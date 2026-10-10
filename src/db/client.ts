import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync, openDatabaseSync } from 'expo-sqlite';
import { Platform } from 'react-native';
import * as schema from './schema';
import type { Db } from './types';

const DB_NAME = 'gymhound.db';

let instance: Db | null = null;

/**
 * Opens (once) the app's database, `gymhound.db`, and returns the shared connection.
 * It only opens and configures the connection. Migrations are applied separately.
 * On web, call `openAppDbAsync` first: this one throws if the SQLite worker is not already running.
 */
export function openAppDb(): Db {
  if (!instance) {
    const sqlite = openDatabaseSync(DB_NAME);
    sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    instance = drizzle(sqlite, { schema });
  }
  return instance;
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
