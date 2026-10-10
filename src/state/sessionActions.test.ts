/** @jest-environment node */
import { ActiveWorkoutExistsError, getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { useDataVersion } from './dataVersion';
import { startEmpty, startFromDay } from './sessionActions';

// dataVersion pulls in the router only for `useDbQuery`; these tests use the store alone.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
});

afterEach(() => {
  jest.useRealTimers();
});

const version = () => useDataVersion.getState().version;

describe('startEmpty', () => {
  it('starts an empty workout at the current time, then bumps the data version', () => {
    const before = version();

    startEmpty(db);

    const view = getActiveWorkoutView(db);
    expect(view).toMatchObject({ name: 'Workout', startedAt: NOW });
    expect(view!.exercises).toEqual([]);
    expect(version()).toBe(before + 1);
  });

  it('throws while a workout is active, leaving one active row and the version alone', () => {
    startEmpty(db);
    const active = getActiveWorkoutId(db);
    const before = version();

    expect(() => startEmpty(db)).toThrow(ActiveWorkoutExistsError);

    expect(getActiveWorkoutId(db)).toBe(active);
    expect(version()).toBe(before);
  });
});

describe('startFromDay', () => {
  it('starts a workout from the routine day, then bumps the data version', () => {
    const before = version();

    startFromDay(db, PUSH_A);

    const view = getActiveWorkoutView(db);
    expect(view).toMatchObject({ name: 'Push A', startedAt: NOW });
    expect(view!.exercises).toHaveLength(5);
    expect(version()).toBe(before + 1);
  });

  it('throws while a workout is active, leaving the version alone', () => {
    startEmpty(db);
    const before = version();

    expect(() => startFromDay(db, PUSH_A)).toThrow(ActiveWorkoutExistsError);

    expect(version()).toBe(before);
  });
});
