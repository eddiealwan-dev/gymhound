/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { checkReviewAfterFinish, reviewDecisionFor } from './reviewRepo';
import { getSettings } from './settingsRepo';
import { addExerciseToWorkout } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const BENCH = 'barbell-bench-press';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();

/** An empty workout on `day` with one bench set of `weight` × 5, finished an hour later. Returns its id. */
function bench(db: Db, day: number, weight: number, mark = false): string {
  const start = OCT_1 + day * DAY;
  const id = startEmptyWorkout(db, start);
  const weId = addExerciseToWorkout(db, id, BENCH);
  if (mark) db.update(workoutExercises).set({ mark: 'rough_sleep' }).where(eq(workoutExercises.id, weId)).run();
  const setId = getActiveWorkoutView(db)!.exercises[0].sets[0].id;
  tickSet(db, setId, { weight, reps: 5, durationS: null, distance: null }, 'lb', start + MINUTE, 'mi');
  finishWorkout(db, id, start + 60 * MINUTE);
  return id;
}

describe('the rating rules after a finish (R585–R587)', () => {
  it('waits for the third workout, then asks on one with a record', () => {
    const db = seededDb();
    const first = bench(db, 0, 135);
    expect(reviewDecisionFor(db, first, OCT_1, false).reason).toBe('1 finished workout. It asks from 3.');
    bench(db, 2, 135);
    const third = bench(db, 4, 145);
    expect(reviewDecisionFor(db, third, OCT_1 + 4 * DAY, false)).toEqual({ ask: true, reason: 'It asked for a rating.' });
  });

  it('says no on a third workout with no record and nothing raised', () => {
    const db = seededDb();
    bench(db, 0, 145);
    bench(db, 2, 135);
    const third = bench(db, 4, 135);
    expect(reviewDecisionFor(db, third, OCT_1 + 4 * DAY, false).reason).toBe('No record, and no weight went up.');
  });

  it('says no when an exercise was marked Something off, record or not', () => {
    const db = seededDb();
    bench(db, 0, 135);
    bench(db, 2, 135);
    const third = bench(db, 4, 145, true);
    expect(reviewDecisionFor(db, third, OCT_1 + 4 * DAY, false).reason).toBe('Something off was marked, so not today.');
  });

  it('keeps the reason for Developer, and the time it asked, so it waits 60 days', () => {
    const db = seededDb();
    bench(db, 0, 135);
    bench(db, 2, 135);
    const third = bench(db, 4, 145);
    const now = OCT_1 + 4 * DAY;
    expect(checkReviewAfterFinish(db, third, now, false)).toBe(true);
    expect(getSettings(db)).toMatchObject({ reviewAskedAt: now, reviewLastCheck: 'It asked for a rating.' });

    const fourth = bench(db, 6, 155);
    expect(checkReviewAfterFinish(db, fourth, now + 2 * DAY, false)).toBe(false);
    expect(getSettings(db)).toMatchObject({ reviewAskedAt: now, reviewLastCheck: 'Asked 2 days ago. It asks again after 60.' });
  });

  it('never asks in a tester build', () => {
    const db = seededDb();
    bench(db, 0, 135);
    bench(db, 2, 135);
    const third = bench(db, 4, 145);
    expect(checkReviewAfterFinish(db, third, OCT_1 + 4 * DAY, true)).toBe(false);
    expect(getSettings(db).reviewAskedAt).toBeNull();
  });
});
