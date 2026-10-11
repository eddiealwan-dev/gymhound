/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { totalVolume } from '../../domain/volume';
import { routineExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { setRestSeconds } from './exercisePrefsRepo';
import { addExerciseToWorkout, addWarmupSet, setExerciseMark, updateSet } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView, getFinishSummary, getTrainingDates, getVolumeSetsSince } from './workoutViewsRepo';

const PUSH_A = 'premade-ppl-6:push-a';
const MINUTE = 60_000;
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();
const OCT_6 = new Date(2026, 9, 6, 9, 0).getTime();
const OCT_9 = new Date(2026, 9, 9, 9, 0).getTime();

/** Ticks a set at `weight` x `reps` in lb. */
function tick(db: Db, setId: string, weight: number, reps: number, at: number): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, 'lb', at, 'mi');
}

/** The ids of the active workout's sets for the exercise at `exerciseIndex` (Push A starts with bench press). */
function setIds(db: Db, exerciseIndex = 0): string[] {
  return getActiveWorkoutView(db)!.exercises[exerciseIndex].sets.map((s) => s.id);
}

/** Starts Push A at `start`, ticks `lifts` on its bench press, and finishes `minutes` later. */
function runPushA(db: Db, start: number, lifts: [weight: number, reps: number][], minutes = 60): string {
  const id = startWorkoutFromDay(db, PUSH_A, start);
  const ids = setIds(db);
  lifts.forEach(([weight, reps], i) => tick(db, ids[i], weight, reps, start + (i + 1) * MINUTE));
  finishWorkout(db, id, start + minutes * MINUTE);
  return id;
}

/**
 * Three bench-press workouts:
 * - Oct 1, finished: two working sets at 100 lb x 5.
 * - Oct 6, finished 72 minutes later: a working set at 135 lb x 5 and a 45 lb x 10 warm-up.
 * - Oct 9, active: a working set at 140 lb x 3 and a ticked plank. Every other set is unticked.
 */
function buildHistory(db: Db): { oct1: string; oct6: string; active: string } {
  const oct1 = runPushA(db, OCT_1, [
    [100, 5],
    [100, 5],
  ]);

  const oct6 = startWorkoutFromDay(db, PUSH_A, OCT_6);
  const [working, warmup] = setIds(db);
  tick(db, working, 135, 5, OCT_6 + MINUTE);
  updateSet(db, warmup, { setType: 'warmup' });
  tick(db, warmup, 45, 10, OCT_6 + 2 * MINUTE);
  finishWorkout(db, oct6, OCT_6 + 72 * MINUTE);

  const active = startWorkoutFromDay(db, PUSH_A, OCT_9);
  tick(db, setIds(db)[0], 140, 3, OCT_9 + MINUTE);
  addExerciseToWorkout(db, active, 'plank');
  const plank = setIds(db, getActiveWorkoutView(db)!.exercises.length - 1)[0];
  tickSet(db, plank, { weight: null, reps: null, durationS: 45, distance: null }, 'lb', OCT_9 + 2 * MINUTE, 'mi');

  return { oct1, oct6, active };
}

describe('getTrainingDates', () => {
  it('is the distinct local dates of finished workouts, earliest first, without the active workout', () => {
    const db = seededDb();
    buildHistory(db);
    expect(getTrainingDates(db)).toEqual(['2026-10-01', '2026-10-06']);
  });

  it('lists a date once when several workouts finished on it', () => {
    const db = seededDb();
    runPushA(db, new Date(2026, 9, 6, 18, 0).getTime(), [[135, 5]]);
    runPushA(db, OCT_6, [[135, 5]]);
    expect(getTrainingDates(db)).toEqual(['2026-10-06']);
  });

  it('is empty when nothing has finished', () => {
    const db = seededDb();
    expect(getTrainingDates(db)).toEqual([]);
    startEmptyWorkout(db, OCT_9);
    expect(getTrainingDates(db)).toEqual([]);
  });
});

describe('getVolumeSetsSince', () => {
  it('covers the finished and the active workouts from the date on, and none before it', () => {
    const db = seededDb();
    buildHistory(db);
    const done = getVolumeSetsSince(db, '2026-10-05').filter((s) => s.done);
    expect(done.map((s) => [s.loggingType, s.setType, s.weight, s.weightUnit, s.reps])).toEqual([
      ['weighted', 'working', 135, 'lb', 5],
      ['weighted', 'warmup', 45, 'lb', 10],
      ['weighted', 'working', 140, 'lb', 3],
      ['timed', 'working', null, null, null],
    ]);
  });

  it('returns every set of those workouts, ticked or not, for totalVolume to filter', () => {
    const db = seededDb();
    buildHistory(db);
    const activeSets = getActiveWorkoutView(db)!.exercises.reduce((n, e) => n + e.sets.length, 0);
    const result = getVolumeSetsSince(db, '2026-10-05');
    expect(result).toHaveLength(2 + activeSets);
    expect(result.filter((s) => !s.done)).toHaveLength(activeSets - 2);
    expect(result.filter((s) => !s.done).every((s) => s.weight === null && s.reps === null)).toBe(true);
  });

  it('includes the given date itself', () => {
    const db = seededDb();
    buildHistory(db);
    const doneSince = (from: string) => getVolumeSetsSince(db, from).filter((s) => s.done).length;
    expect(doneSince('2026-10-01')).toBe(6);
    expect(doneSince('2026-10-06')).toBe(4);
    expect(doneSince('2026-10-07')).toBe(2);
    expect(doneSince('2026-10-09')).toBe(2);
    expect(doneSince('2026-10-10')).toBe(0);
  });

  it('feeds totalVolume: warm-ups, unticked sets and timed sets add nothing', () => {
    const db = seededDb();
    buildHistory(db);
    // 135 x 5 (Oct 6) + 140 x 3 (active); the 45 lb warm-up, the unticked sets and the plank are left out.
    expect(totalVolume(getVolumeSetsSince(db, '2026-10-05'), 'lb')).toBe(1095);
    expect(totalVolume(getVolumeSetsSince(db, '2026-10-01'), 'lb')).toBe(2095);
  });

  it('is empty when there are no workouts', () => {
    expect(getVolumeSetsSince(seededDb(), '2026-10-05')).toEqual([]);
  });
});

describe('getFinishSummary', () => {
  it('has the id, name, duration, volume and the number of done sets', () => {
    const db = seededDb();
    const { oct6 } = buildHistory(db);
    // Volume leaves the warm-up out; the set count does not.
    expect(getFinishSummary(db, oct6, 'lb')).toEqual({
      id: oct6,
      name: 'Push A',
      durationMs: 72 * MINUTE,
      volume: 675,
      setCount: 2,
      // One working set of the four missed: the bench holds at what was lifted.
      next: [{ name: 'Barbell bench press', outcome: 'held', nextWeight: 135, nextUnit: 'lb', mark: null }],
    });
  });

  it('totals the volume in the display unit', () => {
    const db = seededDb();
    const { oct1, oct6 } = buildHistory(db);
    expect(getFinishSummary(db, oct1, 'lb')).toMatchObject({ durationMs: 60 * MINUTE, volume: 1000, setCount: 2 });
    // 675 lb is 306.17 kg.
    expect(getFinishSummary(db, oct6, 'kg').volume).toBe(306);
  });

  it('throws for a workout that does not exist', () => {
    const db = seededDb();
    expect(() => getFinishSummary(db, 'missing', 'lb')).toThrow('No finished workout with id missing.');
  });

  it('throws for a workout that is still active', () => {
    const db = seededDb();
    const { active } = buildHistory(db);
    expect(() => getFinishSummary(db, active, 'lb')).toThrow(`No finished workout with id ${active}.`);
  });
});

describe('getFinishSummary: next time for each exercise (8.5, R64)', () => {
  /** Stores `weight` lb as the Push A exercise's next weight, so the next start plans it. */
  function plan(db: Db, exerciseId: string, weight: number): void {
    db.update(routineExercises)
      .set({ nextWeight: weight, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:${exerciseId}`))
      .run();
  }

  it('lists each exercise with a rule and a next weight, in workout order, after a real finish', () => {
    const db = seededDb();
    plan(db, 'barbell-overhead-press', 95);
    plan(db, 'cable-triceps-pushdown', 40);
    const id = startWorkoutFromDay(db, PUSH_A, OCT_9);
    const [bench, ohp, incline, , pushdown] = getActiveWorkoutView(db)!.exercises;
    // Bench: every set hits 8, so it is raised.
    setIds(db, 0).forEach((setId, i) => tick(db, setId, 135, 8, OCT_9 + (i + 1) * MINUTE));
    // Overhead press: every set hits 12, but it is flagged Pain, so the plan holds.
    setIds(db, 1).forEach((setId, i) => tick(db, setId, 100, 12, OCT_9 + (i + 10) * MINUTE));
    setExerciseMark(db, ohp.id, 'pain');
    // Incline press: one set of three, so it holds at what was lifted.
    tick(db, setIds(db, 2)[0], 50, 8, OCT_9 + 20 * MINUTE);
    // Lateral raise: nothing ticked, so the finish drops it.
    // Pushdown: only a warm-up ticked, so the plan holds.
    tick(db, addWarmupSet(db, pushdown.id), 20, 10, OCT_9 + 30 * MINUTE);
    // An exercise added on the day has no rule, and neither has a timed one.
    addExerciseToWorkout(db, id, 'barbell-curl');
    tick(db, setIds(db, 5)[0], 65, 10, OCT_9 + 40 * MINUTE);
    addExerciseToWorkout(db, id, 'plank');
    tickSet(db, setIds(db, 6)[0], { weight: null, reps: null, durationS: 45, distance: null }, 'lb', OCT_9 + 41 * MINUTE, 'mi');
    expect([bench.name, incline.name]).toEqual(['Barbell bench press', 'Incline dumbbell press']);
    finishWorkout(db, id, OCT_9 + 60 * MINUTE);

    expect(getFinishSummary(db, id, 'lb').next).toEqual([
      { name: 'Barbell bench press', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
      { name: 'Overhead press', outcome: 'held_marked', nextWeight: 95, nextUnit: 'lb', mark: 'pain' },
      { name: 'Incline dumbbell press', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
      { name: 'Triceps pushdown', outcome: 'no_sets', nextWeight: 40, nextUnit: 'lb', mark: null },
    ]);
  });

  it('leaves out an exercise with no next weight: only a warm-up ticked and nothing planned', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, OCT_9);
    tick(db, addWarmupSet(db, getActiveWorkoutView(db)!.exercises[0].id), 45, 10, OCT_9 + MINUTE);
    finishWorkout(db, id, OCT_9 + 60 * MINUTE);

    expect(getFinishSummary(db, id, 'lb').next).toEqual([]);
  });

  it('is empty for an empty workout: nothing in it has a rule', () => {
    const db = seededDb();
    const id = startEmptyWorkout(db, OCT_9);
    addExerciseToWorkout(db, id, 'barbell-bench-press');
    tick(db, setIds(db)[0], 135, 8, OCT_9 + MINUTE);
    finishWorkout(db, id, OCT_9 + 60 * MINUTE);

    expect(getFinishSummary(db, id, 'lb').next).toEqual([]);
  });

  it('keeps the unit each next weight is in, whatever the display unit', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, OCT_9);
    setIds(db).forEach((setId) => tickSet(db, setId, { weight: 60, reps: 8, durationS: null, distance: null }, 'kg', OCT_9 + MINUTE, 'mi'));
    finishWorkout(db, id, OCT_9 + 60 * MINUTE);

    expect(getFinishSummary(db, id, 'lb').next).toEqual([
      { name: 'Barbell bench press', outcome: 'raised', nextWeight: 62.5, nextUnit: 'kg', mark: null },
    ]);
  });
});

describe('getActiveWorkoutView: rest per exercise and tick times (Task 21)', () => {
  it("carries each exercise's rest pref (null with none) and each set's completedAt (null until ticked)", () => {
    const db = seededDb();
    setRestSeconds(db, 'barbell-bench-press', 90, OCT_9);
    startWorkoutFromDay(db, PUSH_A, OCT_9);
    const [first] = setIds(db);
    tick(db, first, 135, 5, OCT_9 + MINUTE);

    const [bench, second] = getActiveWorkoutView(db)!.exercises;
    expect(bench.exerciseId).toBe('barbell-bench-press');
    expect(bench.restSeconds).toBe(90);
    expect(second.restSeconds).toBeNull();
    expect(bench.sets.map((s) => s.completedAt)).toEqual([OCT_9 + MINUTE, null, null, null]);
  });

  it('carries Off as 0, not as null', () => {
    const db = seededDb();
    setRestSeconds(db, 'barbell-bench-press', 0, OCT_9);
    startWorkoutFromDay(db, PUSH_A, OCT_9);
    expect(getActiveWorkoutView(db)!.exercises[0].restSeconds).toBe(0);
  });
});
