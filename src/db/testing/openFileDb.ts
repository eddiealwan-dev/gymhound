import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../schema';
import type { Db } from '../types';

/**
 * Opens a better-sqlite3 database for Node tests with foreign keys on, and does not migrate it.
 * `close()` really closes the handle, so the file can be renamed or removed afterwards.
 */
export function openFileDb(file: string): { db: Db; close(): void } {
  const sqlite = new Database(file);
  sqlite.pragma('foreign_keys = ON');
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}
