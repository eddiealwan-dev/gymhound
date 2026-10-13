/** @jest-environment node */
import { asc, eq, inArray } from 'drizzle-orm';
import { routineExercises, settings, sets, workoutExercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getSettings } from './settingsRepo';
import { switchDisplayUnit } from './unitsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = `${PUSH_A}:barbell-bench-press`; // barbell
const LATERAL = `${PUSH_A}:dumbbell-lateral-raise`; // dumbbell

function setNext(db: Db, id: string, weight: number | null, unit: 'lb' | 'kg' | null): void {
  db.update(routineExercises).set({ nextWeight: weight, nextWeightUnit: unit }).where(eq(routineExercises.id, id)).run();
}

/** The workout's exercise rows and their sets, straight from the tables, in a stable order. */
function workoutRows(db: Db, workoutId: string) {
  const exerciseRows = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  const setRows = db
    .select()
    .from(sets)
    .where(inArray(sets.workoutExerciseId, exerciseRows.map((r) => r.id)))
    .orderBy(asc(sets.workoutExerciseId), asc(sets.position))
    .all();
  return { exerciseRows, setRows };
}

/** Ticks the first set of the workout's first exercise at `weight` lb x 5. */
function tickFirstSet(db: Db, workoutId: string, weight: number, at: number): void {
  const first = workoutRows(db, workoutId).exerciseRows[0];
  const setId = db.select().from(sets).where(eq(sets.workoutExerciseId, first.id)).orderBy(asc(sets.position)).get()!.id;
  tickSet(db, setId, { weight, reps: 5, durationS: null, distance: null }, 'lb', at, 'mi');
}

describe('switchDisplayUnit', () => {
  it('sets the unit and leaves every routine row as stored', () => {
    const db = seededDb('us');
    setNext(db, BENCH, 135, 'lb');
    setNext(db, LATERAL, 50, 'lb');
    const rulesBefore = db.select().from(routineExercises).all();

    switchDisplayUnit(db, 'kg');

    expect(getSettings(db).unit).toBe('kg');
    expect(db.select().from(routineExercises).all()).toEqual(rulesBefore);

    switchDisplayUnit(db, 'lb');

    expect(getSettings(db).unit).toBe('lb');
    expect(db.select().from(routineExercises).all()).toEqual(rulesBefore);
  });

  it('leaves the active workout and finished history unchanged', () => {
    const db = seededDb('us');
    setNext(db, BENCH, 225, 'lb');
    setNext(db, LATERAL, 50, 'lb');

    const finished = startWorkoutFromDay(db, PUSH_A, NOW - 2 * 24 * HOUR);
    tickFirstSet(db, finished, 225, NOW - 2 * 24 * HOUR + 60_000);
    finishWorkout(db, finished, NOW - 2 * 24 * HOUR + HOUR);

    const active = startWorkoutFromDay(db, PUSH_A, NOW);
    tickFirstSet(db, active, 230, NOW + 60_000);

    const finishedBefore = workoutRows(db, finished);
    const activeBefore = workoutRows(db, active);
    expect(activeBefore.exerciseRows[0]).toMatchObject({ plannedUnit: 'lb' });

    switchDisplayUnit(db, 'kg');

    expect(workoutRows(db, finished)).toEqual(finishedBefore);
    expect(workoutRows(db, active)).toEqual(activeBefore);
  });

  it('changes nothing when the unit is already the target', () => {
    const db = seededDb('us');
    // A stray kg next weight: a real switch to lb would convert it.
    setNext(db, BENCH, 100, 'kg');
    const rulesBefore = db.select().from(routineExercises).all();
    const settingsBefore = db.select().from(settings).all();

    switchDisplayUnit(db, 'lb');

    expect(db.select().from(routineExercises).all()).toEqual(rulesBefore);
    expect(db.select().from(settings).all()).toEqual(settingsBefore);
  });
});
