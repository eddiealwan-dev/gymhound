/** A bundled food, per serving (§6 foods, §10.3): built from USDA FoodData Central SR Legacy by scripts/build-foods.mjs (R139). */
export type SeedFood = {
  /** `fdc-{fdcId}`: stable, so a re-seed upserts by it. */
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

/** The foods are about 40 KB of data, so they are read only when the seed has to run, never at every start. */
export function loadSeedFoods(): readonly SeedFood[] {
  return require('./foods.json') as SeedFood[];
}
