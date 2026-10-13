import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import type * as schema from '../schema';
import type { Db } from '../types';
import { openFileDb } from './openFileDb';

/** Applies the SQL migrations in `src/db/migrations` to a better-sqlite3 database. */
export function migrateTestDb(db: Db): void {
  migrate(db as BetterSQLite3Database<typeof schema>, { migrationsFolder: path.resolve(__dirname, '../migrations') });
}

/**
 * A migrated better-sqlite3 database for Node tests. Pass `file` to reopen the
 * same database after `close()`. The default is a fresh in-memory database.
 */
export function createTestDb(file: string = ':memory:'): { db: Db; close(): void } {
  const handle = openFileDb(file);
  migrateTestDb(handle.db);
  return handle;
}
