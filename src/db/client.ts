import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';
import type { Db } from './types';

let instance: Db | null = null;

/**
 * Opens (once) the app's database, `gymhound.db`, and returns the shared connection.
 * It only opens and configures the connection. Migrations are applied separately.
 */
export function openAppDb(): Db {
  if (!instance) {
    const sqlite = openDatabaseSync('gymhound.db');
    sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    instance = drizzle(sqlite, { schema });
  }
  return instance;
}
