import { and, asc, desc, eq, gte, inArray, isNotNull, lte, min, ne, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import type { HistoryCard } from '../../domain/history';
import { countPrKinds } from '../../domain/prs';
import type { DistanceUnit, ExerciseMark, LoggingType, SetType, WeightUnit } from '../../domain/types';
import { LB_TO_KG } from '../../domain/units';
import { newId } from '../ids';
import { exercises, routineDays, routines, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
// Not './workoutsRepo': the guard lives on its own so no repository that starts a workout makes a require cycle.
import { assertNoActiveWorkout } from './activeWorkout';
import { getFinishSummary, type FinishSummary } from './workoutViewsRepo';

export type WorkoutDetailSet = {
  id: string;
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  prFlags: number;
};

export type WorkoutDetailExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  supersetGroup: number | null;
  mark: ExerciseMark | null;
  /** The exercise's note as it was when the workout finished (read-only, R165). */
  note: string | null;
  /** The RPE column was on, or a set has an RPE. */
  showRpe: boolean;
  sets: WorkoutDetailSet[];
};

export type WorkoutDetail = {
  /** `getFinishSummary`: duration, volume, set count, next lines, personal bests. */
  summary: FinishSummary;
  localDate: string;
  startedAt: number;
  /** The routine and day it was started from, while they still exist; null otherwise. */
  routineName: string | null;
  dayName: string | null;
  exercises: WorkoutDetailExercise[];
};

/** A set's load in `displayUnit`, in SQL (spec 7.1): a set with no unit is taken as already in it. */
function loadIn(displayUnit: WeightUnit) {
  const w = sql`coalesce(${sets.weight}, 0)`;
  return sql`case
    when ${sets.weightUnit} is null or ${sets.weightUnit} = ${displayUnit} then ${w}
    when ${sets.weightUnit} = 'kg' then ${w} / ${LB_TO_KG}
    else ${w} * ${LB_TO_KG}
  end`;
}

/**
 * Every finished workout as a History card (R163), newest first, in three reads however long the history (R185): one
 * grouped read for the duration, done-set count and volume (done, not warm-up, `weighted` / `bodyweight_plus`, load ×
 * reps converted to `displayUnit`, as spec 7.9; rounded once), one for the marks and one for the flagged sets. The
 * active workout is never listed.
 */
export function listHistory(db: Db, displayUnit: WeightUnit): HistoryCard[] {
  const countsToVolume = sql`${sets.done} = 1 and ${sets.setType} <> 'warmup'
    and ${exercises.loggingType} in ('weighted', 'bodyweight_plus') and ${sets.reps} is not null`;
  const rows = db
    .select({
      id: workouts.id,
      name: workouts.name,
      localDate: workouts.localDate,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      setCount: sql<number>`coalesce(sum(case when ${sets.done} = 1 then 1 else 0 end), 0)`,
      volume: sql<number>`coalesce(sum(case when ${countsToVolume} then ${loadIn(displayUnit)} * ${sets.reps} else 0 end), 0)`,
    })
    .from(workouts)
    .leftJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .leftJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(eq(workouts.status, 'finished'))
    .groupBy(workouts.id)
    .orderBy(desc(workouts.startedAt), desc(workouts.id))
    .all();

  const markRows = db
    .select({ workoutId: workoutExercises.workoutId, mark: workoutExercises.mark })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workouts.status, 'finished'), isNotNull(workoutExercises.mark)))
    .orderBy(asc(workoutExercises.position))
    .all();
  const marks = new Map<string, ExerciseMark[]>();
  for (const { workoutId, mark } of markRows) {
    if (mark === null) continue;
    const list = marks.get(workoutId);
    if (!list) marks.set(workoutId, [mark]);
    else if (!list.includes(mark)) list.push(mark);
  }

  const prRows = db
    .select({ workoutId: workoutExercises.workoutId, exerciseId: workoutExercises.exerciseId, prFlags: sets.prFlags })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workouts.status, 'finished'), ne(sets.prFlags, 0)))
    .all();
  const flagged = new Map<string, { exerciseId: string; prFlags: number }[]>();
  for (const r of prRows) {
    const list = flagged.get(r.workoutId);
    if (list) list.push(r);
    else flagged.set(r.workoutId, [r]);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    localDate: r.localDate,
    startedAt: r.startedAt,
    durationMs: (r.finishedAt ?? r.startedAt) - r.startedAt,
    volume: Math.round(Number(r.volume)),
    setCount: Number(r.setCount),
    marks: marks.get(r.id) ?? [],
    prCount: countPrKinds(flagged.get(r.id) ?? []),
  }));
}

/** The YYYY-MM month of the earliest finished workout, or null with none (the calendar's ‹ stops there, R164). */
export function firstWorkoutMonth(db: Db): string | null {
  const row = db.select({ first: min(workouts.localDate) }).from(workouts).where(eq(workouts.status, 'finished')).get();
  return row?.first ? row.first.slice(0, 7) : null;
}

/** The distinct `local_date`s of finished workouts in a YYYY-MM month, earliest first. The active workout is not one. */
export function trainingDaysInMonth(db: Db, month: string): string[] {
  return db
    .selectDistinct({ localDate: workouts.localDate })
    .from(workouts)
    .where(and(eq(workouts.status, 'finished'), gte(workouts.localDate, `${month}-01`), lte(workouts.localDate, `${month}-31`)))
    .orderBy(asc(workouts.localDate))
    .all()
    .map((r) => r.localDate);
}

/**
 * A finished workout for the History detail (R165): the finish summary, when and from what it was started, and each
 * exercise in order with its superset group (a group left with one member reads as none), its mark, the note saved with
 * it and its sets with their PR flags. Null unless the workout exists, is finished and has a finish time.
 */
export function getWorkoutDetail(db: Db, workoutId: string, displayUnit: WeightUnit): WorkoutDetail | null {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  // A finished workout always has a finish time; one without (a damaged row) is not shown rather than thrown on.
  if (!workout || workout.status !== 'finished' || workout.finishedAt === null) return null;

  const routineName =
    workout.routineId === null
      ? null
      : (db.select({ name: routines.name }).from(routines).where(eq(routines.id, workout.routineId)).get()?.name ?? null);
  const dayName =
    workout.routineDayId === null
      ? null
      : (db.select({ name: routineDays.name }).from(routineDays).where(eq(routineDays.id, workout.routineDayId)).get()?.name ?? null);

  const rows = db
    .select({ we: workoutExercises, name: exercises.name, loggingType: exercises.loggingType })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
    .all();
  const groups = realGroups(rows.map((r) => r.we.supersetGroup));
  const setRows =
    rows.length === 0
      ? []
      : db
          .select()
          .from(sets)
          .where(
            inArray(
              sets.workoutExerciseId,
              rows.map((r) => r.we.id),
            ),
          )
          .orderBy(asc(sets.position))
          .all();
  const setsByExercise = new Map<string, WorkoutDetailSet[]>();
  for (const s of setRows) {
    const view: WorkoutDetailSet = {
      id: s.id,
      setType: s.setType,
      weight: s.weight,
      weightUnit: s.weightUnit,
      reps: s.reps,
      rpe: s.rpe,
      durationS: s.durationS,
      distance: s.distance,
      distanceUnit: s.distanceUnit,
      prFlags: s.prFlags,
    };
    const list = setsByExercise.get(s.workoutExerciseId);
    if (list) list.push(view);
    else setsByExercise.set(s.workoutExerciseId, [view]);
  }

  return {
    summary: getFinishSummary(db, workoutId, displayUnit),
    localDate: workout.localDate,
    startedAt: workout.startedAt,
    routineName,
    dayName,
    exercises: rows.map(({ we, name, loggingType }, index) => {
      const exerciseSets = setsByExercise.get(we.id) ?? [];
      return {
        workoutExerciseId: we.id,
        exerciseId: we.exerciseId,
        name,
        loggingType,
        supersetGroup: groups[index],
        mark: we.mark,
        note: we.note,
        showRpe: we.showRpe || exerciseSets.some((s) => s.rpe !== null),
        sets: exerciseSets,
      };
    }),
  };
}

/** Superset groups as kept: a group with one member left is no superset, so it becomes null. */
function realGroups(groups: (number | null)[]): (number | null)[] {
  const sizes = new Map<number, number>();
  for (const g of groups) if (g !== null) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  return groups.map((g) => (g !== null && (sizes.get(g) ?? 0) > 1 ? g : null));
}

/**
 * Repeat (R171): starts a new workout copied from a finished one, in one transaction. It is named as the past one, with
 * no routine, day or saved-workout link, and dated by `now`. Each exercise (archived ones too, R130) comes in position
 * order with its superset group (a group left with one member is stored as none) and RPE shown when any of its sets had
 * an RPE; no rule, plan, mark or note. Each past set gives one empty, unticked set of the same type, in order.
 * Throws `ActiveWorkoutExistsError` if a workout is active and an error if the workout is missing or not finished,
 * before inserting anything. Returns the new workout's id.
 */
export function startRepeatWorkout(db: Db, workoutId: string, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const past = tx.select().from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!past || past.status !== 'finished') throw new Error(`No finished workout with id ${workoutId}.`);

    const pastExercises = tx
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
      .all();
    const pastSets =
      pastExercises.length === 0
        ? []
        : tx
            .select({ workoutExerciseId: sets.workoutExerciseId, setType: sets.setType, rpe: sets.rpe })
            .from(sets)
            .where(
              inArray(
                sets.workoutExerciseId,
                pastExercises.map((e) => e.id),
              ),
            )
            .orderBy(asc(sets.position))
            .all();
    const groups = realGroups(pastExercises.map((e) => e.supersetGroup));

    const newWorkoutId = newId();
    tx.insert(workouts)
      .values({ id: newWorkoutId, name: past.name, status: 'active', startedAt: now, localDate: toLocalDate(now) })
      .run();
    pastExercises.forEach((e, position) => {
      const own = pastSets.filter((s) => s.workoutExerciseId === e.id);
      const workoutExerciseId = newId();
      tx.insert(workoutExercises)
        .values({
          id: workoutExerciseId,
          workoutId: newWorkoutId,
          exerciseId: e.exerciseId,
          position,
          supersetGroup: groups[position],
          showRpe: own.some((s) => s.rpe !== null),
        })
        .run();
      own.forEach((s, setPosition) => {
        tx.insert(sets).values({ id: newId(), workoutExerciseId, position: setPosition, setType: s.setType }).run();
      });
    });
    return newWorkoutId;
  });
}
