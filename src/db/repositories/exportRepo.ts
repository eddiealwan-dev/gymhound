import { and, asc, eq } from 'drizzle-orm';
import {
  buildBodyCsvRows,
  buildFoodCsvRows,
  buildWorkoutCsvRows,
  deviceOffsetMinutes,
  type BodyCsvEntry,
  type CsvValue,
} from '../../domain/csv';
import {
  bodyweight,
  exercises,
  foodLog,
  measurements,
  routineDays,
  routines,
  sets,
  workoutExercises,
  workouts,
} from '../schema';
import type { Db } from '../types';

/**
 * The rows of the workouts CSV (spec §11), one per done set of a finished workout, ordered by start time, then
 * exercise position, then set position. The routine and day are their names, empty when the workout was not started
 * from one. Times carry the offset `offsetAt` gives for each instant: by default the device's own at that instant.
 */
export function workoutCsvRows(db: Db, offsetAt: (epochMs: number) => number = deviceOffsetMinutes): CsvValue[][] {
  const records = db
    .select({
      workoutId: workouts.id,
      localDate: workouts.localDate,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      workoutName: workouts.name,
      routineName: routines.name,
      routineDayName: routineDays.name,
      mark: workoutExercises.mark,
      workoutExerciseId: workoutExercises.id,
      exerciseName: exercises.name,
      exerciseId: exercises.id,
      setType: sets.setType,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
      rpe: sets.rpe,
      durationS: sets.durationS,
      distance: sets.distance,
      distanceUnit: sets.distanceUnit,
      prFlags: sets.prFlags,
      exerciseNote: workoutExercises.note,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(routines, eq(routines.id, workouts.routineId))
    .leftJoin(routineDays, eq(routineDays.id, workouts.routineDayId))
    .where(and(eq(workouts.status, 'finished'), eq(sets.done, true)))
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position), asc(sets.position))
    .all();
  return buildWorkoutCsvRows(records, offsetAt);
}

/**
 * The rows of the food CSV (spec §11), one per food log entry, ordered by the day it is logged for, then the time
 * logged. Each entry's own copied name and totals are written, never the food's current ones (§6). Pro is not asked:
 * the food CSV stays free, and a lapsed user keeps it (§9, R153). Times carry the offset `offsetAt` gives for each
 * instant: by default the device's own at that instant.
 */
export function foodCsvRows(db: Db, offsetAt: (epochMs: number) => number = deviceOffsetMinutes): CsvValue[][] {
  const entries = db
    .select({
      localDate: foodLog.localDate,
      loggedAt: foodLog.loggedAt,
      name: foodLog.name,
      servings: foodLog.servings,
      kcal: foodLog.kcal,
      proteinG: foodLog.proteinG,
      carbsG: foodLog.carbsG,
      fatG: foodLog.fatG,
    })
    .from(foodLog)
    .orderBy(asc(foodLog.localDate), asc(foodLog.loggedAt), asc(foodLog.id))
    .all();
  return buildFoodCsvRows(entries, offsetAt);
}

/**
 * The rows of the body CSV (R183): every bodyweight entry and every measurement together, by date, then the time
 * measured, then kind in the Body order. Each value is written as stored, in the unit it was logged in. Free. Times
 * carry the offset `offsetAt` gives for each instant: by default the device's own at that instant.
 */
export function bodyCsvRows(db: Db, offsetAt: (epochMs: number) => number = deviceOffsetMinutes): CsvValue[][] {
  const weights: BodyCsvEntry[] = db
    .select({ localDate: bodyweight.localDate, measuredAt: bodyweight.measuredAt, value: bodyweight.weight, unit: bodyweight.unit })
    .from(bodyweight)
    .orderBy(asc(bodyweight.localDate), asc(bodyweight.measuredAt), asc(bodyweight.id))
    .all()
    .map((e) => ({ ...e, kind: 'bodyweight' }));
  const others: BodyCsvEntry[] = db
    .select({
      localDate: measurements.localDate,
      measuredAt: measurements.measuredAt,
      kind: measurements.kind,
      value: measurements.value,
      unit: measurements.unit,
    })
    .from(measurements)
    .orderBy(asc(measurements.localDate), asc(measurements.measuredAt), asc(measurements.id))
    .all();
  return buildBodyCsvRows([...weights, ...others], offsetAt);
}
