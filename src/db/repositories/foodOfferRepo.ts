import { and, eq, isNull } from 'drizzle-orm';
import { shouldOfferShortOnFood } from '../../domain/fuelPace';
import { workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { getFuelTargets, proteinLoggedBy } from './foodLogRepo';

/**
 * Whether the active workout `workoutId` shows the Short on food offer (§7.10, R152). It is judged as of the workout's
 * start, so it stays the same while the session is open and when it is resumed: the protein of the workout's date
 * logged at or before `started_at`, the pace at `started_at`, and the training-day protein target. Pro must be on, the
 * offer not yet shown, and no exercise already Short on food. A workout with no exercise left to flag (none yet, or
 * every one flagged for another reason) has nothing for Mark it to do, so it is not offered until one is added.
 * A finished or missing workout is never offered.
 */
export function foodOfferDue(db: Db, workoutId: string, isPro: boolean): boolean {
  if (!isPro) return false;
  const workout = db
    .select({ status: workouts.status, startedAt: workouts.startedAt, localDate: workouts.localDate, shown: workouts.foodOfferShown })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .get();
  if (!workout || workout.status !== 'active' || workout.shown) return false;
  const exerciseMarks = db
    .select({ mark: workoutExercises.mark })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all()
    .map((r) => r.mark);
  if (!exerciseMarks.some((m) => m === null)) return false;
  const food = proteinLoggedBy(db, workout.localDate, workout.startedAt);
  return shouldOfferShortOnFood({
    isPro,
    offerShown: workout.shown,
    anyFoodToday: food.anyFood,
    proteinSoFar: food.protein,
    trainingProteinTarget: getFuelTargets(db)?.training.protein ?? null,
    anyExerciseShortOnFood: exerciseMarks.includes('short_on_food'),
    startedAt: workout.startedAt,
  });
}

/** Throws unless `workoutId` is the active workout, as every other session edit does. Says whether the offer was shown. */
function requireActiveWorkout(db: Db, workoutId: string): { shown: boolean } {
  const workout = db
    .select({ status: workouts.status, shown: workouts.foodOfferShown })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .get();
  if (workout?.status !== 'active') throw new Error(`Workout ${workoutId} is not the active workout.`);
  return { shown: workout.shown };
}

/**
 * Mark it (R152): in one transaction, flags every exercise of the active workout that has no mark Short on food (an
 * exercise flagged Pain or any other reason keeps it) and records that the offer was shown. Exercises added later are
 * not flagged. Once the offer was shown (× or Mark it already tapped, as in a quick double tap) it flags nothing and
 * returns 0. Returns how many exercises it flagged. Throws, changing nothing, outside the active workout.
 */
export function flagUnmarkedShortOnFood(db: Db, workoutId: string): number {
  return db.transaction((tx) => {
    if (requireActiveWorkout(tx, workoutId).shown) return 0;
    const unmarked = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.mark)))
      .all();
    tx.update(workoutExercises)
      .set({ mark: 'short_on_food' })
      .where(and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.mark)))
      .run();
    tx.update(workouts).set({ foodOfferShown: true }).where(eq(workouts.id, workoutId)).run();
    return unmarked.length;
  });
}

/** The offer's ×: records that it was shown, so it never appears again for this workout. Flags nothing. */
export function setFoodOfferShown(db: Db, workoutId: string): void {
  db.update(workouts).set({ foodOfferShown: true }).where(eq(workouts.id, workoutId)).run();
}
