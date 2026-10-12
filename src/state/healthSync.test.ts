/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { addBodyEntry } from '../db/repositories/bodyRepo';
import { healthRecordIdOf, sleepOfferOpen } from '../db/repositories/healthRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { setExerciseMark } from '../db/repositories/workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { workoutExercises, workouts } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import type { HealthStore } from '../platform/health';
import {
  acceptSleepOffer,
  dismissSleepOffer,
  healthBodyweightOffer,
  removeHealthRecord,
  roughSleepOfferFor,
  setHealthSwitch,
  syncHealthSoon,
  writeDueWorkouts,
} from './healthSync';

jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));

const PUSH_A = 'premade-ppl-6:push-a';
const NOW = new Date(2026, 9, 12, 8, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function fakeStore(): jest.Mocked<HealthStore> {
  let n = 0;
  return {
    name: 'Apple Health',
    isAvailable: jest.fn(async () => true),
    requestAccess: jest.fn(async () => true),
    granted: jest.fn(async () => null),
    writeWorkout: jest.fn(async () => `HK-${++n}`),
    deleteWorkout: jest.fn(async () => {}),
    readSleep: jest.fn(async () => []),
    readRestingHeartRate: jest.fn(async () => []),
    readLatestBodyweight: jest.fn(async () => null),
    readSteps: jest.fn(async () => 0),
  } as unknown as jest.Mocked<HealthStore>;
}

/** A finished empty workout with one ticked set, finished at `at`. */
function finishedAt(db: Db, at: number, name?: string): string {
  const id = startEmptyWorkout(db, at - HOUR);
  if (name) db.update(workouts).set({ name }).where(eq(workouts.id, id)).run();
  const { addExerciseToWorkout } = require('../db/repositories/workoutEditRepo') as typeof import('../db/repositories/workoutEditRepo');
  const we = addExerciseToWorkout(db, id, 'barbell-bench-press');
  const setId = getActiveWorkoutView(db)!.exercises.find((e) => e.id === we)!.sets[0].id;
  tickSet(db, setId, { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', at - HOUR / 2, 'mi');
  finishWorkout(db, id, at);
  return id;
}

const statusOf = (db: Db, id: string) =>
  db.select({ status: workouts.healthStatus, recordId: workouts.healthRecordId }).from(workouts).where(eq(workouts.id, id)).get();

let db: Db;
beforeEach(() => {
  db = seededDb();
  mockAnnounce.mockClear();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('the Health write-out (§17.1, R307, R308)', () => {
  it('writes nothing while it is off', async () => {
    const store = fakeStore();
    finishedAt(db, NOW);
    await expect(writeDueWorkouts(db, store)).resolves.toEqual({ written: 0, failed: 0 });
    expect(store.writeWorkout).not.toHaveBeenCalled();
  });

  it('turning it on asks to write workouts, starts from now and writes nothing from before', async () => {
    const store = fakeStore();
    const before = finishedAt(db, NOW - DAY);
    await expect(setHealthSwitch(db, 'workouts', true, store, NOW)).resolves.toBe(true);
    expect(store.requestAccess).toHaveBeenCalledWith({ writeWorkouts: true, reads: [] });
    expect(getSettings(db)).toMatchObject({ healthWorkouts: true, healthWorkoutsSince: NOW });
    await syncHealthSoon(db, store);
    expect(store.writeWorkout).not.toHaveBeenCalled();
    expect(statusOf(db, before)).toEqual({ status: null, recordId: null });
  });

  it('writes a workout finished since as one session, keeps the id and marks it done, once', async () => {
    const store = fakeStore();
    await setHealthSwitch(db, 'workouts', true, store, NOW - DAY);
    const id = finishedAt(db, NOW, 'Push A');

    await expect(writeDueWorkouts(db, store)).resolves.toEqual({ written: 1, failed: 0 });
    expect(store.writeWorkout).toHaveBeenCalledWith({ workoutId: id, title: 'Push A', start: NOW - HOUR, end: NOW });
    expect(statusOf(db, id)).toEqual({ status: 'done', recordId: 'HK-1' });

    await writeDueWorkouts(db, store);
    expect(store.writeWorkout).toHaveBeenCalledTimes(1);
  });

  it('marks a refused write failed and tries it again on the next pass', async () => {
    const store = fakeStore();
    await setHealthSwitch(db, 'workouts', true, store, NOW - DAY);
    const id = finishedAt(db, NOW);
    store.writeWorkout.mockRejectedValueOnce(new Error('denied'));

    await expect(writeDueWorkouts(db, store)).resolves.toEqual({ written: 0, failed: 1 });
    expect(statusOf(db, id)).toEqual({ status: 'failed', recordId: null });

    await writeDueWorkouts(db, store);
    expect(statusOf(db, id)).toEqual({ status: 'done', recordId: 'HK-1' });
  });

  it('never writes the workout in progress', async () => {
    const store = fakeStore();
    await setHealthSwitch(db, 'workouts', true, store, NOW - DAY);
    startEmptyWorkout(db, NOW);
    await writeDueWorkouts(db, store);
    expect(store.writeWorkout).not.toHaveBeenCalled();
  });

  it('runs passes one after another and does nothing without a store (Expo Go)', async () => {
    const store = fakeStore();
    await setHealthSwitch(db, 'workouts', true, store, NOW - DAY);
    finishedAt(db, NOW);
    await Promise.all([syncHealthSoon(db, store), syncHealthSoon(db, store)]);
    expect(store.writeWorkout).toHaveBeenCalledTimes(1);
    await expect(syncHealthSoon(db, null)).resolves.toBeUndefined();
  });

  it('turning it off stops the writes; a sheet that fails leaves the switch as it was', async () => {
    const store = fakeStore();
    await setHealthSwitch(db, 'workouts', true, store, NOW - DAY);
    await setHealthSwitch(db, 'workouts', false, store);
    finishedAt(db, NOW);
    await writeDueWorkouts(db, store);
    expect(store.writeWorkout).not.toHaveBeenCalled();

    store.requestAccess.mockRejectedValueOnce(new Error('no sheet'));
    await expect(setHealthSwitch(db, 'sleep', true, store)).resolves.toBe(false);
    expect(getSettings(db).healthSleep).toBe(false);
  });

  it('removes the record of a deleted workout, best effort', async () => {
    const store = fakeStore();
    await removeHealthRecord('HK-9', store);
    expect(store.deleteWorkout).toHaveBeenCalledWith('HK-9');
    store.deleteWorkout.mockRejectedValueOnce(new Error('refused'));
    await expect(removeHealthRecord('HK-9', store)).resolves.toBeUndefined();
    await removeHealthRecord(null, store);
    expect(store.deleteWorkout).toHaveBeenCalledTimes(2);
    expect(healthRecordIdOf(db, 'missing')).toBeNull();
  });
});

describe('the Rough sleep offer (§17.1, R309, R310)', () => {
  const night = (hours: number) => [{ kind: 'asleep' as const, start: NOW - 9 * HOUR, end: NOW - 9 * HOUR + hours * HOUR }];

  async function readsOn(store: HealthStore): Promise<void> {
    await setHealthSwitch(db, 'sleep', true, store);
    await setHealthSwitch(db, 'heartRate', true, store);
  }

  it('asks for each read separately when it is switched on', async () => {
    const store = fakeStore();
    await readsOn(store);
    expect(store.requestAccess).toHaveBeenCalledWith({ writeWorkouts: false, reads: ['sleep'] });
    expect(store.requestAccess).toHaveBeenCalledWith({ writeWorkouts: false, reads: ['heartRate'] });
  });

  it('offers after under 6 hours of sleep', async () => {
    const store = fakeStore();
    await readsOn(store);
    store.readSleep.mockResolvedValue(night(5));
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBe('short_sleep');
  });

  it('offers when resting heart rate is 10 bpm over its average', async () => {
    const store = fakeStore();
    await readsOn(store);
    store.readSleep.mockResolvedValue(night(8));
    store.readRestingHeartRate.mockResolvedValue([
      { at: NOW - HOUR, bpm: 62 },
      ...Array.from({ length: 10 }, (_, i) => ({ at: NOW - (i + 1) * DAY, bpm: 50 })),
    ]);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBe('resting_heart_rate');
  });

  it('reads only what is switched on, and offers nothing with both off or no store', async () => {
    const store = fakeStore();
    store.readSleep.mockResolvedValue(night(4));
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBeNull();
    expect(store.readSleep).not.toHaveBeenCalled();
    await setHealthSwitch(db, 'heartRate', true, store);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBeNull();
    expect(store.readSleep).not.toHaveBeenCalled();
    await expect(roughSleepOfferFor(db, id, null, NOW)).resolves.toBeNull();
  });

  it('offers nothing when a read fails', async () => {
    const store = fakeStore();
    await readsOn(store);
    store.readSleep.mockRejectedValue(new Error('locked'));
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBeNull();
  });

  it('Mark it flags every unflagged exercise Rough sleep, once, and says so', async () => {
    const store = fakeStore();
    await readsOn(store);
    store.readSleep.mockResolvedValue(night(5));
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const [first] = getActiveWorkoutView(db)!.exercises;
    setExerciseMark(db, first.id, 'pain');

    acceptSleepOffer(db, id);

    const marks = db.select({ mark: workoutExercises.mark }).from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(marks.filter((m) => m.mark === 'pain')).toHaveLength(1);
    expect(marks.filter((m) => m.mark === 'rough_sleep')).toHaveLength(marks.length - 1);
    expect(mockAnnounce).toHaveBeenCalledWith('Marked Rough sleep.');
    expect(sleepOfferOpen(db, id)).toBe(false);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBeNull();
    acceptSleepOffer(db, id);
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
  });

  it('× means it never comes back for this workout', async () => {
    const store = fakeStore();
    await readsOn(store);
    store.readSleep.mockResolvedValue(night(5));
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    dismissSleepOffer(db, id);
    await expect(roughSleepOfferFor(db, id, store, NOW)).resolves.toBeNull();
  });

  it('is not offered once an exercise is already Rough sleep, or with nothing to flag', async () => {
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const [first] = getActiveWorkoutView(db)!.exercises;
    setExerciseMark(db, first.id, 'rough_sleep');
    expect(sleepOfferOpen(db, id)).toBe(false);
    const empty = seededDb();
    expect(sleepOfferOpen(empty, startEmptyWorkout(empty, NOW))).toBe(false);
  });
});

describe('the body weight from Health (R311)', () => {
  it('offers a newer reading in the display unit, only with the read on', async () => {
    const store = fakeStore();
    store.readLatestBodyweight.mockResolvedValue({ at: NOW, kg: 80 });
    await expect(healthBodyweightOffer(db, store)).resolves.toBeNull();
    setSetting(db, 'healthBodyweight', true);
    await expect(healthBodyweightOffer(db, store)).resolves.toEqual({ at: NOW, weight: 176.4, unit: 'lb' });
    addBodyEntry(db, 'bodyweight', 180, 'lb', NOW + 1);
    await expect(healthBodyweightOffer(db, store)).resolves.toBeNull();
    await expect(healthBodyweightOffer(db, null)).resolves.toBeNull();
  });
});
