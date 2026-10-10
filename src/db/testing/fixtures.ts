import type { MeasurementSystem } from '../../domain/types';
import { ensureSettings } from '../repositories/settingsRepo';
import { runSeed } from '../../seed/seed';
import type { Db } from '../types';
import { createTestDb } from './createTestDb';

/** The time the fixture seeds at: 2026-10-09 00:00 UTC. */
const SEEDED_AT = Date.UTC(2026, 9, 9);

/** A fresh in-memory database with default settings for `m`, the bundled exercises and the premade routines. */
export function seededDb(m: MeasurementSystem = 'us'): Db {
  const { db } = createTestDb();
  ensureSettings(db, m);
  runSeed(db, SEEDED_AT);
  return db;
}
