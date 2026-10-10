import * as Sharing from 'expo-sharing';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { newestSnapshot, snapshotTime, writeSnapshot } from '../db/snapshots';
import type { Db } from '../db/types';
import { getSnapshotFiles } from '../platform/snapshots';
import { fileUri } from '../platform/snapshots/fileUri';

/**
 * Writes a snapshot of the whole database and records the time as `lastSnapshotAt`. Returns true when both worked.
 * A failure is logged and returns false: it never throws, because a failed snapshot must never fail a finish.
 * Returns false, without logging, where snapshots never run (web).
 * Call it outside any transaction.
 */
export function takeSnapshotSafely(db: Db, now: number): boolean {
  try {
    const files = getSnapshotFiles();
    if (!files) return false;
    writeSnapshot(db, files, now);
    setSetting(db, 'lastSnapshotAt', now);
    return true;
  } catch (error) {
    console.warn('GymHound could not write a snapshot.', error);
    return false;
  }
}

/**
 * After a restore, makes `lastSnapshotAt` at least the time of the snapshot restored from. The restored database was
 * saved just before that snapshot's own time was recorded, so without this Settings could show an older time, or
 * "No snapshot yet.", beside a Share button for a snapshot that exists. A newer stored time is kept. Never throws.
 */
export function recordRestoredSnapshot(db: Db, restoredFrom: string): void {
  try {
    const restoredAt = snapshotTime(restoredFrom);
    const stored = getSettings(db).lastSnapshotAt;
    if (stored === null || stored < restoredAt) setSetting(db, 'lastSnapshotAt', restoredAt);
  } catch (error) {
    console.warn('GymHound could not record the restored snapshot time.', error);
  }
}

/** The absolute path of the newest snapshot, or null when there is none or snapshots do not run here. Never throws. */
export function latestSnapshotPath(): string | null {
  try {
    const files = getSnapshotFiles();
    const name = files ? newestSnapshot(files.list()) : null;
    return files && name ? files.pathFor(name) : null;
  } catch {
    return null;
  }
}

/** Opens the system share sheet for a file, given its absolute path. Rejects if sharing is not available. */
export async function shareFile(path: string): Promise<void> {
  await Sharing.shareAsync(fileUri(path), { dialogTitle: 'GymHound data', mimeType: 'application/vnd.sqlite3' });
}
