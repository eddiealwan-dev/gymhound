/**
 * GymHound's iCloud copy module (iOS only, `ios/GymHoundCloudBackupModule.swift`): types and the name only.
 * The app reaches it through `optionalNativeModule<CloudBackupModule>(CLOUD_BACKUP_MODULE)`, which is null in Expo Go,
 * on the web, on Android and in Jest. Nothing here loads native code.
 */
export const CLOUD_BACKUP_MODULE = 'GymHoundCloudBackup';

export type CloudBackupModule = {
  /** True when the phone is signed in to iCloud with iCloud Drive on for GymHound and the container is reachable. */
  available(): Promise<boolean>;
  /**
   * Copies the snapshot at `sourcePath` (absolute, no `file://`) to `<container>/Documents/backup/<name>` through a temporary
   * file and a coordinated replace, then removes the `gymhound-*.db` there whose names sort before `name` (a newer one from
   * another device is kept). Rejects with the system's message.
   */
  save(sourcePath: string, name: string): Promise<void>;
  /**
   * The newest snapshot in the container, downloaded if needed (waiting up to `timeoutMs`) and copied into the app's caches
   * folder; `path` is absolute with no `file://`. An empty listing is retried until `timeoutMs` (iCloud may not have synced
   * the file list yet on a new phone); 0 lists once. Null when there is none, iCloud is off, or it did not arrive in time.
   */
  latest(timeoutMs: number): Promise<{ name: string; path: string } | null>;
};
