import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import type { Settings } from '../db/repositories/settingsRepo';
import { exercises, routineDays, routineExercises, routines } from '../db/schema';
import type { Db } from '../db/types';
import { SEED_EXERCISES } from './exercises';
import { SEED_ROUTINES } from './routines';
import type { SeedIncrement } from './routines';

export { PREMADE_ORDER } from './routines';

/** Bump this when the bundled data changes. `runSeed` re-applies the seed once per version. */
export const SEED_VERSION = 1;

function incrementFor(inc: SeedIncrement, s: Settings): number {
  const base = s.unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg;
  if (inc === 'none') return 0;
  return inc === 'double' ? base * 2 : base;
}

function upsertExercises(db: Db, now: number): void {
  for (const { id, ...content } of SEED_EXERCISES) {
    // A re-seed refreshes the content but never flips `is_custom` or `archived`, or the creation time.
    db.insert(exercises)
      .values({ id, ...content, isCustom: false, createdAt: now })
      .onConflictDoUpdate({ target: exercises.id, set: content })
      .run();
  }
}

function upsertRoutines(db: Db, now: number, s: Settings): void {
  for (const routine of SEED_ROUTINES) {
    // `next_day_index` is progress, so a re-seed never resets it.
    db.insert(routines)
      .values({ id: routine.id, name: routine.name, isPremade: true, nextDayIndex: 0, createdAt: now })
      .onConflictDoUpdate({ target: routines.id, set: { name: routine.name } })
      .run();

    routine.days.forEach((day, dayPosition) => {
      const dayId = `${routine.id}:${day.slug}`;
      db.insert(routineDays)
        .values({ id: dayId, routineId: routine.id, name: day.name, position: dayPosition })
        .onConflictDoUpdate({ target: routineDays.id, set: { name: day.name, position: dayPosition } })
        .run();

      day.exercises.forEach((entry, position) => {
        const rule = {
          exerciseId: entry.exercise,
          position,
          setCount: entry.sets,
          repMin: entry.reps[0],
          repMax: entry.reps[1],
          increment: incrementFor(entry.inc, s),
          incrementUnit: s.unit,
        };
        // `next_weight` and `next_weight_unit` are left out of the update: they hold progress.
        db.insert(routineExercises)
          .values({ id: `${dayId}:${entry.exercise}`, routineDayId: dayId, ...rule })
          .onConflictDoUpdate({ target: routineExercises.id, set: rule })
          .run();
      });
    });
  }
}

/**
 * Upserts the bundled exercises and premade routines by stable id, in one transaction, when the stored
 * `seed_version` is behind `SEED_VERSION`. Rows are never deleted, and user rows are never touched.
 */
export function runSeed(db: Db, now: number): void {
  db.transaction((tx) => {
    const current = getSettings(tx);
    if (current.seedVersion >= SEED_VERSION) return;
    upsertExercises(tx, now);
    upsertRoutines(tx, now, current);
    setSetting(tx, 'seedVersion', SEED_VERSION);
  });
}
