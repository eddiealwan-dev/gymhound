import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { gearFor, planInUnit } from '../../domain/plates';
import { computeOutcome, type Outcome } from '../../domain/progression';
import type { TickValues } from '../../domain/setEntry';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { convertIncrement } from '../../domain/units';
import { dayTitle } from '../../domain/upNext';
import { newId } from '../ids';
import {
  exerciseNotes,
  exercises,
  routineDays,
  routineExercises,
  routines,
  sets,
  workoutExercises,
  workouts,
} from '../schema';
import type { Db } from '../types';
import { ActiveWorkoutExistsError, assertNoActiveWorkout, getActiveWorkoutId } from './activeWorkout';
import { writePrFlags } from './prRepo';
import { ruleOf } from './ruleSnapshot';
import { rememberSavedWorkout } from './savedWorkoutsRepo';
import { getSettings } from './settingsRepo';

export { ActiveWorkoutExistsError, assertNoActiveWorkout, getActiveWorkoutId };

/** Raised when a workout is finished with no set ticked. An empty workout never reaches history. */
export class NothingTickedError extends Error {
  constructor() {
    super('Nothing is ticked yet.');
    this.name = 'NothingTickedError';
  }
}

/** The active workout's id and its stored rest end (epoch ms, null when no rest is running), or null with no active workout. A light read for the rest watcher. */
export function getActiveRest(db: Db): { workoutId: string; restEndsAt: number | null } | null {
  const row = db
    .select({ id: workouts.id, restEndsAt: workouts.restEndsAt })
    .from(workouts)
    .where(eq(workouts.status, 'active'))
    .get();
  return row ? { workoutId: row.id, restEndsAt: row.restEndsAt } : null;
}

function requireActiveWorkout(db: Db, workoutId: string) {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'active') throw new Error(`No active workout with id ${workoutId}.`);
  return workout;
}

/** Starts an empty workout named "Workout". Throws `ActiveWorkoutExistsError` if one is active. */
export function startEmptyWorkout(db: Db, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const id = newId();
    tx.insert(workouts)
      .values({ id, name: 'Workout', status: 'active', startedAt: now, localDate: toLocalDate(now) })
      .run();
    return id;
  });
}

/**
 * Starts a workout from a routine day. Each exercise copies the day's rule as a snapshot, its planned
 * weight, superset group and position, and gets `set_count` empty working sets. The planned weight and the
 * increment are snapshotted in the display unit (spec 7.1, `planInUnit`); the routine rows are not changed.
 * Throws `ActiveWorkoutExistsError` if one is active, before inserting anything.
 */
export function startWorkoutFromDay(db: Db, routineDayId: string, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const row = tx
      .select({ day: routineDays, routineName: routines.name })
      .from(routineDays)
      .innerJoin(routines, eq(routines.id, routineDays.routineId))
      .where(eq(routineDays.id, routineDayId))
      .get();
    if (!row) throw new Error(`No routine day with id ${routineDayId}.`);
    const { day, routineName } = row;

    const workoutId = newId();
    tx.insert(workouts)
      .values({
        id: workoutId,
        // Named as Train names the day ("5×5 A", R56); a finished workout keeps the name it was stored with.
        name: dayTitle(routineName, day.name),
        routineId: day.routineId,
        routineDayId: day.id,
        status: 'active',
        startedAt: now,
        localDate: toLocalDate(now),
      })
      .run();

    const { unit, barLb, barKg, platesLb, platesKg } = getSettings(tx);
    const bar = unit === 'lb' ? barLb : barKg;
    const plates = unit === 'lb' ? platesLb : platesKg;
    const rules = tx
      .select({ rule: routineExercises, equipment: exercises.equipment })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .where(eq(routineExercises.routineDayId, day.id))
      .orderBy(asc(routineExercises.position))
      .all();
    for (const { rule, equipment } of rules) {
      const workoutExerciseId = newId();
      tx.insert(workoutExercises)
        .values({
          id: workoutExerciseId,
          workoutId,
          exerciseId: rule.exerciseId,
          routineExerciseId: rule.id,
          position: rule.position,
          supersetGroup: rule.supersetGroup,
          showRpe: false,
          ruleSetCount: rule.setCount,
          ruleRepMin: rule.repMin,
          ruleRepMax: rule.repMax,
          ruleIncrement: convertIncrement(rule.increment, rule.incrementUnit, unit),
          ruleIncrementUnit: unit,
          plannedWeight:
            rule.nextWeight === null
              ? null
              : planInUnit(rule.nextWeight, rule.nextWeightUnit ?? unit, unit, equipment === 'barbell', bar, plates),
          plannedUnit: rule.nextWeight === null ? null : unit,
        })
        .run();
      for (let position = 0; position < rule.setCount; position++) {
        tx.insert(sets).values({ id: newId(), workoutExerciseId, position, setType: 'working' }).run();
      }
    }
    return workoutId;
  });
}

/**
 * The day after `routineDayId` in its routine's rotation: the index the routine's pointer moves to, wrapping from the
 * last day to the first, with that day's name and the routine's. Null when the day no longer exists.
 */
function dayAfter(
  db: Db,
  routineDayId: string,
): { routineId: string; nextIndex: number; routineName: string; dayName: string } | null {
  const day = db
    .select({ routineId: routineDays.routineId, routineName: routines.name })
    .from(routineDays)
    .innerJoin(routines, eq(routines.id, routineDays.routineId))
    .where(eq(routineDays.id, routineDayId))
    .get();
  if (!day) return null;
  const days = db
    .select({ id: routineDays.id, name: routineDays.name })
    .from(routineDays)
    .where(eq(routineDays.routineId, day.routineId))
    .orderBy(asc(routineDays.position))
    .all();
  const nextIndex = (days.findIndex((d) => d.id === routineDayId) + 1) % days.length;
  return { routineId: day.routineId, nextIndex, routineName: day.routineName, dayName: days[nextIndex].name };
}

/**
 * What Up next will show once this workout is finished: the title of its routine's day after this one ("Pull A",
 * "5×5 A"). Null for an unknown or empty workout, a day deleted since it started, or a routine that is not the active
 * one, since Up next shows only the active routine.
 */
export function getNextDayTitle(db: Db, workoutId: string): string | null {
  const workout = db.select({ routineDayId: workouts.routineDayId }).from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.routineDayId === null) return null;
  const next = dayAfter(db, workout.routineDayId);
  if (next === null || next.routineId !== getSettings(db).activeRoutineId) return null;
  return dayTitle(next.routineName, next.dayName);
}

/** One exercise's outcome as `storeOutcomes` stored it, with the routine slot it came from (null when none). */
export type StoredOutcome = {
  routineExerciseId: string | null;
  exerciseId: string;
  outcome: Outcome;
  nextWeight: number | null;
  nextUnit: WeightUnit | null;
};

/**
 * Runs the rule (spec 7.3, 18.7) on each exercise of the workout, in position order, and stores its working weight,
 * outcome and next weight on the workout exercise. It writes nothing else: the routine slots are the caller's (finish
 * writes them from this workout, a history edit re-reads the newest finished workout of each slot). "Marked" is the
 * exercise flagged Something off. Each exercise uses its own rule snapshot and planned weight; barbell raises round
 * with the bar and plates in Settings now, for the working unit. With `only`, just those workout exercises are run;
 * the others keep what is stored.
 */
export function storeOutcomes(db: Db, workoutId: string, only?: readonly string[]): StoredOutcome[] {
  const settings = getSettings(db);
  const gear = { lb: gearFor('lb', settings), kg: gearFor('kg', settings) };
  const rows = db
    .select({ we: workoutExercises, loggingType: exercises.loggingType, equipment: exercises.equipment })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      only === undefined
        ? eq(workoutExercises.workoutId, workoutId)
        : and(eq(workoutExercises.workoutId, workoutId), inArray(workoutExercises.id, [...only])),
    )
    .orderBy(asc(workoutExercises.position))
    .all();
  const stored: StoredOutcome[] = [];
  for (const { we, loggingType, equipment } of rows) {
    const exerciseSets = db
      .select({
        setType: sets.setType,
        done: sets.done,
        weight: sets.weight,
        weightUnit: sets.weightUnit,
        reps: sets.reps,
        durationS: sets.durationS,
      })
      .from(sets)
      .where(eq(sets.workoutExerciseId, we.id))
      .all();
    const result = computeOutcome({
      // No routine exercise means no rule (7.3 step 3), whatever the row snapshotted.
      rule: we.routineExerciseId === null ? null : ruleOf(we),
      plannedWeight: we.plannedWeight,
      plannedUnit: we.plannedUnit,
      loggingType,
      equipment,
      marked: we.mark !== null,
      sets: exerciseSets,
      gear,
    });
    db.update(workoutExercises)
      .set({
        workingWeight: result.workingWeight,
        workingUnit: result.workingUnit,
        outcome: result.outcome,
        nextWeight: result.nextWeight,
        nextUnit: result.nextUnit,
      })
      .where(eq(workoutExercises.id, we.id))
      .run();
    stored.push({
      routineExerciseId: we.routineExerciseId,
      exerciseId: we.exerciseId,
      outcome: result.outcome,
      nextWeight: result.nextWeight,
      nextUnit: result.nextUnit,
    });
  }
  return stored;
}

/**
 * Runs the rule on the workout (`storeOutcomes`) and, unless an outcome is `no_rule`, writes its next weight to the
 * routine exercise it came from, if that slot still holds the same exercise (R74). At finish the workout is the newest
 * finished one of each of its slots, so its own outcomes are the slots' next weights (7.3).
 */
function writeOutcomes(db: Db, workoutId: string): void {
  for (const o of storeOutcomes(db, workoutId)) {
    if (o.routineExerciseId !== null && o.outcome !== 'no_rule') {
      // Only while the routine slot still holds this exercise (R74).
      db.update(routineExercises)
        .set({ nextWeight: o.nextWeight, nextWeightUnit: o.nextUnit })
        .where(and(eq(routineExercises.id, o.routineExerciseId), eq(routineExercises.exerciseId, o.exerciseId)))
        .run();
    }
  }
}

/**
 * Finishes a workout in one transaction: unticked sets are dropped, then exercises left with no sets, then each
 * remaining exercise keeps a copy of its current note (null when it has none) so later note edits never touch
 * history, and runs the rule (`writeOutcomes`), which writes next time's weight back to the routine. The workout is
 * marked finished with its rest timer cleared, its PR flags are written (`writePrFlags`), the saved workout it was
 * started from remembers today's sets (`rememberSavedWorkout`), and the routine's rotation moves to the day after this one. Throws
 * `NothingTickedError`, changing nothing, if no set is ticked.
 */
export function finishWorkout(db: Db, workoutId: string, now: number): void {
  db.transaction((tx) => {
    const workout = requireActiveWorkout(tx, workoutId);

    const ticked = tx
      .select({ n: count() })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(and(eq(workoutExercises.workoutId, workoutId), eq(sets.done, true)))
      .get();
    if (!ticked || ticked.n === 0) throw new NothingTickedError();

    const exerciseIds = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId));
    tx.delete(sets)
      .where(and(inArray(sets.workoutExerciseId, exerciseIds), eq(sets.done, false)))
      .run();
    tx.delete(workoutExercises)
      .where(
        and(
          eq(workoutExercises.workoutId, workoutId),
          notInArray(
            workoutExercises.id,
            tx.select({ id: sets.workoutExerciseId }).from(sets).where(inArray(sets.workoutExerciseId, exerciseIds)),
          ),
        ),
      )
      .run();

    // One correlated subquery per row: null when the exercise has no note.
    const currentNote = sql`(
      select ${exerciseNotes.text} from ${exerciseNotes}
      where ${exerciseNotes.exerciseId} = ${workoutExercises.exerciseId}
    )`;
    tx.update(workoutExercises).set({ note: currentNote }).where(eq(workoutExercises.workoutId, workoutId)).run();

    writeOutcomes(tx, workoutId);

    tx.update(workouts)
      .set({ status: 'finished', finishedAt: now, restEndsAt: null, restSetId: null })
      .where(eq(workouts.id, workoutId))
      .run();

    // Phase 4 (R102, R123): after the status update, since PR eligibility reads finished workouts (R103).
    writePrFlags(tx, workoutId);
    rememberSavedWorkout(tx, workoutId);

    // The routine or day may have been deleted since the workout started; then there is no rotation to move.
    const next = workout.routineDayId === null ? null : dayAfter(tx, workout.routineDayId);
    if (next) {
      tx.update(routines).set({ nextDayIndex: next.nextIndex }).where(eq(routines.id, next.routineId)).run();
    }
  });
}

/** Deletes an active workout with its exercises and sets. The rotation pointer does not move. */
export function discardWorkout(db: Db, workoutId: string): void {
  db.transaction((tx) => {
    requireActiveWorkout(tx, workoutId);
    const exerciseIds = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId));
    tx.delete(sets).where(inArray(sets.workoutExerciseId, exerciseIds)).run();
    tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).run();
    tx.delete(workouts).where(eq(workouts.id, workoutId)).run();
  });
}

/**
 * Moves the end of the running rest timer (-15s), keeping the set that started it; or, with null, clears the rest and
 * that set together (Skip).
 */
export function setRestEndsAt(db: Db, workoutId: string, endsAt: number | null): void {
  const patch = endsAt === null ? { restEndsAt: null, restSetId: null } : { restEndsAt: endsAt };
  db.update(workouts).set(patch).where(eq(workouts.id, workoutId)).run();
}

/** Starts a rest timer: its absolute end, and the set whose tick started it, which the countdown shows under (R38). */
export function startRest(db: Db, workoutId: string, endsAt: number, setId: string): void {
  db.update(workouts).set({ restEndsAt: endsAt, restSetId: setId }).where(eq(workouts.id, workoutId)).run();
}

/**
 * Clears the rest end, and the set that started it, only if the end is still `endsAt`, the end that was just dealt
 * with. A tick that started a new rest in the meantime keeps its end and its set.
 */
export function clearRestEndsAtIf(db: Db, workoutId: string, endsAt: number): void {
  db.update(workouts)
    .set({ restEndsAt: null, restSetId: null })
    .where(and(eq(workouts.id, workoutId), eq(workouts.restEndsAt, endsAt)))
    .run();
}

/**
 * Ticks a set with the values `resolveTick` produced. `weight_unit` and `distance_unit` are the units the
 * weight and the distance were logged in, and stay null when the set has no weight or no distance.
 */
export function tickSet(
  db: Db,
  setId: string,
  v: TickValues,
  unit: WeightUnit,
  now: number,
  distanceUnit: DistanceUnit,
): void {
  db.update(sets)
    .set({
      weight: v.weight,
      weightUnit: v.weight === null ? null : unit,
      reps: v.reps,
      durationS: v.durationS,
      distance: v.distance,
      distanceUnit: v.distance === null ? null : distanceUnit,
      // An AMRAP score's extra reps (R607); every other type has none.
      extraReps: v.extraReps ?? null,
      done: true,
      completedAt: now,
    })
    .where(eq(sets.id, setId))
    .run();
}

/** Un-ticks a set. Its values stay, so ticking it again needs no retyping. */
export function untickSet(db: Db, setId: string): void {
  db.update(sets).set({ done: false, completedAt: null }).where(eq(sets.id, setId)).run();
}
