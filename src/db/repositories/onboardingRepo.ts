import { count, eq } from 'drizzle-orm';
import { workouts } from '../schema';
import type { Db } from '../types';

/**
 * How many workouts have been finished. The first-run lines (§18.15) show while it is 0, and the finish summary's
 * "Personal bests start with your next workout." while it is 1 (R405).
 */
export function finishedWorkoutCount(db: Db): number {
  const row = db.select({ n: count() }).from(workouts).where(eq(workouts.status, 'finished')).get();
  return row?.n ?? 0;
}
