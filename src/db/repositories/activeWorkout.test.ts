/** @jest-environment node */
import { seededDb } from '../testing/fixtures';
import { ActiveWorkoutExistsError, assertNoActiveWorkout, getActiveWorkoutId } from './activeWorkout';
import * as workoutsRepo from './workoutsRepo';

// Its own module, so repositories that workoutsRepo imports (savedWorkoutsRepo) can use it without a require cycle.
it('is the same error and checks workoutsRepo re-exports', () => {
  expect(workoutsRepo.ActiveWorkoutExistsError).toBe(ActiveWorkoutExistsError);
  expect(workoutsRepo.assertNoActiveWorkout).toBe(assertNoActiveWorkout);
  expect(workoutsRepo.getActiveWorkoutId).toBe(getActiveWorkoutId);
});

it('passes with no active workout and throws ActiveWorkoutExistsError with one', () => {
  const db = seededDb();
  expect(getActiveWorkoutId(db)).toBeNull();
  expect(() => assertNoActiveWorkout(db)).not.toThrow();
  const id = workoutsRepo.startEmptyWorkout(db, 1);
  expect(getActiveWorkoutId(db)).toBe(id);
  expect(() => assertNoActiveWorkout(db)).toThrow(ActiveWorkoutExistsError);
});
