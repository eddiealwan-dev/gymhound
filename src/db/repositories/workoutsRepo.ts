import { and, asc, count, eq, inArray, isNotNull, notInArray, or, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { planInUnit } from '../../domain/plates';
import type { TickValues } from '../../domain/setEntry';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { convertIncrement } from '../../domain/units';
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
    const day = tx.select().from(routineDays).where(eq(routineDays.id, routineDayId)).get();
    if (!day) throw new Error(`No routine day with id ${routineDayId}.`);

    const workoutId = newId();
    tx.insert(workouts)
      .values({
        id: workoutId,
        name: day.name,
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

/** How many sets are not ticked but already have a weight, reps, duration or distance typed in. */
export function countUntickedWithValues(db: Db, workoutId: string): number {
  const row = db
    .select({ n: count() })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .where(
      and(
        eq(workoutExercises.workoutId, workoutId),
        eq(sets.done, false),
        or(isNotNull(sets.weight), isNotNull(sets.reps), isNotNull(sets.durationS), isNotNull(sets.distance)),
      ),
    )
    .get();
  return row?.n ?? 0;
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
      .set({ status: 'finished', finishedAt: now, restEndsAt: null })
      .where(eq(workouts.id, workoutId))
      .run();

    // The routine or day may have been deleted since the workout started; then there is no rotation to move.
    const day =
      workout.routineDayId === null
        ? undefined
        : tx.select().from(routineDays).where(eq(routineDays.id, workout.routineDayId)).get();
    if (day) {
      const days = tx
        .select({ id: routineDays.id })
        .from(routineDays)
        .where(eq(routineDays.routineId, day.routineId))
        .orderBy(asc(routineDays.position))
        .all();
      const index = days.findIndex((d) => d.id === day.id);
      tx.update(routines)
        .set({ nextDayIndex: (index + 1) % days.length })
        .where(eq(routines.id, day.routineId))
        .run();
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

/** Stores the absolute end time of the running rest timer, or null to clear it. */
export function setRestEndsAt(db: Db, workoutId: string, endsAt: number | null): void {
  db.update(workouts).set({ restEndsAt: endsAt }).where(eq(workouts.id, workoutId)).run();
}

/**
 * Clears the rest end only if it is still `endsAt`, the end that was just dealt with. A tick that started a new rest in
 * the meantime keeps its end.
 */
export function clearRestEndsAtIf(db: Db, workoutId: string, endsAt: number): void {
  db.update(workouts)
    .set({ restEndsAt: null })
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
