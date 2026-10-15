import { and, asc, eq, gte, inArray, isNotNull, isNull } from 'drizzle-orm';
import { blockDone, programWeek, weekInfo } from '../../domain/programRules';
import type { WeightUnit } from '../../domain/types';
import { programById } from '../../seed/programs.generated';
import type { Program, ProgramSlot, ProgramWeek } from '../../seed/programTypes';
import { routineDays, routineExercises, routines, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { setSetting } from './settingsRepo';

/**
 * A program's run (spec §18.29, R616, R627, R636): when it started, the week counted from the finished workouts since
 * then, the reactive deload, and a ladder's rung (R618). Weeks, misses and resets are derived from finished history,
 * never counted in a stored counter (§7.12); only the run's start, the deload's start and the lifter's rung are stored.
 * Routines that are not one of the twenty (your own, a Duplicate, a retired premade) have no run (R628).
 */

const slotsByProgram = new Map<string, ReadonlyMap<string, ProgramSlot>>();

/** The program slot a routine exercise is (its id is the slot's id, as seed 9 writes it), or undefined for any other. */
export function programSlotOf(routineId: string | null, routineExerciseId: string | null): ProgramSlot | undefined {
  if (routineId === null || routineExerciseId === null) return undefined;
  const program = programById(routineId);
  if (!program) return undefined;
  let slots = slotsByProgram.get(program.id);
  if (!slots) {
    slots = new Map(program.days.flatMap((d) => d.slots.map((s) => [s.id, s] as const)));
    slotsByProgram.set(program.id, slots);
  }
  return slots.get(routineExerciseId);
}

/** What makes two program slots one progression (R625, ruling R-w1): the rule kind, the range and target unit, the
 * exercise now in the slot and, for a ladder, the same rungs and the rung it is on. */
function progressionKey(slot: ProgramSlot, row: { exerciseId: string; ladderRung: number | null }): string {
  const ladder = slot.ladder ? `${JSON.stringify(slot.ladder)}@${row.ladderRung ?? 0}` : '';
  return [slot.ruleKind, slot.repMin, slot.repMax, slot.targetUnit, row.exerciseId, ladder].join('|');
}

/** A second slot of one exercise on a day (`…@2`, R625): its own progression, never shared. */
const isRepeatSlot = (slot: ProgramSlot) => slot.id.includes('@');

/**
 * The slots that share one progression with a routine slot (R625 as amended by ruling R-w1): on one of the twenty
 * programs, a slot on each other day with the same rule kind, range and target unit whose exercise is now the same
 * (after a Modify swap or a ladder's rung change, the exercise in the slot now), and for a ladder the same rungs on the
 * same rung. They share next weight, misses, halving, resets, the two-session raise, the rung and added sets: each
 * reads the group's history. Slots whose range or kind differ stay their own (#6's two bench ranges, #12's top set and
 * back-off), as does a repeat slot (`@2`). One slot a day: never another slot on the slot's own day, and on another day
 * that holds two matches (after a Modify swap), the first. Just the slot itself for your own routines (R628) and a slot
 * that no longer exists. The slot comes first.
 */
export function progressionGroup(db: Db, routineExerciseId: string): string[] {
  const own = db
    .select({
      routineId: routineDays.routineId,
      dayId: routineExercises.routineDayId,
      exerciseId: routineExercises.exerciseId,
      ladderRung: routineExercises.ladderRung,
    })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineExercises.id, routineExerciseId))
    .get();
  const slot = own ? programSlotOf(own.routineId, routineExerciseId) : undefined;
  if (!own || !slot || isRepeatSlot(slot)) return [routineExerciseId];
  const key = progressionKey(slot, own);
  const rows = db
    .select({
      id: routineExercises.id,
      dayId: routineExercises.routineDayId,
      exerciseId: routineExercises.exerciseId,
      ladderRung: routineExercises.ladderRung,
    })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineDays.routineId, own.routineId))
    .orderBy(asc(routineDays.position), asc(routineExercises.position))
    .all();
  const group = [routineExerciseId];
  const days = new Set([own.dayId]);
  for (const r of rows) {
    if (days.has(r.dayId)) continue;
    const s = programSlotOf(own.routineId, r.id);
    if (s === undefined || isRepeatSlot(s) || progressionKey(s, r) !== key) continue;
    group.push(r.id);
    days.add(r.dayId);
  }
  return group;
}

/**
 * The next weight of the slot's progression (`progressionGroup`): the slot's own, else the first other slot's that has
 * one (a slot that just joined it by a Modify swap or Change rung has none of its own). Null when none has one.
 */
export function groupNextWeight(db: Db, routineExerciseId: string): { weight: number; unit: WeightUnit | null } | null {
  const group = progressionGroup(db, routineExerciseId);
  const rows = db
    .select({ id: routineExercises.id, weight: routineExercises.nextWeight, unit: routineExercises.nextWeightUnit })
    .from(routineExercises)
    .where(and(inArray(routineExercises.id, group), isNotNull(routineExercises.nextWeight)))
    .all();
  const row = group.map((id) => rows.find((r) => r.id === id)).find((r) => r !== undefined);
  return row && row.weight !== null ? { weight: row.weight, unit: row.unit } : null;
}

/** A slot that has joined a progression (a Modify swap or Change rung onto the lift another day runs) takes its next
 * weight, so Up next and the next workout plan it (R625 as amended). Nothing changes for a slot with no group. */
export function joinGroupNextWeight(db: Db, routineExerciseId: string): void {
  const plan = groupNextWeight(db, routineExerciseId);
  if (!plan) return;
  db.update(routineExercises)
    .set({ nextWeight: plan.weight, nextWeightUnit: plan.unit })
    .where(and(eq(routineExercises.id, routineExerciseId), isNull(routineExercises.nextWeight)))
    .run();
}

/** A finished workout's place in time: history is ordered by finish, then start, then id (as `refreshNextWeights`). */
export type WorkoutTime = { id: string; startedAt: number; finishedAt: number | null };

/** Whether `a` comes before `b` in history. An active workout (no finish) comes after every finished one. */
export function isBefore(a: WorkoutTime, b: WorkoutTime): boolean {
  const af = a.finishedAt ?? Number.POSITIVE_INFINITY;
  const bf = b.finishedAt ?? Number.POSITIVE_INFINITY;
  if (af !== bf) return af < bf;
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt;
  return a.id < b.id;
}

/** The finished workouts of a routine started at or after `from`, in time order. */
export function finishedWorkoutsSince(db: Db, routineId: string, from: number): WorkoutTime[] {
  const rows = db
    .select({ id: workouts.id, startedAt: workouts.startedAt, finishedAt: workouts.finishedAt })
    .from(workouts)
    .where(and(eq(workouts.routineId, routineId), eq(workouts.status, 'finished'), gte(workouts.startedAt, from)))
    .all();
  return rows.sort((a, b) => (isBefore(a, b) ? -1 : isBefore(b, a) ? 1 : 0));
}

/** One finished session of a program slot, as `storeOutcomes` stored it. */
export type SlotSession = WorkoutTime & {
  workoutExerciseId: string;
  exerciseId: string;
  missed: boolean;
  outcome: string | null;
  mark: string | null;
  ruleRung: number | null;
  nextRung: number | null;
  nextSetCount: number | null;
};

/** A carry slot's distance unit (R607): ft or yd from the program's target unit; null for any other slot. */
export function carryUnit(slot: ProgramSlot | undefined): 'ft' | 'yd' | null {
  if (slot?.targetUnit === 'feet') return 'ft';
  if (slot?.targetUnit === 'yards') return 'yd';
  return null;
}

/**
 * The finished sessions of a routine slot's progression (`progressionGroup`: the slot, and on a program the slots on
 * other days that share it, R625 as amended) whose workout started at or after `from`, in time order; with
 * `exerciseId`, only those that logged it (after a Modify swap, the old exercise's sessions are not the slot's misses,
 * R553).
 */
export function slotSessions(db: Db, routineExerciseId: string, from: number, exerciseId?: string): SlotSession[] {
  const group = progressionGroup(db, routineExerciseId);
  const rows = db
    .select({
      id: workouts.id,
      startedAt: workouts.startedAt,
      finishedAt: workouts.finishedAt,
      workoutExerciseId: workoutExercises.id,
      exerciseId: workoutExercises.exerciseId,
      missed: workoutExercises.missed,
      outcome: workoutExercises.outcome,
      mark: workoutExercises.mark,
      ruleRung: workoutExercises.ruleRung,
      nextRung: workoutExercises.nextRung,
      nextSetCount: workoutExercises.nextSetCount,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.routineExerciseId, group),
        exerciseId === undefined ? undefined : eq(workoutExercises.exerciseId, exerciseId),
        eq(workouts.status, 'finished'),
        gte(workouts.startedAt, from),
      ),
    )
    .all();
  return rows.sort((a, b) => (isBefore(a, b) ? -1 : isBefore(b, a) ? 1 : 0));
}

/**
 * Where a program's run is now (R616, R617, R627): the finished sessions since it started, the week of the next one,
 * that week's special kind (null on a normal week and once the block is done) and whether the block is done. Null for a
 * routine that is not one of the twenty, or a program whose run has not started.
 */
export function runNow(
  db: Db,
  routineId: string,
): { program: Program; runStartedAt: number; sessions: WorkoutTime[]; week: number; weekInfo: ProgramWeek | null; done: boolean } | null {
  const program = programById(routineId);
  if (!program) return null;
  const routine = db
    .select({ runStartedAt: routines.runStartedAt, runDeloadAt: routines.runDeloadAt })
    .from(routines)
    .where(eq(routines.id, routineId))
    .get();
  if (!routine || routine.runStartedAt === null) return null;
  const sessions = finishedWorkoutsSince(db, routineId, routine.runStartedAt);
  const week = programWeek(sessions.length, program.daysPerWeek);
  // The deload starts after the sessions started before the tap: counted from the time, so deleting or adding a
  // workout before it never stretches or shortens the deload (§7.12).
  const runDeloadAt = routine.runDeloadAt;
  const early =
    runDeloadAt === null
      ? null
      : { deloadAt: sessions.filter((s) => s.startedAt < runDeloadAt).length, session: sessions.length, daysPerWeek: program.daysPerWeek };
  return {
    program,
    runStartedAt: routine.runStartedAt,
    sessions,
    week,
    weekInfo: weekInfo(program.weekPlan, program.weeks, week, early),
    done: blockDone(program.weeks, week, early),
  };
}

/** Starts the program's run at `now` when it has none (R616); any other routine is left alone. */
export function ensureRunStarted(db: Db, routineId: string, now: number): void {
  if (!programById(routineId)) return;
  db.update(routines)
    .set({ runStartedAt: now })
    .where(and(eq(routines.id, routineId), isNull(routines.runStartedAt)))
    .run();
}

/**
 * Set active (R636): makes the routine the active one (null for none). One of the twenty starts its run at `now` when it
 * has none, at week 1; one that has a run continues it, so switching away and back never resets a run (R616).
 */
export function setActiveProgram(db: Db, routineId: string | null, now: number): void {
  setSetting(db, 'activeRoutineId', routineId);
  if (routineId !== null) ensureRunStarted(db, routineId, now);
}

/**
 * Start over (R616): the program's run starts again at `now`, at week 1, with no deload pending, so halving after the
 * first miss and the miss counts start again. Weights, rungs and added sets stay (they are the lifter's progress).
 */
export function startProgramOver(db: Db, routineId: string, now: number): void {
  if (!programById(routineId)) throw new Error(`${routineId} is not a program.`);
  db.update(routines).set({ runStartedAt: now, runDeloadAt: null }).where(eq(routines.id, routineId)).run();
}

export type ProgramState = {
  /** The week of the next session (R616): "Week 3 of 12". */
  week: number;
  /** That week's special kind (R617), or the reactive deload (R627); null on a normal week and once the block is done. */
  weekInfo: ProgramWeek | null;
  /** The block is done (after the last week, or after an early deload): "12 weeks done." and Start over. */
  done: boolean;
  /** Finished sessions since the run started. */
  sessions: number;
  /**
   * Main lifts (each day's first slot) that missed in the week of the latest finished session (R627). It is that week's
   * and not the next session's, so a second miss on the last day of a week still offers the deload until the lifter
   * trains again. 0 before the first session.
   */
  mainMissesThisWeek: number;
  /** Resets of each slot's progression (`progressionGroup`) in this run, by routine exercise id (R614). */
  resetsBySlot: Record<string, number>;
};

/** The program's run as Up next and its page show it. Null for a routine that is not one of the twenty, or with no run. */
export function programState(db: Db, routineId: string): ProgramState | null {
  const run = runNow(db, routineId);
  if (!run) return null;
  const { program, sessions } = run;
  const ids = sessions.map((s) => s.id);
  const rows =
    ids.length === 0
      ? []
      : db
          .select({
            workoutId: workoutExercises.workoutId,
            routineExerciseId: workoutExercises.routineExerciseId,
            missed: workoutExercises.missed,
            outcome: workoutExercises.outcome,
          })
          .from(workoutExercises)
          .where(inArray(workoutExercises.workoutId, ids))
          .all();

  // A reset counts for every slot of its progression: the squat dropped back on day A and on day B is one lift
  // dropped back twice (R614, R625 as amended).
  const resetsBySlot: Record<string, number> = {};
  for (const r of rows) {
    if (r.outcome !== 'reset' || r.routineExerciseId === null) continue;
    for (const id of progressionGroup(db, r.routineExerciseId)) resetsBySlot[id] = (resetsBySlot[id] ?? 0) + 1;
  }

  let mainMissesThisWeek = 0;
  if (sessions.length > 0) {
    const weekOf = (index: number) => programWeek(index, program.daysPerWeek);
    const lastWeek = weekOf(sessions.length - 1);
    const inWeek = new Set(sessions.filter((_, i) => weekOf(i) === lastWeek).map((s) => s.id));
    const mains = new Set(program.days.flatMap((d) => d.slots.filter((s) => s.isMain).map((s) => s.id)));
    // Main lifts, not sessions: one slot that missed twice in the week is one lift (R627).
    mainMissesThisWeek = new Set(
      rows
        .filter((r) => r.missed && inWeek.has(r.workoutId) && r.routineExerciseId !== null && mains.has(r.routineExerciseId))
        .map((r) => r.routineExerciseId),
    ).size;
  }

  return { week: run.week, weekInfo: run.weekInfo, done: run.done, sessions: sessions.length, mainMissesThisWeek, resetsBySlot };
}

/**
 * Start deload (R627): the tap's time, `now`, is stored; the next `daysPerWeek` sessions started after it are the
 * deload, and the block ends after them. Nothing happens for a routine with no run, or once a deload is pending.
 */
export function startEarlyDeload(db: Db, routineId: string, now: number): void {
  const run = runNow(db, routineId);
  if (!run) return;
  db.update(routines)
    .set({ runDeloadAt: now })
    .where(and(eq(routines.id, routineId), isNull(routines.runDeloadAt)))
    .run();
}

/**
 * Change rung (R618): the ladder slot moves to `rung` (0-based) and logs that rung's exercise from the next workout. Its
 * next weight is cleared, since it was the old rung's; on a rung another day of the program is on, it takes that
 * progression's (R625 as amended). Throws for a slot that is not a ladder or a rung it lacks.
 */
export function changeRung(db: Db, routineExerciseId: string, rung: number): void {
  const row = db
    .select({ routineId: routineDays.routineId })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .where(eq(routineExercises.id, routineExerciseId))
    .get();
  const ladder = programSlotOf(row?.routineId ?? null, routineExerciseId)?.ladder;
  if (!ladder) throw new Error(`${routineExerciseId} is not a ladder.`);
  if (!Number.isInteger(rung) || rung < 0 || rung >= ladder.length) throw new Error(`No rung ${rung} on ${routineExerciseId}.`);
  db.update(routineExercises)
    .set({ ladderRung: rung, exerciseId: ladder[rung].exerciseId, nextWeight: null, nextWeightUnit: null })
    .where(eq(routineExercises.id, routineExerciseId))
    .run();
  joinGroupNextWeight(db, routineExerciseId);
}

/** The finished workouts of a routine after `w` in time order (for a history edit's recompute, §7.12). */
export function finishedWorkoutsAfter(db: Db, routineId: string, w: WorkoutTime): WorkoutTime[] {
  return finishedWorkoutsSince(db, routineId, 0).filter((x) => x.id !== w.id && isBefore(w, x));
}

/** The ids of a workout's exercises linked to any of `routineExerciseIds`, in position order. */
export function workoutSlotRows(db: Db, workoutId: string, routineExerciseIds: readonly string[]): string[] {
  if (routineExerciseIds.length === 0) return [];
  return db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), inArray(workoutExercises.routineExerciseId, [...routineExerciseIds])))
    .orderBy(asc(workoutExercises.position))
    .all()
    .map((r) => r.id);
}
