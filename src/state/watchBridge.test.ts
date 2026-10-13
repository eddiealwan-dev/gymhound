/** @jest-environment node */
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { parseWatchCommand, WATCH_PROTOCOL, type WatchCommand } from '../domain/watchProtocol';
import { startFromDay } from './sessionActions';
import { applyWatchCommand, watchStateFor } from './watchBridge';

// As in sessionActions.test.ts: the rest surface, the screen reader and phase 7's services are watched, never run.
const mockSurface = { start: jest.fn(async () => {}), update: jest.fn(async () => {}), cancel: jest.fn(async () => {}), ended: jest.fn(async () => {}) };
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('../platform/restTimer', () => ({ getRestTimerSurface: () => mockSurface }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('./nativeServices', () => ({ afterFinish: jest.fn(), healthRecordBeforeDelete: jest.fn(() => null), afterHistoryDelete: jest.fn() }));
jest.mock('./backup', () => ({ takeSnapshotSafely: jest.fn(() => true) }));

const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';

let db: Db;
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
});
afterEach(() => jest.useRealTimers());

const tickCmd = (workoutId: string, setId: string, weight: number | null, reps: number | null): WatchCommand => ({
  v: WATCH_PROTOCOL,
  kind: 'tick',
  workoutId,
  setId,
  weight,
  reps,
});

describe('parseWatchCommand (R316)', () => {
  it('reads each command, from a JSON string or an object', () => {
    expect(parseWatchCommand('{"v":1,"kind":"hello"}')).toEqual({ v: 1, kind: 'hello' });
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: 's', weight: 135, reps: 8 })).toEqual(tickCmd('w', 's', 135, 8));
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: 's' })).toEqual(tickCmd('w', 's', null, null));
    expect(parseWatchCommand({ v: 1, kind: 'restSkip', workoutId: 'w', endsAt: 5 })).toEqual({ v: 1, kind: 'restSkip', workoutId: 'w', endsAt: 5 });
  });

  it('ignores another version, a malformed message, or a value out of range', () => {
    expect(parseWatchCommand({ v: 2, kind: 'hello' })).toBeNull();
    expect(parseWatchCommand('{not json')).toBeNull();
    expect(parseWatchCommand(null)).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'erase' })).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: '' })).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: 's', weight: -5 })).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: 's', reps: 8.5 })).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'tick', workoutId: 'w', setId: 's', weight: '135' })).toBeNull();
    expect(parseWatchCommand({ v: 1, kind: 'restPlus15', workoutId: 'w', endsAt: Number.NaN })).toBeNull();
  });
});

describe('watchStateFor (R316)', () => {
  it('is no workout when none is active', () => {
    expect(watchStateFor(db)).toEqual({ v: WATCH_PROTOCOL, workout: null });
  });

  it('shows the workout, its progress and the next set', () => {
    startFromDay(db, PUSH_A);
    const view = getActiveWorkoutView(db)!;
    const { workout } = watchStateFor(db);
    expect(workout).toMatchObject({ id: view.id, name: view.name, startedAt: NOW, restEndsAt: null, done: 0 });
    expect(workout!.total).toBe(view.exercises.reduce((n, ex) => n + ex.sets.length, 0));
    expect(workout!.next).toMatchObject({ exercise: view.exercises[0].name, weightUnit: 'lb', distanceUnit: 'mi' });
    expect(view.exercises[0].sets.map((s) => s.id)).toContain(workout!.next!.setId);
  });
});

describe('applyWatchCommand (R317)', () => {
  it('ticks the set as the session screen does, starting the rest, and moves the next set on', () => {
    startFromDay(db, PUSH_A);
    const before = watchStateFor(db).workout!;
    const setId = before.next!.setId;
    expect(applyWatchCommand(db, tickCmd(before.id, setId, 135, 8))).toBe('ok');
    const after = watchStateFor(db).workout!;
    expect(after.done).toBe(1);
    expect(after.next!.setId).not.toBe(setId);
    expect(after.restEndsAt).not.toBeNull();
    expect(mockSurface.start).toHaveBeenCalled();
    const set = getActiveWorkoutView(db)!.exercises.flatMap((ex) => ex.sets).find((s) => s.id === setId)!;
    expect(set).toMatchObject({ done: true, weight: 135, reps: 8 });
  });

  it('is stale for another workout, a set already ticked or a rest that has changed', () => {
    expect(applyWatchCommand(db, tickCmd('w-gone', 's', 135, 8))).toBe('stale');
    startFromDay(db, PUSH_A);
    const { id, next } = watchStateFor(db).workout!;
    expect(applyWatchCommand(db, tickCmd('w-old', next!.setId, 135, 8))).toBe('stale');
    expect(applyWatchCommand(db, tickCmd(id, next!.setId, 135, 8))).toBe('ok');
    expect(applyWatchCommand(db, tickCmd(id, next!.setId, 135, 8))).toBe('stale');
    expect(applyWatchCommand(db, { v: WATCH_PROTOCOL, kind: 'restSkip', workoutId: id, endsAt: 1 })).toBe('stale');
  });

  it('adds 15 seconds to, or skips, the running rest', () => {
    startFromDay(db, PUSH_A);
    const { id, next } = watchStateFor(db).workout!;
    applyWatchCommand(db, tickCmd(id, next!.setId, 135, 8));
    const endsAt = watchStateFor(db).workout!.restEndsAt!;
    expect(applyWatchCommand(db, { v: WATCH_PROTOCOL, kind: 'restPlus15', workoutId: id, endsAt })).toBe('ok');
    const later = watchStateFor(db).workout!.restEndsAt!;
    expect(later).toBe(endsAt + 15_000);
    expect(applyWatchCommand(db, { v: WATCH_PROTOCOL, kind: 'restSkip', workoutId: id, endsAt: later })).toBe('ok');
    expect(watchStateFor(db).workout!.restEndsAt).toBeNull();
  });

  it('refuses a tick with nothing to log, logs the shown reps with a weight from the wrist, and answers hello', () => {
    startFromDay(db, PUSH_A);
    const { id, next } = watchStateFor(db).workout!;
    // A fresh Push A has reps from the rule but no weight yet: the phone has nothing to log for it.
    expect(next).toMatchObject({ setName: 'Set 1', weight: null, reps: 8 });
    expect(applyWatchCommand(db, tickCmd(id, next!.setId, null, null))).toBe('refused');
    expect(applyWatchCommand(db, tickCmd(id, next!.setId, 95, null))).toBe('ok');
    const set = getActiveWorkoutView(db)!.exercises[0].sets.find((s) => s.id === next!.setId)!;
    expect(set).toMatchObject({ weight: 95, reps: 8 });
    expect(applyWatchCommand(db, { v: WATCH_PROTOCOL, kind: 'hello' })).toBe('ok');
  });
});
