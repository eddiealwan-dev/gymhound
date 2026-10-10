/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { getExerciseNote, setExerciseNote } from '../db/repositories/exercisesRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import {
  ActiveWorkoutExistsError,
  finishWorkout,
  getActiveWorkoutId,
  startWorkoutFromDay,
  tickSet,
} from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { workoutExercises } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { useDataVersion } from './dataVersion';
import {
  addExercise,
  addSetTo,
  commitSetField,
  moveBlock,
  removeFromWorkout,
  removeSetFrom,
  replaceWith,
  restEnded,
  restMinus15,
  restSkip,
  saveNote,
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

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
  mockSurface.start.mockClear();
  mockSurface.update.mockClear();
  mockSurface.cancel.mockClear();
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

  it("uses today's target for a working set, converted into the entry unit", () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    db.update(workoutExercises).set({ plannedWeight: 60, plannedUnit: 'kg' }).where(eq(workoutExercises.id, ex.id)).run();

    tick(db, bench(), bench().sets[0], { weight: null, reps: 5, durationS: null, distance: null });

    // 60 kg is 132.28 lb, and it is stored in lb, the unit it was ticked in.
    expect(reread(ex.sets[0].id)).toMatchObject({ done: true, weight: 132.28, weightUnit: 'lb', reps: 5 });
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

describe('addSetTo and removeSetFrom', () => {
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
