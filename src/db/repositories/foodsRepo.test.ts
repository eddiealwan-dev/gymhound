/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { foods } from '../schema';
import { seededDb } from '../testing/fixtures';
import {
  archiveCustomFood,
  createCustomFood,
  customFoodNames,
  findFoodByBarcode,
  getFood,
  listFoods,
  recentFoods,
  saveOnlineFood,
  updateCustomFood,
} from './foodsRepo';
import { logFood, logQuickAdd } from './foodLogRepo';

const EGG = 'fdc-171287';
const EGG_WHITE = 'fdc-172183';
const NOW = new Date(2026, 9, 10, 9, 0).getTime();
const MIN = 60_000;

const shake = { name: 'Protein shake', servingLabel: '1 scoop', servingGrams: 32, kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5 };

describe('foodsRepo (Task 5)', () => {
  it('lists the bundled foods with their serving and macros', () => {
    const db = seededDb();
    const all = listFoods(db);
    expect(all.length).toBeGreaterThan(250);
    expect(all.find((f) => f.id === EGG)).toEqual({
      id: EGG,
      name: 'Egg, large',
      servingLabel: '1 large',
      servingGrams: 50,
      kcal: 72,
      proteinG: 6.3,
      carbsG: 0.4,
      fatG: 4.8,
      source: 'bundled',
    });
  });

  it('lists your own foods first, then bundled, each by name ignoring case', () => {
    const db = seededDb();
    const b = createCustomFood(db, { ...shake, name: 'banana bread' });
    const a = createCustomFood(db, { ...shake, name: 'Apple pie' });
    const all = listFoods(db);
    expect(all.slice(0, 2).map((f) => f.id)).toEqual([a, b]);
    expect(all.slice(0, 2).every((f) => f.source === 'custom')).toBe(true);
    const bundled = all.slice(2).map((f) => f.name.toLowerCase());
    expect(all.slice(2).every((f) => f.source === 'bundled')).toBe(true);
    expect(bundled).toEqual([...bundled].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
  });

  it('creates a custom food that getFood reads back', () => {
    const db = seededDb();
    const id = createCustomFood(db, shake);
    expect(getFood(db, id)).toEqual({ id, ...shake, source: 'custom' });
    expect(db.select().from(foods).where(eq(foods.id, id)).get()).toMatchObject({ barcode: null, archived: false });
  });

  it('returns null for a missing food', () => {
    expect(getFood(seededDb(), 'nope')).toBeNull();
  });

  it('updates a custom food', () => {
    const db = seededDb();
    const id = createCustomFood(db, shake);
    updateCustomFood(db, id, { ...shake, name: 'Whey', servingGrams: null, kcal: 110 });
    expect(getFood(db, id)).toEqual({ id, ...shake, name: 'Whey', servingGrams: null, kcal: 110, source: 'custom' });
  });

  it('refuses to update or archive a bundled food', () => {
    const db = seededDb();
    expect(() => updateCustomFood(db, EGG, shake)).toThrow();
    expect(() => archiveCustomFood(db, EGG)).toThrow();
    expect(getFood(db, EGG)?.name).toBe('Egg, large');
    expect(listFoods(db).some((f) => f.id === EGG)).toBe(true);
  });

  it('archives a custom food: gone from the list, still named by getFood (R144)', () => {
    const db = seededDb();
    const id = createCustomFood(db, shake);
    archiveCustomFood(db, id);
    expect(listFoods(db).some((f) => f.id === id)).toBe(false);
    expect(getFood(db, id)).toEqual({ id, ...shake, source: 'custom' });
  });

  it('names your own foods, not archived ones, leaving one out on request', () => {
    const db = seededDb();
    const a = createCustomFood(db, { ...shake, name: 'Whey' });
    createCustomFood(db, { ...shake, name: 'Oat bar' });
    const gone = createCustomFood(db, { ...shake, name: 'Old bar' });
    archiveCustomFood(db, gone);
    expect(customFoodNames(db).sort()).toEqual(['Oat bar', 'Whey']);
    expect(customFoodNames(db, a)).toEqual(['Oat bar']);
  });

  it('lists recent foods: distinct, newest logged first, archived and quick adds left out', () => {
    const db = seededDb();
    const mine = createCustomFood(db, shake);
    const gone = createCustomFood(db, { ...shake, name: 'Gone' });
    logFood(db, EGG, 1, '2026-10-09', NOW - 10 * MIN);
    logFood(db, EGG_WHITE, 1, '2026-10-09', NOW - 9 * MIN);
    logFood(db, gone, 1, '2026-10-10', NOW - 8 * MIN);
    logFood(db, EGG, 2, '2026-10-10', NOW - 7 * MIN);
    logQuickAdd(db, 'Snack', { kcal: 100, proteinG: 5, carbsG: 0, fatG: 0 }, '2026-10-10', NOW - 6 * MIN);
    logFood(db, mine, 1, '2026-10-10', NOW - 5 * MIN);
    archiveCustomFood(db, gone);
    expect(recentFoods(db).map((f) => f.id)).toEqual([mine, EGG, EGG_WHITE]);
    expect(recentFoods(db, 2).map((f) => f.id)).toEqual([mine, EGG]);
  });

  it('keeps recent foods to 12 by default', () => {
    const db = seededDb();
    const ids = listFoods(db).slice(0, 14).map((f) => f.id);
    ids.forEach((id, i) => logFood(db, id, 1, '2026-10-10', NOW + i * MIN));
    expect(recentFoods(db).map((f) => f.id)).toEqual(ids.slice(2).reverse());
  });
});

describe('barcodes and foods found online (R546, R547)', () => {
  const online = { barcode: '049000028911', name: 'Coca-Cola', servingLabel: '355 ml', servingGrams: null, kcal: 149, proteinG: 0, carbsG: 37.6, fatG: 0 };
  const mineFood = { name: 'My bar', servingLabel: '1 bar', servingGrams: 60, kcal: 230, proteinG: 20, carbsG: 24, fatG: 8 };

  it('keeps a food found online on the phone, and finds it by its barcode in either form', () => {
    const db = seededDb();
    const id = saveOnlineFood(db, online);
    expect(id).toBe('off-049000028911');
    expect(getFood(db, id)).toMatchObject({ name: 'Coca-Cola', source: 'online', kcal: 149 });
    expect(findFoodByBarcode(db, '049000028911')?.id).toBe(id);
    expect(findFoodByBarcode(db, '0049000028911')?.id).toBe(id);
    expect(findFoodByBarcode(db, '5000112548167')).toBeNull();
    expect(listFoods(db).some((f) => f.id === id)).toBe(true);
  });

  it('found again, takes the new numbers', () => {
    const db = seededDb();
    saveOnlineFood(db, online);
    saveOnlineFood(db, { ...online, kcal: 140 });
    expect(getFood(db, 'off-049000028911')?.kcal).toBe(140);
  });

  it('a food of your own made for a barcode comes first, and an archived one not at all', () => {
    const db = seededDb();
    saveOnlineFood(db, online);
    const mine = createCustomFood(db, mineFood, '049000028911');
    expect(findFoodByBarcode(db, '049000028911')?.id).toBe(mine);
    archiveCustomFood(db, mine);
    expect(findFoodByBarcode(db, '049000028911')?.id).toBe('off-049000028911');
  });
});
