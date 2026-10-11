import { asc, eq } from 'drizzle-orm';
import { newId } from '../ids';
import { waterLog } from '../schema';
import type { Db } from '../types';
import { setSetting } from './settingsRepo';

// Water (R150, free): one row per drink in `water_log` (0007), in ml, dated by the day it is logged for. The daily goal
// is the `water_goal_ml` setting, null until the user sets one.

export type WaterEntry = { id: string; loggedAt: number; amountMl: number };

/** One day's water, in the order it was logged. */
export function listWater(db: Db, localDate: string): WaterEntry[] {
  return db
    .select({ id: waterLog.id, loggedAt: waterLog.loggedAt, amountMl: waterLog.amountMl })
    .from(waterLog)
    .where(eq(waterLog.localDate, localDate))
    .orderBy(asc(waterLog.loggedAt), asc(waterLog.id))
    .all();
}

/** One day's water in ml, summed unrounded (the screen rounds once). */
export function waterTotal(db: Db, localDate: string): number {
  return listWater(db, localDate).reduce((sum, e) => sum + e.amountMl, 0);
}

/** Logs `amountMl` for `localDate` (which may be an earlier day), at `now`. Returns the new id. */
export function logWater(db: Db, amountMl: number, localDate: string, now: number): string {
  if (!Number.isFinite(amountMl) || amountMl <= 0) throw new Error(`Not an amount of water: ${amountMl}`);
  const id = newId();
  db.insert(waterLog).values({ id, localDate, loggedAt: now, amountMl }).run();
  return id;
}

export function deleteWater(db: Db, id: string): void {
  db.delete(waterLog).where(eq(waterLog.id, id)).run();
}

/** Sets the daily goal in ml, or clears it with null. */
export function setWaterGoal(db: Db, ml: number | null): void {
  setSetting(db, 'waterGoalMl', ml);
}
