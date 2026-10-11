import { listFoods } from '../db/repositories/foodsRepo';
import type { Db } from '../db/types';
import type { FoodPerServing } from '../domain/fuel';
import { searchFoods } from '../domain/foodSearch';

/**
 * Where the add-food screen finds foods (§8.10). Today only the foods on the phone; a barcode lookup is a later
 * implementation of this seam (the `foods.barcode` column waits for it).
 */
export interface FoodLookup {
  /** Foods on the phone matching `query` (R140); archived foods never show. Empty for an empty query. */
  searchLocal(query: string): FoodPerServing[];
}

/** Searches the foods table, read fresh at each search so your own new foods show at once. */
export function createLocalFoodLookup(db: Db): FoodLookup {
  return {
    searchLocal: (query) => searchFoods(listFoods(db), query),
  };
}
