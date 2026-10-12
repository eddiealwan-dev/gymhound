import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import type { HealthDueRow } from '../../domain/health';
import { bodyweight, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';

/**
 * PHASE 7: what GymHound keeps about Apple Health and Health Connect (§17.1, R307–R309). The workout row says whether
 * its copy was written (`health_status`, `health_record_id`); the Rough sleep offer is recorded once per workout
 * (`sleep_offer_shown`), as the Short on food offer is (R152).
 */

/** The finished workouts at or after `since`, for `healthWritesDue`. */
export function healthRowsSince(db: Db, since: number): HealthDueRow[] {
  return db
    .select({ id: workouts.id, status: workouts.status, finishedAt: workouts.finishedAt, healthStatus: workouts.healthStatus })
    .from(workouts)
    .where(and(eq(workouts.status, 'finished'), gte(workouts.finishedAt, since)))
    .all();
}

/** The fields a Health record is made from, or null when the workout is gone. */
export function workoutForHealth(db: Db, workoutId: string): { id: string; name: string; startedAt: number; finishedAt: number | null } | null {
  return (
    db
      .select({ id: workouts.id, name: workouts.name, startedAt: workouts.startedAt, finishedAt: workouts.finishedAt })
      .from(workouts)
      .where(eq(workouts.id, workoutId))
      .get() ?? null
  );
}

/** Records a write: done with the store's id, or failed (tried again later). A workout deleted meanwhile is left alone. */
export function recordHealthWrite(db: Db, workoutId: string, result: { status: 'done'; recordId: string } | { status: 'failed' }): void {
  db.update(workouts)
    .set(result.status === 'done' ? { healthStatus: 'done', healthRecordId: result.recordId } : { healthStatus: 'failed' })
    .where(eq(workouts.id, workoutId))
    .run();
}

/** The id of the record GymHound wrote for the workout, or null. */
export function healthRecordIdOf(db: Db, workoutId: string): string | null {
  return db.select({ id: workouts.healthRecordId }).from(workouts).where(eq(workouts.id, workoutId)).get()?.id ?? null;
}

/**
 * Whether the active workout `workoutId` may still show the Rough sleep offer: not yet shown, with an exercise left to
 * flag and none already Rough sleep. Whether Health says to offer it is the caller's (R309).
 */
export function sleepOfferOpen(db: Db, workoutId: string): boolean {
  const workout = db.select({ status: workouts.status, shown: workouts.sleepOfferShown }).from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'active' || workout.shown) return false;
  const marks = db.select({ mark: workoutExercises.mark }).from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).all();
  return marks.some((m) => m.mark === null) && !marks.some((m) => m.mark === 'rough_sleep');
}

/**
 * Mark it: in one transaction, flags every exercise with no mark Rough sleep (others keep theirs) and records the offer
 * as shown. Once shown it flags nothing and returns 0. Returns how many it flagged. Throws outside the active workout.
 */
export function flagUnmarkedRoughSleep(db: Db, workoutId: string): number {
  return db.transaction((tx) => {
    const workout = tx.select({ status: workouts.status, shown: workouts.sleepOfferShown }).from(workouts).where(eq(workouts.id, workoutId)).get();
    if (workout?.status !== 'active') throw new Error(`Workout ${workoutId} is not the active workout.`);
    if (workout.shown) return 0;
    const unmarked = and(eq(workoutExercises.workoutId, workoutId), isNull(workoutExercises.mark));
    const count = tx.select({ id: workoutExercises.id }).from(workoutExercises).where(unmarked).all().length;
    tx.update(workoutExercises).set({ mark: 'rough_sleep' }).where(unmarked).run();
    tx.update(workouts).set({ sleepOfferShown: true }).where(eq(workouts.id, workoutId)).run();
    return count;
  });
}

/** The offer's ×, or an offer judged not due: it never appears again for this workout. */
export function setSleepOfferShown(db: Db, workoutId: string): void {
  db.update(workouts).set({ sleepOfferShown: true }).where(eq(workouts.id, workoutId)).run();
}

/** When the app's newest body weight was measured, or null with none (R311). */
export function latestBodyweightAt(db: Db): number | null {
  return db.select({ at: bodyweight.measuredAt }).from(bodyweight).orderBy(desc(bodyweight.measuredAt)).limit(1).get()?.at ?? null;
}
