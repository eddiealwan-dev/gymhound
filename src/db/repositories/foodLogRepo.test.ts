/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { MAX_SERVINGS } from '../../domain/fuel';
import { foodLog, foods, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { createCustomFood, updateCustomFood } from './foodsRepo';
import {
  dailySeries,
  deleteEntry,
  getFuelTargets,
  isTrainingDay,
  listEntries,
  logFood,
  logQuickAdd,
  proteinLoggedBy,
  setFuelTargets,
  updateEntryServings,
  updateQuickAdd,
} from './foodLogRepo';

const EGG = 'fdc-171287';
const NOW = new Date(2026, 9, 10, 9, 0).getTime();
const MIN = 60_000;
const TODAY = '2026-10-10';

const shake = { name: 'Protein shake', servingLabel: '1 scoop', servingGrams: 32, kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5 };

function addWorkout(db: Db, id: string, localDate: string, status: 'active' | 'finished'): void {
  db.insert(workouts)
    .values({
      id,
      name: 'Workout',
      status,
      startedAt: NOW,
      finishedAt: status === 'finished' ? NOW + 60 * MIN : null,
      localDate,
    })
    .run();
}

describe('foodLogRepo (Task 5)', () => {
  it('logs 1.5 servings of the egg: name copied, totals x 1.5, serving label joined', () => {
    const db = seededDb();
    const id = logFood(db, EGG, 1.5, TODAY, NOW);
    expect(listEntries(db, TODAY)).toEqual([
      {
        id,
        localDate: TODAY,
        loggedAt: NOW,
        foodId: EGG,
        name: 'Egg, large',
        servings: 1.5,
        servingLabel: '1 large',
        kcal: 108,
        proteinG: expect.closeTo(9.45, 10),
        carbsG: expect.closeTo(0.6, 10),
        fatG: expect.closeTo(7.2, 10),
      },
    ]);
  });

  it('throws for a food that does not exist, logging nothing', () => {
    const db = seededDb();
    expect(() => logFood(db, 'nope', 1, TODAY, NOW)).toThrow();
    expect(listEntries(db, TODAY)).toEqual([]);
  });

  it('keeps an entry as logged when its custom food changes afterwards (§6)', () => {
    const db = seededDb();
    const food = createCustomFood(db, shake);
    logFood(db, food, 2, TODAY, NOW);
    updateCustomFood(db, food, { ...shake, name: 'Whey', kcal: 999, proteinG: 1 });
    expect(listEntries(db, TODAY)[0]).toMatchObject({
      name: 'Protein shake',
      kcal: 240,
      proteinG: 48,
      carbsG: 6,
      fatG: 3,
    });
  });

  it('rescales an entry from its own totals when its servings change (R142)', () => {
    const db = seededDb();
    const food = createCustomFood(db, shake);
    const id = logFood(db, food, 2, TODAY, NOW);
    updateCustomFood(db, food, { ...shake, kcal: 999 });
    updateEntryServings(db, id, 3);
    expect(listEntries(db, TODAY)[0]).toMatchObject({
      servings: 3,
      kcal: 360,
      proteinG: 72,
      carbsG: 9,
      fatG: 4.5,
      loggedAt: NOW,
    });
  });

  it('round-trips a quick add, with no food and no serving label', () => {
    const db = seededDb();
    const id = logQuickAdd(db, 'Lunch out', { kcal: 650, proteinG: 40, carbsG: 70, fatG: 20 }, TODAY, NOW);
    expect(listEntries(db, TODAY)).toEqual([
      {
        id,
        localDate: TODAY,
        loggedAt: NOW,
        foodId: null,
        name: 'Lunch out',
        servings: 1,
        servingLabel: null,
        kcal: 650,
        proteinG: 40,
        carbsG: 70,
        fatG: 20,
      },
    ]);
    updateQuickAdd(db, id, 'Burrito', { kcal: 700, proteinG: 35, carbsG: 80, fatG: 25 });
    expect(listEntries(db, TODAY)[0]).toMatchObject({
      name: 'Burrito',
      kcal: 700,
      proteinG: 35,
      carbsG: 80,
      fatG: 25,
      servings: 1,
    });
  });

  it('refuses servings that are not more than 0', () => {
    const db = seededDb();
    expect(() => logFood(db, EGG, 0, TODAY, NOW)).toThrow();
    const id = logFood(db, EGG, 1, TODAY, NOW);
    expect(() => updateEntryServings(db, id, 0)).toThrow();
    expect(() => updateEntryServings(db, id, Number.NaN)).toThrow();
    expect(listEntries(db, TODAY)).toEqual([expect.objectContaining({ id, servings: 1, kcal: 72 })]);
  });

  it('edits only quick adds with updateQuickAdd', () => {
    const db = seededDb();
    const id = logFood(db, EGG, 1, TODAY, NOW);
    updateQuickAdd(db, id, 'Burrito', { kcal: 700, proteinG: 35, carbsG: 80, fatG: 25 });
    expect(listEntries(db, TODAY)[0]).toMatchObject({ name: 'Egg, large', kcal: 72 });
  });

  it('deletes an entry', () => {
    const db = seededDb();
    const a = logFood(db, EGG, 1, TODAY, NOW);
    const b = logQuickAdd(db, 'Snack', { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0 }, TODAY, NOW + MIN);
    deleteEntry(db, a);
    expect(listEntries(db, TODAY).map((e) => e.id)).toEqual([b]);
  });

  it('lists only that date, in logged order', () => {
    const db = seededDb();
    const late = logFood(db, EGG, 1, TODAY, NOW + 5 * MIN);
    const early = logFood(db, EGG, 1, TODAY, NOW);
    logFood(db, EGG, 1, '2026-10-09', NOW);
    logFood(db, EGG, 1, '2026-10-11', NOW);
    expect(listEntries(db, TODAY).map((e) => e.id)).toEqual([early, late]);
  });

  it('keeps the copied name and serving label when the food is gone', () => {
    const db = seededDb();
    logFood(db, EGG, 1, TODAY, NOW);
    db.update(foodLog).set({ foodId: 'deleted' }).run();
    expect(listEntries(db, TODAY)[0]).toMatchObject({ foodId: 'deleted', name: 'Egg, large', servingLabel: '1 large' });
  });

  it("keeps an entry's serving label when its custom food is renamed or re-served (R158)", () => {
    const db = seededDb();
    const food = createCustomFood(db, shake);
    logFood(db, food, 1, TODAY, NOW);
    updateCustomFood(db, food, { ...shake, name: 'Whey', servingLabel: '2 scoops' });
    expect(listEntries(db, TODAY)[0]).toMatchObject({ name: 'Protein shake', servingLabel: '1 scoop' });
    logFood(db, food, 1, TODAY, NOW + MIN);
    expect(listEntries(db, TODAY)[1]).toMatchObject({ name: 'Whey', servingLabel: '2 scoops' });
  });

  it("keeps history's serving label when a seed changes a bundled food's label (R158)", () => {
    const db = seededDb();
    logFood(db, EGG, 1, TODAY, NOW);
    db.update(foods).set({ servingLabel: '1 extra large' }).where(eq(foods.id, EGG)).run();
    expect(listEntries(db, TODAY)[0]).toMatchObject({ foodId: EGG, servingLabel: '1 large' });
  });

  it('shows no serving label for an entry logged before the column existed, even with its food still there', () => {
    const db = seededDb();
    logFood(db, EGG, 1, TODAY, NOW);
    db.update(foodLog).set({ servingLabel: null }).run();
    expect(listEntries(db, TODAY)[0]).toMatchObject({ foodId: EGG, servingLabel: null });
  });

  it('caps servings at MAX_SERVINGS (R141)', () => {
    const db = seededDb();
    expect(() => logFood(db, EGG, MAX_SERVINGS + 0.01, TODAY, NOW)).toThrow();
    expect(listEntries(db, TODAY)).toEqual([]);
    const id = logFood(db, EGG, MAX_SERVINGS, TODAY, NOW);
    expect(() => updateEntryServings(db, id, MAX_SERVINGS + 1)).toThrow();
    expect(listEntries(db, TODAY)[0]).toMatchObject({ servings: MAX_SERVINGS, kcal: 72 * MAX_SERVINGS });
  });

  it('refuses to change the servings of a quick add', () => {
    const db = seededDb();
    const id = logQuickAdd(db, 'Snack', { kcal: 100, proteinG: 5, carbsG: 0, fatG: 0 }, TODAY, NOW);
    expect(() => updateEntryServings(db, id, 2)).toThrow();
    expect(listEntries(db, TODAY)[0]).toMatchObject({ servings: 1, kcal: 100 });
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])('refuses quick-add totals of %s', (bad) => {
    const db = seededDb();
    const good = { kcal: 100, proteinG: 5, carbsG: 0, fatG: 0 };
    for (const key of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
      expect(() => logQuickAdd(db, 'Snack', { ...good, [key]: bad }, TODAY, NOW)).toThrow();
    }
    expect(listEntries(db, TODAY)).toEqual([]);
    const id = logQuickAdd(db, 'Snack', good, TODAY, NOW);
    for (const key of ['kcal', 'proteinG', 'carbsG', 'fatG'] as const) {
      expect(() => updateQuickAdd(db, id, 'Changed', { ...good, [key]: bad })).toThrow();
    }
    expect(listEntries(db, TODAY)[0]).toMatchObject({ name: 'Snack', kcal: 100, proteinG: 5 });
  });

  it('is a training day once a workout of that date is finished, not while it is active (§7.11)', () => {
    const db = seededDb();
    expect(isTrainingDay(db, TODAY)).toBe(false);
    addWorkout(db, 'w1', TODAY, 'active');
    expect(isTrainingDay(db, TODAY)).toBe(false);
    addWorkout(db, 'w0', '2026-10-09', 'finished');
    expect(isTrainingDay(db, TODAY)).toBe(false);
    expect(isTrainingDay(db, '2026-10-09')).toBe(true);
    addWorkout(db, 'w2', TODAY, 'finished');
    expect(isTrainingDay(db, TODAY)).toBe(true);
  });

  it('stores fuel targets', () => {
    const db = seededDb();
    expect(getFuelTargets(db)).toBeNull();
    const targets = {
      training: { kcal: 2800, protein: 180, carbs: 300, fat: null },
      rest: { kcal: 2400, protein: 180, carbs: null, fat: 70 },
    };
    setFuelTargets(db, targets);
    expect(getFuelTargets(db)).toEqual(targets);
  });

  it('counts protein of that date logged by a moment, ignoring later entries and other dates (R152)', () => {
    const db = seededDb();
    expect(proteinLoggedBy(db, TODAY, NOW)).toEqual({ anyFood: false, protein: 0 });
    logQuickAdd(db, 'A', { kcal: 100, proteinG: 20.5, carbsG: 0, fatG: 0 }, TODAY, NOW - 60 * MIN);
    logQuickAdd(db, 'B', { kcal: 100, proteinG: 10, carbsG: 0, fatG: 0 }, TODAY, NOW);
    logQuickAdd(db, 'Later', { kcal: 100, proteinG: 50, carbsG: 0, fatG: 0 }, TODAY, NOW + 1);
    logQuickAdd(db, 'Yesterday', { kcal: 100, proteinG: 50, carbsG: 0, fatG: 0 }, '2026-10-09', NOW - 120 * MIN);
    expect(proteinLoggedBy(db, TODAY, NOW)).toEqual({ anyFood: true, protein: 30.5 });
    expect(proteinLoggedBy(db, TODAY, NOW - 61 * MIN)).toEqual({ anyFood: false, protein: 0 });
  });

  it('counts a zero-protein entry as food', () => {
    const db = seededDb();
    logQuickAdd(db, 'Juice', { kcal: 110, proteinG: 0, carbsG: 26, fatG: 0 }, TODAY, NOW);
    expect(proteinLoggedBy(db, TODAY, NOW)).toEqual({ anyFood: true, protein: 0 });
  });

  it('gives one point per day with entries, the unrounded total, oldest first', () => {
    const db = seededDb();
    const add = (date: string, proteinG: number, kcal = 100) =>
      logQuickAdd(db, 'x', { kcal, proteinG, carbsG: 1, fatG: 2 }, date, NOW);
    add('2026-10-10', 33.3);
    add('2026-10-10', 33.3);
    add('2026-10-08', 10, 250);
    add('2026-10-10', 33.3);
    expect(dailySeries(db, 'protein')).toEqual([
      { localDate: '2026-10-08', value: 10 },
      { localDate: '2026-10-10', value: expect.closeTo(99.9, 10) },
    ]);
    expect(dailySeries(db, 'kcal')).toEqual([
      { localDate: '2026-10-08', value: 250 },
      { localDate: '2026-10-10', value: 300 },
    ]);
    expect(dailySeries(db, 'carbs').map((p) => p.value)).toEqual([1, 3]);
    expect(dailySeries(db, 'fat').map((p) => p.value)).toEqual([2, 6]);
  });

  it('gives an empty series with no entries', () => {
    expect(dailySeries(seededDb(), 'kcal')).toEqual([]);
  });
});
