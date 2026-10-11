import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { Outcome } from '../../domain/progression';
import { clampRule, dayLabel, linksFromGroups, supersetGroups, validateDraft } from '../../domain/routineDraft';
import type { RoutineDraft } from '../../domain/routineDraft';
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

/** Raised when a draft that does not validate is saved. `errors` is `validateDraft`'s list, in the editor's words. */
export class InvalidDraftError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(' '));
    this.name = 'InvalidDraftError';
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

/**
 * The premades in `PREMADE_ORDER`, then the retired premades still in use (by id), then the user's routines by
 * creation time. A retired premade (§18.8) is listed only while it is the active routine or a finished workout was
 * run from it.
 */
export function listRoutines(db: Db): RoutineSummary[] {
  const activeId = getSettings(db).activeRoutineId;
  const dayCounts = new Map<string, number>();
  for (const { routineId } of db.select({ routineId: routineDays.routineId }).from(routineDays).all()) {
    dayCounts.set(routineId, (dayCounts.get(routineId) ?? 0) + 1);
  }

  const inHistory = new Set(
    db
      .selectDistinct({ routineId: workouts.routineId })
      .from(workouts)
      .innerJoin(routines, and(eq(routines.id, workouts.routineId), eq(routines.retired, true)))
      .where(eq(workouts.status, 'finished'))
      .all()
      .map((w) => w.routineId),
  );
  const premadeRank = (id: string) => {
    const rank = PREMADE_ORDER.indexOf(id);
    return rank === -1 ? PREMADE_ORDER.length : rank;
  };
  const rows = db
    .select()
    .from(routines)
    .all()
    .filter((r) => !r.retired || r.id === activeId || inHistory.has(r.id));
  rows.sort((a, b) => {
    if (a.isPremade !== b.isPremade) return a.isPremade ? -1 : 1;
    if (a.isPremade) return premadeRank(a.id) - premadeRank(b.id) || a.id.localeCompare(b.id);
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

/** A routine as the editor's draft, every row keyed by its id; null when it does not exist. */
export function routineToDraft(db: Db, routineId: string): RoutineDraft | null {
  const detail = getRoutineDetail(db, routineId);
  if (!detail) return null;
  return {
    id: detail.id,
    name: detail.name,
    nextKey: 1,
    days: detail.days.map((day) => {
      const links = linksFromGroups(day.exercises.map((e) => e.supersetGroup));
      return {
        key: day.id,
        id: day.id,
        name: day.name,
        exercises: day.exercises.map((e, i) => ({
          key: e.id,
          id: e.id,
          exerciseId: e.exerciseId,
          name: e.name,
          loggingType: e.loggingType,
          setCount: e.setCount,
          repMin: e.repMin,
          repMax: e.repMax,
          increment: e.increment,
          incrementUnit: e.incrementUnit,
          supersetWithNext: links[i],
        })),
      };
    }),
  };
}

/**
 * Where the rotation points once the days are saved: the day that was up next, at its new place; if it was deleted,
 * the first day after it (wrapping) that stays; 0 when none stays.
 */
function nextDayIndexAfter(oldDayIds: string[], nextDayIndex: number, newIndexById: Map<string, number>): number {
  for (let step = 0; step < oldDayIds.length; step++) {
    const id = oldDayIds[(nextDayIndex + step) % oldDayIds.length];
    const index = newIndexById.get(id);
    if (index !== undefined) return index;
  }
  return 0;
}

/**
 * Saves the editor's draft in one transaction (R89) and returns the routine's id. A new draft becomes a routine of
 * your own, created at `now`. Otherwise days and exercises that still exist in the routine are updated in place by id,
 * so an exercise that stays keeps its next weight (unless its slot now holds another exercise, R74); new rows get
 * uuids and removed ones are deleted. Positions and superset groups are renumbered from the draft's order, names are
 * trimmed, rules are kept within the editor's limits (`clampRule`), and the day up next stays up next. Workouts are never touched, a workout in progress included. Throws
 * `InvalidDraftError` for a draft that does not validate and `PremadeRoutineError` for a premade, changing nothing.
 * The free limit is the caller's to check before a new routine (`canAddRoutine`).
 */
export function saveRoutine(db: Db, draft: RoutineDraft, now: number): string {
  const errors = validateDraft(draft);
  if (errors.length > 0) throw new InvalidDraftError(errors);

  return db.transaction((tx) => {
    const name = draft.name.trim();
    let routineId: string;
    let nextDayIndex = 0;
    if (draft.id === null) {
      routineId = newId();
      tx.insert(routines).values({ id: routineId, name, isPremade: false, nextDayIndex: 0, createdAt: now }).run();
    } else {
      const routine = tx.select().from(routines).where(eq(routines.id, draft.id)).get();
      if (!routine) throw new Error(`No routine with id ${draft.id}.`);
      if (routine.isPremade) throw new PremadeRoutineError();
      routineId = routine.id;
      nextDayIndex = routine.nextDayIndex;
    }

    const oldDayIds = tx
      .select({ id: routineDays.id })
      .from(routineDays)
      .where(eq(routineDays.routineId, routineId))
      .orderBy(asc(routineDays.position), asc(routineDays.id))
      .all()
      .map((d) => d.id);
    const oldExercises = new Map(
      (oldDayIds.length === 0
        ? []
        : tx
            .select({ id: routineExercises.id, exerciseId: routineExercises.exerciseId })
            .from(routineExercises)
            .where(inArray(routineExercises.routineDayId, oldDayIds))
            .all()
      ).map((e) => [e.id, e.exerciseId]),
    );

    // Only this routine's own rows are updated in place, each once; any other id is saved as a new row.
    const kept = new Set<string>();
    const keep = (id: string | null, existing: (id: string) => boolean): string | null => {
      if (id === null || kept.has(id) || !existing(id)) return null;
      kept.add(id);
      return id;
    };

    const newIndexById = new Map<string, number>();
    draft.days.forEach((day, position) => {
      const dayName = dayLabel(day, position);
      let dayId = keep(day.id, (id) => oldDayIds.includes(id));
      if (dayId === null) {
        dayId = newId();
        tx.insert(routineDays).values({ id: dayId, routineId, name: dayName, position }).run();
      } else {
        tx.update(routineDays).set({ name: dayName, position }).where(eq(routineDays.id, dayId)).run();
        newIndexById.set(dayId, position);
      }

      const groups = supersetGroups(day.exercises);
      day.exercises.forEach((e, index) => {
        const rule = {
          routineDayId: dayId,
          exerciseId: e.exerciseId,
          position: index,
          supersetGroup: groups[index],
          // The editor's limits hold for any draft, a hand-built one included.
          ...clampRule({ setCount: e.setCount, repMin: e.repMin, repMax: e.repMax, increment: e.increment }),
          incrementUnit: e.incrementUnit,
        };
        const rowId = keep(e.id, (id) => oldExercises.has(id));
        if (rowId === null) {
          tx.insert(routineExercises).values({ id: newId(), ...rule }).run();
          return;
        }
        // A slot that now holds another exercise starts its progress afresh (R74).
        const progress = oldExercises.get(rowId) === e.exerciseId ? {} : { nextWeight: null, nextWeightUnit: null };
        tx.update(routineExercises).set({ ...rule, ...progress }).where(eq(routineExercises.id, rowId)).run();
      });
    });

    const removedExercises = [...oldExercises.keys()].filter((id) => !kept.has(id));
    if (removedExercises.length > 0) tx.delete(routineExercises).where(inArray(routineExercises.id, removedExercises)).run();
    const removedDays = oldDayIds.filter((id) => !kept.has(id));
    if (removedDays.length > 0) {
      tx.delete(routineExercises).where(inArray(routineExercises.routineDayId, removedDays)).run();
      tx.delete(routineDays).where(inArray(routineDays.id, removedDays)).run();
    }

    const upNextIndex =
      oldDayIds.length === 0 ? 0 : nextDayIndexAfter(oldDayIds, nextDayIndex % oldDayIds.length, newIndexById);
    tx.update(routines).set({ name, nextDayIndex: upNextIndex }).where(eq(routines.id, routineId)).run();
    return routineId;
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
