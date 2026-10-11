/** @jest-environment node */
import { asc, eq, inArray } from 'drizzle-orm';
import { PR_BIT } from '../../domain/prs';
import { patchDraftSet, addDraftSet, removeDraftSet, setDraftMark, type WorkoutDraft } from '../../domain/historyDraft';
import type { WeightUnit } from '../../domain/types';
import { routineExercises, routines, savedWorkoutExercises, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { deleteSavedWorkout, getSavedWorkout, saveWorkoutAs, startSavedWorkout } from './savedWorkoutsRepo';
import { setActiveRoutine } from './routinesRepo';
import { setSetting } from './settingsRepo';
import { addExerciseToWorkout, addSet, setExerciseMark } from './workoutEditRepo';
import {
  deleteFinishedWorkout,
  loadWorkoutDraft,
  NothingLeftError,
  refreshNextWeights,
  saveWorkoutEdit,
} from './workoutHistoryRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, storeOutcomes, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();
const PPL = 'premade-ppl-6';
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';
const OHP = 'barbell-overhead-press';
const PLANK = 'plank';
const BENCH_SLOT = `${PUSH_A}:${BENCH}`;
const OHP_SLOT = `${PUSH_A}:${OHP}`;
const HEAVIEST = PR_BIT.heaviest;

function tick(db: Db, setId: string, weight: number | null, reps: number | null, at: number, unit: WeightUnit = 'lb', durationS: number | null = null): void {
  tickSet(db, setId, { weight, reps, durationS, distance: null }, unit, at, 'mi');
}

/**
 * Starts Push A at `start`, ticks its bench sets at `weight` (one rep count per set) a minute apart, and finishes an
 * hour later; the other exercises are left unticked, so finish drops them. Returns the workout id.
 */
function pushDay(db: Db, start: number, weight: number, reps: number[], unit: WeightUnit = 'lb', finish = true): string {
  const id = startWorkoutFromDay(db, PUSH_A, start);
  const benchSets = getActiveWorkoutView(db)!.exercises[0].sets.map((s) => s.id);
  reps.forEach((r, i) => tick(db, benchSets[i], weight, r, start + (i + 1) * MINUTE, unit));
  if (finish) finishWorkout(db, id, start + HOUR);
  return id;
}

/** An empty workout at `start` with one block per entry, every set ticked; finished an hour later. */
function plainWorkout(db: Db, start: number, blocks: [exerciseId: string, lifts: [number | null, number | null, number | null][]][]): string {
  const id = startEmptyWorkout(db, start);
  let at = start;
  for (const [exerciseId, lifts] of blocks) {
    const weId = addExerciseToWorkout(db, id, exerciseId);
    for (let i = 1; i < lifts.length; i++) addSet(db, weId);
    const ids = getActiveWorkoutView(db)!.exercises.find((e) => e.id === weId)!.sets.map((s) => s.id);
    lifts.forEach(([w, r, d], i) => tick(db, ids[i], w, r, (at += MINUTE), 'lb', d));
  }
  finishWorkout(db, id, start + HOUR);
  return id;
}

function slot(db: Db, id: string) {
  return db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
}

function block(db: Db, workoutId: string, exerciseId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .all()
    .find((r) => r.exerciseId === exerciseId);
}

function setsOf(db: Db, workoutId: string, exerciseId: string) {
  const b = block(db, workoutId, exerciseId);
  if (!b) return [];
  return db.select().from(sets).where(eq(sets.workoutExerciseId, b.id)).orderBy(asc(sets.position)).all();
}

const flagsOf = (db: Db, workoutId: string, exerciseId: string) => setsOf(db, workoutId, exerciseId).map((s) => s.prFlags);

/** The draft of a finished workout, with the bench block's index. */
function draftOf(db: Db, workoutId: string): WorkoutDraft {
  const d = loadWorkoutDraft(db, workoutId);
  if (!d) throw new Error('no draft');
  return d;
}

const weIdOf = (d: WorkoutDraft, exerciseId: string) => d.exercises.find((e) => e.exerciseId === exerciseId)!.workoutExerciseId;

/** Everything about a workout: its row, its exercises and its sets. */
function dump(db: Db, workoutId: string) {
  const blocks = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).orderBy(asc(workoutExercises.position)).all();
  return {
    workout: db.select().from(workouts).where(eq(workouts.id, workoutId)).get(),
    blocks,
    sets: blocks.length === 0 ? [] : db.select().from(sets).where(inArray(sets.workoutExerciseId, blocks.map((b) => b.id))).orderBy(asc(sets.id)).all(),
  };
}

describe('loadWorkoutDraft', () => {
  it('reads a finished workout in order, with names, types, marks and set values', () => {
    const db = seededDb();
    const id = plainWorkout(db, OCT_1, [
      [BENCH, [[135, 5, null], [140, 4, null]]],
      [PLANK, [[null, null, 60]]],
    ]);
    const d = draftOf(db, id);
    expect(d.workoutId).toBe(id);
    expect(d.name).toBe('Workout');
    expect(d.exercises.map((e) => [e.exerciseId, e.loggingType, e.mark])).toEqual([
      [BENCH, 'weighted', null],
      [PLANK, 'timed', null],
    ]);
    expect(d.exercises[0].name).toBe('Barbell bench press');
    expect(d.exercises[0].sets.map((s) => [s.weight, s.weightUnit, s.reps, s.done, s.setType])).toEqual([
      [135, 'lb', 5, true, 'working'],
      [140, 'lb', 4, true, 'working'],
    ]);
    expect(d.exercises[1].sets[0].durationS).toBe(60);
  });

  it('is null for the active workout and for an unknown id', () => {
    const db = seededDb();
    const active = pushDay(db, OCT_1, 135, [8], 'lb', false);
    expect(loadWorkoutDraft(db, active)).toBeNull();
    expect(loadWorkoutDraft(db, 'nope')).toBeNull();
  });
});

describe('storeOutcomes', () => {
  it('stores the outcome on the workout exercises only, and returns each with its slot', () => {
    const db = seededDb();
    const id = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    db.update(routineExercises).set({ nextWeight: 999 }).where(eq(routineExercises.id, BENCH_SLOT)).run();
    db.update(workoutExercises).set({ outcome: null, nextWeight: null }).where(eq(workoutExercises.workoutId, id)).run();

    expect(storeOutcomes(db, id)).toEqual([
      { routineExerciseId: BENCH_SLOT, exerciseId: BENCH, outcome: 'raised', nextWeight: 140, nextUnit: 'lb' },
    ]);
    expect(block(db, id, BENCH)).toMatchObject({ outcome: 'raised', nextWeight: 140 });
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(999);
  });
});

describe('saveWorkoutEdit re-runs the rule (7.12 step 1, R167)', () => {
  it('reps below the top on the newest workout turn raised into held, and the slot to the working weight', () => {
    const db = seededDb();
    const id = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });

    const d = draftOf(db, id);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 3, { reps: 6 }));

    expect(block(db, id, BENCH)).toMatchObject({ outcome: 'held', workingWeight: 135, nextWeight: 135 });
    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('next weight comes from the newest after editing an older one', () => {
    const db = seededDb();
    const older = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(145);

    const d = draftOf(db, older);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 5 }));

    expect(block(db, older, BENCH)).toMatchObject({ outcome: 'held', nextWeight: 135 });
    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 145, nextWeightUnit: 'lb' });
  });

  it('marking an exercise Pain holds the plan (held_marked)', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const id = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    expect(block(db, id, BENCH)).toMatchObject({ plannedWeight: 140, outcome: 'raised', nextWeight: 145 });

    const d = draftOf(db, id);
    saveWorkoutEdit(db, setDraftMark(d, weIdOf(d, BENCH), 'pain'));

    expect(block(db, id, BENCH)).toMatchObject({ mark: 'pain', outcome: 'held_marked', nextWeight: 140 });
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);

    // Nothing off again: a normal day raises.
    saveWorkoutEdit(db, setDraftMark(draftOf(db, id), weIdOf(d, BENCH), null));
    expect(block(db, id, BENCH)).toMatchObject({ mark: null, outcome: 'raised', nextWeight: 145 });
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(145);
  });

  it('keeps a kg set in kg under a display unit of lb, and the slot takes the kg next weight', () => {
    const db = seededDb();
    // Logged in kg (the plan is null, so the working weight is what was lifted).
    const id = pushDay(db, OCT_1, 60, [8, 8, 8, 8], 'kg');
    const d = draftOf(db, id);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 7 }));

    expect(setsOf(db, id, BENCH).map((s) => [s.weight, s.weightUnit, s.reps])).toEqual([
      [60, 'kg', 7],
      [60, 'kg', 8],
      [60, 'kg', 8],
      [60, 'kg', 8],
    ]);
    expect(block(db, id, BENCH)).toMatchObject({ outcome: 'held', workingWeight: 60, workingUnit: 'kg', nextWeight: 60, nextUnit: 'kg' });
    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 60, nextWeightUnit: 'kg' });
  });

  it('a set added in the editor takes the units given, and a weightless set stores no unit', () => {
    const db = seededDb();
    const id = plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    let d = draftOf(db, id);
    const we = weIdOf(d, BENCH);
    d = addDraftSet(d, we, 'kg', 'km');
    d = patchDraftSet(d, we, 1, { weight: 82.5, reps: 3, done: true });
    d = addDraftSet(d, we, 'lb', 'mi');
    d = patchDraftSet(d, we, 2, { weight: null, reps: 3 });
    saveWorkoutEdit(db, d);

    const rows = setsOf(db, id, BENCH);
    expect(rows.map((s) => [s.position, s.weight, s.weightUnit, s.reps, s.done])).toEqual([
      [0, 135, 'lb', 5, true],
      [1, 82.5, 'kg', 3, true],
    ]);
    expect(rows[1].completedAt).toBe(OCT_1 + HOUR);
  });

  it('removes a set and renumbers the rest', () => {
    const db = seededDb();
    const id = plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null], [140, 5, null], [145, 5, null]]]]);
    const d = draftOf(db, id);
    saveWorkoutEdit(db, removeDraftSet(d, weIdOf(d, BENCH), 0));
    expect(setsOf(db, id, BENCH).map((s) => [s.position, s.weight])).toEqual([
      [0, 140],
      [1, 145],
    ]);
  });
});

describe('PRs after an edit or a delete (7.12 step 2, R103)', () => {
  it('delete first session clears the next session\'s flags', () => {
    const db = seededDb();
    const first = plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    const second = plainWorkout(db, OCT_1 + DAY, [[BENCH, [[145, 5, null]]]]);
    expect(flagsOf(db, second, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);

    deleteFinishedWorkout(db, first);

    expect(flagsOf(db, second, BENCH)).toEqual([0]);
  });

  it('edit lowers a PR and a later set takes it', () => {
    const db = seededDb();
    plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    const pr = plainWorkout(db, OCT_1 + DAY, [[BENCH, [[145, 5, null]]]]);
    const later = plainWorkout(db, OCT_1 + 2 * DAY, [[BENCH, [[140, 5, null]]]]);
    expect(flagsOf(db, pr, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);
    expect(flagsOf(db, later, BENCH)).toEqual([0]);

    const d = draftOf(db, pr);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { weight: 130 }));

    expect(flagsOf(db, pr, BENCH)).toEqual([0]);
    expect(flagsOf(db, later, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);
  });

  it('warmup loses flag', () => {
    const db = seededDb();
    plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    const pr = plainWorkout(db, OCT_1 + DAY, [[BENCH, [[145, 5, null], [100, 5, null]]]]);
    expect(flagsOf(db, pr, BENCH)[0]).not.toBe(0);

    const d = draftOf(db, pr);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { setType: 'warmup' }));

    expect(flagsOf(db, pr, BENCH)).toEqual([0, 0]);
  });

  it('unticking every set of one exercise removes it and recomputes its PRs; the rest of the workout stays', () => {
    const db = seededDb();
    plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    const mid = plainWorkout(db, OCT_1 + DAY, [
      [BENCH, [[145, 5, null]]],
      [PLANK, [[null, null, 60]]],
    ]);
    const later = plainWorkout(db, OCT_1 + 2 * DAY, [[BENCH, [[140, 5, null]]]]);
    expect(flagsOf(db, later, BENCH)).toEqual([0]);

    const d = draftOf(db, mid);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { done: false }));

    expect(block(db, mid, BENCH)).toBeUndefined();
    expect(block(db, mid, PLANK)).toMatchObject({ position: 0 });
    expect(flagsOf(db, later, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);
  });

  it('mixed units: a kg set edited to the same load as a later lb set no longer leaves that set heavier', () => {
    const db = seededDb();
    plainWorkout(db, OCT_1, [[BENCH, [[100, 5, null]]]]);
    const kgDay = startEmptyWorkout(db, OCT_1 + DAY);
    const we = addExerciseToWorkout(db, kgDay, BENCH);
    tick(db, getActiveWorkoutView(db)!.exercises.find((e) => e.id === we)!.sets[0].id, 50, 5, OCT_1 + DAY + MINUTE, 'kg');
    finishWorkout(db, kgDay, OCT_1 + DAY + HOUR);
    const lbDay = plainWorkout(db, OCT_1 + 2 * DAY, [[BENCH, [[132.3, 5, null]]]]);
    // 50 kg is 110.2 lb: 132.3 lb is heavier.
    expect(flagsOf(db, lbDay, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);

    const d = draftOf(db, kgDay);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { weight: 60 }));

    // 60 kg and 132.3 lb are the same load (R125): the lb set is no longer the heaviest.
    expect(setsOf(db, kgDay, BENCH)[0]).toMatchObject({ weight: 60, weightUnit: 'kg' });
    expect(flagsOf(db, lbDay, BENCH)[0] & HEAVIEST).toBe(0);
    expect(flagsOf(db, kgDay, BENCH)[0] & HEAVIEST).toBe(HEAVIEST);
  });
});

describe('next weights after a delete (7.12 step 3, R167)', () => {
  it('delete newest falls back to the workout before', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const newest = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(145);

    deleteFinishedWorkout(db, newest);

    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });
    expect(dump(db, newest)).toEqual({ workout: undefined, blocks: [], sets: [] });
  });

  it('none left keeps the slot', () => {
    const db = seededDb();
    const only = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);

    deleteFinishedWorkout(db, only);

    expect(slot(db, BENCH_SLOT)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });
  });

  it('a slot that now holds another exercise is not written (R74)', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const newest = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    db.update(routineExercises).set({ exerciseId: 'dumbbell-bench-press', nextWeight: 50 }).where(eq(routineExercises.id, BENCH_SLOT)).run();

    const d = draftOf(db, newest);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 5 }));
    expect(slot(db, BENCH_SLOT)).toMatchObject({ exerciseId: 'dumbbell-bench-press', nextWeight: 50 });

    deleteFinishedWorkout(db, newest);
    expect(slot(db, BENCH_SLOT)).toMatchObject({ exerciseId: 'dumbbell-bench-press', nextWeight: 50 });
  });

  it('delete the only workout for one slot while another slot falls back', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    // The newest also logs overhead press, for the first time.
    const id = startWorkoutFromDay(db, PUSH_A, OCT_1 + 2 * DAY);
    const view = getActiveWorkoutView(db)!;
    view.exercises[0].sets.forEach((s, i) => tick(db, s.id, 140, 8, OCT_1 + 2 * DAY + (i + 1) * MINUTE));
    view.exercises[1].sets.forEach((s, i) => tick(db, s.id, 95, 12, OCT_1 + 2 * DAY + (i + 10) * MINUTE));
    finishWorkout(db, id, OCT_1 + 2 * DAY + HOUR);
    expect(slot(db, OHP_SLOT).nextWeight).toBe(100);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(145);

    deleteFinishedWorkout(db, id);

    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);
    expect(slot(db, OHP_SLOT).nextWeight).toBe(100);
  });

  it('refreshNextWeights skips a slot that no longer exists, and a no_rule row', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const newest = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    db.update(workoutExercises).set({ outcome: 'no_rule', nextWeight: null }).where(eq(workoutExercises.workoutId, newest)).run();

    refreshNextWeights(db, [BENCH_SLOT, 'gone']);

    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);
  });
});

describe('the active workout is never touched (7.12)', () => {
  it('active workout untouched: its planned weight, sets and rule snapshot equal before and after an edit and a delete', () => {
    const db = seededDb();
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const newest = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    const active = pushDay(db, OCT_1 + 4 * DAY, 145, [8, 6], 'lb', false);
    setExerciseMark(db, getActiveWorkoutView(db)!.exercises[0].id, 'rough_sleep');
    const before = dump(db, active);
    expect(before.blocks[0]).toMatchObject({ plannedWeight: 145, ruleRepMax: 8 });

    const d = draftOf(db, newest);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 5 }));
    expect(dump(db, active)).toEqual(before);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);

    deleteFinishedWorkout(db, newest);
    expect(dump(db, active)).toEqual(before);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);
  });

  it('editing or deleting the active workout throws and changes nothing', () => {
    const db = seededDb();
    const active = pushDay(db, OCT_1, 135, [8, 8], 'lb', false);
    const before = dump(db, active);
    const draft: WorkoutDraft = { workoutId: active, name: 'x', exercises: [] };
    expect(() => saveWorkoutEdit(db, draft)).toThrow();
    expect(() => deleteFinishedWorkout(db, active)).toThrow();
    expect(dump(db, active)).toEqual(before);
  });
});

describe('refusals change nothing', () => {
  it('NothingLeftError leaves everything as it was', () => {
    const db = seededDb();
    const id = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const before = dump(db, id);
    let d = draftOf(db, id);
    const we = weIdOf(d, BENCH);
    for (let i = 0; i < 4; i++) d = patchDraftSet(d, we, i, { done: false });

    expect(() => saveWorkoutEdit(db, d)).toThrow(NothingLeftError);
    expect(dump(db, id)).toEqual(before);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);
  });

  it('a ticked set without a value it needs, or an id from another workout, throws and changes nothing', () => {
    const db = seededDb();
    const other = plainWorkout(db, OCT_1, [[BENCH, [[135, 5, null]]]]);
    const id = plainWorkout(db, OCT_1 + DAY, [[BENCH, [[140, 5, null]]]]);
    const before = dump(db, id);
    const d = draftOf(db, id);
    expect(() => saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: null }))).toThrow();
    const foreign = draftOf(db, other).exercises[0].sets[0].id;
    expect(() => saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { id: foreign }))).toThrow();
    expect(() => saveWorkoutEdit(db, { ...d, exercises: [{ ...d.exercises[0], workoutExerciseId: 'nope' }] })).toThrow();
    expect(dump(db, id)).toEqual(before);
  });
});

describe('saved workouts and Up next (R168, R169)', () => {
  function savedDay(db: Db, savedId: string, start: number, weight: number): string {
    const id = startSavedWorkout(db, savedId, start);
    const s = getActiveWorkoutView(db)!.exercises[0].sets;
    s.forEach((set, i) => tick(db, set.id, weight, 5, start + (i + 1) * MINUTE));
    finishWorkout(db, id, start + HOUR);
    return id;
  }

  const savedWeights = (db: Db, savedId: string) => getSavedWorkout(db, savedId)!.exercises[0].sets.map((s) => s.weight);

  it('a saved workout is re-remembered only by its latest finished workout; a delete never changes it', () => {
    const db = seededDb();
    const source = plainWorkout(db, OCT_1, [[BENCH, [[100, 5, null], [100, 5, null]]]]);
    const savedId = saveWorkoutAs(db, source, 'Bench day', OCT_1 + 2 * HOUR);
    const older = savedDay(db, savedId, OCT_1 + DAY, 110);
    const latest = savedDay(db, savedId, OCT_1 + 2 * DAY, 120);
    expect(savedWeights(db, savedId)).toEqual([120, 120]);

    let d = draftOf(db, older);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { weight: 111 }));
    expect(savedWeights(db, savedId)).toEqual([120, 120]);

    d = draftOf(db, latest);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 1, { weight: 125 }));
    expect(savedWeights(db, savedId)).toEqual([120, 125]);

    deleteFinishedWorkout(db, latest);
    expect(savedWeights(db, savedId)).toEqual([120, 125]);
    expect(db.select().from(savedWorkoutExercises).all()).toHaveLength(1);
  });

  it('an edit of a workout whose saved workout was deleted saves without it', () => {
    const db = seededDb();
    const source = plainWorkout(db, OCT_1, [[BENCH, [[100, 5, null]]]]);
    const savedId = saveWorkoutAs(db, source, 'Bench day', OCT_1 + 2 * HOUR);
    const id = savedDay(db, savedId, OCT_1 + DAY, 110);
    deleteSavedWorkout(db, savedId);
    const d = draftOf(db, id);
    expect(() => saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 6 }))).not.toThrow();
  });

  it('Up next pointer unchanged after an edit and a delete', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    const newest = pushDay(db, OCT_1 + 2 * DAY, 140, [8, 8, 8, 8]);
    const pointer = () => db.select({ i: routines.nextDayIndex }).from(routines).where(eq(routines.id, PPL)).get()!.i;
    const at = pointer();
    expect(at).toBe(1);

    const d = draftOf(db, newest);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { reps: 5 }));
    expect(pointer()).toBe(at);
    deleteFinishedWorkout(db, newest);
    expect(pointer()).toBe(at);
  });
});

describe('gear from Settings now (R167)', () => {
  it('a raise on edit rounds with the plates in Settings at the time of the edit', () => {
    const db = seededDb();
    const id = pushDay(db, OCT_1, 135, [8, 8, 8, 8]);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(140);
    // Only 45s and 5s: the nearest loadable weight above 135 is 145.
    setSetting(db, 'platesLb', { '45': 4, '5': 2 });
    const d = draftOf(db, id);
    saveWorkoutEdit(db, patchDraftSet(d, weIdOf(d, BENCH), 0, { rpe: 8 }));
    expect(block(db, id, BENCH)!.nextWeight).toBe(145);
    expect(slot(db, BENCH_SLOT).nextWeight).toBe(145);
  });
});
