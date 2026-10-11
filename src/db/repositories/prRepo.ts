import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { computePrFlags, pickHighlights, type PrCandidate, type PrHighlight } from '../../domain/prs';
import type { LoggingType } from '../../domain/types';
import { exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';

/** Set ids per UPDATE, well under SQLite's 999 bound variables. */
const UPDATE_CHUNK = 500;

const CANDIDATE_COLUMNS = {
  id: sets.id,
  workoutId: workoutExercises.workoutId,
  setType: sets.setType,
  done: sets.done,
  weight: sets.weight,
  weightUnit: sets.weightUnit,
  reps: sets.reps,
  durationS: sets.durationS,
  prFlags: sets.prFlags,
};

/**
 * Rewrites `sets.pr_flags` (spec 7.6) for every set of each exercise in finished workouts, from the whole history in
 * time order (R103): the workout's start, then the set's tick time (unticked last), then the exercise's position in the
 * workout, then the set's position. The logging type is the exercise's current one. Sets of the active workout are
 * neither read nor written. Only rows whose flags change are updated, batched by flag value.
 *
 * Spec 7.12 step 2 (phase 6) reuses this after an edit to history. The caller passes every exercise whose history
 * changed: on a replace, both the old and the new exercise id (the old one's later sets may now be PRs, the new one's
 * may stop being); before deleting a workout, collect its exercise ids first (the rows are gone afterwards), then
 * recompute them once the delete is done.
 */
export function recomputePrFlags(db: Db, exerciseIds: readonly string[]): void {
  if (exerciseIds.length === 0) return;
  const types = db
    .select({ id: exercises.id, loggingType: exercises.loggingType })
    .from(exercises)
    .where(inArray(exercises.id, [...exerciseIds]))
    .all();

  for (const { id: exerciseId, loggingType } of types) {
    const rows = db
      .select(CANDIDATE_COLUMNS)
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(workouts.status, 'finished')))
      .orderBy(
        asc(workouts.startedAt),
        // Two workouts started at the same moment stay apart, so each workout's sets are together.
        asc(workouts.id),
        asc(sql`${sets.completedAt} is null`),
        asc(sets.completedAt),
        asc(workoutExercises.position),
        asc(sets.position),
      )
      .all();

    const flags = computePrFlags(loggingType, rows);
    // At most 16 flag values: one UPDATE per value per chunk, however long the history.
    const changed = new Map<number, string[]>();
    for (const row of rows) {
      const f = flags.get(row.id) ?? 0;
      if (f === row.prFlags) continue;
      const ids = changed.get(f);
      if (ids) ids.push(row.id);
      else changed.set(f, [row.id]);
    }
    for (const [f, ids] of changed) {
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        db.update(sets).set({ prFlags: f }).where(inArray(sets.id, ids.slice(i, i + UPDATE_CHUNK))).run();
      }
    }
  }
}

/**
 * Writes the PR flags of workouts finished before phase 4 (R127), once: at launch, after the seed, while
 * `prFlagsBackfilled` is off, every exercise in a finished workout is recomputed in one transaction and the setting
 * is turned on. A fresh install finds no finished workout and just turns it on; once on, this only reads settings. A
 * restored older snapshot has no such setting, so it is backfilled on the launch that opens it. Returns how many
 * exercises were recomputed.
 */
export function backfillPrFlags(db: Db): number {
  if (getSettings(db).prFlagsBackfilled) return 0;
  return db.transaction((tx) => {
    const exerciseIds = tx
      .selectDistinct({ exerciseId: workoutExercises.exerciseId })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(eq(workouts.status, 'finished'))
      .all()
      .map((r) => r.exerciseId);
    recomputePrFlags(tx, exerciseIds);
    setSetting(tx, 'prFlagsBackfilled', true);
    return exerciseIds.length;
  });
}

/**
 * The backfill as the launch runs it (R127): a failure is logged and the app starts anyway, rather than showing the
 * startup error screen on every launch. Its transaction rolls back, so `prFlagsBackfilled` stays off and the next
 * launch tries again; until then older workouts just show no PR marks.
 */
export function tryBackfillPrFlags(db: Db): void {
  try {
    backfillPrFlags(db);
  } catch (error) {
    console.warn('GymHound could not mark the PRs of older workouts. It will try again next launch.', error);
  }
}

/** The ids of the exercises logged in a workout, without repeats. */
function exerciseIdsOf(db: Db, workoutId: string): string[] {
  return db
    .selectDistinct({ exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all()
    .map((r) => r.exerciseId);
}

/**
 * Writes `sets.pr_flags` (spec 7.6) for every exercise in a workout that has just been marked finished, by recomputing
 * each one's history (`recomputePrFlags`). Called by `finishWorkout` inside its transaction, after the status update,
 * as PR eligibility reads finished workouts (R103). PRs are computed at finish only (R104).
 */
export function writePrFlags(db: Db, workoutId: string): void {
  recomputePrFlags(db, exerciseIdsOf(db, workoutId));
}

/**
 * The finish summary's personal bests for a workout (R105), from the stored flags: exercises in workout order (an
 * exercise logged twice is listed once, where it first appears), one highlight per kind. Empty when there are none or
 * the workout is not there.
 */
export function getWorkoutPrs(db: Db, workoutId: string): PrHighlight[] {
  const rows = db
    .select({
      ...CANDIDATE_COLUMNS,
      exerciseId: workoutExercises.exerciseId,
      name: exercises.name,
      loggingType: exercises.loggingType,
      localDate: workouts.localDate,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workouts.id, workoutId))
    .orderBy(asc(workoutExercises.position), asc(sets.position))
    .all();

  type Group = {
    exerciseId: string;
    name: string;
    loggingType: LoggingType;
    localDate: string;
    sets: (PrCandidate & { prFlags: number })[];
  };
  const groups = new Map<string, Group>();
  for (const { exerciseId, name, loggingType, localDate, ...set } of rows) {
    let group = groups.get(exerciseId);
    if (!group) {
      group = { exerciseId, name, loggingType, localDate, sets: [] };
      groups.set(exerciseId, group);
    }
    group.sets.push(set);
  }
  return pickHighlights([...groups.values()]);
}
