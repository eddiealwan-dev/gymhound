/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { loadWorkoutDraft } from '../db/repositories/workoutHistoryRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { addExerciseToWorkout } from '../db/repositories/workoutEditRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { sets, workouts } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { patchDraftSet } from '../domain/historyDraft';
import { useDataVersion } from './dataVersion';
import { deleteHistoryWorkout, saveHistoryEdit } from './historyActions';

// dataVersion pulls in the router only for `useDbQuery`; these tests use the store alone.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

const order: string[] = [];
const mockSnapshot = jest.fn((_db: Db, _now: number) => true);
// Phase 7's Health write-out and iCloud copy (nativeServices) are watched, never run: their own tests cover them.
const mockNative = { afterFinish: jest.fn(), healthRecordBeforeDelete: jest.fn((_db: Db, _id: string): string | null => null), afterHistoryDelete: jest.fn() };
jest.mock('./nativeServices', () => ({
  afterFinish: (db: Db) => mockNative.afterFinish(db),
  healthRecordBeforeDelete: (db: Db, id: string) => mockNative.healthRecordBeforeDelete(db, id),
  afterHistoryDelete: (db: Db, id: string | null) => mockNative.afterHistoryDelete(db, id),
}));
jest.mock('./backup', () => ({ takeSnapshotSafely: (db: Db, now: number) => mockSnapshot(db, now) }));

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const version = () => useDataVersion.getState().version;

function finished(db: Db): string {
  const id = startEmptyWorkout(db, NOW - 3_600_000);
  const we = addExerciseToWorkout(db, id, 'barbell-bench-press');
  const setId = getActiveWorkoutView(db)!.exercises.find((e) => e.id === we)!.sets[0].id;
  tickSet(db, setId, { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', NOW - 3_000_000, 'mi');
  finishWorkout(db, id, NOW - 1_000_000);
  return id;
}

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
  order.length = 0;
  mockSnapshot.mockReset();
  mockSnapshot.mockImplementation(() => {
    order.push(`snapshot v${version()}`);
    return true;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('saveHistoryEdit', () => {
  it('saves, then takes a snapshot, then bumps (R170)', () => {
    const id = finished(db);
    const d = loadWorkoutDraft(db, id)!;
    const v = version();
    expect(saveHistoryEdit(db, patchDraftSet(d, d.exercises[0].workoutExerciseId, 0, { reps: 6 }))).toBe('saved');
    expect(db.select().from(sets).all().find((s) => s.reps === 6)).toBeDefined();
    expect(mockSnapshot).toHaveBeenCalledWith(db, NOW);
    expect(order).toEqual([`snapshot v${v}`]);
    expect(version()).toBe(v + 1);
  });

  it("says 'nothing_left' with no snapshot and no bump when no set would be left", () => {
    const id = finished(db);
    const d = loadWorkoutDraft(db, id)!;
    const v = version();
    expect(saveHistoryEdit(db, patchDraftSet(d, d.exercises[0].workoutExerciseId, 0, { done: false }))).toBe('nothing_left');
    expect(mockSnapshot).not.toHaveBeenCalled();
    expect(version()).toBe(v);
  });

  it('a failed snapshot never fails the save', () => {
    mockSnapshot.mockImplementation(() => false);
    const id = finished(db);
    const d = loadWorkoutDraft(db, id)!;
    expect(saveHistoryEdit(db, patchDraftSet(d, d.exercises[0].workoutExerciseId, 0, { reps: 6 }))).toBe('saved');
  });

  it('throws any other failure without a snapshot or a bump', () => {
    const v = version();
    expect(() => saveHistoryEdit(db, { workoutId: 'nope', name: 'x', exercises: [] })).toThrow();
    expect(mockSnapshot).not.toHaveBeenCalled();
    expect(version()).toBe(v);
  });
});

describe('deleteHistoryWorkout', () => {
  it('deletes, then takes a snapshot, then bumps', () => {
    const id = finished(db);
    const v = version();
    deleteHistoryWorkout(db, id);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toBeUndefined();
    expect(order).toEqual([`snapshot v${v}`]);
    expect(version()).toBe(v + 1);
  });

  it("reads the workout's Health record before the delete and hands it on after (phase 7, §17.1)", () => {
    const id = finished(db);
    mockNative.healthRecordBeforeDelete.mockClear().mockImplementation(() => 'HK-1');
    mockNative.afterHistoryDelete.mockClear().mockImplementation(() => {
      expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toBeUndefined();
    });
    deleteHistoryWorkout(db, id);
    expect(mockNative.healthRecordBeforeDelete).toHaveBeenCalledWith(db, id);
    expect(mockNative.afterHistoryDelete).toHaveBeenCalledWith(db, 'HK-1');
  });

  it('throws for the active workout, with no snapshot and no bump', () => {
    mockNative.afterHistoryDelete.mockClear();
    const id = startEmptyWorkout(db, NOW);
    const v = version();
    expect(() => deleteHistoryWorkout(db, id)).toThrow();
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toBeDefined();
    expect(mockSnapshot).not.toHaveBeenCalled();
    expect(mockNative.afterHistoryDelete).not.toHaveBeenCalled();
    expect(version()).toBe(v);
  });
});
