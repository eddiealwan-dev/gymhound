/** @jest-environment node */
import { count, eq } from 'drizzle-orm';
import { countPrKinds } from '../../domain/history';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { exercises, routineDays, routines, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { setExerciseNote } from './exercisesRepo';
import {
  firstWorkoutMonth,
  getWorkoutDetail,
  listHistory,
  startRepeatWorkout,
  trainingDaysInMonth,
} from './historyRepo';
import {
  addExerciseToWorkout,
  addSet,
  addWarmupSet,
  setExerciseMark,
  setShowRpe,
  toggleSupersetWithNext,
  updateSet,
} from './workoutEditRepo';
import { getActiveWorkoutView, getFinishSummary } from './workoutViewsRepo';
import { ActiveWorkoutExistsError, finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MIN = 60_000;
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';
const SQUAT = 'barbell-back-squat';
const LATERAL = 'dumbbell-lateral-raise';
const PUSHDOWN = 'cable-triceps-pushdown';

function tick(db: Db, setId: string, weight: number, reps: number, at: number, unit: WeightUnit = 'lb'): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, unit, at, 'mi' as DistanceUnit);
}

function active(db: Db, exerciseId: string) {
  const e = getActiveWorkoutView(db)!.exercises.find((x) => x.exerciseId === exerciseId);
  if (!e) throw new Error(`${exerciseId} is not in the active workout`);
  return e;
}

/** An empty workout with bench: a warmup and `weight` × 5 twice, in `unit`. Finished 48 minutes after `start`. */
function benchWorkout(db: Db, start: number, weight: number, unit: WeightUnit = 'lb'): string {
  const id = startEmptyWorkout(db, start);
  const we = addExerciseToWorkout(db, id, BENCH);
  addSet(db, we);
  addWarmupSet(db, we);
  const ids = active(db, BENCH).sets.map((s) => s.id);
  tick(db, ids[0], weight / 2, 10, start + 1, unit);
  tick(db, ids[1], weight, 5, start + 2, unit);
  tick(db, ids[2], weight, 5, start + 3, unit);
  finishWorkout(db, id, start + 48 * MIN);
  return id;
}

describe('listHistory (R163)', () => {
  it('lists finished workouts newest first and leaves out the active one', () => {
    const db = seededDb();
    const older = benchWorkout(db, NOW - 30 * DAY, 135);
    const newer = benchWorkout(db, NOW - DAY, 185);
    startEmptyWorkout(db, NOW);

    const cards = listHistory(db, 'lb');
    expect(cards.map((c) => c.id)).toEqual([newer, older]);
    expect(cards[0]).toMatchObject({ name: expect.any(String), localDate: '2026-10-08', durationMs: 48 * MIN, setCount: 3 });
  });

  it('counts volume in the display unit, without warm-ups, and every done set', () => {
    const db = seededDb();
    const id = benchWorkout(db, NOW, 100, 'kg');

    const [card] = listHistory(db, 'lb');
    expect(card.id).toBe(id);
    // 2 × 100 kg × 5 = 1000 kg = 2204.6 lb; the 50 kg warm-up does not count.
    expect(card.volume).toBe(2205);
    expect(card.setCount).toBe(3);
    expect(listHistory(db, 'kg')[0].volume).toBe(1000);
    expect(card.volume).toBe(getFinishSummary(db, id, 'lb').volume);
  });

  it('lists each mark once and counts PRs as the finish summary does (R178)', () => {
    const db = seededDb();
    benchWorkout(db, NOW - 2 * DAY, 135);
    const id = startEmptyWorkout(db, NOW);
    const bench = addExerciseToWorkout(db, id, BENCH);
    addSet(db, bench);
    const squat = addExerciseToWorkout(db, id, SQUAT);
    setExerciseMark(db, bench, 'rough_sleep');
    setExerciseMark(db, squat, 'pain');
    const benchSets = active(db, BENCH).sets.map((s) => s.id);
    tick(db, benchSets[0], 185, 5, NOW + 1);
    tick(db, benchSets[1], 185, 6, NOW + 2);
    tick(db, active(db, SQUAT).sets[0].id, 225, 5, NOW + 3);
    finishWorkout(db, id, NOW + HOUR);

    const [card] = listHistory(db, 'lb');
    expect(card.marks).toEqual(['rough_sleep', 'pain']);
    const prs = getFinishSummary(db, id, 'lb').prs;
    expect(prs.length).toBeGreaterThan(0);
    expect(card.prCount).toBe(prs.length);
  });

  it('is empty with no finished workout', () => {
    const db = seededDb();
    startEmptyWorkout(db, NOW);
    expect(listHistory(db, 'lb')).toEqual([]);
  });
});

describe('firstWorkoutMonth and trainingDaysInMonth (R164)', () => {
  it('reads finished workouts only', () => {
    const db = seededDb();
    expect(firstWorkoutMonth(db)).toBeNull();
    benchWorkout(db, new Date(2026, 8, 28, 9).getTime(), 135);
    benchWorkout(db, new Date(2026, 9, 2, 9).getTime(), 135);
    benchWorkout(db, new Date(2026, 9, 2, 18).getTime(), 135);
    benchWorkout(db, new Date(2026, 9, 5, 9).getTime(), 135);
    startEmptyWorkout(db, new Date(2026, 9, 9, 9).getTime());

    expect(firstWorkoutMonth(db)).toBe('2026-09');
    expect(trainingDaysInMonth(db, '2026-10')).toEqual(['2026-10-02', '2026-10-05']);
    expect(trainingDaysInMonth(db, '2026-09')).toEqual(['2026-09-28']);
    expect(trainingDaysInMonth(db, '2026-11')).toEqual([]);
  });
});

describe('getWorkoutDetail (R165)', () => {
  it('reads the exercises, sets, marks, flags and the note saved with the workout', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, 'Elbows in', NOW - DAY);
    benchWorkout(db, NOW - 2 * DAY, 135);
    const id = benchWorkout(db, NOW, 185);
    setExerciseNote(db, BENCH, 'Pause the first rep', NOW + 2 * HOUR);

    const detail = getWorkoutDetail(db, id, 'lb')!;
    expect(detail.localDate).toBe('2026-10-09');
    expect(detail.startedAt).toBe(NOW);
    expect(detail.routineName).toBeNull();
    expect(detail.dayName).toBeNull();
    expect(detail.summary.durationMs).toBe(48 * MIN);
    expect(detail.exercises).toHaveLength(1);
    const [bench] = detail.exercises;
    expect(bench).toMatchObject({ exerciseId: BENCH, loggingType: 'weighted', note: 'Elbows in', mark: null, supersetGroup: null });
    expect(bench.sets.map((s) => [s.setType, s.weight, s.reps])).toEqual([
      ['warmup', 92.5, 10],
      ['working', 185, 5],
      ['working', 185, 5],
    ]);
    expect(bench.sets.some((s) => s.prFlags !== 0)).toBe(true);
    expect(bench.sets[0].prFlags).toBe(0);
  });

  it('names the routine and day it was started from', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, active(db, BENCH).sets[0].id, 185, 5, NOW + 1);
    finishWorkout(db, id, NOW + HOUR);
    const day = db.select().from(routineDays).where(eq(routineDays.id, PUSH_A)).get()!;
    const routine = db.select().from(routines).where(eq(routines.id, day.routineId)).get()!;

    const detail = getWorkoutDetail(db, id, 'lb')!;
    expect(detail.routineName).toBe(routine.name);
    expect(detail.dayName).toBe(day.name);
  });

  it('shows RPE where a set had one', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    const we = addExerciseToWorkout(db, id, BENCH);
    setShowRpe(db, we, true);
    const setId = active(db, BENCH).sets[0].id;
    tick(db, setId, 185, 5, NOW + 1);
    updateSet(db, setId, { rpe: 8 });
    finishWorkout(db, id, NOW + HOUR);

    const [bench] = getWorkoutDetail(db, id, 'lb')!.exercises;
    expect(bench.showRpe).toBe(true);
    expect(bench.sets[0].rpe).toBe(8);
  });

  it('is null for the active workout and an unknown id', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    expect(getWorkoutDetail(db, id, 'lb')).toBeNull();
    expect(getWorkoutDetail(db, 'nope', 'lb')).toBeNull();
  });
});

describe('startRepeatWorkout (R171)', () => {
  /** Push A from its routine day: bench with a warmup and RPE on one set, lateral and pushdown as a superset. */
  function finishedPushA(db: Db): string {
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const bench = active(db, BENCH);
    addWarmupSet(db, bench.id);
    setShowRpe(db, bench.id, true);
    setExerciseMark(db, bench.id, 'sick');
    const benchSets = active(db, BENCH).sets.map((s) => s.id);
    tick(db, benchSets[0], 95, 10, NOW + 1);
    tick(db, benchSets[1], 185, 5, NOW + 2);
    updateSet(db, benchSets[1], { rpe: 8, setType: 'failure' });
    toggleSupersetWithNext(db, active(db, LATERAL).id);
    tick(db, active(db, LATERAL).sets[0].id, 20, 15, NOW + 3);
    tick(db, active(db, PUSHDOWN).sets[0].id, 50, 12, NOW + 4);
    finishWorkout(db, id, NOW + HOUR);
    return id;
  }

  it('copies the exercises in order with set types, superset groups and the RPE flag, values empty, no routine', () => {
    const db = seededDb();
    const pastId = finishedPushA(db);
    const past = getWorkoutDetail(db, pastId, 'lb')!;
    const later = NOW + 2 * DAY;

    const id = startRepeatWorkout(db, pastId, later);
    const row = db.select().from(workouts).where(eq(workouts.id, id)).get()!;
    expect(row).toMatchObject({
      name: past.summary.name,
      status: 'active',
      startedAt: later,
      localDate: '2026-10-11',
      routineId: null,
      routineDayId: null,
      savedWorkoutId: null,
    });

    const view = getActiveWorkoutView(db)!;
    expect(view.exercises.map((e) => e.exerciseId)).toEqual(past.exercises.map((e) => e.exerciseId));
    expect(view.exercises.map((e) => e.sets.map((s) => s.setType))).toEqual(past.exercises.map((e) => e.sets.map((s) => s.setType)));
    expect(view.exercises.map((e) => e.supersetGroup)).toEqual(past.exercises.map((e) => e.supersetGroup));
    expect(view.exercises.find((e) => e.exerciseId === LATERAL)!.supersetGroup).not.toBeNull();
    for (const e of view.exercises) {
      expect(e.showRpe).toBe(e.exerciseId === BENCH);
      expect(e.rule).toBeNull();
      expect(e.plannedWeight).toBeNull();
      expect(e.mark).toBeNull();
      for (const s of e.sets) {
        expect(s).toMatchObject({ weight: null, weightUnit: null, reps: null, rpe: null, durationS: null, distance: null, done: false });
      }
    }
    const raw = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    for (const we of raw) expect(we).toMatchObject({ routineExerciseId: null, note: null, outcome: null });
    // The past workout is untouched.
    expect(getWorkoutDetail(db, pastId, 'lb')).toEqual(past);
  });

  it('stores a superset group left with one member as none', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    const a = addExerciseToWorkout(db, id, BENCH);
    addExerciseToWorkout(db, id, SQUAT);
    toggleSupersetWithNext(db, a);
    tick(db, active(db, BENCH).sets[0].id, 185, 5, NOW + 1);
    // Squat is never ticked, so finishing drops it and leaves bench alone in its group.
    finishWorkout(db, id, NOW + HOUR);
    expect(getWorkoutDetail(db, id, 'lb')!.exercises.map((e) => e.supersetGroup)).toEqual([expect.any(Number)]);

    startRepeatWorkout(db, id, NOW + DAY);
    expect(getActiveWorkoutView(db)!.exercises.map((e) => e.supersetGroup)).toEqual([null]);
  });

  it('keeps an archived exercise', () => {
    const db = seededDb();
    const pastId = benchWorkout(db, NOW, 185);
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, BENCH)).run();

    startRepeatWorkout(db, pastId, NOW + DAY);
    expect(getActiveWorkoutView(db)!.exercises.map((e) => e.exerciseId)).toEqual([BENCH]);
  });

  it('throws ActiveWorkoutExistsError with a workout active and changes nothing', () => {
    const db = seededDb();
    const pastId = benchWorkout(db, NOW, 185);
    startEmptyWorkout(db, NOW + DAY);
    const before = [db.select({ n: count() }).from(workouts).get()!.n, db.select({ n: count() }).from(sets).get()!.n];

    expect(() => startRepeatWorkout(db, pastId, NOW + DAY)).toThrow(ActiveWorkoutExistsError);
    expect([db.select({ n: count() }).from(workouts).get()!.n, db.select({ n: count() }).from(sets).get()!.n]).toEqual(before);
  });

  it('refuses a workout that is not finished', () => {
    const db = seededDb();
    expect(() => startRepeatWorkout(db, 'nope', NOW)).toThrow();
    expect(db.select({ n: count() }).from(workouts).get()!.n).toBe(0);
  });
});

describe('the PR count matches the stored flags', () => {
  it("equals countPrKinds of the workout's sets", () => {
    const db = seededDb();
    benchWorkout(db, NOW - DAY, 135);
    const id = benchWorkout(db, NOW, 185);
    const rows = db
      .select({ exerciseId: workoutExercises.exerciseId, prFlags: sets.prFlags })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(eq(workoutExercises.workoutId, id))
      .all();
    expect(listHistory(db, 'lb')[0].prCount).toBe(countPrKinds(rows));
  });
});
