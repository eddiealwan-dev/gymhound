import { and, asc, count, eq, isNull, lte, sql } from 'drizzle-orm';
import type { SeriesPoint } from '../../domain/chart';
import { type EntryTotals, entryTotals, MAX_SERVINGS, rescaleEntry } from '../../domain/fuel';
import type { FuelTargets } from '../../domain/types';
import { newId } from '../ids';
import { foodLog, workouts } from '../schema';
import type { Db } from '../types';
import { getFood } from './foodsRepo';
import { getSettings, setSetting } from './settingsRepo';

// Every entry stores its own name, serving label and totals, copied when it is logged (§6, R158): a food edited,
// relabelled or archived later never changes a past day, and editing servings rescales the entry's own totals (R142).

/** One row of the food log. `servingLabel` is the copy made when logged: null for a quick add or an entry from before 0007. */
export type FoodEntry = EntryTotals & {
  id: string;
  localDate: string;
  loggedAt: number;
  foodId: string | null;
  name: string;
  servings: number;
  servingLabel: string | null;
};

function assertServings(servings: number): void {
  if (!(servings > 0 && servings <= MAX_SERVINGS)) {
    throw new Error(`Servings must be more than 0 and at most ${MAX_SERVINGS}, not ${servings}`);
  }
}

/** Quick-add totals must be finite and not below 0 (`parseQuickAdd` checks the bounds the screen shows). */
function assertTotals(t: EntryTotals): void {
  for (const value of [t.kcal, t.proteinG, t.carbsG, t.fatG]) {
    if (!(Number.isFinite(value) && value >= 0)) throw new Error(`Totals must be finite and at least 0, not ${value}`);
  }
}

/** The entries of one day, in the order they were logged. */
export function listEntries(db: Db, localDate: string): FoodEntry[] {
  return db
    .select({
      id: foodLog.id,
      localDate: foodLog.localDate,
      loggedAt: foodLog.loggedAt,
      foodId: foodLog.foodId,
      name: foodLog.name,
      servings: foodLog.servings,
      servingLabel: foodLog.servingLabel,
      kcal: foodLog.kcal,
      proteinG: foodLog.proteinG,
      carbsG: foodLog.carbsG,
      fatG: foodLog.fatG,
    })
    .from(foodLog)
    .where(eq(foodLog.localDate, localDate))
    .orderBy(asc(foodLog.loggedAt), asc(foodLog.id))
    .all();
}

/**
 * Logs `servings` of a food for `localDate` (the day being viewed, R148), copying its name, serving label (R158) and
 * totals (§6). Throws for a missing food or servings outside more than 0 to `MAX_SERVINGS`. Returns the new id.
 */
export function logFood(db: Db, foodId: string, servings: number, localDate: string, now: number): string {
  assertServings(servings);
  const food = getFood(db, foodId);
  if (!food) throw new Error(`No food ${foodId}`);
  const id = newId();
  db.insert(foodLog)
    .values({
      id,
      localDate,
      loggedAt: now,
      foodId,
      name: food.name,
      servingLabel: food.servingLabel,
      servings,
      ...entryTotals(food, servings),
    })
    .run();
  return id;
}

/**
 * Logs a quick add (R143): no food, no serving label, one serving, the given totals. Throws for a NaN, infinite or
 * negative total. Returns the new id.
 */
export function logQuickAdd(db: Db, name: string, totals: EntryTotals, localDate: string, now: number): string {
  assertTotals(totals);
  const id = newId();
  db.insert(foodLog)
    .values({
      id,
      localDate,
      loggedAt: now,
      foodId: null,
      name,
      servingLabel: null,
      servings: 1,
      kcal: totals.kcal,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
    })
    .run();
  return id;
}

/**
 * Changes a food entry's servings, rescaling its own stored totals, never the food's (R142). Throws for servings outside
 * more than 0 to `MAX_SERVINGS` and for a quick add (edit those with `updateQuickAdd`). Missing entries are ignored.
 */
export function updateEntryServings(db: Db, id: string, servings: number): void {
  assertServings(servings);
  db.transaction((tx) => {
    const entry = tx.select().from(foodLog).where(eq(foodLog.id, id)).get();
    if (!entry) return;
    if (entry.foodId === null) throw new Error(`Entry ${id} is a quick add; its servings don't change`);
    tx.update(foodLog)
      .set({ servings, ...rescaleEntry(entry, servings) })
      .where(eq(foodLog.id, id))
      .run();
  });
}

/** Changes a quick add's name and totals. Entries of a food are left alone. Throws for a NaN, infinite or negative total. */
export function updateQuickAdd(db: Db, id: string, name: string, totals: EntryTotals): void {
  assertTotals(totals);
  db.update(foodLog)
    .set({ name, kcal: totals.kcal, proteinG: totals.proteinG, carbsG: totals.carbsG, fatG: totals.fatG })
    .where(and(eq(foodLog.id, id), isNull(foodLog.foodId)))
    .run();
}

export function deleteEntry(db: Db, id: string): void {
  db.delete(foodLog).where(eq(foodLog.id, id)).run();
}

/** §7.11: a training day is one with a finished workout of that local date; an active one doesn't count yet (R146). */
export function isTrainingDay(db: Db, localDate: string): boolean {
  const row = db
    .select({ n: count() })
    .from(workouts)
    .where(and(eq(workouts.localDate, localDate), eq(workouts.status, 'finished')))
    .get();
  return (row?.n ?? 0) > 0;
}

export function getFuelTargets(db: Db): FuelTargets | null {
  return getSettings(db).fuelTargets;
}

export function setFuelTargets(db: Db, targets: FuelTargets): void {
  setSetting(db, 'fuelTargets', targets);
}

/**
 * Whether any food of `localDate` was logged at or before `untilMs`, and the protein of those entries, unrounded:
 * the Short on food offer judges a workout as of its start (R152).
 */
export function proteinLoggedBy(db: Db, localDate: string, untilMs: number): { anyFood: boolean; protein: number } {
  const row = db
    .select({ n: count(), protein: sql<number>`total(${foodLog.proteinG})` })
    .from(foodLog)
    .where(and(eq(foodLog.localDate, localDate), lte(foodLog.loggedAt, untilMs)))
    .get();
  return { anyFood: (row?.n ?? 0) > 0, protein: row?.protein ?? 0 };
}

export type FuelMetric = 'kcal' | 'protein' | 'carbs' | 'fat';

const METRIC_COLUMNS = {
  kcal: foodLog.kcal,
  protein: foodLog.proteinG,
  carbs: foodLog.carbsG,
  fat: foodLog.fatG,
} as const;

/** One point per date with entries, that day's unrounded total of `metric` (R156), oldest first. */
export function dailySeries(db: Db, metric: FuelMetric): SeriesPoint[] {
  return db
    .select({ localDate: foodLog.localDate, value: sql<number>`total(${METRIC_COLUMNS[metric]})` })
    .from(foodLog)
    .groupBy(foodLog.localDate)
    .orderBy(asc(foodLog.localDate))
    .all();
}
