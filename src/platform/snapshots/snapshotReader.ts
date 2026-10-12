import { openDatabaseSync } from 'expo-sqlite';
import type { SnapshotReader } from '../../db/snapshots';
import { snapshotDirPath } from './expoSnapshotFiles';

/**
 * `StartupDeps.openSnapshot` on the phone: opens a snapshot on its own connection, only to check it before a restore.
 * Nothing is written to it. A file that is not a database throws here or on its first query.
 */
export function openSnapshotForCheck(name: string): SnapshotReader {
  const db = openDatabaseSync(name, { useNewConnection: true }, snapshotDirPath());
  return {
    all: (query) => db.getAllSync<Record<string, unknown>>(query),
    close: () => db.closeSync(),
  };
}
