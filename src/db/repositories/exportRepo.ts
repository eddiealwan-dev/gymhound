import { and, asc, eq } from 'drizzle-orm';
import { buildWorkoutCsvRows, deviceOffsetMinutes, type CsvValue } from '../../domain/csv';
import { exercises, routineDays, routines, sets, workoutExercises, workouts } from '../schema';
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
      dayMark: workouts.dayMark,
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
