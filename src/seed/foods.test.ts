import { isPickedFood, loadSeedFoods } from './foods';
import type { SeedFood } from './foods';

/** Everything bundled: the hand-picked foods and the library (R545). */
const ALL = loadSeedFoods();
/** The 305 hand-picked foods (R139), which these rules are about; the library has its own checks in seed.test.ts. */
const FOODS = ALL.filter((f) => isPickedFood(f.id));

/** Energy from the macros with the general 4/4/9 factors. */
const atwater = (f: SeedFood) => 4 * f.proteinG + 4 * f.carbsG + 9 * f.fatG;

/**
 * Foods whose kcal is more than 10% (and more than 5 kcal) away from 4/4/9: USDA uses food-specific factors, so
 * alcohol (7 kcal/g, not in the macros) and fibre-heavy produce and legumes fall outside it.
 */
const ATWATER_EXCEPTIONS = new Set<string>([
  // Alcohol (not in the macros)
  'Beer',
  'Light beer',
  'Red wine',
  'White wine',
  'Liquor (vodka, gin, rum, whiskey)',
  // Fibre-heavy fruit
  'Banana',
  'Strawberries',
  'Blueberries',
  'Raspberries',
  'Blackberries',
  'Watermelon',
  'Cantaloupe',
  'Peach',
  'Pear',
  'Cherries',
  'Kiwi',
  'Medjool date',
  'Dried apricots',
  'Pomegranate seeds',
  'Tangerine',
  'Applesauce, unsweetened',
  // Fibre-heavy vegetables and legumes
  'Broccoli, raw',
  'Broccoli, cooked',
  'Spinach, cooked',
  'Red bell pepper',
  'Corn on the cob',
  'Corn kernels, cooked',
  'Green beans, cooked',
  'Brussels sprouts, cooked',
  'Cauliflower, raw',
  'Zucchini',
  'Butternut squash, baked',
  'Baked beans',
]);

const offBy = (f: SeedFood) => Math.abs(f.kcal - atwater(f));
const outsideTolerance = (f: SeedFood) => offBy(f) > 5 && offBy(f) > 0.1 * Math.max(f.kcal, atwater(f));

describe('bundled foods (USDA FoodData Central SR Legacy, R139)', () => {
  it('has about 300 foods', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(280);
    expect(FOODS.length).toBeLessThanOrEqual(320);
  });

  it('gives every food a unique fdc id', () => {
    for (const f of FOODS) expect(f.id).toMatch(/^fdc-\d+$/);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });

  it('gives every food a plain, trimmed name in sentence case, no name twice ignoring case', () => {
    for (const f of FOODS) {
      expect(f.name).toBe(f.name.trim());
      expect(f.name).toMatch(/^[A-Z]/);
      expect(f.name).not.toMatch(/ {2}/);
    }
    expect(new Set(FOODS.map((f) => f.name.toLowerCase())).size).toBe(FOODS.length);
  });

  it('gives every food a serving label and a weight', () => {
    for (const f of FOODS) {
      expect(f.servingLabel.trim()).not.toBe('');
      expect(f.servingLabel).toBe(f.servingLabel.trim());
      expect(f.servingGrams).toBeGreaterThan(0);
      expect(Number.isFinite(f.servingGrams)).toBe(true);
    }
  });

  it('stores whole kcal and macros to 0.1 g, none negative', () => {
    for (const f of FOODS) {
      expect(Number.isInteger(f.kcal)).toBe(true);
      for (const g of [f.proteinG, f.carbsG, f.fatG, f.servingGrams]) {
        expect(g).toBeGreaterThanOrEqual(0);
        expect(Math.round(g * 10) / 10).toBe(g);
      }
    }
  });

  it('keeps kcal within 10% of 4p + 4c + 9f, apart from the listed exceptions', () => {
    const outside = FOODS.filter(outsideTolerance).map((f) => f.name);
    expect(outside.filter((name) => !ATWATER_EXCEPTIONS.has(name))).toEqual([]);
  });

  it('lists only exceptions that exist and need it', () => {
    const byName = new Map(FOODS.map((f) => [f.name, f]));
    for (const name of ATWATER_EXCEPTIONS) {
      expect(byName.has(name)).toBe(true);
      expect(outsideTolerance(byName.get(name)!)).toBe(true);
    }
  });

  it('has the staples a lifter logs, with their usual serving', () => {
    const byName = new Map(FOODS.map((f) => [f.name, f]));
    expect(byName.get('Egg, large')).toEqual({
      id: 'fdc-171287',
      name: 'Egg, large',
      servingLabel: '1 large',
      servingGrams: 50,
      kcal: 72,
      proteinG: 6.3,
      carbsG: 0.4,
      fatG: 4.8,
    });
    expect(byName.get('Chicken breast, cooked')).toMatchObject({ servingLabel: '3 oz', servingGrams: 85, kcal: 140, proteinG: 26.4 });
    expect(byName.get('White rice, cooked')).toMatchObject({ servingLabel: '1 cup', servingGrams: 158 });
    expect(byName.get('Olive oil')).toMatchObject({ servingLabel: '1 tbsp', fatG: 13.5 });
  });

  it('weighs chicken pieces by the 3 oz serving, like the breast, not by a whole piece', () => {
    const byName = new Map(FOODS.map((f) => [f.name, f]));
    for (const name of ['Chicken breast, cooked', 'Chicken thigh, cooked', 'Chicken drumstick, cooked', 'Chicken wing, roasted, with skin']) {
      expect(byName.get(name)).toMatchObject({ servingLabel: '3 oz', servingGrams: 85 });
    }
  });

  it('serves mixed dishes by the cup, not by a restaurant plate', () => {
    const byName = new Map(FOODS.map((f) => [f.name, f]));
    expect(byName.get('Spaghetti with meat sauce')).toMatchObject({ servingLabel: '1 cup', servingGrams: 248, kcal: 300 });
    for (const f of FOODS) expect(f.servingLabel).not.toMatch(/restaurant/i);
  });

  it('keeps every serving a portion one person eats: no more than 400 g', () => {
    expect(FOODS.filter((f) => f.servingGrams > 400).map((f) => f.name)).toEqual([]);
  });

  it('uses generic names, not trademarks, and ½ rather than 0.5 in labels', () => {
    const names = FOODS.map((f) => f.name);
    expect(names).toContain('Farina, cooked');
    expect(names.filter((n) => /cream of wheat/i.test(n))).toEqual([]);
    expect(FOODS.filter((f) => /\b0\.5\b/.test(f.servingLabel)).map((f) => f.name)).toEqual([]);
  });
});

describe('the library beside them (R545)', () => {
  const library = ALL.filter((f) => !isPickedFood(f.id));

  it('writes its servings as the hand-picked foods do: ½ not 0.5, and no NLEA notes', () => {
    // An amount with no digit before its point (".5 cup"), a count as a decimal ("0.5 cup", weights keep "0.8 oz"), or a
    // slashed count at the start ("1/2 cup"); sizes such as 1/8" thick and "11.2 fl oz" stay.
    const odd = /NLEA|(^|[\s(,])\.\d|(^|[\s(])0\.(5|25|75|33)\s+(?!(oz|g|ml|fl|lb)\b)|^\d\/\d\s/;
    expect(library.filter((f) => odd.test(f.servingLabel)).map((f) => f.servingLabel)).toEqual([]);
    const labels = new Set(library.map((f) => f.servingLabel));
    expect(labels).toContain('½ cup');
    expect(labels).toContain('3 oz');
  });

  it('names brands as people write them', () => {
    const names = library.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["McDonald's, Big Mac", "Kellogg's, Eggo Protein, Waffles, Homestyle", "T.G.I. Friday's, french fries"]));
    expect(names.filter((n) => /McDONALD|KELLOGG'S|CAMPBELL'S/.test(n))).toEqual([]);
  });
});

describe('loadSeedFoods', () => {
  it('reads foods.json only when it is called, never when the module loads', () => {
    const loads = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('./foods.json', () => {
        loads();
        return jest.requireActual('./foods.json');
      });
      const isolated = require('./foods') as typeof import('./foods');
      expect(loads).not.toHaveBeenCalled();
      expect(isolated.loadSeedFoods()).toHaveLength(ALL.length);
      expect(loads).toHaveBeenCalledTimes(1);
    });
    jest.dontMock('./foods.json');
  });
});
