/** @jest-environment node */
import { and, eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mondayOf, toLocalDate } from '../../domain/dates';
import { formatPrevious } from '../../domain/setEntry';
import { computeStreak } from '../../domain/streak';
import { dayTitle } from '../../domain/upNext';
import type { WeightUnit } from '../../domain/types';
import { totalVolume } from '../../domain/volume';
import { runSeed } from '../../seed/seed';
import {
  exerciseNotes,
  exercises,
  routineDays,
  routineExercises,
  routines,
  sets,
  workoutExercises,
  workouts,
} from '../schema';
import { createTestDb } from '../testing/createTestDb';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getExerciseNote, setExerciseNote } from './exercisesRepo';
import { getUpNext, setActiveRoutine } from './routinesRepo';
import { ensureSettings, getSettings, setSetting } from './settingsRepo';
import { addExerciseToWorkout, replaceExercise, setExerciseMark, setOverride } from './workoutEditRepo';
import {
  ActiveWorkoutExistsError,
  clearRestEndsAtIf,
  discardWorkout,
  finishWorkout,
  getActiveRest,
  getActiveWorkoutId,
  getNextDayTitle,
  NothingTickedError,
  setRestEndsAt,
  startEmptyWorkout,
  startRest,
  startWorkoutFromDay,
  tickSet,
  untickSet,
} from './workoutsRepo';
import { getActiveWorkoutView, getPreviousSets, getTrainingDates, getVolumeSetsSince } from './workoutViewsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PPL = 'premade-ppl-6';
const PUSH_A = 'premade-ppl-6:push-a';
const FIVE_A = 'premade-5x5-3:a';
const FIVE_B = 'premade-5x5-3:b';

/** Ticks a set at `weight` x `reps` in lb. */
function tick(db: Db, setId: string, weight: number, reps: number, at: number): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, 'lb', at, 'mi');
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

/** The raw workout_exercises row of `exerciseId` in a workout, straight from the table. */
function rawWorkoutExercise(db: Db, workoutId: string, exerciseId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.exerciseId, exerciseId)))
    .get()!;
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

  it("names the workout as Train does: the routine's name before a one- or two-character day (R56)", () => {
    const db = seededDb();
    const five = startWorkoutFromDay(db, FIVE_B, NOW);
    expect(db.select().from(workouts).where(eq(workouts.id, five)).get()!.name).toBe('5×5 B');
    discardWorkout(db, five);

    const push = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(db.select().from(workouts).where(eq(workouts.id, push)).get()!.name).toBe('Push A');
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
    expect(v).toMatchObject({ startedAt: NOW, restEndsAt: null });
    // Marks are per exercise now (R60): the view carries no workout-level mark.
    expect(v).not.toHaveProperty('dayMark');
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

  it('snapshots the plan in the display unit and leaves the routine row as stored', () => {
    const db = seededDb('us');
    const BENCH = `${PUSH_A}:barbell-bench-press`;
    db.update(routineExercises).set({ nextWeight: 135, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, BENCH)).run();
    db.update(routineExercises)
      .set({ nextWeight: 15, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:dumbbell-lateral-raise`))
      .run();
    const storedBefore = db.select().from(routineExercises).where(eq(routineExercises.id, BENCH)).get()!;
    expect(storedBefore).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb', increment: 5, incrementUnit: 'lb' });

    setSetting(db, 'unit', 'kg');
    const inKg = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(rawWorkoutExercise(db, inKg, 'barbell-bench-press')).toMatchObject({
      plannedWeight: 60,
      plannedUnit: 'kg',
      ruleIncrement: 2.5,
      ruleIncrementUnit: 'kg',
    });
    // Not a barbell: 6.80 kg rounds to 0.5, not up to the bar.
    expect(rawWorkoutExercise(db, inKg, 'dumbbell-lateral-raise')).toMatchObject({ plannedWeight: 7, plannedUnit: 'kg' });
    discardWorkout(db, inKg);

    setSetting(db, 'unit', 'lb');
    const inLb = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(rawWorkoutExercise(db, inLb, 'barbell-bench-press')).toMatchObject({
      plannedWeight: 135,
      plannedUnit: 'lb',
      ruleIncrement: 5,
      ruleIncrementUnit: 'lb',
    });

    expect(db.select().from(routineExercises).where(eq(routineExercises.id, BENCH)).get()).toEqual(storedBefore);
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

describe('several workouts on one day', () => {
  it('finishes both, counts both in this week\'s volume and counts the date once in the streak', () => {
    const db = seededDb();
    const today = toLocalDate(NOW);
    const first = runDay(db, PUSH_A, NOW, 135, 8);

    // A second, empty workout the same morning: the first is finished, so starting is allowed.
    const second = startEmptyWorkout(db, NOW + 2 * HOUR);
    addExerciseToWorkout(db, second, 'barbell-bench-press');
    tick(db, setIds(db)[0], 100, 5, NOW + 2 * HOUR + 60_000);
    finishWorkout(db, second, NOW + 3 * HOUR);

    expect(db.select().from(workouts).all()).toHaveLength(2);
    for (const id of [first, second]) {
      expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
        status: 'finished',
        localDate: today,
      });
    }

    // This week's volume, read the way the Train screen reads it: 135 x 8 plus 100 x 5.
    const weekStart = mondayOf(today);
    expect(totalVolume(getVolumeSetsSince(db, weekStart), 'lb')).toBe(135 * 8 + 100 * 5);

    // The streak counts the date once.
    expect(getTrainingDates(db)).toEqual([today]);
    expect(computeStreak(getTrainingDates(db), today)).toBe(1);
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

describe('finishWorkout saves the note and clears the rest timer', () => {
  // Review Focus 8
  it('saves the note with the finished workout and keeps it after later edits', () => {
    const db = seededDb();
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    setExerciseNote(db, 'barbell-bench-press', 'Wrists straight', NOW + DAY);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press').note).toBe('Elbows in');
    expect(getExerciseNote(db, 'barbell-bench-press')).toBe('Wrists straight');
  });

  it('saves null for an exercise with no note', () => {
    const db = seededDb();
    // Another exercise has a note, so a copy that matched the wrong row would show.
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db, 0)[0], 135, 8, NOW + 60_000);
    tick(db, setIds(db, 1)[0], 95, 8, NOW + 120_000);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-overhead-press').note).toBeNull();
    expect(rawWorkoutExercise(db, id, 'barbell-bench-press').note).toBe('Elbows in');
  });

  it('saves null when the note was cleared before the finish', () => {
    const db = seededDb();
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setExerciseNote(db, 'barbell-bench-press', '  ', NOW + 1_000);
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press').note).toBeNull();
  });

  it('a replaced exercise saves its own note, not the old one', () => {
    const db = seededDb();
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    setExerciseNote(db, 'dumbbell-bench-press', 'Neutral grip', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    replaceExercise(db, getActiveWorkoutView(db)!.exercises[0].id, 'dumbbell-bench-press');
    tick(db, setIds(db)[0], 60, 10, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'dumbbell-bench-press').note).toBe('Neutral grip');
    const replacedAway = db
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.exerciseId, 'barbell-bench-press'))
      .all();
    expect(replacedAway).toEqual([]);
  });

  it('copies the note only for the exercises that stay after the cleanup', () => {
    const db = seededDb();
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    setExerciseNote(db, 'barbell-overhead-press', 'Squeeze the glutes', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    // Only the overhead press is ticked; the bench press has a note but is dropped as empty.
    tick(db, setIds(db, 1)[0], 95, 8, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    const kept = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(kept.map((e) => [e.exerciseId, e.note])).toEqual([['barbell-overhead-press', 'Squeeze the glutes']]);
  });

  it('clears rest_ends_at on finish', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    startRest(db, id, NOW + 120_000, setIds(db)[0]);
    finishWorkout(db, id, NOW + 90_000);

    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({
      status: 'finished',
      restEndsAt: null,
      restSetId: null,
    });
  });

  it('leaves a refused finish untouched: the rest timer keeps running and no note is copied', () => {
    const db = seededDb();
    setExerciseNote(db, 'barbell-bench-press', 'Elbows in', NOW);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setRestEndsAt(db, id, NOW + 120_000);

    expect(() => finishWorkout(db, id, NOW + 30_000)).toThrow(NothingTickedError);
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()!.restEndsAt).toBe(NOW + 120_000);
    expect(db.select().from(workoutExercises).all().every((e) => e.note === null)).toBe(true);
  });
});

describe('finishWorkout runs the rule (7.3, 18.7)', () => {
  const BENCH = `${PUSH_A}:barbell-bench-press`;
  const OHP = `${PUSH_A}:barbell-overhead-press`;

  /** Stores `weight` as the routine exercise's next weight, so the next start plans it. */
  function plan(db: Db, routineExerciseId: string, weight: number, unit: WeightUnit = 'lb'): void {
    db.update(routineExercises)
      .set({ nextWeight: weight, nextWeightUnit: unit })
      .where(eq(routineExercises.id, routineExerciseId))
      .run();
  }

  function routineExercise(db: Db, id: string) {
    return db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;
  }

  /** Starts Push A and ticks its four bench sets at `weight` lb, one rep count per set. */
  function benchDay(db: Db, weight: number, reps: [number, number, number, number]): string {
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setIds(db).forEach((setId, i) => tick(db, setId, weight, reps[i], NOW + (i + 1) * 60_000));
    return id;
  }

  it('raises when every set hits the top: next time 140 lb, written to the routine and planned at the next start', () => {
    const db = seededDb();
    const id = benchDay(db, 135, [8, 8, 8, 8]);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      workingWeight: 135,
      workingUnit: 'lb',
      outcome: 'raised',
      nextWeight: 140,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });

    const next = startWorkoutFromDay(db, PUSH_A, NOW + DAY);
    expect(rawWorkoutExercise(db, next, 'barbell-bench-press')).toMatchObject({ plannedWeight: 140, plannedUnit: 'lb' });
  });

  it('holds at the working weight when one set misses the top', () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const id = benchDay(db, 135, [8, 8, 8, 7]);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      workingWeight: 135,
      workingUnit: 'lb',
      outcome: 'held',
      nextWeight: 135,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('holds the plan, not what was lifted, on an exercise flagged Rough sleep', () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const id = benchDay(db, 140, [8, 8, 8, 8]);
    setExerciseMark(db, getActiveWorkoutView(db)!.exercises[0].id, 'rough_sleep');
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      mark: 'rough_sleep',
      workingWeight: 140,
      workingUnit: 'lb',
      outcome: 'held_marked',
      nextWeight: 135,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('raises once the flag is cleared: nothing off is a normal day', () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const id = benchDay(db, 135, [8, 8, 8, 8]);
    const benchId = getActiveWorkoutView(db)!.exercises[0].id;
    setExerciseMark(db, benchId, 'rough_sleep');
    setExerciseMark(db, benchId, null);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      mark: null,
      outcome: 'raised',
      nextWeight: 140,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 140, nextWeightUnit: 'lb' });
  });

  it('drops an exercise with no ticks and leaves its routine next weight untouched', () => {
    const db = seededDb();
    // A plan in kg while Settings shows lb: the start plans it in lb, so had the rule run on OHP before the drop,
    // its no_sets outcome would write that lb plan back over the 40 kg.
    plan(db, OHP, 40, 'kg');
    const before = db.select().from(routineExercises).all().filter((r) => r.id !== BENCH);
    const id = benchDay(db, 135, [8, 8, 8, 8]);
    expect(rawWorkoutExercise(db, id, 'barbell-overhead-press').plannedUnit).toBe('lb');
    finishWorkout(db, id, NOW + HOUR);

    const kept = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(kept.map((e) => [e.exerciseId, e.outcome])).toEqual([['barbell-bench-press', 'raised']]);
    expect(routineExercise(db, OHP)).toMatchObject({ nextWeight: 40, nextWeightUnit: 'kg' });
    expect(db.select().from(routineExercises).all().filter((r) => r.id !== BENCH)).toEqual(before);
  });

  it("ignores today's override: a flagged exercise holds the plan, not the override", () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const id = benchDay(db, 150, [8, 8, 8, 8]);
    const benchId = getActiveWorkoutView(db)!.exercises[0].id;
    setOverride(db, benchId, 150, 'lb');
    setExerciseMark(db, benchId, 'pain');
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      overrideWeight: 150,
      workingWeight: 150,
      outcome: 'held_marked',
      nextWeight: 135,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('rounds a barbell raise with the plates in Settings: without 2.5 lb plates, 135 goes to 145', () => {
    const db = seededDb();
    setSetting(db, 'platesLb', { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1 });
    const id = benchDay(db, 135, [8, 8, 8, 8]);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      outcome: 'raised',
      nextWeight: 145,
      nextUnit: 'lb',
    });
    expect(routineExercise(db, BENCH)).toMatchObject({ nextWeight: 145, nextWeightUnit: 'lb' });
  });

  it('leaves the routine slot alone when it now holds another exercise (R74)', () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const id = benchDay(db, 135, [8, 8, 8, 8]);
    // The routine's bench slot is changed to another exercise while the workout runs.
    db.update(routineExercises).set({ exerciseId: 'incline-dumbbell-press' }).where(eq(routineExercises.id, BENCH)).run();
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({ outcome: 'raised', nextWeight: 140 });
    expect(routineExercise(db, BENCH)).toMatchObject({ exerciseId: 'incline-dumbbell-press', nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('a timed exercise has no rule: no_rule, and its routine next weight is kept', () => {
    const db = seededDb();
    const PLANK = 'premade-fullbody-3:a:plank';
    plan(db, PLANK, 25);
    const id = startWorkoutFromDay(db, 'premade-fullbody-3:a', NOW);
    const plankIndex = getActiveWorkoutView(db)!.exercises.findIndex((e) => e.exerciseId === 'plank');
    tickSet(db, setIds(db, plankIndex)[0], { weight: null, reps: null, durationS: 60, distance: null }, 'lb', NOW + 60_000, 'mi');
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'plank')).toMatchObject({
      routineExerciseId: PLANK,
      outcome: 'no_rule',
      workingWeight: null,
      nextWeight: null,
    });
    expect(routineExercise(db, PLANK)).toMatchObject({ nextWeight: 25, nextWeightUnit: 'lb' });
  });

  it('an empty workout has no rule: no_rule with the working weight, no next weight, and no routine row changes', () => {
    const db = seededDb();
    const before = db.select().from(routineExercises).all();
    const id = startEmptyWorkout(db, NOW);
    addExerciseToWorkout(db, id, 'barbell-bench-press');
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    expect(rawWorkoutExercise(db, id, 'barbell-bench-press')).toMatchObject({
      routineExerciseId: null,
      workingWeight: 135,
      workingUnit: 'lb',
      outcome: 'no_rule',
      nextWeight: null,
      nextUnit: null,
    });
    expect(db.select().from(routineExercises).all()).toEqual(before);
  });

  it('a refused finish writes nothing: no outcome on any exercise and no routine row changes', () => {
    const db = seededDb();
    plan(db, BENCH, 135);
    const before = db.select().from(routineExercises).all();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    untickSet(db, setIds(db)[0]);

    expect(() => finishWorkout(db, id, NOW + HOUR)).toThrow(NothingTickedError);
    const rows = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(rows).toHaveLength(5);
    expect(
      rows.every(
        (e) =>
          e.workingWeight === null &&
          e.workingUnit === null &&
          e.outcome === null &&
          e.nextWeight === null &&
          e.nextUnit === null,
      ),
    ).toBe(true);
    expect(db.select().from(routineExercises).all()).toEqual(before);
  });
});

describe('discardWorkout', () => {
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

describe('Up next only advances on a finished day', () => {
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

  it('an empty workout never moves Up next', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const id = startEmptyWorkout(db, NOW);
    addExerciseToWorkout(db, id, 'barbell-bench-press');
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    expect(getActiveWorkoutId(db)).toBeNull();
    expect(getUpNext(db)!.dayName).toBe('Push A');
    expect(nextDayIndex(db, PPL)).toBe(0);
  });

  it('an empty workout leaves Up next where the last finished day put it', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    runDay(db, PUSH_A, NOW, 135, 8);
    expect(getUpNext(db)!.dayName).toBe('Pull A');

    const id = startEmptyWorkout(db, NOW + DAY);
    addExerciseToWorkout(db, id, 'barbell-bench-press');
    tick(db, setIds(db)[0], 135, 8, NOW + DAY + 60_000);
    finishWorkout(db, id, NOW + DAY + HOUR);

    expect(getUpNext(db)!.dayName).toBe('Pull A');
    expect(nextDayIndex(db, PPL)).toBe(1);
  });
});

describe('getNextDayTitle', () => {
  it("names the active routine's day after the workout's day", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(getNextDayTitle(db, id)).toBe('Pull A');
  });

  it('wraps from the last day to the first', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const id = startWorkoutFromDay(db, 'premade-ppl-6:legs-b', NOW);
    expect(getNextDayTitle(db, id)).toBe('Push A');
  });

  it('puts the routine name before a one- or two-character day name', () => {
    const db = seededDb();
    setActiveRoutine(db, 'premade-5x5-3');
    const id = startWorkoutFromDay(db, FIVE_B, NOW);
    expect(getNextDayTitle(db, id)).toBe('5×5 A');
  });

  it('is null for a day of a routine that is not the active one', () => {
    const db = seededDb();
    setActiveRoutine(db, 'premade-5x5-3');
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(getNextDayTitle(db, id)).toBeNull();
  });

  it('is null for an empty workout and for an unknown workout', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const id = startEmptyWorkout(db, NOW);
    expect(getNextDayTitle(db, id)).toBeNull();
    expect(getNextDayTitle(db, 'no-such-workout')).toBeNull();
  });

  it('is null when the day was deleted after the workout started', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    // Only the day goes: its routine is still the active one.
    db.delete(routineDays).where(eq(routineDays.id, PUSH_A)).run();
    expect(getSettings(db).activeRoutineId).toBe(PPL);
    expect(getNextDayTitle(db, id)).toBeNull();
  });

  it('names the day finish moves Up next to, as the Up next card titles it', () => {
    const db = seededDb();
    setActiveRoutine(db, 'premade-5x5-3');
    const id = startWorkoutFromDay(db, FIVE_A, NOW);
    const preview = getNextDayTitle(db, id);
    tick(db, setIds(db)[0], 135, 5, NOW + 60_000);
    finishWorkout(db, id, NOW + HOUR);

    const upNext = getUpNext(db)!;
    expect(preview).toBe(dayTitle(upNext.routineName, upNext.dayName));
    expect(preview).toBe('5×5 B');
    expect(nextDayIndex(db, 'premade-5x5-3')).toBe(1);
  });
});

describe('tickSet and untickSet', () => {
  it('records the values, the unit of the weight and when it was ticked', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a, b] = setIds(db);
    tickSet(db, a, { weight: 82.5, reps: 8, durationS: null, distance: null }, 'kg', NOW + 5_000, 'mi');
    tickSet(db, b, { weight: 0, reps: 10, durationS: null, distance: null }, 'lb', NOW + 6_000, 'mi');
    const [rowA, rowB] = db.select().from(sets).all().filter((s) => s.id === a || s.id === b);
    expect(rowA).toMatchObject({ weight: 82.5, weightUnit: 'kg', reps: 8, done: true, completedAt: NOW + 5_000 });
    // A zero added weight is still a weight, logged in the entry unit.
    expect(rowB).toMatchObject({ weight: 0, weightUnit: 'lb', reps: 10, done: true });
  });

  it('leaves the weight unit empty when the set has no weight', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a] = setIds(db);
    tickSet(db, a, { weight: null, reps: null, durationS: 45, distance: null }, 'kg', NOW, 'mi');
    expect(db.select().from(sets).where(eq(sets.id, a)).get()).toMatchObject({
      weight: null,
      weightUnit: null,
      reps: null,
      durationS: 45,
      done: true,
    });
  });

  it('leaves the distance unit empty on a weighted tick', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, NOW);
    const [a] = setIds(db);
    tickSet(db, a, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', NOW, 'km');
    expect(db.select().from(sets).where(eq(sets.id, a)).get()).toMatchObject({
      weight: 135,
      weightUnit: 'lb',
      distance: null,
      distanceUnit: null,
    });
  });

  it('records the unit a distance was logged in, and it shows as the previous set', () => {
    const db = seededDb();
    // No bundled exercise logs distance and time, so add a custom one to an empty workout.
    db.insert(exercises)
      .values({
        id: 'custom-run',
        name: 'Run',
        aliases: [],
        primaryMuscles: ['quads'],
        secondaryMuscles: [],
        equipment: 'bodyweight',
        pattern: 'core',
        loggingType: 'distance_time',
        isCustom: true,
        createdAt: NOW,
      })
      .run();
    const workoutId = startEmptyWorkout(db, NOW);
    db.insert(workoutExercises)
      .values({ id: 'we-run', workoutId, exerciseId: 'custom-run', position: 0, showRpe: false })
      .run();
    db.insert(sets).values({ id: 'set-run', workoutExerciseId: 'we-run', position: 0, setType: 'working' }).run();

    // The weight unit is passed too, but with no weight it is not stored.
    tickSet(db, 'set-run', { weight: null, reps: null, durationS: 1500, distance: 5 }, 'lb', NOW + 1_000, 'km');
    expect(db.select().from(sets).where(eq(sets.id, 'set-run')).get()).toMatchObject({
      weight: null,
      weightUnit: null,
      durationS: 1500,
      distance: 5,
      distanceUnit: 'km',
      done: true,
    });

    finishWorkout(db, workoutId, NOW + HOUR);
    const [previous] = getPreviousSets(db, 'custom-run', 'x');
    expect(previous).toMatchObject({ distance: 5, distanceUnit: 'km', durationS: 1500 });
    expect(formatPrevious(previous, 'distance_time', 'lb')).toBe('5 km · 25:00');
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

  it('moves only the end of a started rest: the set that started it stays (R38)', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const [first] = setIds(db);
    startRest(db, id, NOW + 120_000, first);

    setRestEndsAt(db, id, NOW + 105_000);

    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: NOW + 105_000, restSetId: first });
  });

  it('clears the set that started the rest with the end (R38)', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    startRest(db, id, NOW + 120_000, setIds(db)[0]);

    setRestEndsAt(db, id, null);

    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: null, restSetId: null });
  });
});

describe('startRest (R38)', () => {
  it('stores the end and the set that started the rest; a later start replaces both', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: null, restSetId: null });
    const [first, second] = setIds(db);

    startRest(db, id, NOW + 120_000, first);
    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: NOW + 120_000, restSetId: first });

    startRest(db, id, NOW + 200_000, second);
    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: NOW + 200_000, restSetId: second });
  });
});

describe('clearRestEndsAtIf (R31)', () => {
  it('clears the set that started the rest only when it clears the end (R38)', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    const [first, second] = setIds(db);
    startRest(db, id, NOW + 120_000, first);
    startRest(db, id, NOW + 200_000, second);

    clearRestEndsAtIf(db, id, NOW + 120_000);
    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: NOW + 200_000, restSetId: second });

    clearRestEndsAtIf(db, id, NOW + 200_000);
    expect(getActiveWorkoutView(db)).toMatchObject({ restEndsAt: null, restSetId: null });
  });

  it('clears the rest end when it is still the one given', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setRestEndsAt(db, id, NOW + 120_000);

    clearRestEndsAtIf(db, id, NOW + 120_000);

    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: null });
  });

  it('leaves a newer rest end alone: a new tick that landed meanwhile keeps its rest', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    setRestEndsAt(db, id, NOW + 120_000);
    setRestEndsAt(db, id, NOW + 200_000); // ticked again before the first end was cleared

    clearRestEndsAtIf(db, id, NOW + 120_000);

    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: NOW + 200_000 });
  });

  it('does nothing when no rest is stored, or for another workout', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);

    clearRestEndsAtIf(db, id, NOW + 120_000);
    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: null });

    setRestEndsAt(db, id, NOW + 120_000);
    clearRestEndsAtIf(db, 'some-other-workout', NOW + 120_000);
    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: NOW + 120_000 });
  });
});

describe('getActiveRest', () => {
  it('is null with no active workout', () => {
    expect(getActiveRest(seededDb())).toBeNull();
  });

  it("reads the active workout's id and stored rest end, null when none is running", () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: null });

    setRestEndsAt(db, id, NOW + 120_000);
    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: NOW + 120_000 });

    setRestEndsAt(db, id, null);
    expect(getActiveRest(db)).toEqual({ workoutId: id, restEndsAt: null });
  });

  it('ignores a finished workout', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, setIds(db)[0], 135, 8, NOW + 60_000);
    setRestEndsAt(db, id, NOW + 120_000);
    finishWorkout(db, id, NOW + 90_000);

    expect(getActiveRest(db)).toBeNull();
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
    tickSet(db, setIds(db)[0], { weight: 82.5, reps: 8, durationS: null, distance: null }, 'kg', NOW + 1_000, 'mi');
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
