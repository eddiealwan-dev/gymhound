import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { MeasurementSystem } from '../../domain/types';
import { ensureSettings } from '../repositories/settingsRepo';
import { runSeed } from '../../seed/seed';
import * as schema from '../schema';
import type { Db } from '../types';
import { migrateTestDb } from './createTestDb';
import { writeSeedV8 } from './seedV8';

/** The time the fixture seeds at: 2026-10-09 00:00 UTC. */
const SEEDED_AT = Date.UTC(2026, 9, 9);

type Kind = 'updated' | 'fresh';

/** A seeded database's image per kind and measurement system: the library makes seeding slow, so each file seeds once. */
const images = new Map<string, Buffer>();

function seededImage(kind: Kind, m: MeasurementSystem): Buffer {
  const key = `${kind}:${m}`;
  let image = images.get(key);
  if (!image) {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const db: Db = drizzle(sqlite, { schema });
    migrateTestDb(db);
    ensureSettings(db, m);
    if (kind === 'updated') writeSeedV8(db, SEEDED_AT);
    runSeed(db, SEEDED_AT);
    image = sqlite.serialize();
    sqlite.close();
    images.set(key, image);
  }
  return image;
}

function open(image: Buffer): Db {
  const sqlite = new Database(image);
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

/**
 * A fresh in-memory database with default settings for `m`, the library's exercises, the twenty programs and the
 * nine retired programs (§18.29, R598): a phone that ran seed version 8 and updated, which is every phone that had
 * GymHound before the twenty. The nine keep their ids, days and exercises, so a test can still run Push/pull/legs
 * (`premade-ppl-6`) as someone who has it does; nobody uses them yet, so Routines doesn't list them. Its own copy of
 * a database migrated and seeded as `ensureSettings`, `writeSeedV8` and `runSeed` leave it.
 */
export function seededDb(m: MeasurementSystem = 'us'): Db {
  return open(seededImage('updated', m));
}

/** As `seededDb`, but a new install: the twenty programs and no retired ones. */
export function freshSeededDb(m: MeasurementSystem = 'us'): Db {
  return open(seededImage('fresh', m));
}
