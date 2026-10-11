/** @jest-environment node */
import { count, eq } from 'drizzle-orm';
import type { SavedSet, SetType } from '../../domain/types';
import { exercises, savedWorkoutExercises, savedWorkouts, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import {
  deleteSavedWorkout,
  getSavedWorkout,
  listSavedWorkouts,
  rememberSavedWorkout,
  renameSavedWorkout,
  savedWorkoutOf,
  saveWorkoutAs,
  startSavedWorkout,
} from './savedWorkoutsRepo';
import { addExerciseToWorkout, addSet, addWarmupSet, toggleSupersetWithNext } from './workoutEditRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';
import {
  ActiveWorkoutExistsError,
  discardWorkout,
  finishWorkout,
  startEmptyWorkout,
  startWorkoutFromDay,
  tickSet,
} from './workoutsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';
const OHP = 'barbell-overhead-press';
const LATERAL = 'dumbbell-lateral-raise';
const PUSHDOWN = 'cable-triceps-pushdown';
const SQUAT = 'barbell-back-squat';

const lb = (weight: number, reps: number, setType: SetType = 'working'): SavedSet => ({
  setType,
  weight,
  weightUnit: 'lb',
  reps,
  durationS: null,
  distance: null,
  distanceUnit: null,
});

function tick(db: Db, setId: string, weight: number, reps: number, at: number): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, 'lb', at, 'mi');
}

/** The active workout's exercise for `exerciseId`. */
function active(db: Db, exerciseId: string) {
  const e = getActiveWorkoutView(db)!.exercises.find((x) => x.exerciseId === exerciseId);
  if (!e) throw new Error(`${exerciseId} is not in the active workout`);
  return e;
}

/**
 * Push A as the template is first logged: bench with a warmup and 185 × 5 × 3, 175 × 8; overhead press two of three
 * sets; incline skipped; lateral raise and pushdown as a superset with one set each. Finished at `NOW + HOUR`.
 */
function finishedPushA(db: Db): string {
  const id = startWorkoutFromDay(db, PUSH_A, NOW);
  const bench = active(db, BENCH);
  addWarmupSet(db, bench.id);
  const benchSets = active(db, BENCH).sets.map((s) => s.id);
  tick(db, benchSets[0], 95, 10, NOW + 1);
  tick(db, benchSets[1], 185, 5, NOW + 2);
  tick(db, benchSets[2], 185, 5, NOW + 3);
  tick(db, benchSets[3], 185, 5, NOW + 4);
  tick(db, benchSets[4], 175, 8, NOW + 5);
  const ohp = active(db, OHP).sets.map((s) => s.id);
  tick(db, ohp[0], 95, 10, NOW + 6);
  tick(db, ohp[1], 95, 9, NOW + 7);
  toggleSupersetWithNext(db, active(db, LATERAL).id);
  tick(db, active(db, LATERAL).sets[0].id, 20, 15, NOW + 8);
  tick(db, active(db, PUSHDOWN).sets[0].id, 50, 12, NOW + 9);
  finishWorkout(db, id, NOW + HOUR);
  return id;
}

function savedPushA(db: Db): string {
  return saveWorkoutAs(db, finishedPushA(db), 'Push A', NOW + 2 * HOUR);
}

/** A saved workout with Bench twice: 3 × 185 × 5, then a back-off 2 × 135 × 12. */
function savedTwoBench(db: Db): string {
  const id = startEmptyWorkout(db, NOW);
  addExerciseToWorkout(db, id, BENCH);
  addExerciseToWorkout(db, id, BENCH);
  const [top, backOff] = getActiveWorkoutView(db)!.exercises;
  addSet(db, top.id);
  addSet(db, top.id);
  addSet(db, backOff.id);
  const view = getActiveWorkoutView(db)!;
  view.exercises[0].sets.forEach((s, i) => tick(db, s.id, 185, 5, NOW + i));
  view.exercises[1].sets.forEach((s, i) => tick(db, s.id, 135, 12, NOW + 10 + i));
  finishWorkout(db, id, NOW + HOUR);
  const savedId = saveWorkoutAs(db, id, 'Bench day', NOW + 2 * HOUR);
  expect(getSavedWorkout(db, savedId)!.exercises.map((e) => e.sets.length)).toEqual([3, 2]);
  return savedId;
}

const countOf = (db: Db, table: typeof workouts | typeof savedWorkouts) => db.select({ n: count() }).from(table).get()!.n;

describe('saveWorkoutAs', () => {
  it("keeps the finished workout's exercises in order, their superset groups and done sets only", () => {
    const db = seededDb();
    const savedId = saveWorkoutAs(db, finishedPushA(db), '  Push A  ', NOW + 2 * HOUR);

    const saved = getSavedWorkout(db, savedId)!;
    expect(saved.name).toBe('Push A');
    expect(saved.exercises.map((e) => e.exerciseId)).toEqual([BENCH, OHP, LATERAL, PUSHDOWN]);
    expect(saved.exercises[0]).toMatchObject({ name: 'Barbell bench press', loggingType: 'weighted', equipment: 'barbell' });
    expect(saved.exercises[0].sets).toEqual([lb(95, 10, 'warmup'), lb(185, 5), lb(185, 5), lb(185, 5), lb(175, 8)]);
    expect(saved.exercises[1].sets).toEqual([lb(95, 10), lb(95, 9)]);
    expect(saved.exercises[0].supersetGroup).toBeNull();
    expect(saved.exercises[1].supersetGroup).toBeNull();
    expect(saved.exercises[2].supersetGroup).not.toBeNull();
    expect(saved.exercises[3].supersetGroup).toBe(saved.exercises[2].supersetGroup);

    const row = db.select().from(savedWorkouts).where(eq(savedWorkouts.id, savedId)).get()!;
    expect(row).toMatchObject({ createdAt: NOW + 2 * HOUR, updatedAt: NOW + 2 * HOUR });
    const positions = db
      .select({ position: savedWorkoutExercises.position })
      .from(savedWorkoutExercises)
      .where(eq(savedWorkoutExercises.savedWorkoutId, savedId))
      .all()
      .map((r) => r.position)
      .sort();
    expect(positions).toEqual([0, 1, 2, 3]);
  });

  it('drops a superset group left with one member', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    toggleSupersetWithNext(db, active(db, LATERAL).id);
    tick(db, active(db, LATERAL).sets[0].id, 20, 15, NOW + 1);
    finishWorkout(db, id, NOW + HOUR);
    const saved = getSavedWorkout(db, saveWorkoutAs(db, id, 'Push A', NOW + 2 * HOUR))!;
    expect(saved.exercises.map((e) => [e.exerciseId, e.supersetGroup])).toEqual([[LATERAL, null]]);
  });

  it('throws for an active workout, saving nothing', () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, NOW);
    tick(db, active(db, BENCH).sets[0].id, 185, 5, NOW + 1);
    expect(() => saveWorkoutAs(db, id, 'Push A', NOW + HOUR)).toThrow();
    expect(() => saveWorkoutAs(db, 'no-such-workout', 'Push A', NOW + HOUR)).toThrow();
    expect(countOf(db, savedWorkouts)).toBe(0);
  });

  it('throws "Nothing logged to save." when no exercise has a done set, saving nothing', () => {
    const db = seededDb();
    const id = finishedPushA(db);
    // A history edit could leave a finished workout with nothing done.
    db.update(sets).set({ done: false }).run();
    expect(() => saveWorkoutAs(db, id, 'Push A', NOW + 2 * HOUR)).toThrow('Nothing logged to save.');
    expect(countOf(db, savedWorkouts)).toBe(0);
  });

  it('throws for an invalid name, saving nothing', () => {
    const db = seededDb();
    const id = finishedPushA(db);
    expect(() => saveWorkoutAs(db, id, '  ', NOW + 2 * HOUR)).toThrow('Give the workout a name.');
    expect(() => saveWorkoutAs(db, id, 'a'.repeat(61), NOW + 2 * HOUR)).toThrow('Keep the name to 60 characters.');
    expect(countOf(db, savedWorkouts)).toBe(0);
  });
});

describe('listSavedWorkouts, renameSavedWorkout and deleteSavedWorkout', () => {
  it('lists by name ignoring case, with exercise counts', () => {
    const db = seededDb();
    const id = finishedPushA(db);
    saveWorkoutAs(db, id, 'push A', NOW + 2 * HOUR);
    const b = saveWorkoutAs(db, id, 'Arms', NOW + 3 * HOUR);
    saveWorkoutAs(db, id, 'Zed', NOW + 4 * HOUR);
    expect(listSavedWorkouts(db).map((s) => s.name)).toEqual(['Arms', 'push A', 'Zed']);
    expect(listSavedWorkouts(db)[0]).toEqual({ id: b, name: 'Arms', exerciseCount: 4, updatedAt: NOW + 3 * HOUR });
  });

  it('is empty with nothing saved', () => {
    expect(listSavedWorkouts(seededDb())).toEqual([]);
  });

  it('renames, trimmed, and refuses an invalid name', () => {
    const db = seededDb();
    const id = savedPushA(db);
    renameSavedWorkout(db, id, '  Chest day ', NOW + DAY);
    expect(listSavedWorkouts(db)[0]).toMatchObject({ name: 'Chest day', updatedAt: NOW + DAY });
    expect(() => renameSavedWorkout(db, id, '', NOW + DAY)).toThrow('Give the workout a name.');
    expect(getSavedWorkout(db, id)!.name).toBe('Chest day');
  });

  it('deletes with its exercises; finished workouts keep their history', () => {
    const db = seededDb();
    const id = savedPushA(db);
    deleteSavedWorkout(db, id);
    expect(getSavedWorkout(db, id)).toBeNull();
    expect(listSavedWorkouts(db)).toEqual([]);
    expect(db.select({ n: count() }).from(savedWorkoutExercises).get()!.n).toBe(0);
    expect(countOf(db, workouts)).toBe(1);
  });

  it('getSavedWorkout is null for an unknown id', () => {
    expect(getSavedWorkout(seededDb(), 'nope')).toBeNull();
  });
});

describe('startSavedWorkout', () => {
  it('creates the remembered set types and counts, empty, with no rule and no planned weight', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const id = startSavedWorkout(db, savedId, NOW + DAY);

    const workout = db.select().from(workouts).where(eq(workouts.id, id)).get()!;
    expect(workout).toMatchObject({
      name: 'Push A',
      status: 'active',
      savedWorkoutId: savedId,
      routineId: null,
      routineDayId: null,
      startedAt: NOW + DAY,
    });

    const view = getActiveWorkoutView(db)!;
    expect(view.exercises.map((e) => e.exerciseId)).toEqual([BENCH, OHP, LATERAL, PUSHDOWN]);
    expect(view.exercises[0].sets.map((s) => s.setType)).toEqual(['warmup', 'working', 'working', 'working', 'working']);
    expect(view.exercises[1].sets).toHaveLength(2);
    for (const e of view.exercises) {
      expect(e).toMatchObject({ rule: null, plannedWeight: null, plannedUnit: null, showRpe: false });
      for (const s of e.sets) {
        expect(s).toMatchObject({ done: false, weight: null, reps: null, durationS: null, distance: null });
      }
    }
    expect(view.exercises[2].supersetGroup).not.toBeNull();
    expect(view.exercises[3].supersetGroup).toBe(view.exercises[2].supersetGroup);
    expect(view.exercises[0].supersetGroup).toBeNull();
    // Previous comes from history, as for any exercise.
    expect(view.exercises[0].previous.map((p) => [p.weight, p.reps])).toEqual([
      [95, 10],
      [185, 5],
      [185, 5],
      [185, 5],
      [175, 8],
    ]);
    const rows = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all();
    expect(rows.every((r) => r.routineExerciseId === null && r.ruleSetCount === null)).toBe(true);
  });

  it('throws ActiveWorkoutExistsError while a workout is active, inserting nothing', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    startEmptyWorkout(db, NOW + DAY);
    const before = countOf(db, workouts);
    expect(() => startSavedWorkout(db, savedId, NOW + DAY + 1)).toThrow(ActiveWorkoutExistsError);
    expect(countOf(db, workouts)).toBe(before);
  });

  it('throws for an unknown saved workout', () => {
    expect(() => startSavedWorkout(seededDb(), 'nope', NOW)).toThrow();
  });

  it('starts an exercise archived since saving, with its name', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, OHP)).run();

    expect(getSavedWorkout(db, savedId)!.exercises[1]).toMatchObject({ exerciseId: OHP, name: 'Overhead press' });
    startSavedWorkout(db, savedId, NOW + DAY);
    const ohp = active(db, OHP);
    expect(ohp.name).toBe('Overhead press');
    expect(ohp.sets).toHaveLength(2);
  });
});

describe('rememberSavedWorkout (at finish)', () => {
  it("rewrites a logged exercise's sets, keeps a skipped one's and ignores an added one", () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const before = getSavedWorkout(db, savedId)!;

    const id = startSavedWorkout(db, savedId, NOW + DAY);
    const bench = active(db, BENCH).sets.map((s) => s.id);
    tick(db, bench[0], 135, 8, NOW + DAY + 1);
    tick(db, bench[1], 190, 5, NOW + DAY + 2);
    tick(db, bench[2], 190, 4, NOW + DAY + 3);
    // Overhead press, lateral raise and pushdown are skipped.
    const squat = addExerciseToWorkout(db, id, SQUAT);
    tick(db, active(db, SQUAT).sets[0].id, 225, 5, NOW + DAY + 4);
    expect(squat).toBeTruthy();
    finishWorkout(db, id, NOW + DAY + HOUR);

    const after = getSavedWorkout(db, savedId)!;
    expect(after.exercises.map((e) => e.exerciseId)).toEqual([BENCH, OHP, LATERAL, PUSHDOWN]);
    expect(after.exercises[0].sets).toEqual([lb(135, 8, 'warmup'), lb(190, 5), lb(190, 4)]);
    expect(after.exercises.slice(1)).toEqual(before.exercises.slice(1));
    expect(db.select().from(savedWorkouts).where(eq(savedWorkouts.id, savedId)).get()!.updatedAt).toBe(NOW + DAY + HOUR);
    expect(savedWorkoutOf(db, id)).toEqual({ id: savedId, name: 'Push A' });
  });

  it('matches each saved row of an exercise to the logged block of it in the same order', () => {
    const db = seededDb();
    const savedId = savedTwoBench(db);
    const id = startSavedWorkout(db, savedId, NOW + DAY);
    const [top, backOff] = getActiveWorkoutView(db)!.exercises;
    top.sets.forEach((s, i) => tick(db, s.id, 190, 5, NOW + DAY + i));
    backOff.sets.forEach((s, i) => tick(db, s.id, 140, 12, NOW + DAY + 10 + i));
    finishWorkout(db, id, NOW + DAY + HOUR);
    const after = getSavedWorkout(db, savedId)!;
    expect(after.exercises.map((e) => e.sets)).toEqual([
      [lb(190, 5), lb(190, 5), lb(190, 5)],
      [lb(140, 12), lb(140, 12)],
    ]);
  });

  it('counts only logged blocks: with the first one skipped, the back-off goes to the first saved row', () => {
    const db = seededDb();
    const savedId = savedTwoBench(db);
    const before = getSavedWorkout(db, savedId)!;
    const id = startSavedWorkout(db, savedId, NOW + DAY);
    const backOff = getActiveWorkoutView(db)!.exercises[1];
    backOff.sets.forEach((s, i) => tick(db, s.id, 140, 12, NOW + DAY + i));
    finishWorkout(db, id, NOW + DAY + HOUR);
    const after = getSavedWorkout(db, savedId)!;
    expect(after.exercises[0].sets).toEqual([lb(140, 12), lb(140, 12)]);
    expect(after.exercises[1].sets).toEqual(before.exercises[1].sets);
  });

  it('ignores an extra logged block of an exercise', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const id = startSavedWorkout(db, savedId, NOW + DAY);
    tick(db, active(db, PUSHDOWN).sets[0].id, 55, 12, NOW + DAY + 1);
    addExerciseToWorkout(db, id, PUSHDOWN);
    const second = getActiveWorkoutView(db)!.exercises.filter((e) => e.exerciseId === PUSHDOWN)[1];
    tick(db, second.sets[0].id, 30, 20, NOW + DAY + 2);
    finishWorkout(db, id, NOW + DAY + HOUR);
    const after = getSavedWorkout(db, savedId)!;
    expect(after.exercises).toHaveLength(4);
    expect(after.exercises[3].sets).toEqual([lb(55, 12)]);
  });

  it('is a no-op for a workout not started from a saved one', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const before = getSavedWorkout(db, savedId);
    const id = startWorkoutFromDay(db, PUSH_A, NOW + DAY);
    tick(db, active(db, BENCH).sets[0].id, 225, 5, NOW + DAY + 1);
    finishWorkout(db, id, NOW + DAY + HOUR);
    expect(getSavedWorkout(db, savedId)).toEqual(before);
    expect(db.select().from(savedWorkouts).where(eq(savedWorkouts.id, savedId)).get()!.updatedAt).toBe(NOW + 2 * HOUR);
    expect(savedWorkoutOf(db, id)).toBeNull();
    rememberSavedWorkout(db, 'no-such-workout');
  });

  it('lets a workout finish when its saved workout was deleted', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const id = startSavedWorkout(db, savedId, NOW + DAY);
    deleteSavedWorkout(db, savedId);
    tick(db, active(db, BENCH).sets[1].id, 190, 5, NOW + DAY + 1);
    finishWorkout(db, id, NOW + DAY + HOUR);
    const row = db.select().from(workouts).where(eq(workouts.id, id)).get()!;
    expect(row).toMatchObject({ status: 'finished', savedWorkoutId: savedId });
    expect(savedWorkoutOf(db, id)).toBeNull();
    expect(listSavedWorkouts(db)).toEqual([]);
  });

  it('keeps the memory of a saved workout whose started run is discarded', () => {
    const db = seededDb();
    const savedId = savedPushA(db);
    const before = getSavedWorkout(db, savedId);
    const id = startSavedWorkout(db, savedId, NOW + DAY);
    tick(db, active(db, BENCH).sets[1].id, 300, 1, NOW + DAY + 1);
    discardWorkout(db, id);
    expect(getSavedWorkout(db, savedId)).toEqual(before);
  });
});
