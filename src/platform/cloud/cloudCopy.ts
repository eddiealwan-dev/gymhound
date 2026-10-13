import { newestSnapshot, snapshotsToPrune, type SnapshotFiles } from '../../db/snapshots';

/**
 * PHASE 7: the copy of the snapshots that survives a dead phone (spec §17.2, R303).
 * - iPhone: after each snapshot, the newest one is copied to GymHound's iCloud container, which keeps the newest 3.
 *   On a new iPhone (no live database and no snapshot on the phone), the newest one in iCloud is brought back into the
 *   snapshot folder before the database starts, and the usual startup restore (§12) takes it from there.
 * - Android: nothing here. Android's own backup carries the snapshot folder (plugins/withSnapshotBackupRules.js) and
 *   puts it back when the app is restored on a new phone.
 * The plans are plain functions of the two folders' names; `CloudFolder` is the store (`iCloudFolder.ts`).
 */

/** How many snapshots iCloud keeps. The phone keeps 7; the cloud copy is for a lost phone, so the newest few do. */
export const KEEP_IN_CLOUD = 3;

export interface CloudFolder {
  /** Whether the cloud can be reached (signed in, iCloud Drive on). Never throws. */
  isAvailable(): Promise<boolean>;
  /** Names in GymHound's cloud snapshot folder (empty when it does not exist yet). */
  list(): Promise<string[]>;
  /** Copies the file at `localPath` up as `name`. */
  upload(name: string, localPath: string): Promise<void>;
  /** Copies `name` down to `localPath`. */
  download(name: string, localPath: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** What to send and what to remove so the cloud holds the phone's newest snapshot and at most `keep` in all. */
export function cloudUploadPlan(local: readonly string[], cloud: readonly string[], keep = KEEP_IN_CLOUD): { upload: string | null; remove: string[] } {
  const newest = newestSnapshot([...local]);
  const upload = newest !== null && !cloud.includes(newest) ? newest : null;
  const after = upload === null ? [...cloud] : [...cloud, upload];
  return { upload, remove: snapshotsToPrune(after, keep) };
}

/** The cloud snapshot to bring back, or null: only when the phone has no live database and no snapshot of its own. */
export function cloudRestorePick(liveMissingOrEmpty: boolean, local: readonly string[], cloud: readonly string[]): string | null {
  if (!liveMissingOrEmpty || newestSnapshot([...local]) !== null) return null;
  return newestSnapshot([...cloud]);
}

/**
 * Sends the phone's newest snapshot up and trims the cloud to the newest 3. Returns the name sent, or null when there was
 * nothing new. Throws on a cloud failure (the caller logs it; the next snapshot tries again).
 */
export async function copyNewestToCloud(files: SnapshotFiles, cloud: CloudFolder): Promise<string | null> {
  if (!(await cloud.isAvailable())) return null;
  const plan = cloudUploadPlan(files.list(), await cloud.list());
  if (plan.upload !== null) await cloud.upload(plan.upload, files.pathFor(plan.upload));
  for (const name of plan.remove) await cloud.remove(name);
  return plan.upload;
}

/**
 * On a phone with no data, brings the newest cloud snapshot into the snapshot folder (through a `.partial` file, so a
 * cut-off download is never taken for a snapshot). Returns its name, or null when nothing was needed or found.
 */
export async function restoreFromCloud(files: SnapshotFiles, cloud: CloudFolder): Promise<string | null> {
  if (!files.liveIsMissingOrEmpty() || newestSnapshot(files.list()) !== null) return null;
  if (!(await cloud.isAvailable())) return null;
  const pick = cloudRestorePick(true, files.list(), await cloud.list());
  if (pick === null) return null;
  const partial = `${pick}.partial`;
  files.remove(partial);
  await cloud.download(pick, files.pathFor(partial));
  files.rename(partial, pick);
  return pick;
}
