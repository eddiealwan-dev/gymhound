/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { getExerciseNote } from '../db/repositories/exercisesRepo';
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
  addSetTo,
  commitSetField,
  removeSetFrom,
  saveNote,
  startEmpty,
  startFromDay,
  tick,
  untick,
} from './sessionActions';

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
