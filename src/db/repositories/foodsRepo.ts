import { and, asc, desc, eq, max, sql } from 'drizzle-orm';
import type { FoodPerServing } from '../../domain/fuel';
import { newId } from '../ids';
import { foodLog, foods } from '../schema';
import type { Db } from '../types';

// Bundled foods come from the seed (R139); your own foods are `source = 'custom'` and are archived, never deleted
// (R144), so a logged day keeps its copy and `getFood` still names them.

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

/** Every food not archived: your own first, then bundled, each by name ignoring case. */
export function listFoods(db: Db): FoodPerServing[] {
  return db
    .select(columns)
    .from(foods)
    .where(eq(foods.archived, false))
    .orderBy(
      sql`case ${foods.source} when 'custom' then 0 else 1 end`,
      sql`${foods.name} collate nocase`,
      asc(foods.id),
    )
    .all();
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

/** Saves one of your own foods (already validated by `validateCustomFood`). Returns the new id. */
export function createCustomFood(db: Db, food: Omit<FoodPerServing, 'id' | 'source'>): string {
  const id = newId();
  db.insert(foods)
    .values({ ...food, id, source: 'custom', barcode: null, archived: false })
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
