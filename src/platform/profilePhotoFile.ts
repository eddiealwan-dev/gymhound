import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { isPhotoFileName } from '../db/repositories/exercisePhotosRepo';
import type { PickedPhoto } from './exercisePhotoFiles';
import { fileUri, pathFromUri } from './snapshots/fileUri';

// The profile photo (R566): one square photo in the app's own folder on the phone, stored by file name as progress
// photos are (R181). Never shared or uploaded. Phone builds only.

/** A saved profile photo's side: sharp at the 96pt it is drawn at, three pixels to the point. */
const PHOTO_SIDE = 480;
/** The JPEG quality it is written at. */
const PHOTO_COMPRESS = 0.8;
/** The folder in the documents folder that holds it. */
const FOLDER = 'profile';

export type { PickedPhoto };

const folderPath = () => `${pathFromUri(Paths.document.uri)}/${FOLDER}`;

/** The centred square of a photo `width` × `height`, or null when it is already square (to a pixel) or has no size. */
export function cropToSquare(width: number, height: number): { originX: number; originY: number; width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.abs(width - height) <= 1) return null;
  const side = Math.min(width, height);
  return { originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side };
}

/**
 * Takes a photo with the camera (cropped square by iOS's own step) or chooses one from the library, and writes its
 * centred square 480 px across as a JPEG at 0.8 to a temporary file, carrying none of the original's metadata. The
 * library opens without iOS's crop step, which can't fetch a photo kept in iCloud (Round 8), so the square is cut here.
 * The camera asks for access the first time; refused, it opens nothing and says 'denied'.
 */
export async function pickProfilePhoto(source: 'camera' | 'library'): Promise<PickedPhoto> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  const options: ImagePicker.ImagePickerOptions =
    source === 'camera'
      ? { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, cameraType: ImagePicker.CameraType.front }
      : {
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 1,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };

  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const crop = cropToSquare(asset.width, asset.height);
    if (crop) context.crop(crop);
    if (Math.min(asset.width, asset.height) > PHOTO_SIDE) context.resize({ width: PHOTO_SIDE, height: PHOTO_SIDE });
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_COMPRESS });
      return { status: 'picked', uri: saved.uri };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}

/** The `file://` URI of the profile photo, built from the documents folder as it is now (iOS moves it on update). */
export function profilePhotoUri(fileName: string): string {
  return fileUri(`${folderPath()}/${fileName}`);
}

/** True when the named photo is in the profile folder. A restored snapshot can name a file it does not hold. Never throws. */
export function profilePhotoExists(fileName: string): boolean {
  if (!isPhotoFileName(fileName)) return false;
  try {
    return new File(profilePhotoUri(fileName)).exists;
  } catch {
    return false;
  }
}

/** Moves a picked photo into `profile/` as "profile-{now}.jpg" (a new name each time, so the image cache never shows the old one) and returns the name. */
export function saveProfilePhoto(tempUri: string, now: number): string {
  const name = `profile-${now}.jpg`;
  new Directory(fileUri(folderPath())).create({ intermediates: true, idempotent: true });
  new File(tempUri).moveSync(new File(profilePhotoUri(name)), { overwrite: true });
  return name;
}

/** Deletes a profile photo's file. One that is not there, or can't be deleted, is fine: nothing names it any more. */
export function deleteProfilePhotoFile(fileName: string): void {
  if (!isPhotoFileName(fileName)) return;
  try {
    const file = new File(profilePhotoUri(fileName));
    if (file.exists) file.delete();
  } catch {
    // Left behind.
  }
}
