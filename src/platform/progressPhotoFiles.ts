import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { isPhotoFileName } from '../db/repositories/exercisePhotosRepo';
import type { PickedPhoto } from './exercisePhotoFiles';
import { fileUri, pathFromUri } from './snapshots/fileUri';

// Progress photos (R181): kept in the app's own folder on the phone, by file name, as your own exercise photos are
// (R111). Not in snapshots or "Save a backup copy", never shared or uploaded. Phone builds only.

/** The widest a saved progress photo is: sharp full screen on a phone. A narrower photo keeps its size. */
const PHOTO_WIDTH = 1080;
/** The JPEG quality a saved progress photo is written at. */
const PHOTO_COMPRESS = 0.8;
/** The folder in the documents folder that holds progress photos. */
const FOLDER = 'progress-photos';

export type { PickedPhoto };

/** The progress photo folder's absolute path, in the documents folder as it is now (it moves when iOS updates the app). */
const folderPath = () => `${pathFromUri(Paths.document.uri)}/${FOLDER}`;

/**
 * Takes a photo with the camera or chooses one from the library, uncropped, and writes it at most 1080 px wide as a
 * JPEG at 0.8 to a temporary file. The photo is always written afresh, even when it is small enough already, so what is
 * kept carries none of the original's metadata, such as where it was taken. The camera asks for access the first time;
 * refused, it opens nothing and says 'denied'. The library needs no access: the phone's own picker hands over only the
 * photo chosen.
 */
export async function pickProgressPhoto(source: 'camera' | 'library'): Promise<PickedPhoto> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    // A JPEG or other common format rather than HEIC, as exercise photos ask for (Round 8).
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };

  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (asset.width > PHOTO_WIDTH) context.resize({ width: PHOTO_WIDTH });
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

/**
 * The `file://` URI of a progress photo, built from the documents folder as it is now, each time it is asked: iOS moves
 * the app's folder on update, so only the name is stored.
 */
export function progressPhotoUri(fileName: string): string {
  return fileUri(`${folderPath()}/${fileName}`);
}

/** True when the named photo is in the progress photo folder. A restored snapshot can name a file it does not hold. Never throws. */
export function progressPhotoExists(fileName: string): boolean {
  if (!isPhotoFileName(fileName)) return false;
  try {
    return new File(progressPhotoUri(fileName)).exists;
  } catch {
    return false;
  }
}

/**
 * Moves a picked photo (from `pickProgressPhoto`) into `progress-photos/` in the documents folder as
 * "progress-{now}.jpg", and returns that file name, never a path.
 */
export function saveProgressPhoto(tempUri: string, now: number): string {
  const name = `progress-${now}.jpg`;
  if (!isPhotoFileName(name)) throw new Error(`Not a photo file name: ${name}`);
  new Directory(fileUri(folderPath())).create({ intermediates: true, idempotent: true });
  new File(tempUri).moveSync(new File(progressPhotoUri(name)), { overwrite: true });
  return name;
}

/**
 * Deletes a progress photo's file. A file that is not there is fine, and so is one that can't be deleted: a stray file
 * costs only space, while the delete that called this must go on. Never reaches outside the progress photo folder.
 */
export function deleteProgressPhotoFile(fileName: string): void {
  if (!isPhotoFileName(fileName)) return;
  try {
    const file = new File(progressPhotoUri(fileName));
    if (file.exists) file.delete();
  } catch {
    // Left behind; nothing names it any more.
  }
}
