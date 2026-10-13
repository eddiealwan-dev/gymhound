import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from './schema';

/**
 * Drizzle's synchronous SQLite database. The same repository code runs on
 * expo-sqlite in the app and on better-sqlite3 in Node tests.
 */
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;
