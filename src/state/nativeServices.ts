import { setSetting } from '../db/repositories/settingsRepo';
import type { Db } from '../db/types';
import { copyNewestToCloud, restoreFromCloud } from '../platform/cloud/cloudCopy';
import { getCloudFolder } from '../platform/cloud/iCloudFolder';
import { getSnapshotFiles } from '../platform/snapshots';
import { healthRecordIdOf, removeHealthRecord, syncHealthSoon } from './healthSync';

/**
 * PHASE 7: the phase 7 work the app does around its own events, in one place (R307, R303). Each call is a no-op in Expo
 * Go and on the web (no health store, no cloud folder), never throws and never makes the caller wait, except
 * `beforeDatabaseStart`, which waits a bounded time for iCloud on a phone with no data.
 */

/** How long a new phone waits for iCloud before starting empty-handed (it never waits on a phone with data). */
export const CLOUD_RESTORE_WAIT_MS = 15_000;

function warn(what: string): (error: unknown) => void {
  return (error) => console.warn(`GymHound: ${what}`, error);
}

/** Copies the newest snapshot to iCloud and records when. Never throws. */
export async function copySnapshotToCloudSoon(db: Db): Promise<void> {
  try {
    const cloud = getCloudFolder();
    const files = cloud === null ? null : getSnapshotFiles();
    if (files === null || cloud === null) return;
    const sent = await copyNewestToCloud(files, cloud);
    if (sent !== null) setSetting(db, 'lastCloudCopyAt', Date.now());
  } catch (error) {
    warn('the iCloud copy of the snapshot failed.')(error);
  }
}

/** Runs `work` and logs anything it throws: the app's own event must never fail because of phase 7. */
function quietly(what: string, work: () => unknown): void {
  try {
    const result = work();
    if (result instanceof Promise) result.catch(warn(what));
  } catch (error) {
    warn(what)(error);
  }
}

/**
 * Before the database opens (app/_layout.tsx): on a phone with no live database and no snapshot, brings the newest
 * iCloud snapshot into the snapshot folder so the startup restore uses it (§17.2). Waits at most
 * `CLOUD_RESTORE_WAIT_MS`. Never throws; returns the snapshot it brought, or null.
 */
export async function beforeDatabaseStart(): Promise<string | null> {
  try {
    const cloud = getCloudFolder();
    const files = cloud === null ? null : getSnapshotFiles();
    if (files === null || cloud === null || !files.liveIsMissingOrEmpty()) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), CLOUD_RESTORE_WAIT_MS);
    });
    try {
      return await Promise.race([restoreFromCloud(files, cloud), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    warn('the iCloud restore failed.')(error);
    return null;
  }
}

/** Once the database is ready (app/_layout.tsx): retries the Health writes that failed or never ran, and the iCloud copy. */
export function afterDatabaseStart(db: Db): void {
  quietly('the Health pass failed.', () => syncHealthSoon(db));
  quietly('the iCloud copy failed.', () => copySnapshotToCloudSoon(db));
}

/** After a finish has committed and its snapshot was taken (sessionActions.finish). */
export function afterFinish(db: Db): void {
  quietly('the Health pass failed.', () => syncHealthSoon(db));
  quietly('the iCloud copy failed.', () => copySnapshotToCloudSoon(db));
}

/** The Health record of a workout History is about to delete; read it before the delete. Never throws. */
export function healthRecordBeforeDelete(db: Db, workoutId: string): string | null {
  try {
    return healthRecordIdOf(db, workoutId);
  } catch (error) {
    warn('the Health record id could not be read.')(error);
    return null;
  }
}

/** After History deleted a workout: removes its Health record (best effort) and copies the new snapshot. */
export function afterHistoryDelete(db: Db, healthRecordId: string | null): void {
  quietly('the Health record could not be removed.', () => removeHealthRecord(healthRecordId));
  quietly('the iCloud copy failed.', () => copySnapshotToCloudSoon(db));
}
