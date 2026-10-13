import { eq } from 'drizzle-orm';
import { workouts } from '../schema';
import type { Db } from '../types';

// The one-active-workout check, on its own so any repository that starts a workout (workoutsRepo, savedWorkoutsRepo)
// can use it without a require cycle. workoutsRepo re-exports all three.

/** Raised when a workout is started while another one is still active. */
export class ActiveWorkoutExistsError extends Error {
  constructor() {
    super('A workout is already active.');
    this.name = 'ActiveWorkoutExistsError';
  }
}

export function getActiveWorkoutId(db: Db): string | null {
  return db.select({ id: workouts.id }).from(workouts).where(eq(workouts.status, 'active')).get()?.id ?? null;
}

/** Throws `ActiveWorkoutExistsError` if a workout is active. Every way of starting a workout calls it first. */
export function assertNoActiveWorkout(db: Db): void {
  if (getActiveWorkoutId(db) !== null) throw new ActiveWorkoutExistsError();
}
