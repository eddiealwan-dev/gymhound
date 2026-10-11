import { and, asc, count, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { planInUnit } from '../../domain/plates';
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
import { getSettings } from './settingsRepo';

/** Raised when a workout is started while another one is still active. */
export class ActiveWorkoutExistsError extends Error {
  constructor() {
    super('A workout is already active.');
    this.name = 'ActiveWorkoutExistsError';
  }
}

/** Raised when a workout is finished with no set ticked. An empty workout never reaches history. */
export class NothingTickedError extends Error {
  constructor() {
    super('Nothing is ticked yet.');
    this.name = 'NothingTickedError';
  }
}

export function getActiveWorkoutId(db: Db): string | null {
  return db.select({ id: workouts.id }).from(workouts).where(eq(workouts.status, 'active')).get()?.id ?? null;
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

function assertNoActiveWorkout(db: Db): void {
  if (getActiveWorkoutId(db) !== null) throw new ActiveWorkoutExistsError();
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

/**
 * Finishes a workout in one transaction: unticked sets are dropped, then exercises left with no sets, then each
 * remaining exercise keeps a copy of its current note (null when it has none) so later note edits never touch
 * history. The workout is marked finished with its rest timer cleared, and the routine's rotation moves to the
 * day after this one. Throws `NothingTickedError`, changing nothing, if no set is ticked.
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

    tx.update(workouts)
      .set({ status: 'finished', finishedAt: now, restEndsAt: null, restSetId: null })
      .where(eq(workouts.id, workoutId))
      .run();

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
