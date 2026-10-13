/** @jest-environment node */
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { finishedWorkoutCount } from './onboardingRepo';
import { addExerciseToWorkout, addSet } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from './workoutsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const MIN = 60_000;

/** Starts an empty workout with one ticked bench set, and finishes it unless `finish` is false. */
function train(db: Db, at: number, finish = true): string {
  const id = startEmptyWorkout(db, at);
  const we = addExerciseToWorkout(db, id, 'barbell-bench-press');
  tickSet(db, addSet(db, we), { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', at + MIN, 'mi');
  if (finish) finishWorkout(db, id, at + 30 * MIN);
  return id;
}

describe('finishedWorkoutCount (§18.15)', () => {
  it('is 0 on a fresh install', () => {
    expect(finishedWorkoutCount(seededDb())).toBe(0);
  });

  it('leaves out the workout in progress', () => {
    const db = seededDb();
    train(db, NOW, false);
    expect(finishedWorkoutCount(db)).toBe(0);
  });

  it('counts each finished workout', () => {
    const db = seededDb();
    train(db, NOW);
    expect(finishedWorkoutCount(db)).toBe(1);
    train(db, NOW + 60 * MIN);
    expect(finishedWorkoutCount(db)).toBe(2);
  });
});
