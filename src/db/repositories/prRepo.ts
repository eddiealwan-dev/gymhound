import type { Db } from '../types';

/**
 * Writes `sets.pr_flags` (§7.6) for every exercise in a workout that has just been marked finished. Called by
 * `finishWorkout` inside its transaction, after the status update, as PR eligibility reads finished workouts (R103).
 *
 * Phase 4 contract (R123): a no-op stub until Task 3 fills it.
 */
export function writePrFlags(db: Db, workoutId: string): void {
  // Not built yet (phase 4 stub).
}
