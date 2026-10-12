import { listFoods } from '../db/repositories/foodsRepo';
import type { Db } from '../db/types';
import type { FoodPerServing } from '../domain/fuel';
import { indexFoods, searchFoods } from '../domain/foodSearch';

/**
 * Where the add-food screen finds foods (§8.10). Today only the foods on the phone; a barcode lookup is a later
 * implementation of this seam (the `foods.barcode` column waits for it).
 */
export interface FoodLookup {
  /** Foods on the phone matching `query` (R140); archived foods never show. Empty for an empty query. */
  searchLocal(query: string): FoodPerServing[];
}

/**
 * Searches the foods table. Without `dataVersion` it reads the table fresh at each search. With it (the add screen
 * passes the app's data version, which every write bumps), the table is read and each name folded once per version, so
 * a keystroke only searches what was read, and a food saved since shows once the version moves on.
 */
export function createLocalFoodLookup(db: Db, dataVersion?: () => number): FoodLookup {
  let index: { version: number; search: (query: string) => FoodPerServing[] } | null = null;
  return {
    searchLocal: (query) => {
      if (dataVersion === undefined) return searchFoods(listFoods(db), query);
      const version = dataVersion();
      if (index === null || index.version !== version) index = { version, search: indexFoods(listFoods(db)) };
      return index.search(query);
    },
  };
}
