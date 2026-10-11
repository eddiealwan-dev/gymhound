import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { isPhotoFileName, type PhotoSlot } from '../db/repositories/exercisePhotosRepo';
import { fileUri, pathFromUri } from './snapshots/fileUri';

/** How wide a saved photo is: twice the bundled photos' 360 × 240, for a sharp demo on a phone's screen. */
const PHOTO_WIDTH = 720;
/** The JPEG quality a saved photo is written at. */
const PHOTO_COMPRESS = 0.7;
/** The folder in the documents folder that holds your own photos (R111). */
const FOLDER = 'exercise-photos';

/** What came of asking for a photo: its temporary file, or why there is none. */
export type PickedPhoto = { status: 'picked'; uri: string } | { status: 'cancelled' } | { status: 'denied' };

/** The photo folder's absolute path, in the documents folder as it is now (it moves when iOS updates the app). */
const folderPath = () => `${pathFromUri(Paths.document.uri)}/${FOLDER}`;

/**
 * The centred 3:2 part of a photo `width` × `height`, or null when it is already 3:2 (to a pixel) or has no size.
 * The picker crops 3:2 on Android only; iOS crops square, so the cut is made here too.
 */
export function cropToThreeByTwo(width: number, height: number): { originX: number; originY: number; width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  if (Math.abs(width - height * 1.5) <= 1) return null;
  if (width > height * 1.5) {
    const cropWidth = Math.round(height * 1.5);
    return { originX: Math.floor((width - cropWidth) / 2), originY: 0, width: cropWidth, height };
  }
  const cropHeight = Math.round(width / 1.5);
  return { originX: 0, originY: Math.floor((height - cropHeight) / 2), width, height: cropHeight };
}

/**
 * Takes a photo with the camera or chooses one from the library, cropped 3:2 (the shape of the bundled photos), and
 * writes it 720 px wide as a JPEG at 0.7 to a temporary file. The camera asks for access the first time; refused, it
 * opens nothing and says 'denied'. The library needs no access: the phone's own picker hands over only the photo chosen.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<PickedPhoto> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [3, 2], quality: 1 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: 'cancelled' };

  const context = ImageManipulator.manipulate(asset.uri);
  try {
    const crop = cropToThreeByTwo(asset.width, asset.height);
    if (crop) context.crop(crop);
    context.resize({ width: PHOTO_WIDTH });
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
 * The `file://` URI of one of your own photos, built from the documents folder as it is now, each time it is asked:
 * iOS moves the app's folder on update, so only the name is stored (R111).
 */
export function photoUri(fileName: string): string {
  return fileUri(`${folderPath()}/${fileName}`);
}

/** True when the named photo is in the photo folder. A restored snapshot can name a file deleted since. Never throws. */
export function photoFileExists(fileName: string): boolean {
  if (!isPhotoFileName(fileName)) return false;
  try {
    return new File(photoUri(fileName)).exists;
  } catch {
    return false;
  }
}

/**
 * Moves a picked photo (from `pickPhoto`) into `exercise-photos/` in the documents folder as
 * "{exerciseId}-{slot}-{now}.jpg", and returns that file name, never a path. A new name each time, so a replaced photo
 * never shows from the image cache.
 */
export function saveExercisePhoto(tempUri: string, exerciseId: string, slot: PhotoSlot, now: number): string {
  const name = `${exerciseId}-${slot}-${now}.jpg`;
  if (!isPhotoFileName(name)) throw new Error(`Not a photo file name: ${name}`);
  new Directory(fileUri(folderPath())).create({ intermediates: true, idempotent: true });
  new File(tempUri).moveSync(new File(photoUri(name)), { overwrite: true });
  return name;
}

/**
 * Deletes one of your own photos. A file that is not there is fine, and so is one that can't be deleted: a stray file
 * costs only space, while the delete that called this must go on. Never reaches outside the photo folder.
 */
export function deleteExercisePhotoFile(fileName: string): void {
  if (!isPhotoFileName(fileName)) return;
  try {
    const file = new File(photoUri(fileName));
    if (file.exists) file.delete();
  } catch {
    // Left behind; nothing names it any more.
  }
}
