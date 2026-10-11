/** @jest-environment node */
import { waterLog } from '../schema';
import { seededDb } from '../testing/fixtures';
import { getSettings } from './settingsRepo';
import { deleteWater, listWater, logWater, setWaterGoal, waterTotal } from './waterRepo';

const NOW = new Date(2026, 9, 11, 9, 0).getTime();
const MINUTE = 60_000;

describe('waterRepo (R150)', () => {
  it('stores an amount in ml for the day it is logged for, with the time it was logged', () => {
    const db = seededDb();
    // Logged at 9:00 on the 11th for the 10th (an earlier day on the Fuel tab).
    const id = logWater(db, 250, '2026-10-10', NOW);
    expect(db.select().from(waterLog).all()).toEqual([{ id, localDate: '2026-10-10', loggedAt: NOW, amountMl: 250 }]);
  });

  it('lists one day in the order it was drunk, and totals it unrounded', () => {
    const db = seededDb();
    const b = logWater(db, 236.5882, '2026-10-11', NOW + 30 * MINUTE);
    const a = logWater(db, 500, '2026-10-11', NOW);
    logWater(db, 750, '2026-10-10', NOW);
    expect(listWater(db, '2026-10-11')).toEqual([
      { id: a, loggedAt: NOW, amountMl: 500 },
      { id: b, loggedAt: NOW + 30 * MINUTE, amountMl: 236.5882 },
    ]);
    expect(waterTotal(db, '2026-10-11')).toBeCloseTo(736.5882, 6);
    expect(waterTotal(db, '2026-10-10')).toBe(750);
    expect(waterTotal(db, '2026-10-09')).toBe(0);
    expect(listWater(db, '2026-10-09')).toEqual([]);
  });

  it('deletes one entry and leaves the rest', () => {
    const db = seededDb();
    const a = logWater(db, 250, '2026-10-11', NOW);
    const b = logWater(db, 500, '2026-10-11', NOW + MINUTE);
    deleteWater(db, a);
    expect(listWater(db, '2026-10-11').map((e) => e.id)).toEqual([b]);
    expect(waterTotal(db, '2026-10-11')).toBe(500);
  });

  it('refuses an amount that is not a positive number', () => {
    const db = seededDb();
    expect(() => logWater(db, 0, '2026-10-11', NOW)).toThrow();
    expect(() => logWater(db, -5, '2026-10-11', NOW)).toThrow();
    expect(() => logWater(db, Number.NaN, '2026-10-11', NOW)).toThrow();
    expect(listWater(db, '2026-10-11')).toEqual([]);
  });

  it('has no goal until one is set, and round-trips and clears it', () => {
    const db = seededDb();
    expect(getSettings(db).waterGoalMl).toBeNull();
    setWaterGoal(db, 2000);
    expect(getSettings(db).waterGoalMl).toBe(2000);
    setWaterGoal(db, null);
    expect(getSettings(db).waterGoalMl).toBeNull();
  });
});
