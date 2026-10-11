import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import type { Settings } from '../db/repositories/settingsRepo';
import { exercises, routineDays, routineExercises, routines } from '../db/schema';
import type { Db } from '../db/types';
import type { LibraryExercise } from './libraryMapping';
import { SEED_ROUTINES } from './routines';
import type { SeedIncrement } from './routines';

export { PREMADE_ORDER } from './routines';

/**
 * Bump this when the bundled data changes. `runSeed` re-applies the seed once per version.
 * 1: the 55 exercises and six premades (phases 1 and 2). 2: the full library with steps and sources (§18.8). 3: hand-written steps for the six exercises without a source (R95) and the pike push-up wording. 4: imported steps without stray numbers, "You" typos or calorie claims (`STEP_FIXES`).
 */
export const SEED_VERSION = 4;

/** The library is about 800 KB of data, so it is loaded only when the seed has to run, never at every start. */
function loadLibrary(): readonly LibraryExercise[] {
  return (require('./library.generated') as typeof import('./library.generated')).LIBRARY_EXERCISES;
}

function incrementFor(inc: SeedIncrement, s: Settings): number {
  const base = s.unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg;
  if (inc === 'none') return 0;
  return inc === 'double' ? base * 2 : base;
}

/** The value an upsert tried to insert into `column`, for its update. */
const excluded = (column: AnySQLiteColumn) => sql.raw(`excluded."${column.name}"`);

/** A re-seed refreshes the content but never flips `is_custom` or `archived`, or the creation time. */
const REFRESHED = {
  name: excluded(exercises.name),
  aliases: excluded(exercises.aliases),
  primaryMuscles: excluded(exercises.primaryMuscles),
  secondaryMuscles: excluded(exercises.secondaryMuscles),
  equipment: excluded(exercises.equipment),
  pattern: excluded(exercises.pattern),
  loggingType: excluded(exercises.loggingType),
  instructions: excluded(exercises.instructions),
  sourceId: excluded(exercises.sourceId),
};

/** Rows per statement: hundreds of single upserts are slow, and 50 rows stay well inside SQLite's variable limit. */
const EXERCISES_PER_STATEMENT = 50;

function upsertExercises(db: Db, now: number, library: readonly LibraryExercise[]): void {
  for (let start = 0; start < library.length; start += EXERCISES_PER_STATEMENT) {
    const rows = library.slice(start, start + EXERCISES_PER_STATEMENT).map((e) => ({ ...e, isCustom: false, createdAt: now }));
    db.insert(exercises).values(rows).onConflictDoUpdate({ target: exercises.id, set: REFRESHED }).run();
  }
}

function upsertRoutines(db: Db, now: number, s: Settings): void {
  for (const routine of SEED_ROUTINES) {
    // `next_day_index` is progress, so a re-seed never resets it. A premade back in the seed is no longer retired.
    db.insert(routines)
      .values({ id: routine.id, name: routine.name, isPremade: true, nextDayIndex: 0, createdAt: now })
      .onConflictDoUpdate({ target: routines.id, set: { name: routine.name, retired: false } })
      .run();

    const dayIds: string[] = [];
    const exerciseIds: string[] = [];
    routine.days.forEach((day, dayPosition) => {
      const dayId = `${routine.id}:${day.slug}`;
      dayIds.push(dayId);
      db.insert(routineDays)
        .values({ id: dayId, routineId: routine.id, name: day.name, position: dayPosition })
        .onConflictDoUpdate({ target: routineDays.id, set: { name: day.name, position: dayPosition } })
        .run();

      day.exercises.forEach((entry, position) => {
        const id = `${dayId}:${entry.exercise}`;
        exerciseIds.push(id);
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
          .values({ id, routineDayId: dayId, ...rule })
          .onConflictDoUpdate({ target: routineExercises.id, set: rule })
          .run();
      });
    });

    // The premade continues: the days and exercises an older seed gave it, and this one does not, go.
    const staleDays = db
      .select({ id: routineDays.id })
      .from(routineDays)
      .where(and(eq(routineDays.routineId, routine.id), notInArray(routineDays.id, dayIds)));
    db.delete(routineExercises).where(inArray(routineExercises.routineDayId, staleDays)).run();
    db.delete(routineDays).where(and(eq(routineDays.routineId, routine.id), notInArray(routineDays.id, dayIds))).run();
    db.delete(routineExercises)
      .where(and(inArray(routineExercises.routineDayId, dayIds), notInArray(routineExercises.id, exerciseIds)))
      .run();
  }

  // A premade the seed no longer has is retired, never deleted: whoever has it active or in history keeps it whole.
  db.update(routines)
    .set({ retired: true })
    .where(and(eq(routines.isPremade, true), notInArray(routines.id, SEED_ROUTINES.map((r) => r.id))))
    .run();
}

/**
 * Upserts the library's exercises and the premade routines by stable id, in one transaction, when the stored
 * `seed_version` is behind `SEED_VERSION`. Exercises are never deleted, and user rows are never touched. A premade
 * that continues loses the days and exercises the seed no longer has (the rest keep their ids and next weights); a
 * premade the seed no longer has is retired with all its rows.
 */
export function runSeed(db: Db, now: number): void {
  db.transaction((tx) => {
    const current = getSettings(tx);
    if (current.seedVersion >= SEED_VERSION) return;
    upsertExercises(tx, now, loadLibrary());
    upsertRoutines(tx, now, current);
    setSetting(tx, 'seedVersion', SEED_VERSION);
  });
}
