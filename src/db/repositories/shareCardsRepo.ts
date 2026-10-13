import { and, asc, between, eq, inArray, sql } from 'drizzle-orm';
import { shiftDay } from '../../domain/dates';
import type { PrHighlight } from '../../domain/prs';
import { pbCardModel, weekCardModel, type PbCardModel, type PbHistorySet, type WeekCardModel } from '../../domain/shareCards';
import type { WeightUnit } from '../../domain/types';
import { exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { prCountBetween } from './analyticsRepo';
import { getWorkoutPrs } from './prRepo';
import { getTrainingDates } from './workoutViewsRepo';

/**
 * What the share cards read (§18.17). The words and numbers are worked out in `src/domain/shareCards.ts`; these only
 * fetch the rows, in the order `recomputePrFlags` uses, so a card says the same as the PR marks.
 */

/** Every set of a lift from finished workouts, in time order, with its workout's date. */
export function liftHistory(db: Db, exerciseId: string): PbHistorySet[] {
  return db
    .select({
      id: sets.id,
      workoutId: workoutExercises.workoutId,
      setType: sets.setType,
      done: sets.done,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
      durationS: sets.durationS,
      localDate: workouts.localDate,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(workouts.status, 'finished')))
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(sql`${sets.completedAt} is null`), asc(sets.completedAt), asc(workoutExercises.position), asc(sets.position))
    .all();
}

/** The personal best card for a highlight set in `workoutId`: the previous best, how far it beat it, and the session count. */
export function pbCardFor(db: Db, highlight: PrHighlight, workoutId: string, locale: string): PbCardModel {
  return pbCardModel(highlight, workoutId, liftHistory(db, highlight.exerciseId), locale);
}

/** The weekly summary card for the Monday-first week starting `monday` (R449–R452). */
export function weekCardFor(db: Db, monday: string, today: string, unit: WeightUnit, locale: string): WeekCardModel {
  const sunday = shiftDay(monday, 6);
  const weekWorkouts = db
    .select({ id: workouts.id, localDate: workouts.localDate, startedAt: workouts.startedAt, finishedAt: workouts.finishedAt })
    .from(workouts)
    .where(and(eq(workouts.status, 'finished'), between(workouts.localDate, monday, sunday)))
    .orderBy(asc(workouts.startedAt), asc(workouts.id))
    .all()
    .map((w) => ({ ...w, finishedAt: w.finishedAt ?? w.startedAt }));
  const ids = weekWorkouts.map((w) => w.id);
  const weekSets =
    ids.length === 0
      ? []
      : db
          .select({
            workoutId: workoutExercises.workoutId,
            exerciseId: workoutExercises.exerciseId,
            name: exercises.name,
            loggingType: exercises.loggingType,
            setType: sets.setType,
            done: sets.done,
            weight: sets.weight,
            weightUnit: sets.weightUnit,
            reps: sets.reps,
          })
          .from(sets)
          .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
          .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
          .where(inArray(workoutExercises.workoutId, ids))
          .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.position), asc(sets.position))
          .all();
  return weekCardModel({
    monday,
    today,
    unit,
    locale,
    workouts: weekWorkouts,
    sets: weekSets,
    prs: weekWorkouts.flatMap((w) => getWorkoutPrs(db, w.id)),
    prCount: prCountBetween(db, monday, sunday),
    trainingDates: getTrainingDates(db),
  });
}
