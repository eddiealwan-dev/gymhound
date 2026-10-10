/** @jest-environment node */
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSeed } from '../../seed/seed';
import { exerciseNotes, routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import { createTestDb } from '../testing/createTestDb';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getUpNext, setActiveRoutine } from './routinesRepo';
import { ensureSettings } from './settingsRepo';
import {
  ActiveWorkoutExistsError,
  countUntickedWithValues,
  discardWorkout,
  finishWorkout,
  getActiveWorkoutId,
  NothingTickedError,
  setRestEndsAt,
  startEmptyWorkout,
  startWorkoutFromDay,
  tickSet,
  untickSet,
} from './workoutsRepo';
import { getActiveWorkoutView, getPreviousSets } from './workoutViewsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PPL = 'premade-ppl-6';
const PUSH_A = 'premade-ppl-6:push-a';
const FIVE_A = 'premade-5x5-3:a';
const FIVE_B = 'premade-5x5-3:b';

/** Ticks a set at `weight` x `reps` in lb. */
function tick(db: Db, setId: string, weight: number, reps: number, at: number): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, 'lb', at);
}

/** The ids of the active workout's sets for the exercise at `exerciseIndex`. */
function setIds(db: Db, exerciseIndex = 0): string[] {
  return getActiveWorkoutView(db)!.exercises[exerciseIndex].sets.map((s) => s.id);
}

function nextDayIndex(db: Db, routineId: string): number {
  return db.select().from(routines).where(eq(routines.id, routineId)).get()!.nextDayIndex;
}

/** Starts `dayId`, ticks the first set of its first exercise at `weight` x `reps`, and finishes. */
function runDay(db: Db, dayId: string, start: number, weight: number, reps: number): string {
  const id = startWorkoutFromDay(db, dayId, start);
  tick(db, setIds(db)[0], weight, reps, start + 60_000);
  finishWorkout(db, id, start + HOUR);
  return id;
}

describe('startWorkoutFromDay', () => {
  it('starts from a day with the rule snapshot, planned weight and empty working sets', () => {
    const db = seededDb();
    db.update(routineExercises)
      .set({ nextWeight: 185, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const v = getActiveWorkoutView(db)!;
    expect([v.id, v.name]).toEqual([id, 'Push A']);
    expect(v.exercises[0]).toMatchObject({
      exerciseId: 'barbell-bench-press',
      rule: { setCount: 4, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' },
      plannedWeight: 185,
      plannedUnit: 'lb',
    });
    expect(v.exercises[0].sets.map((s) => [s.setType, s.done, s.weight])).toEqual(
      Array(4).fill(['working', false, null]),
    );
  });

  it('copies the day, the exercise order, supersets and the rest of the view', () => {
    const db = seededDb();
    db.update(routineExercises)
      .set({ supersetGroup: 1 })
      .where(eq(routineExercises.id, `${PUSH_A}:dumbbell-lateral-raise`))
      .run();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);

    const w = db.select().from(workouts).where(eq(workouts.id, id)).get()!;
    expect(w).toMatchObject({
      name: 'Push A',
      routineId: PPL,
      routineDayId: PUSH_A,
      status: 'active',
      dayMark: 'normal',
      startedAt: NOW,
      finishedAt: null,
      localDate: '2026-10-09',
      restEndsAt: null,
    });

    const v = getActiveWorkoutView(db)!;
    expect(v).toMatchObject({ startedAt: NOW, dayMark: 'normal', restEndsAt: null });
    expect(v.exercises.map((e) => [e.position, e.exerciseId])).toEqual([
      [0, 'barbell-bench-press'],
      [1, 'barbell-overhead-press'],
      [2, 'incline-dumbbell-press'],
      [3, 'dumbbell-lateral-raise'],
      [4, 'cable-triceps-pushdown'],
    ]);
    expect(v.exercises.map((e) => e.supersetGroup)).toEqual([null, null, null, 1, null]);
    expect(v.exercises[0]).toMatchObject({
      name: 'Barbell bench press',
      loggingType: 'weighted',
      equipment: 'barbell',
      showRpe: false,
      note: null,
      plannedWeight: null,
      plannedUnit: null,
      overrideWeight: null,
      overrideUnit: null,
      previous: [],
    });
    expect(v.exercises.map((e) => e.sets.length)).toEqual([4, 3, 3, 3, 3]);
    expect(v.exercises[0].sets.map((s) => s.position)).toEqual([0, 1, 2, 3]);
  });

  it('keeps the rule it started with when the routine is edited afterwards', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    db.update(routineExercises)
      .set({ setCount: 6, repMin: 1, repMax: 2, increment: 10, incrementUnit: 'kg' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();
    expect(getActiveWorkoutView(db)!.exercises[0].rule).toEqual({
      setCount: 4,
      repMin: 5,
      repMax: 8,
      increment: 5,
      incrementUnit: 'lb',
    });
  });

  it('refuses an unknown day and creates nothing', () => {
    const db = seededDb();
    expect(() => startWorkoutFromDay(db, 'no-such-day', NOW)).toThrow();
    expect(db.select().from(workouts).all()).toEqual([]);
  });
});

describe('starting a workout', () => {
  it('names an empty workout "Workout" and dates it by its start', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    expect(getActiveWorkoutId(db)).toBe(id);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      name: 'Workout',
      routineId: null,
      routineDayId: null,
      status: 'active',
      startedAt: NOW,
      localDate: '2026-10-09',
    });
    expect(getActiveWorkoutView(db)).toMatchObject({ id, name: 'Workout', exercises: [] });
  });

  it('has no active workout until one is started', () => {
    const db = seededDb();
    expect(getActiveWorkoutId(db)).toBeNull();
    expect(getActiveWorkoutView(db)).toBeNull();
  });

  it('refuses a second active workout', () => {
    const db = seededDb();
    startEmptyWorkout(db, NOW);
    expect(() => startEmptyWorkout(db, NOW)).toThrow(ActiveWorkoutExistsError);
    expect(() => startWorkoutFromDay(db, PUSH_A, NOW)).toThrow(ActiveWorkoutExistsError);
  });

  it('inserts nothing when it refuses to start from a day', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    expect(() => startWorkoutFromDay(db, PUSH_A, NOW)).toThrow(ActiveWorkoutExistsError);
    expect(db.select().from(workouts).all().map((w) => w.id)).toEqual([id]);
    expect(db.select().from(workoutExercises).all()).toEqual([]);
    expect(db.select().from(sets).all()).toEqual([]);
  });

  it('allows a new workout once the last one is finished or discarded', () => {
    const db = seededDb();
    runDay(db, PUSH_A, NOW, 135, 8);
    const second = startEmptyWorkout(db, NOW + DAY);
    discardWorkout(db, second);
    expect(() => startEmptyWorkout(db, NOW + 2 * DAY)).not.toThrow();
  });
});

describe('finishWorkout', () => {
  it('dates a late-night workout by its start', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, new Date(2026, 9, 9, 23, 50).getTime());
    tick(db, setIds(db)[0], 135, 8, new Date(2026, 9, 9, 23, 55).getTime());
    const finishedAt = new Date(2026, 9, 10, 0, 30).getTime();
    finishWorkout(db, id, finishedAt);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      localDate: '2026-10-09',
      finishedAt,
    });
  });

  it('drops unticked sets and empty exercises, marks it finished, advances the rotation', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const [first, second] = setIds(db);
    tick(db, first, 135, 8, NOW + 60_000);
    tick(db, second, 135, 7, NOW + 120_000);
    const finishedAt = NOW + HOUR;
    finishWorkout(db, id, finishedAt);

    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      status: 'finished',
      finishedAt,
    });
    const kept = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(kept.map((e) => e.exerciseId)).toEqual(['barbell-bench-press']);
    const remaining = db.select().from(sets).all();
    expect(remaining.map((s) => [s.id, s.done])).toEqual([
      [first, true],
      [second, true],
    ]);
    expect(nextDayIndex(db, PPL)).toBe(1);
    expect(getActiveWorkoutId(db)).toBeNull();
  });

  it('keeps an exercise that has any ticked set, and the order of what is left', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db, 3)[2], 20, 12, NOW + 1_000);
    tick(db, setIds(db, 1)[0], 95, 10, NOW + 2_000);
    finishWorkout(db, id, NOW + HOUR);

    const kept = db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, id))
      .all()
      .sort((a, b) => a.position - b.position);
    expect(kept.map((e) => [e.position, e.exerciseId])).toEqual([
      [1, 'barbell-overhead-press'],
      [3, 'dumbbell-lateral-raise'],
    ]);
    expect(db.select().from(sets).all()).toHaveLength(2);
  });

  it('5x5 rotation alternates A, B, A', () => {
    const db = seededDb();
    setActiveRoutine(db, 'premade-5x5-3');
    expect(getUpNext(db)!.dayName).toBe('A');

    runDay(db, FIVE_A, NOW, 95, 5);
    expect(nextDayIndex(db, 'premade-5x5-3')).toBe(1);
    expect(getUpNext(db)!.dayName).toBe('B');

    runDay(db, FIVE_B, NOW + DAY, 95, 5);
    expect(nextDayIndex(db, 'premade-5x5-3')).toBe(0);
    expect(getUpNext(db)!.dayName).toBe('A');
  });

  it('advances from the day that was run, not from the pointer', () => {
    const db = seededDb();
    // The pointer says Push A is next, but the user runs the last day (Legs B).
    runDay(db, 'premade-ppl-6:legs-b', NOW, 135, 8);
    expect(nextDayIndex(db, PPL)).toBe(0);
    runDay(db, 'premade-ppl-6:pull-a', NOW + DAY, 135, 8);
    expect(nextDayIndex(db, PPL)).toBe(2);
  });

  it('does not move any other routine', () => {
    const db = seededDb();
    runDay(db, PUSH_A, NOW, 135, 8);
    const others = db.select().from(routines).all().filter((r) => r.id !== PPL);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((r) => r.nextDayIndex === 0)).toBe(true);
  });

  it('finishing with nothing ticked throws and stays active', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    // A typed value that was never ticked does not count.
    db.update(sets).set({ weight: 135, weightUnit: 'lb' }).where(eq(sets.id, setIds(db)[0])).run();

    expect(() => finishWorkout(db, id, NOW + HOUR)).toThrow(NothingTickedError);
    expect(getActiveWorkoutId(db)).toBe(id);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      status: 'active',
      finishedAt: null,
    });
    expect(db.select().from(sets).all()).toHaveLength(16);
    expect(db.select().from(workoutExercises).all()).toHaveLength(5);
    expect(nextDayIndex(db, PPL)).toBe(0);
  });

  it('refuses an empty workout with no sets at all', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    expect(() => finishWorkout(db, id, NOW + HOUR)).toThrow(NothingTickedError);
    expect(getActiveWorkoutId(db)).toBe(id);
  });

  it('refuses a workout that is already finished, and leaves the rotation alone', () => {
    const db = seededDb();
    const id = runDay(db, PUSH_A, NOW, 135, 8);
    expect(nextDayIndex(db, PPL)).toBe(1);
    expect(() => finishWorkout(db, id, NOW + DAY)).toThrow(Error);
    expect(() => finishWorkout(db, 'no-such-workout', NOW + DAY)).toThrow(Error);
    expect(nextDayIndex(db, PPL)).toBe(1);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()!.finishedAt).toBe(NOW + HOUR);
  });

  it('finishes even when the routine was deleted after the workout started', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 1_000);
    db.delete(routines).where(eq(routines.id, PPL)).run();
    expect(db.select().from(routineDays).where(eq(routineDays.id, PUSH_A)).all()).toEqual([]);

    finishWorkout(db, id, NOW + HOUR);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()!.status).toBe('finished');
  });
});

describe('discardWorkout', () => {
  it('deletes the workout and children and leaves the rotation alone', () => {
    const db = seededDb();
    runDay(db, PUSH_A, NOW, 135, 8);
    expect(nextDayIndex(db, PPL)).toBe(1);
    const finishedRows = {
      workouts: db.select().from(workouts).all(),
      exercises: db.select().from(workoutExercises).all(),
      sets: db.select().from(sets).all(),
    };

    const id = startWorkoutFromDay(db, 'premade-ppl-6:pull-a', NOW + DAY);
    tick(db, setIds(db)[0], 225, 5, NOW + DAY + 1_000);
    setRestEndsAt(db, id, NOW + DAY + 120_000);
    discardWorkout(db, id);

    expect(getActiveWorkoutId(db)).toBeNull();
    expect(getActiveWorkoutView(db)).toBeNull();
    expect(db.select().from(workouts).all()).toEqual(finishedRows.workouts);
    expect(db.select().from(workoutExercises).all()).toEqual(finishedRows.exercises);
    expect(db.select().from(sets).all()).toEqual(finishedRows.sets);
    expect(nextDayIndex(db, PPL)).toBe(1);
  });

  it('discards an empty workout', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, NOW);
    discardWorkout(db, id);
    expect(db.select().from(workouts).all()).toEqual([]);
  });

  it('refuses a finished workout, so history cannot be discarded', () => {
    const db = seededDb();
    const id = runDay(db, PUSH_A, NOW, 135, 8);
    expect(() => discardWorkout(db, id)).toThrow(Error);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()!.status).toBe('finished');
    expect(db.select().from(sets).all()).toHaveLength(1);
  });
});

describe('countUntickedWithValues', () => {
  it('counts only unticked sets that have a value', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(countUntickedWithValues(db, id)).toBe(0);

    const [typed, , ticked] = setIds(db);
    db.update(sets).set({ weight: 135 }).where(eq(sets.id, typed)).run();
    tick(db, ticked, 135, 8, NOW + 1_000);
    // One typed but unticked, one blank, one ticked.
    expect(countUntickedWithValues(db, id)).toBe(1);

    // Any of the four value fields counts, and an un-ticked set keeps its values.
    db.update(sets).set({ durationS: 45 }).where(eq(sets.id, setIds(db, 1)[0])).run();
    untickSet(db, ticked);
    expect(countUntickedWithValues(db, id)).toBe(3);
  });
});

describe('tickSet and untickSet', () => {
  it('records the values, the unit of the weight and when it was ticked', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a, b] = setIds(db);
    tickSet(db, a, { weight: 82.5, reps: 8, durationS: null, distance: null }, 'kg', NOW + 5_000);
    tickSet(db, b, { weight: 0, reps: 10, durationS: null, distance: null }, 'lb', NOW + 6_000);
    const [rowA, rowB] = db.select().from(sets).all().filter((s) => s.id === a || s.id === b);
    expect(rowA).toMatchObject({ weight: 82.5, weightUnit: 'kg', reps: 8, done: true, completedAt: NOW + 5_000 });
    // A zero added weight is still a weight, logged in the entry unit.
    expect(rowB).toMatchObject({ weight: 0, weightUnit: 'lb', reps: 10, done: true });
  });

  it('leaves the weight unit empty when the set has no weight', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a] = setIds(db);
    tickSet(db, a, { weight: null, reps: null, durationS: 45, distance: null }, 'kg', NOW);
    expect(db.select().from(sets).where(eq(sets.id, a)).get()).toMatchObject({
      weight: null,
      weightUnit: null,
      reps: null,
      durationS: 45,
      done: true,
    });
  });

  it('ticks only the set it is given', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a, b] = setIds(db);
    tick(db, a, 135, 8, NOW);
    expect(db.select().from(sets).where(eq(sets.id, b)).get()).toMatchObject({ weight: null, done: false });
  });

  it('un-ticking keeps the values and clears the tick', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a] = setIds(db);
    tick(db, a, 135, 8, NOW);
    untickSet(db, a);
    expect(db.select().from(sets).where(eq(sets.id, a)).get()).toMatchObject({
      weight: 135,
      weightUnit: 'lb',
      reps: 8,
      done: false,
      completedAt: null,
    });
    expect(getActiveWorkoutView(db)!.exercises[0].sets[0]).toMatchObject({ done: false, weight: 135, reps: 8 });
  });
});

describe('setRestEndsAt', () => {
  it('stores the absolute end time and clears it', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setRestEndsAt(db, id, NOW + 120_000);
    expect(getActiveWorkoutView(db)!.restEndsAt).toBe(NOW + 120_000);
    setRestEndsAt(db, id, null);
    expect(getActiveWorkoutView(db)!.restEndsAt).toBeNull();
  });
});

describe('restart', () => {
  it('survives a restart: a reopened file DB returns ticks, values and rest end', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-'));
    const file = path.join(dir, 'restart.db');
    const handles: { close(): void }[] = [];
    try {
      const first = createTestDb(file);
      handles.push(first);
      ensureSettings(first.db, 'us');
      runSeed(first.db, NOW);
      const id = startWorkoutFromDay(first.db, PUSH_A, NOW);
      const [set1] = setIds(first.db);
      tick(first.db, set1, 185, 8, NOW + 60_000);
      setRestEndsAt(first.db, id, NOW + 120_000);
      first.close();

      const second = createTestDb(file);
      handles.push(second);
      const v = getActiveWorkoutView(second.db)!;
      expect(v.id).toBe(id);
      expect(v.restEndsAt).toBe(NOW + 120_000);
      expect(v.exercises[0].sets[0]).toMatchObject({ id: set1, done: true, weight: 185, weightUnit: 'lb', reps: 8 });
      expect(v.exercises[0].sets.slice(1).every((s) => !s.done)).toBe(true);
      second.close();
    } finally {
      handles.forEach((h) => h.close());
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(fs.existsSync(dir)).toBe(false);
  });
});

describe('previous sets', () => {
  it('come from the most recent finished workout with the exercise', () => {
    const db = seededDb();
    runDay(db, PUSH_A, NOW, 180, 10);
    runDay(db, PUSH_A, NOW + DAY, 185, 8);
    startWorkoutFromDay(db, PUSH_A, NOW + 2 * DAY);

    const bench = getActiveWorkoutView(db)!.exercises[0];
    expect(bench.previous).toHaveLength(1);
    expect(bench.previous[0]).toMatchObject({ position: 0, setType: 'working', weight: 185, weightUnit: 'lb', reps: 8 });
    // Exercises with no ticked set last time have no previous.
    expect(getActiveWorkoutView(db)!.exercises[1].previous).toEqual([]);
  });

  it('are the done sets only, in position order', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const ids = setIds(db);
    tick(db, ids[2], 135, 6, NOW + 3_000);
    tick(db, ids[0], 135, 8, NOW + 1_000);
    // A typed but unticked set is dropped at finish.
    db.update(sets).set({ weight: 999, reps: 1 }).where(eq(sets.id, ids[1])).run();
    finishWorkout(db, id, NOW + HOUR);

    const previous = getPreviousSets(db, 'barbell-bench-press', 'some-other-workout');
    expect(previous.map((s) => [s.position, s.weight, s.reps])).toEqual([
      [0, 135, 8],
      [2, 135, 6],
    ]);
  });

  it('go by when the workout finished, not by when it was inserted', () => {
    const db = seededDb();
    const older = runDay(db, PUSH_A, NOW, 180, 10);
    runDay(db, PUSH_A, NOW + DAY, 185, 8);
    db.update(workouts).set({ finishedAt: NOW + 5 * DAY }).where(eq(workouts.id, older)).run();

    expect(getPreviousSets(db, 'barbell-bench-press', 'x')[0]).toMatchObject({ weight: 180, reps: 10 });
  });

  it('leave out the workout being excluded', () => {
    const db = seededDb();
    runDay(db, PUSH_A, NOW, 180, 10);
    const latest = runDay(db, PUSH_A, NOW + DAY, 185, 8);
    expect(getPreviousSets(db, 'barbell-bench-press', latest)[0]).toMatchObject({ weight: 180, reps: 10 });
    expect(getPreviousSets(db, 'barbell-bench-press', 'x')[0]).toMatchObject({ weight: 185, reps: 8 });
  });

  it('are empty for an exercise that was never finished, and ignore an active workout', () => {
    const db = seededDb();
    expect(getPreviousSets(db, 'barbell-bench-press', 'x')).toEqual([]);
    startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 1_000);
    expect(getPreviousSets(db, 'barbell-bench-press', 'x')).toEqual([]);
  });

  it('keep the unit they were logged in', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tickSet(db, setIds(db)[0], { weight: 82.5, reps: 8, durationS: null, distance: null }, 'kg', NOW + 1_000);
    finishWorkout(db, id, NOW + HOUR);
    expect(getPreviousSets(db, 'barbell-bench-press', 'x')[0]).toMatchObject({ weight: 82.5, weightUnit: 'kg' });
  });
});

describe('getActiveWorkoutView', () => {
  it("carries each exercise's sticky note", () => {
    const db = seededDb();
    db.insert(exerciseNotes)
      .values({ exerciseId: 'barbell-bench-press', text: 'Pause the first rep', updatedAt: NOW })
      .run();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const v = getActiveWorkoutView(db)!;
    expect(v.exercises[0].note).toBe('Pause the first rep');
    expect(v.exercises[1].note).toBeNull();
  });

  it('shows an override and RPE setting stored on the exercise', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const weId = getActiveWorkoutView(db)!.exercises[0].id;
    db.update(workoutExercises)
      .set({ showRpe: true, overrideWeight: 60, overrideUnit: 'kg' })
      .where(eq(workoutExercises.id, weId))
      .run();
    expect(getActiveWorkoutView(db)!.exercises[0]).toMatchObject({
      showRpe: true,
      overrideWeight: 60,
      overrideUnit: 'kg',
    });
  });

  it('lists the sets in position order', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a, b] = setIds(db);
    db.update(sets).set({ position: 9, rpe: 8.5 }).where(eq(sets.id, a)).run();
    const listed = getActiveWorkoutView(db)!.exercises[0].sets;
    expect(listed.map((s) => s.id).slice(0, 1)).toEqual([b]);
    expect(listed.at(-1)).toMatchObject({ id: a, rpe: 8.5, position: 9 });
  });
});
