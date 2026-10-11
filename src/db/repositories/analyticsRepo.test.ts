/** @jest-environment node */
import { and, eq } from 'drizzle-orm';
import { totalVolume } from '../../domain/volume';
import { sets } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { checkInReport, loggedBlocksBetween, prCountBetween, weekReport, workoutDatesSince } from './analyticsRepo';
import { addBodyEntry } from './bodyRepo';
import { getWorkoutPrs } from './prRepo';
import { addExerciseToWorkout, addSet, updateSet } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from './workoutsRepo';

const BENCH = 'barbell-bench-press';
const RDL = 'barbell-romanian-deadlift';
const PLANK = 'plank';
const MINUTE = 60_000;
// Wednesday; this week starts Monday 2026-10-12, last week is 2026-10-05 … 2026-10-11.
const TODAY = '2026-10-14';
const at = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min).getTime();

type LoggedSet = { weight?: number; reps?: number; durationS?: number; warmup?: boolean; done?: boolean };

/** Logs a workout started at `start` with the given exercises and sets; finishes it 50 minutes later unless `active`. */
function logWorkout(db: Db, start: number, exercises: [string, LoggedSet[]][], opts: { active?: boolean } = {}): string {
  const id = startEmptyWorkout(db, start);
  let t = start;
  for (const [exerciseId, list] of exercises) {
    const weId = addExerciseToWorkout(db, id, exerciseId);
    list.forEach((s, i) => {
      // addExerciseToWorkout adds the first set; the rest are added here.
      const setId = i === 0 ? firstSetId(db, weId) : addSet(db, weId);
      if (s.warmup) updateSet(db, setId, { setType: 'warmup' });
      if (s.done === false) return;
      t += MINUTE;
      tickSet(db, setId, { weight: s.weight ?? null, reps: s.reps ?? null, durationS: s.durationS ?? null, distance: null }, 'lb', t, 'mi');
    });
  }
  if (!opts.active) finishWorkout(db, id, start + 50 * MINUTE);
  return id;
}

function firstSetId(db: Db, workoutExerciseId: string): string {
  return db
    .select({ id: sets.id })
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), eq(sets.position, 0)))
    .get()!.id;
}

const bench = (weight: number, reps: number, n: number): LoggedSet[] => Array.from({ length: n }, () => ({ weight, reps }));

describe('analyticsRepo', () => {
  let db: Db;
  let monday5: string;
  let sunday11: string;
  let tuesday13: string;

  beforeEach(() => {
    db = seededDb('us');
    logWorkout(db, at(2026, 9, 1), [[BENCH, bench(95, 5, 3)]]);
    monday5 = logWorkout(db, at(2026, 10, 5), [
      [BENCH, [{ weight: 45, reps: 10, warmup: true }, ...bench(100, 5, 3), { weight: 100, reps: 5, done: false }]],
      [PLANK, [{ durationS: 60 }, { durationS: 45 }]],
    ]);
    // Started Sunday 23:50, finished Monday 00:40: counts for last week.
    sunday11 = logWorkout(db, at(2026, 10, 11, 23, 50), [[BENCH, bench(110, 5, 2)]]);
    tuesday13 = logWorkout(db, at(2026, 10, 13), [[RDL, bench(135, 8, 4)]]);
    // The active workout is never counted.
    logWorkout(db, at(2026, 10, 14), [[RDL, bench(200, 8, 3)], [BENCH, bench(300, 5, 3)]], { active: true });
  });

  it('logs one block per exercise with its done, non-warm-up sets, finished workouts only', () => {
    const blocks = loggedBlocksBetween(db, '2026-10-05', TODAY);
    expect(blocks).toEqual([
      { workoutId: monday5, exerciseId: BENCH, loggingType: 'weighted', hardSets: 3 },
      { workoutId: monday5, exerciseId: PLANK, loggingType: 'timed', hardSets: 2 },
      { workoutId: sunday11, exerciseId: BENCH, loggingType: 'weighted', hardSets: 2 },
      { workoutId: tuesday13, exerciseId: RDL, loggingType: 'weighted', hardSets: 4 },
    ]);
    expect(loggedBlocksBetween(db, '2026-10-12', TODAY).map((b) => b.workoutId)).toEqual([tuesday13]);
  });

  it('lists one date per finished workout since a day', () => {
    expect(workoutDatesSince(db, '2026-10-01')).toEqual(['2026-10-05', '2026-10-11', '2026-10-13']);
  });

  it('counts PRs as distinct (exercise, kind) pairs per workout, as the finish summary lists them (R178)', () => {
    const lastWeek = prCountBetween(db, '2026-10-05', '2026-10-11');
    expect(lastWeek).toBe(getWorkoutPrs(db, monday5).length + getWorkoutPrs(db, sunday11).length);
    expect(getWorkoutPrs(db, sunday11).length).toBeGreaterThan(0);
    // Two sets at the same PR weight in one workout count once per kind.
    expect(prCountBetween(db, '2026-10-11', '2026-10-11')).toBe(getWorkoutPrs(db, sunday11).length);
    // The first session of an exercise sets no PR.
    expect(prCountBetween(db, '2026-10-13', '2026-10-13')).toBe(0);
  });

  it('reports this week: sets per muscle, sessions, PRs and the bodyweight trend', () => {
    addBodyEntry(db, 'bodyweight', 182, 'lb', at(2026, 9, 12));
    addBodyEntry(db, 'bodyweight', 180, 'lb', at(2026, 10, 13));
    const r = weekReport(db, TODAY, 'lb');
    expect(r.muscles.find((g) => g.group === 'hamstrings')).toEqual({ group: 'hamstrings', sets: 4, status: 'under' });
    // Bench was last week and the active workout's bench doesn't count.
    expect(r.muscles.find((g) => g.group === 'chest')!.sets).toBe(0);
    // First workout in the week of Aug 31: 6 full weeks, 3 sessions in them.
    expect(r.sessions).toEqual({ thisWeek: 1, lastWeek: 2, average: 0.5, averageWeeks: 6 });
    expect(r.prsThisWeek).toBe(0);
    expect(r.prsLast4Weeks).toBe(prCountBetween(db, '2026-09-17', TODAY));
    expect(r.bodyweight).toEqual({ change: -2, perWeek: -0.5 });
    expect(weekReport(db, TODAY, 'kg').bodyweight!.change).toBeCloseTo(-2 * 0.45359237);
  });

  it('caps the average at 8 weeks for a history older than the window', () => {
    const old = seededDb('us');
    logWorkout(old, at(2026, 1, 5), [[BENCH, bench(95, 5, 1)]]);
    logWorkout(old, at(2026, 10, 6), [[BENCH, bench(95, 5, 1)]]);
    expect(weekReport(old, TODAY, 'lb').sessions).toEqual({ thisWeek: 0, lastWeek: 1, average: 0.1, averageWeeks: 8 });
  });

  it('reviews last week in the check-in (R180)', () => {
    addBodyEntry(db, 'bodyweight', 184, 'lb', at(2026, 9, 29));
    addBodyEntry(db, 'bodyweight', 182, 'lb', at(2026, 10, 6));
    addBodyEntry(db, 'bodyweight', 180, 'lb', at(2026, 10, 9));
    addBodyEntry(db, 'bodyweight', 179, 'lb', at(2026, 10, 9, 20));
    const { checkIn } = checkInReport(db, TODAY, 'lb', false);
    expect(checkIn).toEqual({
      weekStart: '2026-10-05',
      sessions: 2,
      // The plank's holds aren't hard sets (R176).
      hardSets: 5,
      volume: totalVolume(
        [...bench(100, 5, 3), ...bench(110, 5, 2)].map((s) => ({ loggingType: 'weighted', setType: 'working', done: true, weight: s.weight!, weightUnit: 'lb', reps: s.reps! })),
        'lb',
      ),
      prs: prCountBetween(db, '2026-10-05', '2026-10-11'),
      // Each day's latest: 182 and 179.
      bodyweightAverage: 180.5,
      bodyweightChange: -3.5,
      under: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes'],
      over: [],
    });
    expect(checkIn!.volume).toBe(2600);
  });

  it('has no check-in when last week had no workout and no bodyweight', () => {
    const empty = seededDb('us');
    logWorkout(empty, at(2026, 10, 13), [[BENCH, bench(95, 5, 1)]]);
    expect(checkInReport(empty, TODAY, 'lb', false).checkIn).toBeNull();
    // Bodyweight alone makes one.
    addBodyEntry(empty, 'bodyweight', 180, 'lb', at(2026, 10, 7));
    expect(checkInReport(empty, TODAY, 'lb', false).checkIn).toMatchObject({ sessions: 0, bodyweightAverage: 180, bodyweightChange: null, volume: 0 });
  });

  it('ticks this week’s items from entries dated Monday to today, and the photo flag passed in', () => {
    addBodyEntry(db, 'bodyweight', 180, 'lb', at(2026, 10, 11, 22));
    addBodyEntry(db, 'waist', 34, 'in', at(2026, 10, 11, 22));
    expect(checkInReport(db, TODAY, 'lb', false).todo).toEqual({ bodyweight: false, waist: false, photo: false });
    addBodyEntry(db, 'bodyweight', 180, 'lb', at(2026, 10, 12, 7));
    addBodyEntry(db, 'chest', 40, 'in', at(2026, 10, 12, 7));
    expect(checkInReport(db, TODAY, 'lb', true).todo).toEqual({ bodyweight: true, waist: false, photo: true });
    addBodyEntry(db, 'waist', 33.5, 'in', at(2026, 10, 14, 7));
    expect(checkInReport(db, TODAY, 'lb', false).todo).toEqual({ bodyweight: true, waist: true, photo: false });
  });
});
