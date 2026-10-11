import { sql } from 'drizzle-orm';
import type { MeasurementSystem, WeightUnit } from '../../domain/types';
import { SEED_EXERCISES } from '../../seed/exercises';
import { ensureSettings, getSettings, setSetting } from '../repositories/settingsRepo';
import type { Db } from '../types';
import { createTestDb } from './createTestDb';
import { V1_ROUTINES } from './v1Routines';

export { V1_ROUTINES } from './v1Routines';

/** The time the v1 fixture seeds at: 2026-10-01 00:00 UTC. */
export const V1_SEEDED_AT = Date.UTC(2026, 9, 1);

/**
 * Writes the bundled data as seed version 1 left a database: the 55 exercises (no steps, no source) and the six
 * premades with their v1 days and rules, then records seed version 1. Ids are built as v1 built them. Rows are written
 * with the columns of migration 0000 only, so this works on a database from before any later migration too.
 */
export function writeSeedV1(db: Db, now: number = V1_SEEDED_AT): void {
  const s = getSettings(db);
  const unit: WeightUnit = s.unit;
  const base = unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg;
  db.transaction((tx) => {
    for (const e of SEED_EXERCISES) {
      tx.run(sql`
        INSERT INTO exercises (id, name, aliases, primary_muscles, secondary_muscles, equipment, pattern, logging_type, is_custom, archived, created_at)
        VALUES (${e.id}, ${e.name}, ${JSON.stringify(e.aliases)}, ${JSON.stringify(e.primaryMuscles)},
          ${JSON.stringify(e.secondaryMuscles)}, ${e.equipment}, ${e.pattern}, ${e.loggingType}, 0, 0, ${now})`);
    }
    for (const routine of V1_ROUTINES) {
      tx.run(sql`
        INSERT INTO routines (id, name, is_premade, next_day_index, created_at) VALUES (${routine.id}, ${routine.name}, 1, 0, ${now})`);
      routine.days.forEach(([slug, name, rows], dayPosition) => {
        const dayId = `${routine.id}:${slug}`;
        tx.run(sql`
          INSERT INTO routine_days (id, routine_id, name, position) VALUES (${dayId}, ${routine.id}, ${name}, ${dayPosition})`);
        rows.forEach(([exerciseId, setCount, repMin, repMax, inc], position) => {
          tx.run(sql`
            INSERT INTO routine_exercises (id, routine_day_id, exercise_id, position, set_count, rep_min, rep_max, increment, increment_unit)
            VALUES (${`${dayId}:${exerciseId}`}, ${dayId}, ${exerciseId}, ${position}, ${setCount}, ${repMin}, ${repMax},
              ${base * inc}, ${unit})`);
        });
      });
    }
    setSetting(tx, 'seedVersion', 1);
  });
}

/** A fresh in-memory database with default settings for `m`, as seed version 1 left it (see `writeSeedV1`). */
export function seededV1Db(m: MeasurementSystem = 'us'): Db {
  const { db } = createTestDb();
  ensureSettings(db, m);
  writeSeedV1(db);
  return db;
}
