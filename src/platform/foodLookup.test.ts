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
  it('reads the food list once per data version, not at every search', () => {
    const db = seededDb();
    let version = 0;
    const lookup = createLocalFoodLookup(db, () => version);
    const list = jest.spyOn(foodsRepo, 'listFoods');
    expect(lookup.searchLocal('e').length).toBeGreaterThan(0);
    lookup.searchLocal('eg');
    lookup.searchLocal('egg');
    expect(list).toHaveBeenCalledTimes(1);

    const id = createCustomFood(db, { ...food, name: 'Zzqx bar' });
    // Not yet: nothing has said the data changed.
    expect(lookup.searchLocal('zzqx')).toEqual([]);
    version += 1;
    expect(lookup.searchLocal('zzqx').map((f) => f.id)).toEqual([id]);
    expect(list).toHaveBeenCalledTimes(2);
    list.mockRestore();
  });

  it('searches as searchFoods does: names starting with the query first', () => {
    const lookup = createLocalFoodLookup(seededDb(), () => 0);
    const found = lookup.searchLocal('egg');
    expect(found[0].name.toLowerCase().startsWith('egg')).toBe(true);
    expect(lookup.searchLocal('  ')).toEqual([]);
  });
});
