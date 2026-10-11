/** @jest-environment node */
import { bodyweight, measurements } from '../schema';
import { seededDb } from '../testing/fixtures';
import { addBodyEntry, deleteBodyEntry, latestBodyEntries, listBodyEntries, updateBodyEntry } from './bodyRepo';

const NOW = new Date(2026, 9, 10, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('bodyRepo (Task 8)', () => {
  it('stores bodyweight in the bodyweight table, dated by the local day of now', () => {
    const db = seededDb();
    const id = addBodyEntry(db, 'bodyweight', 182.5, 'lb', NOW);
    expect(db.select().from(bodyweight).all()).toEqual([
      { id, localDate: '2026-10-10', measuredAt: NOW, weight: 182.5, unit: 'lb' },
    ]);
    expect(db.select().from(measurements).all()).toEqual([]);
  });

  it('stores a measurement in the measurements table with its kind', () => {
    const db = seededDb();
    const id = addBodyEntry(db, 'waist', 34, 'in', NOW);
    expect(db.select().from(measurements).all()).toEqual([
      { id, kind: 'waist', localDate: '2026-10-10', measuredAt: NOW, value: 34, unit: 'in' },
    ]);
    expect(db.select().from(bodyweight).all()).toEqual([]);
  });

  it('round-trips bodyweight: add, list, update, delete', () => {
    const db = seededDb();
    const id = addBodyEntry(db, 'bodyweight', 182.5, 'lb', NOW);
    expect(listBodyEntries(db, 'bodyweight')).toEqual([
      { id, kind: 'bodyweight', localDate: '2026-10-10', measuredAt: NOW, value: 182.5, unit: 'lb' },
    ]);
    updateBodyEntry(db, 'bodyweight', id, 181, 'lb');
    expect(listBodyEntries(db, 'bodyweight')[0]).toMatchObject({ id, value: 181, unit: 'lb', measuredAt: NOW });
    deleteBodyEntry(db, 'bodyweight', id);
    expect(listBodyEntries(db, 'bodyweight')).toEqual([]);
  });

  it('round-trips waist: add, list, update, delete', () => {
    const db = seededDb();
    const id = addBodyEntry(db, 'waist', 34, 'in', NOW);
    expect(listBodyEntries(db, 'waist')).toEqual([
      { id, kind: 'waist', localDate: '2026-10-10', measuredAt: NOW, value: 34, unit: 'in' },
    ]);
    updateBodyEntry(db, 'waist', id, 33.5, 'in');
    expect(listBodyEntries(db, 'waist')[0]).toMatchObject({ id, value: 33.5, unit: 'in' });
    deleteBodyEntry(db, 'waist', id);
    expect(listBodyEntries(db, 'waist')).toEqual([]);
  });

  it('lists one kind only, newest first, several a day included', () => {
    const db = seededDb();
    const a = addBodyEntry(db, 'waist', 34, 'in', NOW - DAY);
    const b = addBodyEntry(db, 'waist', 33.8, 'in', NOW);
    const c = addBodyEntry(db, 'waist', 33.6, 'in', NOW + HOUR);
    addBodyEntry(db, 'chest', 42, 'in', NOW);
    addBodyEntry(db, 'bodyweight', 180, 'lb', NOW);
    expect(listBodyEntries(db, 'waist').map((e) => e.id)).toEqual([c, b, a]);
    expect(listBodyEntries(db, 'chest')).toHaveLength(1);
  });

  it('keeps the unit an entry was logged in', () => {
    const db = seededDb();
    addBodyEntry(db, 'bodyweight', 182, 'lb', NOW);
    addBodyEntry(db, 'bodyweight', 82, 'kg', NOW + HOUR);
    expect(listBodyEntries(db, 'bodyweight').map((e) => [e.value, e.unit])).toEqual([
      [82, 'kg'],
      [182, 'lb'],
    ]);
  });

  it('latestBodyEntries gives each kind its newest entry and leaves out kinds with none', () => {
    const db = seededDb();
    addBodyEntry(db, 'bodyweight', 182, 'lb', NOW - DAY);
    const bw = addBodyEntry(db, 'bodyweight', 181, 'lb', NOW);
    addBodyEntry(db, 'waist', 34, 'in', NOW);
    const waist = addBodyEntry(db, 'waist', 33.5, 'in', NOW + HOUR);
    const fat = addBodyEntry(db, 'body_fat', 18.5, '%', NOW);
    const latest = latestBodyEntries(db);
    expect(Object.keys(latest).sort()).toEqual(['body_fat', 'bodyweight', 'waist']);
    expect(latest.bodyweight).toMatchObject({ id: bw, value: 181 });
    expect(latest.waist).toMatchObject({ id: waist, value: 33.5 });
    expect(latest.body_fat).toMatchObject({ id: fat, kind: 'body_fat', value: 18.5, unit: '%' });
    expect(latest.chest).toBeUndefined();
  });

  it('update and delete touch only the named kind', () => {
    const db = seededDb();
    const waist = addBodyEntry(db, 'waist', 34, 'in', NOW);
    updateBodyEntry(db, 'chest', waist, 99, 'in');
    deleteBodyEntry(db, 'chest', waist);
    expect(listBodyEntries(db, 'waist')).toEqual([expect.objectContaining({ id: waist, value: 34 })]);
  });

  it('refuses a unit that does not belong to the kind', () => {
    const db = seededDb();
    expect(() => addBodyEntry(db, 'bodyweight', 34, 'in', NOW)).toThrow();
    expect(() => addBodyEntry(db, 'waist', 80, 'kg', NOW)).toThrow();
    const id = addBodyEntry(db, 'waist', 34, 'in', NOW);
    expect(() => updateBodyEntry(db, 'waist', id, 20, '%')).toThrow();
  });
});
