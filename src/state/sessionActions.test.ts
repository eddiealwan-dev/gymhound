/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { getRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { getExerciseNote, setExerciseNote } from '../db/repositories/exercisesRepo';
import { getUpNext, setActiveRoutine } from '../db/repositories/routinesRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { switchDisplayUnit } from '../db/repositories/unitsRepo';
import {
  ActiveWorkoutExistsError,
  finishWorkout,
  getActiveWorkoutId,
  startWorkoutFromDay,
  tickSet,
} from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView, getFinishSummary } from '../db/repositories/workoutViewsRepo';
import { workoutExercises, workouts } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { gearFor } from '../domain/plates';
import { buildRows, fieldPatch, readRow, valueText } from '../domain/setTable';
import { useDataVersion } from './dataVersion';
import {
  addExercise,
  addSetTo,
  addWarmupTo,
  commitSetField,
  discard,
  finish,
  moveBlock,
  removeFromWorkout,
  removeSetFrom,
  replaceWith,
  restEnded,
  restMinus15,
  restSkip,
  saveNote,
  setExerciseRest,
  setRpeShown,
  startEmpty,
  startFromDay,
  tick,
  toggleSuperset,
  untick,
} from './sessionActions';

// dataVersion pulls in the router only for `useDbQuery`; these tests use the store alone.
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));

// The rest surface is the lock-screen notification. Tests watch the calls and never touch expo-notifications.
const mockSurface = {
  start: jest.fn((_endsAt: number, _withSound: boolean) => Promise.resolve()),
  update: jest.fn((_endsAt: number, _withSound: boolean) => Promise.resolve()),
  cancel: jest.fn(() => Promise.resolve()),
};
jest.mock('../platform/restTimer', () => ({ getRestTimerSurface: () => mockSurface }));

// The snapshot writes a file on the phone and does nothing on web. Tests watch the calls (its own tests are in backup.test.ts).
const mockSnapshot = jest.fn((_db: Db, _now: number) => true);
jest.mock('./backup', () => ({ takeSnapshotSafely: (db: Db, now: number) => mockSnapshot(db, now) }));

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
  mockSurface.start.mockClear();
  mockSurface.update.mockClear();
  mockSurface.cancel.mockClear();
  mockSnapshot.mockClear();
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

// ---- the session screen's actions (Task 14) ----

const BENCH = 'barbell-bench-press';

function activeView() {
  return getActiveWorkoutView(db)!;
}

/** The first exercise of the active workout (Push A opens with the bench press, four working sets). */
function bench() {
  const ex = activeView().exercises[0];
  expect(ex.exerciseId).toBe(BENCH);
  return ex;
}

const reread = (setId: string) => activeView().exercises[0].sets.find((s) => s.id === setId)!;

/** A finished Push A from the day before, with `done` bench sets ticked at 135 × 8 and the rest left unticked. */
function finishedPushA(done: number) {
  const before = new Date(2026, 9, 8, 9, 0).getTime();
  const id = startWorkoutFromDay(db, PUSH_A, before);
  const first = getActiveWorkoutView(db)!.exercises[0];
  first.sets.slice(0, done).forEach((s, i) => {
    tickSet(db, s.id, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', before + (i + 1) * 60_000, 'mi');
  });
  finishWorkout(db, id, before + 3_600_000);
}

const NOTHING = { weight: null, reps: null, durationS: null, distance: null };

describe('commitSetField', () => {
  it('writes the patch to the set, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const set = bench().sets[0];
    const before = version();

    commitSetField(db, set.id, { weight: 135, weightUnit: 'lb' });

    expect(reread(set.id)).toMatchObject({ weight: 135, weightUnit: 'lb', reps: null, done: false });
    expect(version()).toBe(before + 1);
  });

  it('changes the set type', () => {
    startFromDay(db, PUSH_A);

    commitSetField(db, bench().sets[0].id, { setType: 'warmup' });

    expect(bench().sets.map((s) => s.setType)).toEqual(['warmup', 'working', 'working', 'working']);
  });
});

describe('tick', () => {
  it('records what was entered, in the unit in Settings, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    const set = ex.sets[0];
    const before = version();

    const ticked = tick(db, ex, set, { weight: 135, reps: 8, durationS: null, distance: null });

    expect(ticked).toBe(true);
    expect(reread(set.id)).toMatchObject({ done: true, weight: 135, weightUnit: 'lb', reps: 8 });
    expect(version()).toBe(before + 1);
  });

  it('stamps the weight with the unit in Settings', () => {
    setSetting(db, 'unit', 'kg');
    startFromDay(db, PUSH_A);
    const ex = bench();

    tick(db, ex, ex.sets[0], { weight: 82.5, reps: 5, durationS: null, distance: null });

    expect(reread(ex.sets[0].id)).toMatchObject({ weight: 82.5, weightUnit: 'kg' });
  });

  it("accepts last time's values when the fields are empty (spec 8.4)", () => {
    finishedPushA(4);
    startFromDay(db, PUSH_A);
    const ex = bench();

    expect(tick(db, ex, ex.sets[1], NOTHING)).toBe(true);

    expect(reread(ex.sets[1].id)).toMatchObject({ done: true, weight: 135, weightUnit: 'lb', reps: 8 });
  });

  it('has nothing to accept for a set that did not exist last time', () => {
    finishedPushA(2);
    startFromDay(db, PUSH_A);
    const ex = bench();

    // Last time only working sets 1 and 2 were ticked. Working set 3 has no weight to fall back on.
    expect(tick(db, ex, ex.sets[2], NOTHING)).toBe(false);
  });

  it('returns false and writes nothing when a field the type needs has no value and no placeholder', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    const before = version();

    // No target and no history: the weight has nothing to fall back on.
    expect(tick(db, ex, ex.sets[0], { weight: null, reps: 8, durationS: null, distance: null })).toBe(false);

    expect(reread(ex.sets[0].id)).toMatchObject({ done: false, weight: null, reps: null });
    expect(version()).toBe(before);
  });

  it("uses today's target for a working set, converted into the entry unit as a workout start does (R36)", () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    db.update(workoutExercises).set({ plannedWeight: 60, plannedUnit: 'kg' }).where(eq(workoutExercises.id, ex.id)).run();

    tick(db, bench(), bench().sets[0], { weight: null, reps: 5, durationS: null, distance: null });

    // 60 kg is 132.28 lb; the bench is a barbell, so it rounds to the nearest weight the lb plates load, and it is
    // stored in lb, the unit it was ticked in.
    expect(reread(ex.sets[0].id)).toMatchObject({ done: true, weight: 130, weightUnit: 'lb', reps: 5 });
  });

  it("prefers today's override to the planned weight", () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    db.update(workoutExercises)
      .set({ plannedWeight: 100, plannedUnit: 'lb', overrideWeight: 105, overrideUnit: 'lb' })
      .where(eq(workoutExercises.id, ex.id))
      .run();

    tick(db, bench(), bench().sets[0], { weight: null, reps: 5, durationS: null, distance: null });

    expect(reread(ex.sets[0].id).weight).toBe(105);
  });

  it('does not start a warmup at the working target', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    db.update(workoutExercises).set({ plannedWeight: 225, plannedUnit: 'lb' }).where(eq(workoutExercises.id, ex.id)).run();
    commitSetField(db, ex.sets[0].id, { setType: 'warmup' });

    const fresh = bench();
    expect(tick(db, fresh, fresh.sets[0], { weight: null, reps: 8, durationS: null, distance: null })).toBe(false);
    expect(tick(db, fresh, fresh.sets[1], { weight: null, reps: 8, durationS: null, distance: null })).toBe(true);
    expect(reread(fresh.sets[1].id).weight).toBe(225);
  });
});

describe('a unit switch mid-workout: logged entries stay in the unit they were logged in (spec 7.1, F4)', () => {
  /** The set table row for bench set `i` as the session shows it now, in the unit in Settings. */
  function benchRow(i: number) {
    const settings = getSettings(db);
    const ex = bench();
    return { ex, row: buildRows(ex, settings.unit, gearFor(settings.unit, settings))[i] };
  }

  it('shows 135 typed in lb and not ticked as "135 lb" after a switch to kg, and ticks it as 135 lb', () => {
    startFromDay(db, PUSH_A);
    commitSetField(db, bench().sets[0].id, fieldPatch('weight', 135, 'lb', 'mi'));

    switchDisplayUnit(db, 'kg');

    const { ex, row } = benchRow(0);
    expect(valueText(row, 'weight', 'kg')).toBe('135 lb');
    const reading = readRow(row, {}, 'kg');
    expect(tick(db, ex, row.set, reading.entered, reading.weightUnit)).toBe(true);
    expect(reread(row.set.id)).toMatchObject({ done: true, weight: 135, weightUnit: 'lb' });
  });

  it('saves a weight typed after the switch in the new unit', () => {
    startFromDay(db, PUSH_A);
    commitSetField(db, bench().sets[0].id, fieldPatch('weight', 135, 'lb', 'mi'));
    switchDisplayUnit(db, 'kg');

    const { ex, row } = benchRow(0);
    const reading = readRow(row, { weight: '60' }, 'kg');
    tick(db, ex, row.set, reading.entered, reading.weightUnit);

    expect(reread(row.set.id)).toMatchObject({ done: true, weight: 60, weightUnit: 'kg' });
  });

  it('shows a done 100 kg set as "100 kg" after a switch to lb', () => {
    setSetting(db, 'unit', 'kg');
    startFromDay(db, PUSH_A);
    tick(db, bench(), bench().sets[0], { weight: 100, reps: 5, durationS: null, distance: null });

    switchDisplayUnit(db, 'lb');

    const { row } = benchRow(0);
    expect(row.set).toMatchObject({ done: true, weight: 100, weightUnit: 'kg' });
    expect(valueText(row, 'weight', 'lb')).toBe('100 kg');
  });

  it('prefills a 135 lb planned bench as 60 after a switch to kg, not 61.23, and ticks 60 kg', () => {
    startFromDay(db, PUSH_A);
    db.update(workoutExercises).set({ plannedWeight: 135, plannedUnit: 'lb' }).where(eq(workoutExercises.id, bench().id)).run();

    switchDisplayUnit(db, 'kg');

    const { ex, row } = benchRow(0);
    expect(row.target).toBe(60);
    expect(valueText(row, 'weight', 'kg')).toBe('60');
    const reading = readRow(row, {}, 'kg');
    tick(db, ex, row.set, reading.entered, reading.weightUnit);
    expect(reread(row.set.id)).toMatchObject({ done: true, weight: 60, weightUnit: 'kg' });
  });
});

describe('untick', () => {
  it('un-ticks the set and keeps its values, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    tick(db, ex, ex.sets[0], { weight: 135, reps: 8, durationS: null, distance: null });
    const before = version();

    untick(db, ex.sets[0].id);

    expect(reread(ex.sets[0].id)).toMatchObject({ done: false, weight: 135, reps: 8 });
    expect(version()).toBe(before + 1);
  });
});

describe('addSetTo, addWarmupTo and removeSetFrom', () => {
  it('appends an empty working set, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    const before = version();

    addSetTo(db, ex.id);

    const sets = bench().sets;
    expect(sets).toHaveLength(5);
    expect(sets[4]).toMatchObject({ setType: 'working', weight: null, reps: null, done: false });
    expect(version()).toBe(before + 1);
  });

  it('adds a warmup at the top, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    const before = version();

    addWarmupTo(db, ex.id);

    const sets = bench().sets;
    expect(sets.map((s) => s.setType)).toEqual(['warmup', 'working', 'working', 'working', 'working']);
    expect(sets.slice(1).map((s) => s.id)).toEqual(ex.sets.map((s) => s.id));
    expect(sets[0]).toMatchObject({ position: 0, weight: null, reps: null, done: false });
    expect(version()).toBe(before + 1);
  });

  it('removes the set and renumbers the rest, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    const before = version();

    removeSetFrom(db, ex.sets[1].id);

    expect(bench().sets.map((s) => s.id)).toEqual([ex.sets[0].id, ex.sets[2].id, ex.sets[3].id]);
    expect(bench().sets.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(version()).toBe(before + 1);
  });
});

describe('saveNote', () => {
  it("saves the exercise's own note, which the workout then shows, and bumps the data version", () => {
    startFromDay(db, PUSH_A);
    const before = version();

    saveNote(db, BENCH, 'Pause on the chest');

    expect(bench().note).toBe('Pause on the chest');
    expect(getExerciseNote(db, BENCH)).toBe('Pause on the chest');
    expect(version()).toBe(before + 1);
  });

  it('clears the note when the text is blank', () => {
    startFromDay(db, PUSH_A);
    saveNote(db, BENCH, 'Pause on the chest');

    saveNote(db, BENCH, '   ');

    expect(bench().note).toBeNull();
  });
});

// ---- the rest timer (Task 15 Step 6) ----

const VALUES = { weight: 135, reps: 8, durationS: null, distance: null };
const workoutId = () => getActiveWorkoutId(db)!;
const restEndsAt = () => activeView().restEndsAt;

/** Ticks working set `i` of exercise `e` of the active workout (the bench press is 0, the overhead press 1). */
function tickSetOf(e: number, i: number): boolean {
  const ex = activeView().exercises[e];
  return tick(db, ex, ex.sets[i], VALUES);
}

describe('tick starts the rest timer', () => {
  it('stores the end time (the Settings length from now) and starts the surface with the bell setting', () => {
    startFromDay(db, PUSH_A);

    expect(tickSetOf(0, 0)).toBe(true);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(mockSurface.start).toHaveBeenCalledTimes(1);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 120_000, true);
  });

  it('bumps the data version once', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    tickSetOf(0, 0);

    expect(version()).toBe(before + 1);
  });

  it('follows the rest length and the bell setting', () => {
    setSetting(db, 'restSeconds', 90);
    setSetting(db, 'restBell', false);
    startFromDay(db, PUSH_A);

    tickSetOf(0, 0);

    expect(restEndsAt()).toBe(NOW + 90_000);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 90_000, false);
  });

  it('restarts the rest from now when a later set is ticked', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 30_000);

    tickSetOf(0, 1);

    expect(restEndsAt()).toBe(NOW + 150_000);
    expect(mockSurface.start).toHaveBeenLastCalledWith(NOW + 150_000, true);
  });

  it('starts nothing in a superset until the last member of the round (bench with overhead press)', () => {
    startFromDay(db, PUSH_A);
    toggleSuperset(db, activeView().exercises[0].id);
    mockSurface.start.mockClear();

    expect(tickSetOf(0, 0)).toBe(true);
    expect(restEndsAt()).toBeNull();
    expect(mockSurface.start).not.toHaveBeenCalled();

    expect(tickSetOf(1, 0)).toBe(true);
    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 120_000, true);
  });

  it('starts nothing when the tick is refused', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();

    // No target and no history: the weight has nothing to fall back on.
    expect(tick(db, ex, ex.sets[0], { weight: null, reps: 8, durationS: null, distance: null })).toBe(false);

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.start).not.toHaveBeenCalled();
  });

  it('is never failed by the surface: a rejection or a throw is logged and the tick stands', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    startFromDay(db, PUSH_A);
    mockSurface.start.mockRejectedValueOnce(new Error('notifications are off'));

    expect(tickSetOf(0, 0)).toBe(true);
    await Promise.resolve();

    expect(reread(bench().sets[0].id).done).toBe(true);
    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(warn).toHaveBeenCalledTimes(1);

    mockSurface.start.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    expect(tickSetOf(0, 1)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

// ---- rest per exercise (Task 21) ----

const UPPER_A = 'premade-upperlower-4:upper-a';

describe('setExerciseRest', () => {
  it("saves the exercise's rest, which the workout then shows, and bumps the data version", () => {
    startFromDay(db, PUSH_A);
    const before = version();

    setExerciseRest(db, BENCH, 90);

    expect(getRestSeconds(db, BENCH)).toBe(90);
    expect(bench().restSeconds).toBe(90);
    expect(version()).toBe(before + 1);
  });

  it('goes back to the Settings rest with null', () => {
    setExerciseRest(db, BENCH, 90);
    setExerciseRest(db, BENCH, null);
    expect(getRestSeconds(db, BENCH)).toBeNull();
  });

  it('leaves a running rest as it is', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    mockSurface.start.mockClear();

    setExerciseRest(db, BENCH, 30);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(mockSurface.start).not.toHaveBeenCalled();
    expect(mockSurface.update).not.toHaveBeenCalled();
  });

  it('follows the exercise: set on Push A, it is there on Upper A too', () => {
    startFromDay(db, PUSH_A);
    setExerciseRest(db, BENCH, 90);
    discard(db, workoutId());

    startFromDay(db, UPPER_A);

    const view = activeView();
    expect(view.name).toBe('Upper A');
    expect(view.exercises.find((e) => e.exerciseId === BENCH)!.restSeconds).toBe(90);
  });
});

describe('tick uses the rest of the exercise ticked', () => {
  it("starts the exercise's own rest: bench at 90 rests 90 seconds", () => {
    setExerciseRest(db, BENCH, 90);
    startFromDay(db, PUSH_A);

    tickSetOf(0, 0);

    expect(restEndsAt()).toBe(NOW + 90_000);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 90_000, true);
  });

  it('starts no rest when the exercise is set to Off (0)', () => {
    setExerciseRest(db, BENCH, 0);
    startFromDay(db, PUSH_A);

    expect(tickSetOf(0, 0)).toBe(true);

    expect(reread(bench().sets[0].id).done).toBe(true);
    expect(restEndsAt()).toBeNull();
    expect(mockSurface.start).not.toHaveBeenCalled();
  });

  it('rests 90 seconds on Default once 1:30 is chosen in Settings (F7)', () => {
    // What the Settings choice 1:30 writes.
    setSetting(db, 'restSeconds', 90);
    startFromDay(db, PUSH_A);
    expect(bench().restSeconds).toBeNull();

    tickSetOf(0, 0);

    expect(restEndsAt()).toBe(NOW + 90_000);
  });

  it('uses the Settings rest for an exercise with no pref of its own', () => {
    setSetting(db, 'restSeconds', 150);
    setExerciseRest(db, BENCH, 90);
    startFromDay(db, PUSH_A);

    tickSetOf(1, 0);

    expect(activeView().exercises[1].restSeconds).toBeNull();
    expect(restEndsAt()).toBe(NOW + 150_000);
  });

  it("uses the last member's own rest after a superset round (bench Off, overhead press 60)", () => {
    startFromDay(db, PUSH_A);
    toggleSuperset(db, activeView().exercises[0].id);
    const ohp = activeView().exercises[1].exerciseId;
    setExerciseRest(db, BENCH, 0);
    setExerciseRest(db, ohp, 60);

    tickSetOf(0, 0);
    expect(restEndsAt()).toBeNull();

    tickSetOf(1, 0);
    expect(restEndsAt()).toBe(NOW + 60_000);
  });

  it('starts nothing after a superset round whose last member is Off, whatever the first member says', () => {
    startFromDay(db, PUSH_A);
    toggleSuperset(db, activeView().exercises[0].id);
    setExerciseRest(db, BENCH, 90);
    setExerciseRest(db, activeView().exercises[1].exerciseId, 0);

    tickSetOf(0, 0);
    tickSetOf(1, 0);

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.start).not.toHaveBeenCalled();
  });
});

describe('restMinus15', () => {
  it('moves the end 15 seconds earlier, then updates the surface and bumps the data version', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 10_000);
    const before = version();

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 105_000);
    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 105_000, true);
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before + 1);
  });

  it('passes the bell setting on to the surface', () => {
    setSetting(db, 'restBell', false);
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 105_000, false);
  });

  it('skips when 15 seconds or less are left', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 110_000);

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.cancel).toHaveBeenCalledTimes(1);
    expect(mockSurface.update).not.toHaveBeenCalled();
  });
});

describe('restSkip', () => {
  it('clears the end time and cancels the surface, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    const before = version();

    restSkip(db, workoutId());

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.cancel).toHaveBeenCalledTimes(1);
    expect(version()).toBe(before + 1);
  });
});

describe('restEnded', () => {
  it('clears the end time without cancelling the surface (the notification already fired), then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    const before = version();

    restEnded(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before + 1);
  });

  it('leaves a newer rest alone: a tick that landed before the old end was cleared keeps its own end (R31)', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0); // ends at NOW + 120 s
    jest.setSystemTime(NOW + 120_500);
    tickSetOf(0, 1); // a new rest starts, ending at NOW + 240.5 s, just as the first one is being cleared

    restEnded(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 240_500);
    expect(mockSurface.cancel).not.toHaveBeenCalled();
  });
});

// ---- the set the countdown shows under (R38) ----

describe('restSetId: the set that started the rest', () => {
  const restSetId = () => activeView().restSetId;
  const setId = (e: number, i: number) => activeView().exercises[e].sets[i].id;

  it('is the ticked set when its tick starts a rest, and moves to the next set whose tick starts one', () => {
    startFromDay(db, PUSH_A);
    expect(restSetId()).toBeNull();

    tickSetOf(0, 0);
    expect(restSetId()).toBe(setId(0, 0));

    tickSetOf(0, 1);
    expect(restSetId()).toBe(setId(0, 1));
  });

  it("stays on bench's set when a set of an exercise whose rest is Off is ticked while bench's rest runs", () => {
    startFromDay(db, PUSH_A);
    setExerciseRest(db, activeView().exercises[1].exerciseId, 0);
    tickSetOf(0, 0);

    tickSetOf(1, 0);

    expect(activeView().exercises[1].sets[0].done).toBe(true);
    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(restSetId()).toBe(setId(0, 0));
  });

  it("stays put when a superset member that is not last in its round is ticked while the round's rest runs", () => {
    startFromDay(db, PUSH_A);
    toggleSuperset(db, activeView().exercises[0].id);
    tickSetOf(0, 0);
    tickSetOf(1, 0); // the round's last member: the rest starts here
    jest.setSystemTime(NOW + 30_000);

    tickSetOf(0, 1);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(restSetId()).toBe(setId(1, 0));
  });

  it('stays when that set is unticked: the rest keeps running', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    const anchor = setId(0, 0);

    untick(db, anchor);

    expect(reread(anchor).done).toBe(false);
    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(restSetId()).toBe(anchor);
  });

  it('stays through -15s', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 105_000);
    expect(restSetId()).toBe(setId(0, 0));
  });

  it('is cleared by Skip, and by a -15s that skips', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    restSkip(db, workoutId());
    expect(restSetId()).toBeNull();

    tickSetOf(0, 1);
    jest.setSystemTime(NOW + 110_000);
    restMinus15(db, workoutId(), NOW + 120_000);
    expect(restEndsAt()).toBeNull();
    expect(restSetId()).toBeNull();
  });

  it('is cleared when the rest with the stored end has ended, and kept for another end', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restEnded(db, workoutId(), NOW + 60_000);
    expect(restSetId()).toBe(setId(0, 0));

    restEnded(db, workoutId(), NOW + 120_000);
    expect(restEndsAt()).toBeNull();
    expect(restSetId()).toBeNull();
  });

  it('is cleared when its exercise is replaced: the rest keeps running in the bar, and no set of the new exercise shows it (F6)', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    replaceWith(db, bench().id, RDL);

    const view = activeView();
    expect(view.exercises[0].exerciseId).toBe(RDL);
    expect(view.restSetId).toBeNull();
    expect(view.restEndsAt).toBe(NOW + 120_000);
    expect(view.exercises.some((e) => e.sets.some((s) => s.id === view.restSetId))).toBe(false);
  });

  it('stays when another exercise is replaced', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    replaceWith(db, activeView().exercises[1].id, RDL);

    expect(restSetId()).toBe(setId(0, 0));
    expect(restEndsAt()).toBe(NOW + 120_000);
  });

  it('is cleared by finishing the workout', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    const id = workoutId();

    expect(finish(db, id)).toBe('finished');

    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      restEndsAt: null,
      restSetId: null,
    });
  });
});

// ---- the exercise menu and the picker (Task 15 Steps 1-2) ----

const RDL = 'barbell-romanian-deadlift';
const OHP = 'barbell-overhead-press';

describe('addExercise', () => {
  it('appends the exercise to the active workout with one empty working set, then bumps the data version', () => {
    startEmpty(db);
    const before = version();

    addExercise(db, RDL);
    addExercise(db, BENCH);

    const exercises = activeView().exercises;
    expect(exercises.map((e) => [e.exerciseId, e.position])).toEqual([
      [RDL, 0],
      [BENCH, 1],
    ]);
    expect(exercises[0].name).toBe('Romanian deadlift');
    expect(exercises[0].sets).toHaveLength(1);
    expect(exercises[0].sets[0]).toMatchObject({ setType: 'working', done: false, weight: null, reps: null });
    expect(version()).toBe(before + 2);
  });

  it('throws when there is no workout in progress, leaving the version alone', () => {
    const before = version();

    expect(() => addExercise(db, RDL)).toThrow('No workout in progress.');

    expect(version()).toBe(before);
  });
});

describe('replaceWith', () => {
  it("swaps the exercise in place and shows the new exercise's own note, while the old note stays with the old exercise", () => {
    startFromDay(db, PUSH_A);
    setExerciseNote(db, BENCH, 'Pause on the chest', NOW);
    setExerciseNote(db, RDL, 'Hips back', NOW);
    const ex = bench();
    expect(ex.note).toBe('Pause on the chest');
    tick(db, ex, ex.sets[0], VALUES);
    const before = version();

    replaceWith(db, ex.id, RDL);

    const replaced = activeView().exercises[0];
    expect(replaced).toMatchObject({ id: ex.id, exerciseId: RDL, name: 'Romanian deadlift', position: 0, note: 'Hips back' });
    expect(replaced.sets).toHaveLength(4);
    expect(replaced.sets.every((s) => !s.done && s.weight === null && s.reps === null)).toBe(true);
    expect(getExerciseNote(db, BENCH)).toBe('Pause on the chest');
    expect(version()).toBe(before + 1);
  });
});

describe('removeFromWorkout', () => {
  it('deletes the exercise and renumbers the rest, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    removeFromWorkout(db, bench().id);

    const exercises = activeView().exercises;
    expect(exercises).toHaveLength(4);
    expect(exercises.map((e) => e.position)).toEqual([0, 1, 2, 3]);
    expect(exercises[0].exerciseId).toBe(OHP);
    expect(version()).toBe(before + 1);
  });
});

describe('moveBlock', () => {
  it('moves the exercise one place, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    moveBlock(db, bench().id, 'down');

    expect(activeView().exercises.slice(0, 2).map((e) => e.exerciseId)).toEqual([OHP, BENCH]);
    expect(version()).toBe(before + 1);
  });

  it('moves a superset as one block', () => {
    startFromDay(db, PUSH_A);
    toggleSuperset(db, bench().id);

    moveBlock(db, bench().id, 'down');

    expect(activeView().exercises.slice(0, 3).map((e) => e.exerciseId)).toEqual(['incline-dumbbell-press', BENCH, OHP]);
  });
});

describe('toggleSuperset', () => {
  it('links the exercise with the next, and a second call breaks the link', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    toggleSuperset(db, bench().id);
    expect(activeView().exercises.slice(0, 3).map((e) => e.supersetGroup)).toEqual([1, 1, null]);

    toggleSuperset(db, bench().id);
    expect(activeView().exercises.slice(0, 3).map((e) => e.supersetGroup)).toEqual([null, null, null]);
    expect(version()).toBe(before + 2);
  });
});

describe('setRpeShown', () => {
  it('shows and hides the RPE column for the exercise, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    setRpeShown(db, bench().id, true);
    expect(bench().showRpe).toBe(true);
    expect(activeView().exercises[1].showRpe).toBe(false);

    setRpeShown(db, bench().id, false);
    expect(bench().showRpe).toBe(false);
    expect(version()).toBe(before + 2);
  });
});

// ---- finish and discard (Task 16) ----

/** Ticks the first `n` bench sets of the active workout, then forgets the rest-timer calls the ticks made. */
function tickBench(n: number): void {
  for (let i = 0; i < n; i++) tick(db, bench(), bench().sets[i], VALUES);
  mockSurface.start.mockClear();
}

describe('finish and discard', () => {
  /** What happened, in order, each with whether the workout was still active at that moment. */
  let order: string[];
  let stopWatching: () => void;
  const mark = (step: string) => order.push(`${step} (${getActiveWorkoutId(db) === null ? 'no active workout' : 'workout active'})`);

  beforeEach(() => {
    order = [];
    mockSurface.cancel.mockImplementation(() => {
      mark('cancel');
      return Promise.resolve();
    });
    mockSnapshot.mockImplementation(() => {
      mark('snapshot');
      return true;
    });
    stopWatching = useDataVersion.subscribe(() => mark('bump'));
  });

  afterEach(() => {
    stopWatching();
    mockSurface.cancel.mockImplementation(() => Promise.resolve());
    mockSnapshot.mockImplementation(() => true);
  });

  const FINISHED_ORDER = ['cancel (no active workout)', 'snapshot (no active workout)', 'bump (no active workout)'];

  describe('finish', () => {
    it('finishes, cancels the rest surface, takes the snapshot, then bumps, in that order, once the finish has committed', () => {
      startFromDay(db, PUSH_A);
      tickBench(2);
      const id = workoutId();
      order = [];
      jest.setSystemTime(NOW + 3_600_000);

      expect(finish(db, id)).toBe('finished');

      expect(order).toEqual(FINISHED_ORDER);
      expect(mockSnapshot).toHaveBeenCalledTimes(1);
      expect(mockSnapshot).toHaveBeenCalledWith(db, NOW + 3_600_000);
      expect(getFinishSummary(db, id, 'lb')).toMatchObject({ id, name: 'Push A', durationMs: 3_600_000, setCount: 2, volume: 2 * 135 * 8 });
    });

    it('is still finished, and still bumps, when the snapshot fails (it returns false)', () => {
      startFromDay(db, PUSH_A);
      tickBench(1);
      const id = workoutId();
      mockSnapshot.mockImplementation(() => {
        mark('snapshot');
        return false;
      });
      order = [];

      expect(finish(db, id)).toBe('finished');

      expect(order).toEqual(FINISHED_ORDER);
      expect(getActiveWorkoutId(db)).toBeNull();
      expect(getFinishSummary(db, id, 'lb').setCount).toBe(1);
    });

    it('refuses with nothing ticked: no cancel, no snapshot, no bump, and the typed values stay', () => {
      startFromDay(db, PUSH_A);
      commitSetField(db, bench().sets[0].id, { weight: 135, weightUnit: 'lb', reps: 8 });
      const id = workoutId();
      order = [];
      const before = version();

      expect(finish(db, id)).toBe('nothing_ticked');

      expect(order).toEqual([]);
      expect(mockSurface.cancel).not.toHaveBeenCalled();
      expect(mockSnapshot).not.toHaveBeenCalled();
      expect(version()).toBe(before);
      expect(getActiveWorkoutId(db)).toBe(id);
      expect(bench().sets[0]).toMatchObject({ weight: 135, reps: 8, done: false });
    });

    it('lets any other error through, with no cancel, no snapshot and no bump', () => {
      startFromDay(db, PUSH_A);
      tickBench(1);
      const before = version();

      expect(() => finish(db, 'no-such-workout')).toThrow('No active workout');

      expect(mockSurface.cancel).not.toHaveBeenCalled();
      expect(mockSnapshot).not.toHaveBeenCalled();
      expect(version()).toBe(before);
    });

    it('takes no second snapshot for a workout that is already finished', () => {
      startFromDay(db, PUSH_A);
      tickBench(1);
      const id = workoutId();
      finish(db, id);
      mockSnapshot.mockClear();

      expect(() => finish(db, id)).toThrow('No active workout');

      expect(mockSnapshot).not.toHaveBeenCalled();
    });

    it('is never failed by the rest surface: a rejection or a throw is logged, and the snapshot and the bump still happen', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      startFromDay(db, PUSH_A);
      tickBench(1);
      mockSurface.cancel.mockRejectedValueOnce(new Error('notifications are off'));
      const id = workoutId();
      order = [];

      expect(finish(db, id)).toBe('finished');
      await Promise.resolve();

      expect(order).toEqual(['snapshot (no active workout)', 'bump (no active workout)']);
      expect(warn).toHaveBeenCalledTimes(1);

      startFromDay(db, PUSH_A);
      tickBench(1);
      mockSurface.cancel.mockImplementationOnce(() => {
        throw new Error('no native module');
      });
      order = [];

      expect(finish(db, workoutId())).toBe('finished');

      expect(order).toEqual(['snapshot (no active workout)', 'bump (no active workout)']);
      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });

  describe('discard', () => {
    it('deletes the workout, cancels the rest surface, then bumps, in that order, and takes no snapshot', () => {
      startFromDay(db, PUSH_A);
      tickBench(2);
      const id = workoutId();
      order = [];

      discard(db, id);

      expect(order).toEqual(['cancel (no active workout)', 'bump (no active workout)']);
      expect(mockSnapshot).not.toHaveBeenCalled();
      expect(() => getFinishSummary(db, id, 'lb')).toThrow('No finished workout');
      expect(getActiveWorkoutView(db)).toBeNull();
    });

    it('lets an error through, with no cancel and no bump, when the workout is not active', () => {
      const before = version();

      expect(() => discard(db, 'no-such-workout')).toThrow('No active workout');

      expect(mockSurface.cancel).not.toHaveBeenCalled();
      expect(version()).toBe(before);
    });

    it('is never failed by the rest surface', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      startFromDay(db, PUSH_A);
      mockSurface.cancel.mockImplementationOnce(() => {
        throw new Error('no native module');
      });
      const id = workoutId();

      expect(() => discard(db, id)).not.toThrow();

      expect(getActiveWorkoutId(db)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});

describe('Up next after finish and discard', () => {
  const upNextDay = () => getUpNext(db)?.dayName;

  beforeEach(() => {
    setActiveRoutine(db, 'premade-ppl-6');
  });

  it('advances when the routine day is finished', () => {
    expect(upNextDay()).toBe('Push A');
    startFromDay(db, PUSH_A);
    tickBench(1);

    finish(db, workoutId());

    expect(upNextDay()).toBe('Pull A');
  });

  it('stays put when the workout is discarded, even with sets ticked', () => {
    startFromDay(db, PUSH_A);
    tickBench(2);

    discard(db, workoutId());

    expect(upNextDay()).toBe('Push A');
  });

  it('stays put when an empty workout is finished', () => {
    startEmpty(db);
    addExercise(db, BENCH);
    const ex = bench();
    tick(db, ex, ex.sets[0], VALUES);

    expect(finish(db, workoutId())).toBe('finished');

    expect(upNextDay()).toBe('Push A');
  });

  it('stays put when the finish is refused for nothing ticked', () => {
    startFromDay(db, PUSH_A);

    expect(finish(db, workoutId())).toBe('nothing_ticked');

    expect(upNextDay()).toBe('Push A');
  });
});
