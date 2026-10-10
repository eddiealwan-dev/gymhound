import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'node:path';
import * as schema from '../schema';
import type { Db } from '../types';

/**
 * A migrated better-sqlite3 database for Node tests. Pass `file` to reopen the
 * same database after `close()`. The default is a fresh in-memory database.
 */
export function createTestDb(file: string = ':memory:'): { db: Db; close(): void } {
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.resolve(__dirname, '../migrations') });
  return { db, close: () => sqlite.close() };
}
