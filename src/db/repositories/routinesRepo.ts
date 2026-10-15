import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { SwapCandidate } from '../../domain/alternatives';
import type { RepSchemeExtra } from '../../domain/labels';
import { programWeek, reactiveDeloadDue } from '../../domain/programRules';
import type { Outcome } from '../../domain/progression';
import { clampRule, dayLabel, linksFromGroups, supersetGroups, validateDraft } from '../../domain/routineDraft';
import type { RoutineDraft } from '../../domain/routineDraft';
import type { Equipment, ExerciseMark, LoggingType, WeightUnit } from '../../domain/types';
import { programById } from '../../seed/programs.generated';
import type { ProgramWeek } from '../../seed/programTypes';
import { PREMADE_ORDER, RETIRED_PREMADES } from '../../seed/routines';
import { newId } from '../ids';
import { exercises, routineDays, routineExercises, routines, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { joinGroupNextWeight, programState, progressionGroup } from './programRunRepo';
import { slotScheme } from './programViewRepo';
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

/**
 * Where Routines lists a routine (§18.29): `program`, one of the twenty; `earlier`, a retired program someone still has
 * (R598); `yours`, a routine of your own.
 */
export type RoutineGroup = 'program' | 'earlier' | 'yours';

export type RoutineSummary = {
  id: string;
  name: string;
  isPremade: boolean;
  dayCount: number;
  isActive: boolean;
  group: RoutineGroup;
};

/** A routine's group: a premade is a program while the seed has it and it isn't retired, else an earlier program. */
function groupOf(r: { id: string; isPremade: boolean; retired: boolean }): RoutineGroup {
  if (!r.isPremade) return 'yours';
  return !r.retired && programById(r.id) !== undefined ? 'program' : 'earlier';
}

const GROUP_ORDER: readonly RoutineGroup[] = ['program', 'earlier', 'yours'];

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
  /** A program slot's scheme words (§18.29): a carry's distance unit, a metcon's format, a run on a clock. */
  schemeExtra?: RepSchemeExtra;
};

/**
 * One of the twenty programs on Up next (§18.29): the week of the next session (R616) and its special kind (R617),
 * whether the block is done (Start over), the reactive deload's offer (R627) with the key Not now stores, and the
 * program's After this program, whose first sentence Up next shows once the block is done.
 */
export type UpNextProgram = {
  week: number;
  weeks: number;
  done: boolean;
  weekInfo: ProgramWeek | null;
  offerDeload: boolean;
  offerKey: string;
  afterThisProgram: string;
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
  /** A premade, which free may or may not hold (§18.21); a routine of your own needs Pro. */
  routineIsPremade: boolean;
  dayId: string;
  dayName: string;
  /** The day's latest finished workout. Its `day_mark` is no longer read: marks are per exercise (R69). */
  lastTime: { localDate: string } | null;
  exercises: UpNextExercise[];
  /** One of the twenty programs with its run started (§18.29); null or absent for any other routine. */
  program?: UpNextProgram | null;
};

/**
 * The twenty programs in `PREMADE_ORDER` (the free five first, R597), then the retired programs still in use (Earlier
 * programs, R598: the nine in their old order, any other by id), then the user's routines by creation time. A retired
 * premade (§18.8) is listed only while it is the active routine or a finished workout was run from it.
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
  const rankIn = (order: readonly string[], id: string) => {
    const rank = order.indexOf(id);
    return rank === -1 ? order.length : rank;
  };
  const rows = db
    .select()
    .from(routines)
    .all()
    .filter((r) => !r.retired || r.id === activeId || inHistory.has(r.id))
    .map((r) => ({ ...r, group: groupOf(r) }));
  rows.sort((a, b) => {
    if (a.group !== b.group) return GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (a.group === 'program') return rankIn(PREMADE_ORDER, a.id) - rankIn(PREMADE_ORDER, b.id) || a.id.localeCompare(b.id);
    if (a.group === 'earlier') return rankIn(RETIRED_PREMADES, a.id) - rankIn(RETIRED_PREMADES, b.id) || a.id.localeCompare(b.id);
    return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isPremade: r.isPremade,
    dayCount: dayCounts.get(r.id) ?? 0,
    isActive: r.id === activeId,
    group: r.group,
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
 * The rule a copy of a program's slot starts from (R635): the slot's sets and base increment, and for a ladder the
 * range of the rung the lifter is on (R618), whose exercise the slot already holds. A weighted top rung rises by its own
 * increment in the slot's unit (lb, or half that in kg, R611). Any other slot keeps its row's range and increment,
 * which the seed writes as the program's base rule; the lifter's progress (rung, added sets) is never copied.
 */
function programSlotRule(
  routineId: string,
  row: { id: string; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit; ladderRung: number | null },
): { repMin: number; repMax: number; increment: number } {
  const slot = programById(routineId)
    ?.days.flatMap((d) => d.slots)
    .find((s) => s.id === row.id);
  const ladder = slot?.ladder ?? null;
  if (ladder === null || ladder.length === 0) return { repMin: row.repMin, repMax: row.repMax, increment: row.increment };
  const rung = ladder[Math.min(Math.max(row.ladderRung ?? 0, 0), ladder.length - 1)];
  const lb = rung.weightedIncrementLb;
  const increment = lb === null ? row.increment : row.incrementUnit === 'lb' ? lb : lb / 2;
  return { repMin: rung.repMin, repMax: rung.repMax, increment };
}

/**
 * Copies a routine, premade or your own, as a routine of your own named "{name} copy", created at `now` and starting
 * from its first day. Every day and exercise is copied with a new id and the same rule and superset group, and with no
 * next weight: the copy's progress starts fresh, and it runs §7.3 as any routine of your own. One of the twenty programs
 * copies its current exercises (a Modify swap, a ladder at its current rung) with their ranges and base increments
 * (R635, `programSlotRule`), and no rung or added sets. Returns the new routine's id. Throws when the routine does not
 * exist. The free limit is the caller's to check first (`canAddRoutine`); whether a program's exercises may be copied
 * is too (`canSeeProgramExercises`).
 */
export function duplicateRoutine(db: Db, routineId: string, now: number): string {
  return db.transaction((tx) => {
    const source = tx.select().from(routines).where(eq(routines.id, routineId)).get();
    if (!source) throw new Error(`No routine with id ${routineId}.`);
    const isProgram = source.isPremade && programById(source.id) !== undefined;

    const id = newId();
    tx.insert(routines)
      .values({ id, name: `${source.name} copy`, isPremade: false, nextDayIndex: 0, createdAt: now })
      .run();

    const days = tx.select().from(routineDays).where(eq(routineDays.routineId, routineId)).all();
    for (const day of days) {
      const dayId = newId();
      tx.insert(routineDays).values({ id: dayId, routineId: id, name: day.name, position: day.position }).run();
      const rows = tx.select().from(routineExercises).where(eq(routineExercises.routineDayId, day.id)).all();
      for (const row of rows) {
        const { id: _id, routineDayId: _dayId, nextWeight: _weight, nextWeightUnit: _unit, ladderRung: _rung, nextSetCount: _sets, ...rule } = row;
        const base = isProgram ? programSlotRule(routineId, row) : {};
        tx.insert(routineExercises).values({ ...rule, ...base, id: newId(), routineDayId: dayId }).run();
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
 * uuids (a new row's next weight is its `startWeight`, if any) and removed ones are deleted. Positions and superset groups are renumbered from the draft's order, names are
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
          // A day made from a saved workout starts at its easiest working load, in the unit it was logged in (R121).
          const start = e.startWeight ?? null;
          tx.insert(routineExercises)
            .values({ id: newId(), ...rule, nextWeight: start?.weight ?? null, nextWeightUnit: start?.unit ?? null })
            .run();
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
 * finished (or was finished before the rule wrote outcomes). On a program, from any slot sharing its progression: the
 * same lift on another day (R625 as amended).
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
          inArray(workoutExercises.routineExerciseId, progressionGroup(db, routineExerciseId)),
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
      ladderRung: routineExercises.ladderRung,
      nextSetCount: routineExercises.nextSetCount,
    })
    .from(routineExercises)
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineExercises.routineDayId, day.id))
    .orderBy(asc(routineExercises.position))
    .all();

  const program = upNextProgram(db, routine.id, routine.runStartedAt, routine.runDeloadAt);
  return {
    routineId: routine.id,
    routineName: routine.name,
    routineIsPremade: routine.isPremade,
    dayId: day.id,
    dayName: day.name,
    lastTime,
    exercises: dayExercises.map(({ ladderRung, nextSetCount, ...exercise }) => ({
      ...exercise,
      // A program slot shows the week's sets and range (R617-R620), as the workout will start it.
      ...(program ? (slotScheme(db, routine.id, { ...exercise, ladderRung, nextSetCount }, program.week, program.weekInfo) ?? {}) : {}),
      ...lastResult(db, exercise.routineExerciseId, exercise.exerciseId),
    })),
    program,
  };
}

/** The program part of Up next (§18.29): null for a routine that is not one of the twenty, or with no run yet. */
function upNextProgram(db: Db, routineId: string, runStartedAt: number | null, runDeloadAt: number | null): UpNextProgram | null {
  const program = programById(routineId);
  const state = program && runStartedAt !== null ? programState(db, routineId) : null;
  if (!program || !state || runStartedAt === null) return null;
  // The offer is for the week of the latest finished session (R627), until Not now for that week, the tap, or the end.
  const missWeek = state.sessions === 0 ? 0 : programWeek(state.sessions - 1, program.daysPerWeek);
  const offerKey = `${routineId}:${runStartedAt}:${missWeek}`;
  const offerDeload =
    program.reactiveDeload &&
    !state.done &&
    runDeloadAt === null &&
    state.weekInfo?.halfSets !== true &&
    reactiveDeloadDue(state.mainMissesThisWeek) &&
    getSettings(db).deloadOfferDismissed !== offerKey;
  return {
    week: state.week,
    weeks: program.weeks,
    done: state.done,
    weekInfo: state.weekInfo,
    offerDeload,
    offerKey,
    afterThisProgram: program.afterThisProgram,
  };
}

/** Not now on the reactive deload's offer (R627): it is not offered again for that run and week. */
export function dismissDeloadOffer(db: Db, offerKey: string): void {
  setSetting(db, 'deloadOfferDismissed', offerKey);
}

/** Every exercise Modify can offer (R553): the library and your own, not archived. */
export function swapCandidates(db: Db): SwapCandidate[] {
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      pattern: exercises.pattern,
      equipment: exercises.equipment,
      loggingType: exercises.loggingType,
      isCustom: exercises.isCustom,
    })
    .from(exercises)
    .where(eq(exercises.archived, false))
    .all();
}

/**
 * Modify on a routine's page (R553): the routine's exercise at `routineExerciseId` becomes `exerciseId`, keeping its
 * sets, reps and increment. Its next weight is cleared, since it was the old exercise's: the first workout with the new
 * one asks for a starting weight, unless on a program another day runs the new one with the same range and rule: then
 * it shares that progression's next weight (R625 as amended). Workouts already finished keep the old exercise.
 */
export function swapRoutineExercise(db: Db, routineExerciseId: string, exerciseId: string): void {
  db.update(routineExercises).set({ exerciseId, nextWeight: null, nextWeightUnit: null }).where(eq(routineExercises.id, routineExerciseId)).run();
  // On a program, swapping onto a lift another day runs joins its progression and its next weight (R625 as amended).
  joinGroupNextWeight(db, routineExerciseId);
}
