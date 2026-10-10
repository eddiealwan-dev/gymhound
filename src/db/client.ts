import { drizzle } from 'drizzle-orm/expo-sqlite';
import { defaultDatabaseDirectory, openDatabaseAsync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';
import type { Db } from './types';

const DB_NAME = 'gymhound.db';

let handle: SQLiteDatabase | null = null;
let instance: Db | null = null;

/** The absolute path of the live database file, with no `file://` prefix. It is where `openAppDb` opens it, whether or not it is open. */
export function liveDbPath(): string {
  if (!defaultDatabaseDirectory) throw new Error('This platform has no database folder.');
  return `${defaultDatabaseDirectory.replace(/\/+$/, '')}/${DB_NAME}`;
}

/**
 * Opens (once) the app's database, `gymhound.db`, and returns the shared connection.
 * It only opens and configures the connection. Migrations are applied separately.
 * After `closeAppDb` the next call opens a fresh connection.
 * On web, call `openAppDbAsync` first: this one throws if the SQLite worker is not already running.
 */
export function openAppDb(): Db {
  if (!instance) {
    const sqlite = openDatabaseSync(DB_NAME);
    try {
      sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    } catch (error) {
      // A file too corrupt to read fails here. Release the handle so the file can be set aside.
      try {
        sqlite.closeSync();
      } catch {
        // The first error is the one worth reporting.
      }
      throw error;
    }
    handle = sqlite;
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}

/**
 * Closes the app's connection for real, so the database file can be renamed or replaced straight afterwards.
 * The singleton is cleared even if closing throws. Does nothing when no connection is open.
 */
export function closeAppDb(): void {
  const sqlite = handle;
  handle = null;
  instance = null;
  sqlite?.closeSync();
}

/**
 * `openAppDb` for every platform. On web, expo-sqlite's sync calls wait only about 30 ms for the SQLite worker,
 * which is less than a cold worker needs to start. So start it with the async API first. Elsewhere this is `openAppDb`.
 */
export async function openAppDbAsync(): Promise<Db> {
  if (Platform.OS === 'web' && !instance) {
    const warmUp = await openDatabaseAsync(DB_NAME);
    await warmUp.closeAsync();
  }
  return openAppDb();
}
