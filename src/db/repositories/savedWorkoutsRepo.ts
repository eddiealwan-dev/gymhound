import type { Db } from '../types';

/**
 * When a finished workout was started from a saved workout, rewrites that saved workout's logged exercises with the
 * sets done today (R120). Called by `finishWorkout` inside its transaction, after `writePrFlags`.
 *
 * Phase 4 contract (R123): a no-op stub until Task 11 fills it.
 */
export function rememberSavedWorkout(db: Db, workoutId: string): void {
  // Not built yet (phase 4 stub).
}
