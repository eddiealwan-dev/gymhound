/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { getRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { getExerciseNote, setExerciseNote } from '../db/repositories/exercisesRepo';
import { getRoutineDetail, getUpNext, saveRoutine, setActiveRoutine } from '../db/repositories/routinesRepo';
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
import { exercises, routineExercises, workoutExercises, workouts } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { gearFor } from '../domain/plates';
import { draftReducer, newDraft } from '../domain/routineDraft';
import { buildRows, fieldPatch, readRow, valueText } from '../domain/setTable';
import { useDataVersion } from './dataVersion';
import {
  acceptFoodOffer,
  addExercise,
  addSetTo,
  addWarmupTo,
  commitSetField,
  discard,
  dismissFoodOffer,
  finish,
  markExercise,
  moveBlock,
  overrideWeight,
  removeFromWorkout,
  removeSetFrom,
  replaceWith,
  restEnded,
  restMinus15,
  restPlus15,
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
  start: jest.fn((_endsAt: number, _withSound: boolean, _sound?: string) => Promise.resolve()),
  update: jest.fn((_endsAt: number, _withSound: boolean, _sound?: string) => Promise.resolve()),
  cancel: jest.fn(() => Promise.resolve()),
  ended: jest.fn(() => Promise.resolve()),
};
jest.mock('../platform/restTimer', () => ({
  getRestTimerSurface: () => mockSurface,
  getWorkCueSurface: () => ({ schedule: () => Promise.resolve(), cancel: () => Promise.resolve() }),
}));

// What VoiceOver is told. Its own module is a thin wrapper over AccessibilityInfo.
const mockAnnounce = jest.fn((_text: string) => {});
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));

// The snapshot writes a file on the phone and does nothing on web. Tests watch the calls (its own tests are in backup.test.ts).
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
const PUSH_A = 'premade-ppl-6:push-a';

let db: Db;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  db = seededDb();
  mockSurface.start.mockClear();
  mockSurface.update.mockClear();
  mockSurface.cancel.mockClear();
  mockSurface.ended.mockClear();
  mockSnapshot.mockClear();
  mockAnnounce.mockClear();
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

/**
 * A finished Push A from the day before, with `done` bench sets ticked at 135 × 8 and the rest left unticked. The
 * next weight the rule wrote to the routine is cleared, so the next start has no plan and only last time's values
 * are left to fall back on.
 */
function finishedPushA(done: number) {
  const before = new Date(2026, 9, 8, 9, 0).getTime();
  const id = startWorkoutFromDay(db, PUSH_A, before);
  const first = getActiveWorkoutView(db)!.exercises[0];
  first.sets.slice(0, done).forEach((s, i) => {
    tickSet(db, s.id, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', before + (i + 1) * 60_000, 'mi');
  });
  finishWorkout(db, id, before + 3_600_000);
  db.update(routineExercises)
    .set({ nextWeight: null, nextWeightUnit: null })
    .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
    .run();
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

  it("ticks set 2 on the weight carried from set 1, with the rule's reps (first run)", () => {
    startFromDay(db, PUSH_A);
    const ex = bench();
    tick(db, ex, ex.sets[0], { weight: 135, reps: 6, durationS: null, distance: null });

    const fresh = bench();
    expect(tick(db, fresh, fresh.sets[1], NOTHING)).toBe(true);

    expect(reread(fresh.sets[1].id)).toMatchObject({ done: true, weight: 135, weightUnit: 'lb', reps: 8 });
  });

  it('a typed, unticked weight carries to the next set', () => {
    startFromDay(db, PUSH_A);
    commitSetField(db, bench().sets[2].id, { weight: 140, weightUnit: 'lb' });

    const fresh = bench();
    expect(tick(db, fresh, fresh.sets[3], NOTHING)).toBe(true);

    expect(reread(fresh.sets[3].id)).toMatchObject({ done: true, weight: 140, reps: 8 });
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
    expect(valueText(row, 'weight', 'kg', 'mi')).toBe('135 lb');
    const reading = readRow(row, {}, 'kg', 'mi');
    expect(tick(db, ex, row.set, reading.entered, reading.weightUnit)).toBe(true);
    expect(reread(row.set.id)).toMatchObject({ done: true, weight: 135, weightUnit: 'lb' });
  });

  it('saves a weight typed after the switch in the new unit', () => {
    startFromDay(db, PUSH_A);
    commitSetField(db, bench().sets[0].id, fieldPatch('weight', 135, 'lb', 'mi'));
    switchDisplayUnit(db, 'kg');

    const { ex, row } = benchRow(0);
    const reading = readRow(row, { weight: '60' }, 'kg', 'mi');
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
    expect(valueText(row, 'weight', 'lb', 'mi')).toBe('100 kg');
  });

  it('prefills a 135 lb planned bench as 60 after a switch to kg, not 61.23, and ticks 60 kg', () => {
    startFromDay(db, PUSH_A);
    db.update(workoutExercises).set({ plannedWeight: 135, plannedUnit: 'lb' }).where(eq(workoutExercises.id, bench().id)).run();

    switchDisplayUnit(db, 'kg');

    const { ex, row } = benchRow(0);
    expect(row.target).toBe(60);
    expect(valueText(row, 'weight', 'kg', 'mi')).toBe('60');
    const reading = readRow(row, {}, 'kg', 'mi');
    tick(db, ex, row.set, reading.entered, reading.weightUnit);
    expect(reread(row.set.id)).toMatchObject({ done: true, weight: 60, weightUnit: 'kg' });
  });

  it('finishes a bench logged half in lb and half in kg: next time is raised once, in the unit it ended in', () => {
    startFromDay(db, PUSH_A);
    db.update(workoutExercises).set({ plannedWeight: 135, plannedUnit: 'lb' }).where(eq(workoutExercises.id, bench().id)).run();
    const repMax = bench().rule!.repMax;
    const count = bench().sets.length;
    const half = Math.ceil(count / 2);
    for (let i = 0; i < half; i++) {
      const { ex, row } = benchRow(i);
      const reading = readRow(row, { reps: String(repMax) }, 'lb', 'mi');
      tick(db, ex, row.set, reading.entered, reading.weightUnit);
    }
    switchDisplayUnit(db, 'kg');
    for (let i = half; i < count; i++) {
      const { ex, row } = benchRow(i);
      const reading = readRow(row, { reps: String(repMax) }, 'kg', 'mi');
      tick(db, ex, row.set, reading.entered, reading.weightUnit);
    }
    const sets = bench().sets.map((s) => [s.weight, s.weightUnit]);
    expect(sets.slice(0, half).every(([w, u]) => w === 135 && u === 'lb')).toBe(true);
    expect(sets.slice(half).every(([w, u]) => w === 60 && u === 'kg')).toBe(true);
    const workoutId = getActiveWorkoutId(db)!;
    const { routineExerciseId } = db.select().from(workoutExercises).where(eq(workoutExercises.id, bench().id)).get()!;

    expect(finish(db, workoutId)).toBe('finished');

    const slot = db.select().from(routineExercises).where(eq(routineExercises.id, routineExerciseId!)).get()!;
    // Every set hit the top, so the plan is raised once from one working weight, never from a sum of mixed units.
    // The working weight is the easiest set, compared in kg: 60 kg (135 lb is 61.2 kg). 5 lb on it is 62.27 kg; the next loadable is 62.5 kg.
    expect(slot).toMatchObject({ nextWeight: 62.5, nextWeightUnit: 'kg' });
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

describe('tick records a carried distance in the entry distance unit', () => {
  it('a distance carried from a set logged in km is recorded in mi, as the row shows it', () => {
    startFromDay(db, PUSH_A);
    setSetting(db, 'distanceUnit', 'mi');
    const ex = activeView().exercises[0];
    // The bench press's sets, read as a distance exercise whose first set was logged in km.
    const run = {
      ...ex,
      loggingType: 'distance_time' as const,
      rule: null,
      sets: [{ ...ex.sets[0], done: true, distance: 5, distanceUnit: 'km' as const, durationS: 1500 }, ...ex.sets.slice(1)],
    };

    expect(tick(db, run, run.sets[1], NOTHING)).toBe(true);

    expect(reread(run.sets[1].id)).toMatchObject({ distance: 3.11, distanceUnit: 'mi', durationS: 1500 });
  });
});

describe('tick and the three program logging types (R607)', () => {
  it("records a carry's distance in the slot's feet, not the mi in Settings, with no time when none was given", () => {
    startFromDay(db, PUSH_A);
    setSetting(db, 'distanceUnit', 'mi');
    const ex = activeView().exercises[0];
    // The bench press's sets, read as a yoke carry whose slot counts feet and asks for 50.
    const yoke = { ...ex, loggingType: 'weighted_distance' as const, rule: ex.rule && { ...ex.rule, repMax: 50 }, slotDistanceUnit: 'ft' as const };

    expect(tick(db, yoke, yoke.sets[0], { ...NOTHING, weight: 315 }, 'lb')).toBe(true);

    expect(reread(yoke.sets[0].id)).toMatchObject({ weight: 315, weightUnit: 'lb', distance: 50, distanceUnit: 'ft', durationS: null, reps: null });
  });

  it("records an AMRAP score's rounds and extra reps, and the view reads them back", () => {
    startFromDay(db, PUSH_A);
    const ex = activeView().exercises[0];
    const amrap = { ...ex, loggingType: 'rounds' as const };

    expect(tick(db, amrap, amrap.sets[0], { ...NOTHING, reps: 6, extraReps: 4 })).toBe(true);

    expect(reread(amrap.sets[0].id)).toMatchObject({ reps: 6, extraReps: 4, weight: null, done: true });
  });

  /** The bench press read as a program metcon whose moves are `elements`, with last time's score at 95 lb. */
  function metconWithLast(loggingType: 'rounds' | 'for_time', elements: string[]) {
    startFromDay(db, PUSH_A);
    const ex = activeView().exercises[0];
    const last = { position: 0, setType: 'working' as const, weight: 95, weightUnit: 'lb' as const, reps: loggingType === 'rounds' ? 6 : null, durationS: loggingType === 'for_time' ? 462 : null, distance: null, distanceUnit: null };
    const metcon = { format: loggingType === 'rounds' ? ('AMRAP' as const) : ('For Time' as const), workMinutes: 10, elements, capMinutes: null };
    const program = { rule: { kind: 'metcon' }, warmUp: false, note: null, metcon, catalogName: 'Metcon', countsTowardVolume: true, restKind: 'none' };
    return { ...ex, loggingType, previous: [last], program: program as unknown as NonNullable<typeof ex.program> };
  }

  it("saves no load on a score whose metcon has no loaded move, whatever last time's had (W3 review)", () => {
    const cindy = metconWithLast('rounds', ['Pull-up', 'Push-up', 'Air squat']);

    expect(tick(db, cindy, cindy.sets[0], { ...NOTHING, reps: 7 })).toBe(true);

    expect(reread(cindy.sets[0].id)).toMatchObject({ reps: 7, weight: null });
  });

  it("saves last time's load on a score when its loaded move's field shows it (ruling R-g3, R48)", () => {
    const fran = metconWithLast('for_time', ['Thruster', 'Pull-up']);

    expect(tick(db, fran, fran.sets[0], { ...NOTHING, durationS: 450 })).toBe(true);

    expect(reread(fran.sets[0].id)).toMatchObject({ durationS: 450, weight: 95, weightUnit: 'lb' });
  });

  it("saves no time on a carry unless one was typed, whatever last time's was (final review)", () => {
    startFromDay(db, PUSH_A);
    const ex = activeView().exercises[0];
    const last = { position: 0, setType: 'working' as const, weight: 315, weightUnit: 'lb' as const, reps: null, durationS: 40, distance: 50, distanceUnit: 'ft' as const };
    const yoke = { ...ex, loggingType: 'weighted_distance' as const, previous: [last], rule: ex.rule && { ...ex.rule, repMax: 50 }, slotDistanceUnit: 'ft' as const };

    expect(tick(db, yoke, yoke.sets[0], NOTHING)).toBe(true);

    expect(reread(yoke.sets[0].id)).toMatchObject({ weight: 315, distance: 50, durationS: null });
  });

  it('commitSetField saves extra reps typed into their field', () => {
    startFromDay(db, PUSH_A);
    const set = bench().sets[0];

    commitSetField(db, set.id, fieldPatch('extraReps', 7, 'lb', 'mi'));

    expect(reread(set.id).extraReps).toBe(7);
  });
});

describe('a distance unit switch mid-workout: a typed or saved distance keeps its unit, as a weight does', () => {
  /** The bench press's first set read as a distance exercise, as the session shows it now, in the units in Settings. */
  function runRow() {
    const settings = getSettings(db);
    const ex = { ...activeView().exercises[0], loggingType: 'distance_time' as const, rule: null };
    return { ex, settings, row: buildRows(ex, settings.unit, gearFor(settings.unit, settings), settings.distanceUnit)[0] };
  }

  /** Saves 5 km on the first set, then switches the distance unit to mi. */
  function fiveKmThenMiles() {
    startFromDay(db, PUSH_A);
    setSetting(db, 'distanceUnit', 'km');
    commitSetField(db, activeView().exercises[0].sets[0].id, fieldPatch('distance', 5, 'lb', 'km'));
    setSetting(db, 'distanceUnit', 'mi');
  }

  it('ticks 5 saved in km before a switch to mi as 5 km, as the row shows it', () => {
    fiveKmThenMiles();

    const { ex, settings, row } = runRow();
    expect(valueText(row, 'distance', settings.unit, settings.distanceUnit)).toBe('5 km');
    const reading = readRow(row, { durationS: '25:00' }, settings.unit, settings.distanceUnit);
    expect(tick(db, ex, row.set, reading.entered, reading.weightUnit, reading.distanceUnit)).toBe(true);

    expect(reread(row.set.id)).toMatchObject({ done: true, distance: 5, distanceUnit: 'km', durationS: 1500 });
  });

  it('ticks a distance typed after the switch in mi', () => {
    fiveKmThenMiles();

    const { ex, settings, row } = runRow();
    const reading = readRow(row, { distance: '3', durationS: '25:00' }, settings.unit, settings.distanceUnit);
    expect(tick(db, ex, row.set, reading.entered, reading.weightUnit, reading.distanceUnit)).toBe(true);

    expect(reread(row.set.id)).toMatchObject({ done: true, distance: 3, distanceUnit: 'mi', durationS: 1500 });
  });
});

describe('tick starts the rest timer', () => {
  it('stores the end time (the Settings length from now) and starts the surface with the bell setting', () => {
    startFromDay(db, PUSH_A);

    expect(tickSetOf(0, 0)).toBe(true);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(mockSurface.start).toHaveBeenCalledTimes(1);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 120_000, true, 'bell');
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
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 90_000, false, 'bell');
  });

  it('restarts the rest from now when a later set is ticked', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 30_000);

    tickSetOf(0, 1);

    expect(restEndsAt()).toBe(NOW + 150_000);
    expect(mockSurface.start).toHaveBeenLastCalledWith(NOW + 150_000, true, 'bell');
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
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 120_000, true, 'bell');
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
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 90_000, true, 'bell');
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
    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 105_000, true, 'bell');
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before + 1);
  });

  it('passes the bell setting on to the surface', () => {
    setSetting(db, 'restBell', false);
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 105_000, false, 'bell');
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

  it('does nothing once the rest is over, so the rest watcher still rings and the row still holds', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 120_000);
    const before = version();

    restMinus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(activeView().restSetId).toBe(activeView().exercises[0].sets[0].id);
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before);
  });
});

describe('restPlus15', () => {
  it('moves the end 15 seconds later and reschedules', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 10_000);
    const before = version();

    restPlus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 135_000);
    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 135_000, true, 'bell');
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before + 1);
  });

  it('passes the bell setting on', () => {
    setSetting(db, 'restBell', false);
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restPlus15(db, workoutId(), NOW + 120_000);

    expect(mockSurface.update).toHaveBeenCalledWith(NOW + 135_000, false, 'bell');
  });

  it('does nothing once the rest is over', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 120_000);

    restPlus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(mockSurface.update).not.toHaveBeenCalled();
  });
});

describe('tick tells VoiceOver what it logged', () => {
  it('a tick announces the set and the rest', () => {
    startFromDay(db, PUSH_A);

    tickSetOf(0, 0);

    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(mockAnnounce).toHaveBeenCalledWith('Set 1 logged. Rest 2 minutes.');
  });

  it('names the set alone when the rest is Off', () => {
    setExerciseRest(db, BENCH, 0);
    startFromDay(db, PUSH_A);

    tickSetOf(0, 0);

    expect(mockAnnounce).toHaveBeenCalledWith('Set 1 logged.');
  });

  it('says the rest length in words', () => {
    setSetting(db, 'restSeconds', 90);
    startFromDay(db, PUSH_A);

    tickSetOf(0, 0);

    expect(mockAnnounce).toHaveBeenCalledWith('Set 1 logged. Rest 1 minute 30 seconds.');
  });

  it('announces nothing when the tick is refused', () => {
    startFromDay(db, PUSH_A);
    const ex = bench();

    expect(tick(db, ex, ex.sets[0], { weight: null, reps: 8, durationS: null, distance: null })).toBe(false);

    expect(mockAnnounce).not.toHaveBeenCalled();
  });
});

describe('restSkip', () => {
  it('clears the end time and cancels the surface, then bumps the data version', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    const before = version();

    restSkip(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBeNull();
    expect(mockSurface.cancel).toHaveBeenCalledTimes(1);
    expect(version()).toBe(before + 1);
  });

  it('does nothing once the rest is over, so the rest watcher still rings and the row still holds', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    jest.setSystemTime(NOW + 120_000);
    const before = version();

    restSkip(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 120_000);
    expect(activeView().restSetId).toBe(activeView().exercises[0].sets[0].id);
    expect(mockSurface.cancel).not.toHaveBeenCalled();
    expect(version()).toBe(before);
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
    // Phase 7: the newer rest's lock-screen countdown stays up.
    expect(mockSurface.ended).not.toHaveBeenCalled();
  });

  it("takes down the rest's lock-screen countdown (phase 7, R301) once it has been seen over", () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restEnded(db, workoutId(), NOW + 120_000);

    expect(mockSurface.ended).toHaveBeenCalledTimes(1);
  });
});

describe('the bell on the lock screen (phase 7, R304)', () => {
  it('hands the surface the bell chosen in Settings', () => {
    setSetting(db, 'restBellSound', 'chime');
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 120_000, true, 'chime');
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

  it('the rest stays under its set through +15s', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);

    restPlus15(db, workoutId(), NOW + 120_000);

    expect(restEndsAt()).toBe(NOW + 135_000);
    expect(restSetId()).toBe(setId(0, 0));
  });

  it('is cleared by Skip, and by a -15s that skips', () => {
    startFromDay(db, PUSH_A);
    tickSetOf(0, 0);
    restSkip(db, workoutId(), NOW + 120_000);
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

// ---- Something off and today's override (phase 2, Task 1) ----

/** The bench press of a Push A finished just now, with one set ticked. Nothing is active afterwards. */
function finishedBenchId(): string {
  startFromDay(db, PUSH_A);
  const ex = bench();
  tick(db, ex, ex.sets[0], VALUES);
  finishWorkout(db, workoutId(), NOW + 3_600_000);
  return ex.id;
}

describe('markExercise', () => {
  it('flags the exercise Something off, then clears it, bumping the data version each time (R60)', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    markExercise(db, bench().id, 'short_on_food');
    expect(activeView().exercises.map((e) => e.mark)).toEqual(['short_on_food', null, null, null, null]);

    markExercise(db, bench().id, null);
    expect(bench().mark).toBeNull();
    expect(version()).toBe(before + 2);
  });

  it('throws for an exercise of a finished workout, leaving the version alone', () => {
    const id = finishedBenchId();
    const before = version();

    expect(() => markExercise(db, id, 'pain')).toThrow('is not in the active workout');

    expect(version()).toBe(before);
  });
});

describe('the Short on food offer (§7.10, R152)', () => {
  const offerShown = () => db.select({ s: workouts.foodOfferShown }).from(workouts).where(eq(workouts.id, workoutId())).get()!.s;

  it('Mark it flags every exercise with no mark, keeps Pain, records the offer, bumps once and says so', () => {
    startFromDay(db, PUSH_A);
    markExercise(db, activeView().exercises[2].id, 'pain');
    const before = version();

    acceptFoodOffer(db, workoutId());

    expect(activeView().exercises.map((e) => e.mark)).toEqual(['short_on_food', 'short_on_food', 'pain', 'short_on_food', 'short_on_food']);
    expect(offerShown()).toBe(true);
    expect(version()).toBe(before + 1);
    expect(mockAnnounce).toHaveBeenCalledWith('Marked Short on food.');
  });

  it('Mark it with nothing left to flag records the offer and says nothing', () => {
    startEmpty(db);

    acceptFoodOffer(db, workoutId());

    expect(offerShown()).toBe(true);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('Mark it outside the active workout throws, leaving the version alone', () => {
    finishedBenchId();
    const finished = db.select({ id: workouts.id }).from(workouts).get()!.id;
    const before = version();
    mockAnnounce.mockClear();

    expect(() => acceptFoodOffer(db, finished)).toThrow('is not the active workout');

    expect(version()).toBe(before);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });

  it('× records the offer, flags nothing and bumps the data version', () => {
    startFromDay(db, PUSH_A);
    const before = version();

    dismissFoodOffer(db, workoutId());

    expect(offerShown()).toBe(true);
    expect(activeView().exercises.every((e) => e.mark === null)).toBe(true);
    expect(version()).toBe(before + 1);
    expect(mockAnnounce).not.toHaveBeenCalled();
  });
});

describe('overrideWeight', () => {
  it("sets today's weight in its unit, then clears it, bumping the data version each time", () => {
    startFromDay(db, PUSH_A);
    const before = version();

    overrideWeight(db, bench().id, 80, 'kg');
    expect(bench()).toMatchObject({ overrideWeight: 80, overrideUnit: 'kg' });

    overrideWeight(db, bench().id, null, null);
    expect(bench()).toMatchObject({ overrideWeight: null, overrideUnit: null });
    expect(version()).toBe(before + 2);
  });

  it('throws for an exercise of a finished workout, leaving the version alone', () => {
    const id = finishedBenchId();
    const before = version();

    expect(() => overrideWeight(db, id, 200, 'lb')).toThrow('is not in the active workout');

    expect(version()).toBe(before);
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

  it('starts the phase 7 Health write-out and iCloud copy after the snapshot, and only for a finish (R307, R303)', () => {
    mockNative.afterFinish.mockClear().mockImplementation(() => {
      expect(mockSnapshot).toHaveBeenCalled();
    });
    startFromDay(db, PUSH_A);
    expect(finish(db, workoutId())).toBe('nothing_ticked');
    expect(mockNative.afterFinish).not.toHaveBeenCalled();
    tickSetOf(0, 0);
    expect(finish(db, workoutId())).toBe('finished');
    expect(mockNative.afterFinish).toHaveBeenCalledWith(db);
  });

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

// ---- the ab roller rest (Round 6, handoff 4.3) ----

describe("the ab roller rest: 'set a rest timer on ab roller, ticked a set, no rest came up' (Round 6)", () => {
  const AB_ROLLER = 'fedb-ab-roller';

  /** Saves a routine of one day, as the editor's Save does, with the exercises in order; returns the day's id. */
  function routineDay(exerciseIds: string[], supersetFirstTwo = false): string {
    let draft = draftReducer(draftReducer(newDraft(), { type: 'rename', name: 'Core' }), { type: 'addDay', name: 'Abs' });
    for (const exerciseId of exerciseIds) {
      const ex = activeLibrary(exerciseId);
      draft = draftReducer(draft, { type: 'addExercise', dayKey: draft.days[0].key, exercise: ex, increment: { value: 5, unit: 'lb' } });
    }
    if (supersetFirstTwo) draft = draftReducer(draft, { type: 'toggleSuperset', dayKey: draft.days[0].key, exerciseKey: draft.days[0].exercises[0].key });
    const id = saveRoutine(db, draft, NOW);
    return getRoutineDetail(db, id)!.days[0].id;
  }

  /** The library row the editor's picker hands back. */
  function activeLibrary(exerciseId: string) {
    const row = db.select().from(exercises).where(eq(exercises.id, exerciseId)).get()!;
    return { id: row.id, name: row.name, loggingType: row.loggingType };
  }

  /** Ticks the first set of the ab roller as its row does: the weight field left empty, 10 reps typed. */
  function tickAbRoller(): boolean {
    const settings = getSettings(db);
    const ex = activeView().exercises.find((e) => e.exerciseId === AB_ROLLER)!;
    const row = buildRows(ex, settings.unit, gearFor(settings.unit, settings), settings.distanceUnit)[0];
    const reading = readRow(row, { reps: '10' }, settings.unit, settings.distanceUnit);
    expect(reading.tickable).toBe(true);
    expect(reading.entered.weight).toBeNull();
    return tick(db, ex, row.set, reading.entered, reading.weightUnit, reading.distanceUnit);
  }

  it('is a bodyweight plus exercise in the library', () => {
    expect(activeLibrary(AB_ROLLER).loggingType).toBe('bodyweight_plus');
  });

  it("starts the ab roller's own rest (set from its ⋯ Rest panel) in a routine of the owner's, with the weight left empty", () => {
    startFromDay(db, routineDay([BENCH, AB_ROLLER]));
    setExerciseRest(db, AB_ROLLER, 60);

    expect(tickAbRoller()).toBe(true);

    const ab = activeView().exercises.find((e) => e.exerciseId === AB_ROLLER)!;
    expect(ab.supersetGroup).toBeNull();
    expect(ab.sets[0].done).toBe(true);
    expect(restEndsAt()).toBe(NOW + 60_000);
    expect(activeView().restSetId).toBe(ab.sets[0].id);
    expect(mockSurface.start).toHaveBeenCalledWith(NOW + 60_000, true, 'bell');
    expect(mockAnnounce).toHaveBeenLastCalledWith('Set 1 logged. Rest 1 minute.');
  });

  it('starts it with the rest chosen before the workout started, too', () => {
    setExerciseRest(db, AB_ROLLER, 90);
    startFromDay(db, routineDay([AB_ROLLER]));

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBe(NOW + 90_000);
  });

  it('starts the rest in Settings when the ab roller has none of its own', () => {
    startFromDay(db, routineDay([AB_ROLLER]));

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBe(NOW + 120_000);
  });

  it('starts it in an empty workout the ab roller was added to', () => {
    startEmpty(db);
    addExercise(db, AB_ROLLER);
    setExerciseRest(db, AB_ROLLER, 45);

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBe(NOW + 45_000);
  });

  it('starts it when the ab roller ends a superset made in the editor', () => {
    setExerciseRest(db, AB_ROLLER, 60);
    startFromDay(db, routineDay([BENCH, AB_ROLLER], true));

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBe(NOW + 60_000);
  });

  it('waits when the ab roller opens a superset made in the editor: the rest comes after the last member (the likely Round 6 case)', () => {
    setExerciseRest(db, AB_ROLLER, 60);
    startFromDay(db, routineDay([AB_ROLLER, BENCH], true));
    expect(activeView().exercises.map((e) => e.supersetGroup)).toEqual([1, 1]);

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBeNull();
    // VoiceOver hears which exercise the rest waits for (R100).
    expect(mockAnnounce).toHaveBeenLastCalledWith('Set 1 logged. Rest after Barbell bench press.');
  });

  it("promises no rest mid-superset when the last member's rest is Off (R100 review)", () => {
    setExerciseRest(db, BENCH, 0);
    startFromDay(db, routineDay([AB_ROLLER, BENCH], true));

    expect(tickAbRoller()).toBe(true);

    expect(restEndsAt()).toBeNull();
    expect(mockAnnounce).toHaveBeenLastCalledWith('Set 1 logged.');
  });
});
