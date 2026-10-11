import { and, asc, between, eq, gte, inArray, min, ne } from 'drizzle-orm';
import { dailySeries } from '../../domain/body';
import { mondayOf, shiftDay } from '../../domain/dates';
import type { Muscle, WeightUnit } from '../../domain/types';
import { totalVolume, type VolumeSet } from '../../domain/volume';
import {
  averageOfDays,
  bodyweightTrend,
  type BodyweightTrend,
  type CheckIn,
  type CheckInTodo,
  countPrKinds,
  countsAsHardSets,
  type GroupWeek,
  type LoggedBlock,
  muscleWeek,
  sessionsSummary,
  type SessionsSummary,
} from '../../domain/weeklyAnalytics';
import { exercises, measurements, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { listBodyEntries } from './bodyRepo';

// Stats' weekly analytics and the check-in (R176–R180), read from finished workouts and body entries. A workout counts
// for its `local_date` (its start, §7.9), so one started Sunday 23:50 is in that Sunday's week. The active workout is
// never read. Nothing here is stored (R162).

/** How many full weeks before this one the sessions average looks back (R177). */
const AVERAGE_WEEKS = 8;

type SetRow = VolumeSet & { workoutId: string; workoutExerciseId: string; exerciseId: string };

/** Every set of the finished workouts with `local_date` in [from, to], in workout, exercise and set order. */
function setsBetween(db: Db, from: string, to: string): SetRow[] {
  return db
    .select({
      workoutId: workoutExercises.workoutId,
      workoutExerciseId: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      loggingType: exercises.loggingType,
      setType: sets.setType,
      done: sets.done,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workouts.status, 'finished'), between(workouts.localDate, from, to)))
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position), asc(sets.position))
    .all();
}

/** One block per workout exercise that has sets; its hard sets are the done sets that are not warm-ups (R176). */
function blocksOf(rows: readonly SetRow[]): LoggedBlock[] {
  const blocks = new Map<string, LoggedBlock>();
  for (const r of rows) {
    let block = blocks.get(r.workoutExerciseId);
    if (!block) {
      block = { workoutId: r.workoutId, exerciseId: r.exerciseId, loggingType: r.loggingType, hardSets: 0 };
      blocks.set(r.workoutExerciseId, block);
    }
    if (r.done && r.setType !== 'warmup') block.hardSets += 1;
  }
  return [...blocks.values()];
}

/** The exercises of finished workouts with `local_date` in [from, to] (inclusive), with their hard sets. */
export function loggedBlocksBetween(db: Db, from: string, to: string): LoggedBlock[] {
  return blocksOf(setsBetween(db, from, to));
}

/** The local date of each finished workout on or after `from`, earliest first: one entry per workout. */
export function workoutDatesSince(db: Db, from: string): string[] {
  return db
    .select({ localDate: workouts.localDate })
    .from(workouts)
    .where(and(eq(workouts.status, 'finished'), gte(workouts.localDate, from)))
    .orderBy(asc(workouts.localDate))
    .all()
    .map((r) => r.localDate);
}

/** The local date of the first finished workout, or null with none. */
function firstWorkoutDate(db: Db): string | null {
  return db.select({ first: min(workouts.localDate) }).from(workouts).where(eq(workouts.status, 'finished')).get()?.first ?? null;
}

/**
 * The personal bests of the finished workouts with `local_date` in [from, to] (R178): per workout, the number of
 * distinct (exercise, kind) pairs flagged, the count the finish summary's Personal bests list shows (R105), summed.
 */
export function prCountBetween(db: Db, from: string, to: string): number {
  const rows = db
    .select({ workoutId: workoutExercises.workoutId, exerciseId: workoutExercises.exerciseId, prFlags: sets.prFlags })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workouts.status, 'finished'), between(workouts.localDate, from, to), ne(sets.prFlags, 0)))
    .all();
  const flags = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.workoutId}\u0000${r.exerciseId}`;
    flags.set(key, (flags.get(key) ?? 0) | r.prFlags);
  }
  let count = 0;
  for (const f of flags.values()) count += countPrKinds(f);
  return count;
}

/** The muscles of the exercises in `blocks`, as `muscleWeek` asks for them. */
function musclesOf(db: Db, blocks: readonly LoggedBlock[]): (exerciseId: string) => { primary: Muscle[]; secondary: Muscle[] } {
  const ids = [...new Set(blocks.map((b) => b.exerciseId))];
  const rows =
    ids.length === 0
      ? []
      : db
          .select({ id: exercises.id, primary: exercises.primaryMuscles, secondary: exercises.secondaryMuscles })
          .from(exercises)
          .where(inArray(exercises.id, ids))
          .all();
  const byId = new Map(rows.map((r) => [r.id, { primary: r.primary, secondary: r.secondary }]));
  return (id) => byId.get(id) ?? { primary: [], secondary: [] };
}

function groupWeekOf(db: Db, blocks: readonly LoggedBlock[]): GroupWeek[] {
  return muscleWeek(blocks, musclesOf(db, blocks));
}

/** Each day's latest bodyweight in the display unit, oldest first. */
function dailyBodyweight(db: Db, displayUnit: WeightUnit) {
  return dailySeries(listBodyEntries(db, 'bodyweight'), displayUnit);
}

export type WeekReport = {
  muscles: GroupWeek[];
  sessions: SessionsSummary;
  prsThisWeek: number;
  prsLast4Weeks: number;
  bodyweight: BodyweightTrend | null;
};

/**
 * Stats' This week (R176–R179): sets per muscle from Monday to `today`, sessions (with the 8-week average), personal
 * bests this week and in the last 4 weeks (the 28 days to `today`), and the bodyweight trend in `displayUnit`.
 */
export function weekReport(db: Db, today: string, displayUnit: WeightUnit): WeekReport {
  const thisMonday = mondayOf(today);
  const windowStart = shiftDay(thisMonday, -7 * AVERAGE_WEEKS);
  const dates = workoutDatesSince(db, windowStart);
  // The first workout says how many weeks the average covers; one older than the window only caps it at 8.
  const first = firstWorkoutDate(db);
  if (first !== null && first < windowStart) dates.unshift(first);
  return {
    muscles: groupWeekOf(db, loggedBlocksBetween(db, thisMonday, today)),
    sessions: sessionsSummary(dates, today, AVERAGE_WEEKS),
    prsThisWeek: prCountBetween(db, thisMonday, today),
    prsLast4Weeks: prCountBetween(db, shiftDay(today, -27), today),
    bodyweight: bodyweightTrend(dailyBodyweight(db, displayUnit), today),
  };
}

/** True when a waist measurement is dated in [from, to]. */
function hasWaistBetween(db: Db, from: string, to: string): boolean {
  return (
    db
      .select({ id: measurements.id })
      .from(measurements)
      .where(and(eq(measurements.kind, 'waist'), between(measurements.localDate, from, to)))
      .limit(1)
      .get() !== undefined
  );
}

/**
 * The weekly check-in (R180). `checkIn` reviews the Monday–Sunday before this week: sessions, hard sets (as sets per
 * muscle count them), volume (display unit, whole), personal bests, that week's bodyweight average and its change on
 * the week before, and the groups under or over the band; null when that week has no workout and no bodyweight entry.
 * `todo` says which of this week's three items (Monday to `today`) are done; the photo flag is the caller's.
 */
export function checkInReport(
  db: Db,
  today: string,
  displayUnit: WeightUnit,
  photoTakenThisWeek: boolean,
): { checkIn: CheckIn | null; todo: CheckInTodo } {
  const thisMonday = mondayOf(today);
  const weekStart = shiftDay(thisMonday, -7);
  const weekEnd = shiftDay(thisMonday, -1);
  const daily = dailyBodyweight(db, displayUnit);

  const todo: CheckInTodo = {
    bodyweight: daily.some((p) => p.localDate >= thisMonday && p.localDate <= today),
    waist: hasWaistBetween(db, thisMonday, today),
    photo: photoTakenThisWeek,
  };

  const rows = setsBetween(db, weekStart, weekEnd);
  const sessions = workoutDatesSince(db, weekStart).filter((d) => d <= weekEnd).length;
  const bodyweightAverage = averageOfDays(daily, weekStart, weekEnd);
  if (sessions === 0 && bodyweightAverage === null) return { checkIn: null, todo };

  const blocks = blocksOf(rows);
  const weekBefore = averageOfDays(daily, shiftDay(weekStart, -7), shiftDay(weekStart, -1));
  const muscles = groupWeekOf(db, blocks);
  return {
    checkIn: {
      weekStart,
      sessions,
      hardSets: blocks.filter(countsAsHardSets).reduce((sum, b) => sum + b.hardSets, 0),
      volume: totalVolume(rows, displayUnit),
      prs: prCountBetween(db, weekStart, weekEnd),
      bodyweightAverage,
      bodyweightChange: bodyweightAverage === null || weekBefore === null ? null : bodyweightAverage - weekBefore,
      under: muscles.filter((g) => g.status === 'under').map((g) => g.group),
      over: muscles.filter((g) => g.status === 'over').map((g) => g.group),
    },
    todo,
  };
}
