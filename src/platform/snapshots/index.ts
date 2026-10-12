import { Platform } from 'react-native';
import type { SnapshotFiles } from '../../db/snapshots';
import { expoSnapshotFiles } from './expoSnapshotFiles';

export { describeSnapshotFolder, fileExists, setAsidePath } from './expoSnapshotFiles';
export { openSnapshotForCheck } from './snapshotReader';

/**
 * The phone's snapshot files, or null on web, where snapshots never run.
 * (Web keeps its database in the browser, and there is no folder to copy it to.)
 */
export function getSnapshotFiles(): SnapshotFiles | null {
  return Platform.OS === 'web' ? null : expoSnapshotFiles();
}
