import { startEmptyWorkout, startWorkoutFromDay } from '../db/repositories/workoutsRepo';
import type { Db } from '../db/types';
import { bumpData } from './dataVersion';

/**
 * What a screen calls to change the session. Each one writes, then bumps the data version so screens read again.
 * The time comes from the clock here, at the edge of the app. Both throw `ActiveWorkoutExistsError` while a workout is active.
 */

/** Starts a workout from a routine day. */
export function startFromDay(db: Db, routineDayId: string): void {
  startWorkoutFromDay(db, routineDayId, Date.now());
  bumpData();
}

/** Starts an empty workout. */
export function startEmpty(db: Db): void {
  startEmptyWorkout(db, Date.now());
  bumpData();
}
