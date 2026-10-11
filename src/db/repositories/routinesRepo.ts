import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Outcome } from '../../domain/progression';
import type { Equipment, ExerciseMark, LoggingType, WeightUnit } from '../../domain/types';
import { PREMADE_ORDER } from '../../seed/routines';
import { newId } from '../ids';
import { exercises, routineDays, routineExercises, routines, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';

/** Raised when a premade routine would be edited or deleted. Premades are read-only (§8.6). */
export class PremadeRoutineError extends Error {
  constructor() {
    super('Premade routines are read-only.');
    this.name = 'PremadeRoutineError';
  }
}

export type RoutineSummary = {
  id: string;
  name: string;
  isPremade: boolean;
  dayCount: number;
  isActive: boolean;
};

export type UpNextExercise = {
  routineExerciseId: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  equipment: Equipment;
  setCount: number;
  repMin: number;
  repMax: number;
  increment: number;
  incrementUnit: WeightUnit;
  nextWeight: number | null;
  nextWeightUnit: WeightUnit | null;
  /**
   * The latest finished workout exercise run from this routine exercise: its outcome, Something off mark, and working
   * and next weights (R73: a raise shows the actual rise).
   */
  lastOutcome: Outcome | null;
  lastMark: ExerciseMark | null;
  lastWorkingWeight: number | null;
  lastWorkingUnit: WeightUnit | null;
  lastNextWeight: number | null;
  lastNextUnit: WeightUnit | null;
};

type LastResult = Pick<
  UpNextExercise,
  'lastOutcome' | 'lastMark' | 'lastWorkingWeight' | 'lastWorkingUnit' | 'lastNextWeight' | 'lastNextUnit'
>;

const NO_LAST_RESULT: LastResult = {
  lastOutcome: null,
  lastMark: null,
  lastWorkingWeight: null,
  lastWorkingUnit: null,
  lastNextWeight: null,
  lastNextUnit: null,
};

export type UpNext = {
  routineId: string;
  routineName: string;
  dayId: string;
  dayName: string;
  /** The day's latest finished workout. Its `day_mark` is no longer read: marks are per exercise (R69). */
  lastTime: { localDate: string } | null;
  exercises: UpNextExercise[];
};

/** The premades in `PREMADE_ORDER`, then the user's routines by creation time. */
export function listRoutines(db: Db): RoutineSummary[] {
  const activeId = getSettings(db).activeRoutineId;
  const dayCounts = new Map<string, number>();
  for (const { routineId } of db.select({ routineId: routineDays.routineId }).from(routineDays).all()) {
    dayCounts.set(routineId, (dayCounts.get(routineId) ?? 0) + 1);
  }

  const premadeRank = (id: string) => {
    const rank = PREMADE_ORDER.indexOf(id);
    return rank === -1 ? PREMADE_ORDER.length : rank;
  };
  const rows = db.select().from(routines).all();
  rows.sort((a, b) => {
    if (a.isPremade !== b.isPremade) return a.isPremade ? -1 : 1;
    if (a.isPremade) return premadeRank(a.id) - premadeRank(b.id);
    return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isPremade: r.isPremade,
    dayCount: dayCounts.get(r.id) ?? 0,
    isActive: r.id === activeId,
  }));
}

export function setActiveRoutine(db: Db, routineId: string | null): void {
  setSetting(db, 'activeRoutineId', routineId);
}

export type RoutineDetailExercise = {
  /** The routine exercise row's id. */
  id: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  equipment: Equipment;
  setCount: number;
  /** Seconds for timed exercises. */
  repMin: number;
  repMax: number;
  /** 0 means progression by reps only. Kept in the unit it was written in. */
  increment: number;
  incrementUnit: WeightUnit;
  /** Exercises of a day with the same number form a superset. */
  supersetGroup: number | null;
  nextWeight: number | null;
  nextWeightUnit: WeightUnit | null;
};

export type RoutineDetail = {
  id: string;
  name: string;
  isPremade: boolean;
  isActive: boolean;
  days: { id: string; name: string; exercises: RoutineDetailExercise[] }[];
};

/** A routine with its days in order, each with its exercises in order; null when it does not exist. */
export function getRoutineDetail(db: Db, routineId: string): RoutineDetail | null {
  const routine = db.select().from(routines).where(eq(routines.id, routineId)).get();
  if (!routine) return null;

  const days = db
    .select({ id: routineDays.id, name: routineDays.name })
    .from(routineDays)
    .where(eq(routineDays.routineId, routineId))
    .orderBy(asc(routineDays.position), asc(routineDays.id))
    .all();
  const rows =
    days.length === 0
      ? []
      : db
          .select({
            dayId: routineExercises.routineDayId,
            id: routineExercises.id,
            exerciseId: routineExercises.exerciseId,
            name: exercises.name,
            loggingType: exercises.loggingType,
            equipment: exercises.equipment,
            setCount: routineExercises.setCount,
            repMin: routineExercises.repMin,
            repMax: routineExercises.repMax,
            increment: routineExercises.increment,
            incrementUnit: routineExercises.incrementUnit,
            supersetGroup: routineExercises.supersetGroup,
            nextWeight: routineExercises.nextWeight,
            nextWeightUnit: routineExercises.nextWeightUnit,
          })
          .from(routineExercises)
          .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
          .where(inArray(routineExercises.routineDayId, days.map((d) => d.id)))
          .orderBy(asc(routineExercises.position), asc(routineExercises.id))
          .all();

  return {
    id: routine.id,
    name: routine.name,
    isPremade: routine.isPremade,
    isActive: getSettings(db).activeRoutineId === routine.id,
    days: days.map((day) => ({
      ...day,
      exercises: rows.filter((r) => r.dayId === day.id).map(({ dayId: _dayId, ...exercise }) => exercise),
    })),
  };
}

/** How many routines of your own there are: what the free limit counts (`canAddRoutine`). */
export function userRoutineCount(db: Db): number {
  return db.select({ n: count() }).from(routines).where(eq(routines.isPremade, false)).get()?.n ?? 0;
}

/**
 * Copies a routine, premade or your own, as a routine of your own named "{name} copy", created at `now` and starting
 * from its first day. Every day and exercise is copied with a new id and the same rule and superset group, and with no
 * next weight: the copy's progress starts fresh. Returns the new routine's id. Throws when the routine does not exist.
 * The free limit is the caller's to check first (`canAddRoutine`).
 */
export function duplicateRoutine(db: Db, routineId: string, now: number): string {
  return db.transaction((tx) => {
    const source = tx.select().from(routines).where(eq(routines.id, routineId)).get();
    if (!source) throw new Error(`No routine with id ${routineId}.`);

    const id = newId();
    tx.insert(routines)
      .values({ id, name: `${source.name} copy`, isPremade: false, nextDayIndex: 0, createdAt: now })
      .run();

    const days = tx.select().from(routineDays).where(eq(routineDays.routineId, routineId)).all();
    for (const day of days) {
      const dayId = newId();
      tx.insert(routineDays).values({ id: dayId, routineId: id, name: day.name, position: day.position }).run();
      const rows = tx.select().from(routineExercises).where(eq(routineExercises.routineDayId, day.id)).all();
      for (const { id: _id, routineDayId: _dayId, nextWeight: _weight, nextWeightUnit: _unit, ...rule } of rows) {
        tx.insert(routineExercises).values({ ...rule, id: newId(), routineDayId: dayId }).run();
      }
    }
    return id;
  });
}

/**
 * Deletes a routine of your own with its days and exercises. Its workouts stay in history: they do not reference it
 * by foreign key. If it was the active routine, no routine is active (R90). Throws `PremadeRoutineError` for a
 * premade; does nothing for a routine that does not exist.
 */
export function deleteRoutine(db: Db, routineId: string): void {
  db.transaction((tx) => {
    const routine = tx.select().from(routines).where(eq(routines.id, routineId)).get();
    if (!routine) return;
    if (routine.isPremade) throw new PremadeRoutineError();

    // The foreign keys cascade, but the rows go explicitly so the delete never depends on the pragma.
    const dayIds = tx.select({ id: routineDays.id }).from(routineDays).where(eq(routineDays.routineId, routineId));
    tx.delete(routineExercises).where(inArray(routineExercises.routineDayId, dayIds)).run();
    tx.delete(routineDays).where(eq(routineDays.routineId, routineId)).run();
    tx.delete(routines).where(eq(routines.id, routineId)).run();
    if (getSettings(tx).activeRoutineId === routineId) setActiveRoutine(tx, null);
  });
}

/**
 * The outcome, mark, working weight and next weight of the latest finished workout exercise run from
 * `routineExerciseId` with the exercise the slot holds now, `exerciseId` (R74); all null when it has never been
 * finished (or was finished before the rule wrote outcomes).
 */
function lastResult(db: Db, routineExerciseId: string, exerciseId: string): LastResult {
  return (
    db
      .select({
        lastOutcome: workoutExercises.outcome,
        lastMark: workoutExercises.mark,
        lastWorkingWeight: workoutExercises.workingWeight,
        lastWorkingUnit: workoutExercises.workingUnit,
        lastNextWeight: workoutExercises.nextWeight,
        lastNextUnit: workoutExercises.nextUnit,
      })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(
        and(
          eq(workoutExercises.routineExerciseId, routineExerciseId),
          eq(workoutExercises.exerciseId, exerciseId),
          eq(workouts.status, 'finished'),
        ),
      )
      .orderBy(desc(workouts.finishedAt))
      .limit(1)
      .get() ?? NO_LAST_RESULT
  );
}

/**
 * The active routine's next day: `days[next_day_index % days.length]`, with its exercises, each with how it went last
 * time, and when the day was last finished. Null when there is no active routine, it no longer exists, or it has no days.
 */
export function getUpNext(db: Db): UpNext | null {
  const activeId = getSettings(db).activeRoutineId;
  if (activeId === null) return null;

  const routine = db.select().from(routines).where(eq(routines.id, activeId)).get();
  if (!routine) return null;

  const days = db
    .select()
    .from(routineDays)
    .where(eq(routineDays.routineId, routine.id))
    .orderBy(asc(routineDays.position))
    .all();
  if (days.length === 0) return null;
  const day = days[routine.nextDayIndex % days.length];

  const lastTime =
    db
      .select({ localDate: workouts.localDate })
      .from(workouts)
      .where(and(eq(workouts.routineDayId, day.id), eq(workouts.status, 'finished')))
      .orderBy(desc(workouts.finishedAt))
      .limit(1)
      .get() ?? null;

  const dayExercises = db
    .select({
      routineExerciseId: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      loggingType: exercises.loggingType,
      equipment: exercises.equipment,
      setCount: routineExercises.setCount,
      repMin: routineExercises.repMin,
      repMax: routineExercises.repMax,
      increment: routineExercises.increment,
      incrementUnit: routineExercises.incrementUnit,
      nextWeight: routineExercises.nextWeight,
      nextWeightUnit: routineExercises.nextWeightUnit,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineDayId, day.id))
    .orderBy(asc(routineExercises.position))
    .all();

  return {
    routineId: routine.id,
    routineName: routine.name,
    dayId: day.id,
    dayName: day.name,
    lastTime,
    exercises: dayExercises.map((exercise) => ({
      ...exercise,
      ...lastResult(db, exercise.routineExerciseId, exercise.exerciseId),
    })),
  };
}
