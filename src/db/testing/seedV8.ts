import type { MeasurementSystem } from '../../domain/types';
import { LIBRARY_EXERCISES } from '../../seed/library.generated';
import { ensureSettings, getSettings, setSetting } from '../repositories/settingsRepo';
import { exercises, routineDays, routineExercises, routines } from '../schema';
import type { Db } from '../types';
import { createTestDb } from './createTestDb';
import { V8_ROUTINES } from './v8Routines';
import type { V8Increment } from './v8Routines';

export { V8_ORDER, V8_ROUTINES } from './v8Routines';

/** The time the version 8 fixture seeds at: 2026-10-05 00:00 UTC. */
export const V8_SEEDED_AT = Date.UTC(2026, 9, 5);

/**
 * Writes what seed version 8 left on a phone, as far as the programs need: the library (before §18.29's new exercises
 * and aliases) and the nine programs, none retired, each from its first day with no progress, then records version 8.
 * The foods are left out; any later seed writes them. Running `runSeed` after this is a phone updating to version 9.
 */
export function writeSeedV8(db: Db, now: number = V8_SEEDED_AT): void {
  const s = getSettings(db);
  const base = s.unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg;
  const increment = (inc: V8Increment) => (inc === 'none' ? 0 : inc === 'double' ? base * 2 : base);
  db.transaction((tx) => {
    for (let start = 0; start < LIBRARY_EXERCISES.length; start += 50) {
      const rows = LIBRARY_EXERCISES.slice(start, start + 50).map((e) => ({ ...e, isCustom: false, createdAt: now }));
      tx.insert(exercises).values(rows).run();
    }
    for (const routine of V8_ROUTINES) {
      tx.insert(routines).values({ id: routine.id, name: routine.name, isPremade: true, nextDayIndex: 0, createdAt: now }).run();
      routine.days.forEach((day, dayPosition) => {
        const dayId = `${routine.id}:${day.slug}`;
        tx.insert(routineDays).values({ id: dayId, routineId: routine.id, name: day.name, position: dayPosition }).run();
        day.exercises.forEach((entry, position) => {
          tx.insert(routineExercises)
            .values({
              id: `${dayId}:${entry.exercise}`,
              routineDayId: dayId,
              exerciseId: entry.exercise,
              position,
              setCount: entry.sets,
              repMin: entry.reps[0],
              repMax: entry.reps[1],
              increment: increment(entry.inc),
              incrementUnit: s.unit,
            })
            .run();
        });
      });
    }
    setSetting(tx, 'seedVersion', 8);
  });
}

/** A fresh in-memory database with default settings for `m`, as seed version 8 left it (see `writeSeedV8`). */
export function seededV8Db(m: MeasurementSystem = 'us'): Db {
  const { db } = createTestDb();
  ensureSettings(db, m);
  writeSeedV8(db);
  return db;
}
