/** @jest-environment node */
import { exercisePrefs } from '../schema';
import { seededDb } from '../testing/fixtures';
import { getRestSeconds, setRestSeconds } from './exercisePrefsRepo';

const BENCH = 'barbell-bench-press';
const NOW = new Date(2026, 9, 10, 9, 0).getTime();

describe('getRestSeconds and setRestSeconds (Task 21)', () => {
  it('is null for an exercise with no pref (use Settings)', () => {
    const db = seededDb();
    expect(getRestSeconds(db, BENCH)).toBeNull();
  });

  it('round-trips 90, then null (use Settings), then 0 (Off), on one row', () => {
    const db = seededDb();

    setRestSeconds(db, BENCH, 90, NOW);
    expect(getRestSeconds(db, BENCH)).toBe(90);

    setRestSeconds(db, BENCH, null, NOW + 1);
    expect(getRestSeconds(db, BENCH)).toBeNull();

    setRestSeconds(db, BENCH, 0, NOW + 2);
    expect(getRestSeconds(db, BENCH)).toBe(0);

    expect(db.select().from(exercisePrefs).all()).toEqual([{ exerciseId: BENCH, restSeconds: 0, updatedAt: NOW + 2 }]);
  });

  it('keeps each exercise its own', () => {
    const db = seededDb();
    setRestSeconds(db, BENCH, 90, NOW);
    setRestSeconds(db, 'barbell-row', 150, NOW);
    expect(getRestSeconds(db, BENCH)).toBe(90);
    expect(getRestSeconds(db, 'barbell-row')).toBe(150);
  });
});
