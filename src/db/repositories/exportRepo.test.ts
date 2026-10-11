/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { WORKOUT_CSV_COLUMNS } from '../../domain/csv';
import { toLocalDate } from '../../domain/dates';
import { sets, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { setExerciseNote } from './exercisesRepo';
import { workoutCsvRows } from './exportRepo';
import { addExerciseToWorkout, addWarmupSet, setExerciseMark } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';
const MINUTE = 60_000;
const OCT_1 = Date.UTC(2026, 9, 1, 14, 0);
const OCT_6 = Date.UTC(2026, 9, 6, 14, 0);
const OCT_9 = Date.UTC(2026, 9, 9, 14, 0);

/** The column's index, so the assertions read by name. */
const col = (name: (typeof WORKOUT_CSV_COLUMNS)[number]) => WORKOUT_CSV_COLUMNS.indexOf(name);

function tick(db: Db, setId: string, weight: number, reps: number, unit: 'lb' | 'kg', at: number): void {
  tickSet(db, setId, { weight, reps, durationS: null, distance: null }, unit, at, 'mi');
}

/** The ids of the active workout's sets for the exercise at `exerciseIndex`, in position order. */
function setIds(db: Db, exerciseIndex = 0): string[] {
  return getActiveWorkoutView(db)!.exercises[exerciseIndex].sets.map((s) => s.id);
}

/**
 * - Oct 6 (logged first): an empty workout with bench press at 60 kg x 5.
 * - Oct 1: Push A, with a 45 lb x 10 warm-up and two working sets on bench (100 x 5, 105 x 4), the bench note
 *   "elbows in, pause" saved at finish (edited afterwards), and the overhead press at 65 lb x 8.
 * - Oct 9: Push A, active, one bench set ticked.
 * After the finishes, an undone set is put into the Oct 1 bench press.
 */
function build(): { db: Db; oct1: string; oct6: string } {
  const db = seededDb();

  const oct6 = startEmptyWorkout(db, OCT_6);
  addExerciseToWorkout(db, oct6, BENCH);
  tick(db, setIds(db)[0], 60, 5, 'kg', OCT_6 + MINUTE);
  finishWorkout(db, oct6, OCT_6 + 30 * MINUTE);

  const oct1 = startWorkoutFromDay(db, PUSH_A, OCT_1);
  const benchId = getActiveWorkoutView(db)!.exercises[0].id;
  const warmup = addWarmupSet(db, benchId);
  const [, first, second] = setIds(db);
  tick(db, warmup, 45, 10, 'lb', OCT_1 + MINUTE);
  tick(db, first, 100, 5, 'lb', OCT_1 + 2 * MINUTE);
  tick(db, second, 105, 4, 'lb', OCT_1 + 3 * MINUTE);
  tick(db, setIds(db, 1)[0], 65, 8, 'lb', OCT_1 + 4 * MINUTE);
  setExerciseNote(db, BENCH, 'elbows in, pause', OCT_1);
  finishWorkout(db, oct1, OCT_1 + 60 * MINUTE);
  setExerciseNote(db, BENCH, 'edited after the finish', OCT_1 + 61 * MINUTE);
  db.insert(sets).values({ id: 'undone', workoutExerciseId: benchId, position: 9, setType: 'working', weight: 200, weightUnit: 'lb', reps: 1, done: false }).run();

  startWorkoutFromDay(db, PUSH_A, OCT_9);
  tick(db, setIds(db)[0], 140, 3, 'lb', OCT_9 + MINUTE);

  return { db, oct1, oct6 };
}

describe('workoutCsvRows', () => {
  it('has one row per done set of finished workouts, by start time, then exercise, then set position', () => {
    const { db, oct1, oct6 } = build();

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.map((r) => [r[col('workout_id')], r[col('exercise_id')], r[col('set_type')], r[col('weight')], r[col('reps')]])).toEqual([
      [oct1, BENCH, 'warmup', 45, 10],
      [oct1, BENCH, 'working', 100, 5],
      [oct1, BENCH, 'working', 105, 4],
      [oct1, 'barbell-overhead-press', 'working', 65, 8],
      [oct6, BENCH, 'working', 60, 5],
    ]);
    rows.forEach((r) => expect(r).toHaveLength(21));
  });

  it('leaves out the active workout and a set that is not done', () => {
    const { db } = build();

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.some((r) => r[col('reps')] === 3)).toBe(false);
    expect(rows.some((r) => r[col('weight')] === 200)).toBe(false);
  });

  it('numbers the warm-up 1 of its own type, and the working sets from 1 after it', () => {
    const { db } = build();

    const bench = workoutCsvRows(db, () => 0).slice(0, 3);

    expect(bench.map((r) => [r[col('set_type')], r[col('set_number')]])).toEqual([
      ['warmup', 1],
      ['working', 1],
      ['working', 2],
    ]);
  });

  it('writes the workout, the routine and day names, the date and the times', () => {
    const { db, oct1 } = build();

    const [row] = workoutCsvRows(db, () => -300);

    expect(row.slice(0, 10)).toEqual([
      oct1,
      toLocalDate(OCT_1),
      '2026-10-01T09:00:00.000-05:00',
      '2026-10-01T10:00:00.000-05:00',
      'Push A',
      'Push/pull/legs',
      'Push A',
      'normal',
      expect.any(String),
      BENCH,
    ]);
  });

  it('leaves the routine and day empty for a workout not started from a routine', () => {
    const { db } = build();

    const row = workoutCsvRows(db, () => 0).at(-1)!;

    expect([row[col('workout')], row[col('routine')], row[col('routine_day')]]).toEqual(['Workout', null, null]);
  });

  it('keeps each set in the unit it was logged in', () => {
    const { db } = build();

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.map((r) => r[col('weight_unit')])).toEqual(['lb', 'lb', 'lb', 'lb', 'kg']);
  });

  it('writes the note saved with the workout, not the note as it reads now', () => {
    const { db } = build();

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.map((r) => r[col('exercise_note')])).toEqual(['elbows in, pause', 'elbows in, pause', 'elbows in, pause', null, null]);
  });

  it('writes the PR kinds from the stored flags, empty when there are none', () => {
    const { db } = build();
    db.update(sets).set({ prFlags: 5 }).where(eq(sets.weight, 105)).run();

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.map((r) => r[col('pr')])).toEqual(['', '', 'heaviest|e1rm', '', '']);
  });

  it("writes each exercise's Something off mark as day_mark, and normal for an exercise with none, never the workout's old day mark (R60)", () => {
    const db = seededDb();
    const id = startWorkoutFromDay(db, PUSH_A, OCT_1);
    db.update(workouts).set({ dayMark: 'pain' }).where(eq(workouts.id, id)).run();
    setExerciseMark(db, getActiveWorkoutView(db)!.exercises[0].id, 'rough_sleep');
    tick(db, setIds(db, 0)[0], 100, 5, 'lb', OCT_1 + MINUTE);
    tick(db, setIds(db, 0)[1], 100, 5, 'lb', OCT_1 + 2 * MINUTE);
    tick(db, setIds(db, 1)[0], 65, 8, 'lb', OCT_1 + 3 * MINUTE);
    finishWorkout(db, id, OCT_1 + 60 * MINUTE);

    const rows = workoutCsvRows(db, () => 0);

    expect(rows.map((r) => [r[col('exercise_id')], r[col('day_mark')]])).toEqual([
      [BENCH, 'rough_sleep'],
      [BENCH, 'rough_sleep'],
      ['barbell-overhead-press', 'normal'],
    ]);
  });

  it('is empty with no finished workouts', () => {
    const db = seededDb();
    startWorkoutFromDay(db, PUSH_A, OCT_9);
    tick(db, setIds(db)[0], 140, 3, 'lb', OCT_9 + MINUTE);

    expect(workoutCsvRows(db)).toEqual([]);
  });

  it("uses the device's own offset when none is given", () => {
    const { db } = build();

    const [row] = workoutCsvRows(db);
    const startedAt = row[col('started_at')] as string;
    const offset = -new Date(OCT_1).getTimezoneOffset();
    const sign = offset < 0 ? '-' : '+';
    const hhmm = `${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;

    expect(startedAt.startsWith(toLocalDate(OCT_1))).toBe(true);
    expect(startedAt.endsWith(`${sign}${hhmm}`)).toBe(true);
    expect(new Date(startedAt).getTime()).toBe(OCT_1);
  });
});
