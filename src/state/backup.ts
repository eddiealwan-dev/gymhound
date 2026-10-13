import * as Sharing from 'expo-sharing';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { newestSnapshot, snapshotTime, writeSnapshot } from '../db/snapshots';
import type { Db } from '../db/types';
import { describeSnapshotFolder, getSnapshotFiles } from '../platform/snapshots';
import { describeError } from '../platform/snapshots/describeError';
import { fileUri } from '../platform/snapshots/fileUri';

/**
 * Writes a snapshot of the whole database and records the time as `lastSnapshotAt`. Returns true when both worked,
 * and clears `lastSnapshotError`.
 * A failure is logged, stored as `lastSnapshotError` (so Settings can say why), and returns false: it never throws,
 * because a failed snapshot must never fail a finish. `lastSnapshotAt` keeps the last good time.
 * Returns false, without logging or storing anything, where snapshots never run (web).
 * Call it outside any transaction.
 */
export function takeSnapshotSafely(db: Db, now: number): boolean {
  try {
    const files = getSnapshotFiles();
    if (!files) return false;
    writeSnapshot(db, files, now);
    setSetting(db, 'lastSnapshotAt', now);
    setSetting(db, 'lastSnapshotError', null);
    return true;
  } catch (error) {
    console.warn('GymHound could not write a snapshot.', error);
    try {
      setSetting(db, 'lastSnapshotError', { at: now, message: describeError(error) });
    } catch {
      // The database itself is failing; the warning above is all that can be done.
    }
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

export type SnapshotListing = {
  /** The absolute path of the newest snapshot, or null when there is none, it can't be listed, or snapshots do not run here. */
  path: string | null;
  /** The names the snapshot folder listed. */
  names: string[];
  /** Why listing (or finding the newest one's path) failed, or null. */
  error: string | null;
};

/**
 * What the snapshot folder holds, for Settings to show and to explain. The same listing feeds keep-7 pruning and the
 * startup restore. Never throws: a failure comes back as `error`. Where snapshots never run (web), all is empty.
 */
export function snapshotListing(): SnapshotListing {
  let names: string[] = [];
  try {
    const files = getSnapshotFiles();
    if (!files) return { path: null, names, error: null };
    names = files.list();
    const newest = newestSnapshot(names);
    return { path: newest ? files.pathFor(newest) : null, names, error: null };
  } catch (error) {
    return { path: null, names, error: describeError(error) };
  }
}

/** The absolute path of the newest snapshot, or null when there is none or snapshots do not run here. Never throws. */
export function latestSnapshotPath(): string | null {
  return snapshotListing().path;
}

/**
 * The snapshot folder as the phone lists it (`describeSnapshotFolder`): whether it exists, its path, and each entry with
 * both of its sizes, for the development line in Settings. Null where snapshots never run (web). Never throws.
 */
export function snapshotFolderReport(): string | null {
  try {
    return getSnapshotFiles() ? describeSnapshotFolder() : null;
  } catch (error) {
    return describeError(error);
  }
}

/** Opens the system share sheet for a file, given its absolute path. Rejects if sharing is not available. */
export async function shareFile(path: string): Promise<void> {
  await Sharing.shareAsync(fileUri(path), { dialogTitle: 'GymHound data', mimeType: 'application/vnd.sqlite3' });
}
