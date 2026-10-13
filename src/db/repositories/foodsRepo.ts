import { and, asc, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';
import type { FoodPerServing } from '../../domain/fuel';
import { barcodeVariants, type OnlineFood } from '../../domain/openFoodFacts';
import { newId } from '../ids';
import { foodLog, foods } from '../schema';
import type { Db } from '../types';

// Bundled foods come from the seed (R139, R545); your own foods are `source = 'custom'` and are archived, never deleted
// (R144), so a logged day keeps its copy and `getFood` still names them. Foods found on Open Food Facts are kept as
// `source = 'online'` (R546).

const columns = {
  id: foods.id,
  name: foods.name,
  servingLabel: foods.servingLabel,
  servingGrams: foods.servingGrams,
  kcal: foods.kcal,
  proteinG: foods.proteinG,
  carbsG: foods.carbsG,
  fatG: foods.fatG,
  source: foods.source,
};

/**
 * Every food not archived: your own first, then the rest, each by name ignoring case. `which` narrows it to the bundled
 * foods, or to yours and the ones found online (R546), which the add screen reads apart (`createLocalFoodLookup`).
 */
export function listFoods(db: Db, which: 'all' | 'bundled' | 'yours' = 'all'): FoodPerServing[] {
  const part = which === 'bundled' ? eq(foods.source, 'bundled') : which === 'yours' ? ne(foods.source, 'bundled') : undefined;
  return db
    .select(columns)
    .from(foods)
    .where(and(eq(foods.archived, false), part))
    .orderBy(
      sql`case ${foods.source} when 'custom' then 0 else 1 end`,
      sql`${foods.name} collate nocase`,
      asc(foods.id),
    )
    .all();
}

/** Whether a food is in the list: there and not archived (deleted). */
export function isFoodListed(db: Db, id: string): boolean {
  return db.select({ id: foods.id }).from(foods).where(and(eq(foods.id, id), eq(foods.archived, false))).get() !== undefined;
}

/** One food, archived ones included; null when there is none. */
export function getFood(db: Db, id: string): FoodPerServing | null {
  return db.select(columns).from(foods).where(eq(foods.id, id)).get() ?? null;
}

/**
 * Up to `limit` foods most recently logged, each once, newest logged first; archived foods and quick adds are left out.
 */
export function recentFoods(db: Db, limit = 12): FoodPerServing[] {
  const lastLogged = max(foodLog.loggedAt);
  return db
    .select(columns)
    .from(foodLog)
    .innerJoin(foods, eq(foods.id, foodLog.foodId))
    .where(eq(foods.archived, false))
    .groupBy(foods.id)
    .orderBy(desc(lastLogged), asc(foods.id))
    .limit(limit)
    .all();
}

/** The names of your own foods not archived, leaving out `exceptId` (the one being edited), for `validateCustomFood`. */
export function customFoodNames(db: Db, exceptId?: string): string[] {
  return db
    .select({ id: foods.id, name: foods.name })
    .from(foods)
    .where(and(eq(foods.source, 'custom'), eq(foods.archived, false)))
    .all()
    .filter((f) => f.id !== exceptId)
    .map((f) => f.name);
}

/**
 * Saves one of your own foods (already validated by `validateCustomFood`). Returns the new id. `barcode` is the code it
 * was made for from a scan nothing knew (R547), so scanning it again finds it.
 */
export function createCustomFood(db: Db, food: Omit<FoodPerServing, 'id' | 'source'>, barcode: string | null = null): string {
  const id = newId();
  db.insert(foods)
    .values({ ...food, id, source: 'custom', barcode, archived: false })
    .run();
  return id;
}

/**
 * The food on the phone with this barcode, in any of its forms (`barcodeVariants`), or null: your own first, then one
 * found online before. Archived foods don't count.
 */
export function findFoodByBarcode(db: Db, code: string): FoodPerServing | null {
  return (
    db
      .select(columns)
      .from(foods)
      .where(and(inArray(foods.barcode, barcodeVariants(code)), eq(foods.archived, false)))
      .orderBy(sql`case ${foods.source} when 'custom' then 0 else 1 end`, asc(foods.id))
      .get() ?? null
  );
}

/**
 * Keeps a food found on Open Food Facts on the phone (R546), as `off-{barcode}`, and returns its id: a later search,
 * scan or Recent finds it offline. Found again, it takes Open Food Facts' current numbers; days already logged keep
 * their own copies (§6).
 */
export function saveOnlineFood(db: Db, food: OnlineFood): string {
  const id = `off-${food.barcode}`;
  const values = {
    name: food.name,
    servingLabel: food.servingLabel,
    servingGrams: food.servingGrams,
    kcal: food.kcal,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
  };
  db.insert(foods)
    .values({ ...values, id, source: 'online', barcode: food.barcode, archived: false })
    .onConflictDoUpdate({ target: foods.id, set: { ...values, archived: false } })
    .run();
  return id;
}

function requireCustom(db: Db, id: string): void {
  const row = db.select({ source: foods.source }).from(foods).where(eq(foods.id, id)).get();
  if (!row) throw new Error(`No food ${id}`);
  if (row.source !== 'custom') throw new Error(`Food ${id} is bundled and can't be changed`);
}

/** Changes one of your own foods; entries already logged keep their copies (§6). Throws for a bundled or missing food. */
export function updateCustomFood(db: Db, id: string, food: Omit<FoodPerServing, 'id' | 'source'>): void {
  requireCustom(db, id);
  db.update(foods)
    .set({
      name: food.name,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      kcal: food.kcal,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
    })
    .where(eq(foods.id, id))
    .run();
}

/** Deleting one of your own foods archives it (R144). Throws for a bundled or missing food. */
export function archiveCustomFood(db: Db, id: string): void {
  requireCustom(db, id);
  db.update(foods).set({ archived: true }).where(eq(foods.id, id)).run();
}
