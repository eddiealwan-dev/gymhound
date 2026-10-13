/**
 * A bundled food, per serving (§6 foods, §10.3): the 305 hand-picked foods built from USDA FoodData Central SR Legacy
 * by scripts/build-foods.mjs (R139), and about 8,000 more from USDA SR28 by scripts/build-food-library.mjs (R545).
 */
export type SeedFood = {
  /** `fdc-{fdcId}` for a hand-picked food, `sr28-{NDB number}` for the library: stable, so a re-seed upserts by it. */
  id: string;
  name: string;
  servingLabel: string;
  servingGrams: number;
  /** Whole kcal per serving. */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** The library's row: [id, name, servingLabel, servingGrams, kcal, proteinG, carbsG, fatG], as foodLibrary.json keeps it. */
type LibraryRow = [string, string, string, number, number, number, number, number];

/**
 * The hand-picked foods, then the library. The library is about 800 KB of data, so the foods are read only when the
 * seed has to run, never at every start.
 */
export function loadSeedFoods(): readonly SeedFood[] {
  const picked = require('./foods.json') as SeedFood[];
  const library = (require('./foodLibrary.json') as { foods: LibraryRow[] }).foods.map(
    ([id, name, servingLabel, servingGrams, kcal, proteinG, carbsG, fatG]): SeedFood => ({ id, name, servingLabel, servingGrams, kcal, proteinG, carbsG, fatG }),
  );
  return [...picked, ...library];
}

/** Whether a bundled food is one of the 305 hand-picked foods, which a search puts before the library's (R545). */
export function isPickedFood(id: string): boolean {
  return id.startsWith('fdc-');
}
