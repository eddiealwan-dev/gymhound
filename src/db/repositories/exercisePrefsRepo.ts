import { eq } from 'drizzle-orm';
import { exercisePrefs } from '../schema';
import type { Db } from '../types';

/** The exercise's own rest in seconds: null when it has none (the rest in Settings applies), 0 when it is Off. */
export function getRestSeconds(db: Db, exerciseId: string): number | null {
  return (
    db
      .select({ restSeconds: exercisePrefs.restSeconds })
      .from(exercisePrefs)
      .where(eq(exercisePrefs.exerciseId, exerciseId))
      .get()?.restSeconds ?? null
  );
}

/** Saves the exercise's own rest: seconds, 0 for Off, or null to go back to the rest in Settings. */
export function setRestSeconds(db: Db, exerciseId: string, seconds: number | null, now: number): void {
  db.insert(exercisePrefs)
    .values({ exerciseId, restSeconds: seconds, updatedAt: now })
    .onConflictDoUpdate({ target: exercisePrefs.exerciseId, set: { restSeconds: seconds, updatedAt: now } })
    .run();
}
