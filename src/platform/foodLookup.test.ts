/** @jest-environment node */
import { archiveCustomFood, createCustomFood } from '../db/repositories/foodsRepo';
import * as foodsRepo from '../db/repositories/foodsRepo';
import { seededDb } from '../db/testing/fixtures';
import { createLocalFoodLookup } from './foodLookup';

const food = { name: 'Egg muffin', servingLabel: '1 muffin', servingGrams: null, kcal: 300, proteinG: 17, carbsG: 30, fatG: 12 };

describe('createLocalFoodLookup (Task 5)', () => {
  it('finds the egg, names starting with the query first', () => {
    const found = createLocalFoodLookup(seededDb()).searchLocal('egg');
    expect(found.map((f) => f.id)).toContain('fdc-171287');
    expect(found[0].name.toLowerCase().startsWith('egg')).toBe(true);
  });

  it('finds your own foods and not archived ones', () => {
    const db = seededDb();
    const mine = createCustomFood(db, food);
    const gone = createCustomFood(db, { ...food, name: 'Egg roll' });
    archiveCustomFood(db, gone);
    const ids = createLocalFoodLookup(db).searchLocal('egg').map((f) => f.id);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(gone);
  });

  it('reads the database at each search', () => {
    const db = seededDb();
    const lookup = createLocalFoodLookup(db);
    expect(lookup.searchLocal('zzqx')).toEqual([]);
    const id = createCustomFood(db, { ...food, name: 'Zzqx bar' });
    expect(lookup.searchLocal('zzqx').map((f) => f.id)).toEqual([id]);
  });

  it('finds nothing for an empty query', () => {
    expect(createLocalFoodLookup(seededDb()).searchLocal('  ')).toEqual([]);
  });
});

describe('createLocalFoodLookup with a data version (the add screen)', () => {
  it('reads the bundled foods once, and yours once per data version, not at every search', () => {
    const db = seededDb();
    let version = 0;
    const lookup = createLocalFoodLookup(db, () => version);
    const list = jest.spyOn(foodsRepo, 'listFoods');
    expect(lookup.searchLocal('e').length).toBeGreaterThan(0);
    lookup.searchLocal('eg');
    lookup.searchLocal('egg');
    expect(list.mock.calls.map((c) => c[1])).toEqual(['bundled', 'yours']);

    const id = createCustomFood(db, { ...food, name: 'Zzqx bar' });
    // Not yet: nothing has said the data changed.
    expect(lookup.searchLocal('zzqx')).toEqual([]);
    version += 1;
    expect(lookup.searchLocal('zzqx').map((f) => f.id)).toEqual([id]);
    // Only yours is read again: logging a food never reads the 8,000 bundled ones again (R545).
    expect(list.mock.calls.map((c) => c[1])).toEqual(['bundled', 'yours', 'yours']);
    list.mockRestore();
  });

  it('searches as searchFoods does: names starting with the query first', () => {
    const lookup = createLocalFoodLookup(seededDb(), () => 0);
    const found = lookup.searchLocal('egg');
    expect(found[0].name.toLowerCase().startsWith('egg')).toBe(true);
    expect(lookup.searchLocal('  ')).toEqual([]);
  });
});

describe('searching the whole list (R545)', () => {
  const lookup = createLocalFoodLookup(seededDb());
  const names = (q: string) => lookup.searchLocal(q).map((f) => f.name);

  it('finds restaurant and branded foods', () => {
    expect(names('big mac')).toContain("McDonald's, Big Mac");
    expect(names('taco bell burrito').length).toBeGreaterThan(2);
    expect(names('eggo').length).toBeGreaterThan(3);
  });

  it('puts the hand-picked staples before the library for a common word', () => {
    const found = lookup.searchLocal('chicken breast');
    expect(found.length).toBeGreaterThan(20);
    expect(found[0].id.startsWith('fdc-')).toBe(true);
  });

  it('ranks your own food first', () => {
    const db = seededDb();
    const mine = createCustomFood(db, { ...food, name: 'Chicken breast meal prep' });
    expect(createLocalFoodLookup(db).searchLocal('chicken breast')[0].id).toBe(mine);
  });
});
