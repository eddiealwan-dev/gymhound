/**
 * The cloud copy of the newest snapshot (spec §17.2, R213, R214): the pure decisions. The platform code (Task 7) copies files.
 */

/** The folder in the app's documents folder that Android's backup includes, and nothing else (plugins/lib/backupRules.js). */
export const CLOUD_BACKUP_FOLDER = 'cloud-backup';

/** A snapshot's name as `writeSnapshot` makes it (src/db/snapshots.ts). Anything else is not a snapshot. */
const SNAPSHOT_NAME = /^gymhound-\d{8}-\d{6}-\d{3}\.db$/;

/**
 * The cloud copy to restore at launch, or null. Only when the live database is missing or empty and the phone has no
 * snapshot of its own (a local snapshot, even an older one, is restored by `startDatabase` instead), and only a file
 * named like a snapshot, so the name is safe to use as a file name in `snapshots/`.
 */
export function restoreCandidate(input: {
  liveMissingOrEmpty: boolean;
  localSnapshots: readonly string[];
  cloud: { name: string } | null;
}): string | null {
  const { liveMissingOrEmpty, localSnapshots, cloud } = input;
  if (!liveMissingOrEmpty || cloud === null || !SNAPSHOT_NAME.test(cloud.name)) return null;
  if (localSnapshots.some((name) => SNAPSHOT_NAME.test(name))) return null;
  return cloud.name;
}

/**
 * Settings → Backups' line about the cloud copy. A failure shows while it is newer than the last good copy.
 * - iCloud: "iCloud copy: {time}." / "No iCloud copy yet." / "The iCloud copy failed at {time}: {message}"
 * - Android: "Android backup copy: {time}. Android backs it up about once a day." / "No backup copy yet." /
 *   "The backup copy failed at {time}: {message}"
 */
export function cloudBackupLine(
  input: { kind: 'icloud' | 'android_backup'; at: number | null; error: { at: number; message: string } | null },
  formatTime: (ms: number) => string,
): string {
  const { kind, at, error } = input;
  const icloud = kind === 'icloud';
  if (error && (at === null || error.at >= at)) {
    return `The ${icloud ? 'iCloud' : 'backup'} copy failed at ${formatTime(error.at)}: ${error.message}`;
  }
  if (at === null) return icloud ? 'No iCloud copy yet.' : 'No backup copy yet.';
  return icloud
    ? `iCloud copy: ${formatTime(at)}.`
    : `Android backup copy: ${formatTime(at)}. Android backs it up about once a day.`;
}
