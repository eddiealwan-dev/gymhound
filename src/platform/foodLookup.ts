import { listFoods } from '../db/repositories/foodsRepo';
import type { Db } from '../db/types';
import type { FoodPerServing } from '../domain/fuel';
import { indexFoods } from '../domain/foodSearch';
import { isPickedFood } from '../seed/foods';

/**
 * Where the add-food screen finds foods (§8.10). Today only the foods on the phone; a barcode lookup is a later
 * implementation of this seam (the `foods.barcode` column waits for it).
 */
export interface FoodLookup {
  /** Foods on the phone matching `query` (R140); archived foods never show. Empty for an empty query. */
  searchLocal(query: string): FoodPerServing[];
}

/**
 * Where a food ranks in a search (R545): your own first, then the hand-picked staples and the foods you found online,
 * then the library of about 8,000.
 */
export function foodTier(food: FoodPerServing): number {
  if (food.source === 'custom') return 0;
  if (food.source === 'online' || isPickedFood(food.id)) return 1;
  return 2;
}

/**
 * Searches the foods table. Without `dataVersion` it reads the table fresh at each search. With it (the add screen
 * passes the app's data version, which every write bumps), each name is folded once: the bundled foods (about 8,300,
 * which only the seed changes) once per lookup, your own and the ones found online once per version, so a keystroke
 * only searches what was read, logging a food never reads the whole list again, and a food saved since shows once the
 * version moves on. Your own and online foods come before the bundled ones, each part ranked by `foodTier` (R545).
 */
export function createLocalFoodLookup(db: Db, dataVersion?: () => number): FoodLookup {
  let bundled: ((query: string) => FoodPerServing[]) | null = null;
  let yours: { version: number; search: (query: string) => FoodPerServing[] } | null = null;
  return {
    searchLocal: (query) => {
      if (dataVersion === undefined) return indexFoods(listFoods(db), foodTier)(query);
      bundled ??= indexFoods(listFoods(db, 'bundled'), foodTier);
      const version = dataVersion();
      if (yours === null || yours.version !== version) yours = { version, search: indexFoods(listFoods(db, 'yours'), foodTier) };
      return [...yours.search(query), ...bundled(query)];
    },
  };
}
