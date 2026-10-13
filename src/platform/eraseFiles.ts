import { Directory, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { getCloudFolder } from './cloud/iCloudFolder';
import { getSnapshotFiles } from './snapshots';
import { fileUri, pathFromUri } from './snapshots/fileUri';

/** The documents folders that hold photos: your own exercise photos (R111), progress photos (R181), the profile photo (R566). */
const PHOTO_FOLDERS = ['exercise-photos', 'progress-photos', 'profile'] as const;

/**
 * The files half of Profile → Delete all data (R568), after `eraseAllData` has emptied the database: every photo
 * folder, the phone's own backups, and GymHound's copies of them in iCloud, so nothing deleted comes back from a
 * backup. A backup copy saved elsewhere with Save a backup copy is the lifter's own and is not touched. Best effort,
 * one part at a time: a part that fails is logged and the rest go on. Never throws. Nothing to do on the web.
 */
export async function eraseFiles(): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const folder of PHOTO_FOLDERS) {
    try {
      const dir = new Directory(fileUri(`${pathFromUri(Paths.document.uri)}/${folder}`));
      if (dir.exists) dir.delete();
    } catch (error) {
      console.warn(`GymHound could not delete ${folder}.`, error);
    }
  }
  try {
    const files = getSnapshotFiles();
    for (const name of files?.list() ?? []) files?.remove(name);
  } catch (error) {
    console.warn("GymHound could not delete the phone's backups.", error);
  }
  try {
    const cloud = getCloudFolder();
    if (cloud !== null && (await cloud.isAvailable())) for (const name of await cloud.list()) await cloud.remove(name);
  } catch (error) {
    console.warn('GymHound could not delete the iCloud backups.', error);
  }
}
