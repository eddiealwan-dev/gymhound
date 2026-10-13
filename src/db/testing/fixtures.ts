import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { MeasurementSystem } from '../../domain/types';
import { ensureSettings } from '../repositories/settingsRepo';
import { runSeed } from '../../seed/seed';
import * as schema from '../schema';
import type { Db } from '../types';
import { migrateTestDb } from './createTestDb';

/** The time the fixture seeds at: 2026-10-09 00:00 UTC. */
const SEEDED_AT = Date.UTC(2026, 9, 9);

/** A seeded database's image per measurement system: the library makes seeding slow, so each file seeds once. */
const images = new Map<MeasurementSystem, Buffer>();

function seededImage(m: MeasurementSystem): Buffer {
  let image = images.get(m);
  if (!image) {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const db: Db = drizzle(sqlite, { schema });
    migrateTestDb(db);
    ensureSettings(db, m);
    runSeed(db, SEEDED_AT);
    image = sqlite.serialize();
    sqlite.close();
    images.set(m, image);
  }
  return image;
}

/**
 * A fresh in-memory database with default settings for `m`, the library's exercises and the premade routines: its own
 * copy of a database migrated and seeded as `ensureSettings` and `runSeed` leave it.
 */
export function seededDb(m: MeasurementSystem = 'us'): Db {
  const sqlite = new Database(seededImage(m));
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}
