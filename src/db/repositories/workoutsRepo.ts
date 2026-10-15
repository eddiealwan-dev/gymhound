import { and, asc, count, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { gearFor, planInUnit } from '../../domain/plates';
import { addSetNext, countedSets, effectiveIncrement, ladderNext, missStreak, setMeasure } from '../../domain/programRules';
import { computeOutcome, isAllHit, type Outcome, type OutcomeInput, type OutcomeResult } from '../../domain/progression';
import type { TickValues } from '../../domain/setEntry';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { convertIncrement } from '../../domain/units';
import { dayTitle } from '../../domain/upNext';
import type { Program, ProgramSlot } from '../../seed/programTypes';
import { newId } from '../ids';
import {
  exerciseNotes,
  exercises,
  routineDays,
  routineExercises,
  routines,
  sets,
  workoutExercises,
  workouts,
} from '../schema';
import type { Db } from '../types';
import { ActiveWorkoutExistsError, assertNoActiveWorkout, getActiveWorkoutId } from './activeWorkout';
import { writePrFlags } from './prRepo';
import {
  carryUnit,
  ensureRunStarted,
  finishedWorkoutsAfter,
  isBefore,
  programSlotOf,
  runNow,
  slotSessions,
  workoutSlotRows,
  type SlotSession,
  type WorkoutTime,
} from './programRunRepo';
import { programRuleSnapshot, ruleOf } from './ruleSnapshot';
import { rememberSavedWorkout } from './savedWorkoutsRepo';
import { getSettings } from './settingsRepo';

export { ActiveWorkoutExistsError, assertNoActiveWorkout, getActiveWorkoutId };

/** Raised when a workout is finished with no set ticked. An empty workout never reaches history. */
export class NothingTickedError extends Error {
  constructor() {
    super('Nothing is ticked yet.');
    this.name = 'NothingTickedError';
  }
}

/** The active workout's id and its stored rest end (epoch ms, null when no rest is running), or null with no active workout. A light read for the rest watcher. */
export function getActiveRest(db: Db): { workoutId: string; restEndsAt: number | null } | null {
  const row = db
    .select({ id: workouts.id, restEndsAt: workouts.restEndsAt })
    .from(workouts)
    .where(eq(workouts.status, 'active'))
    .get();
  return row ? { workoutId: row.id, restEndsAt: row.restEndsAt } : null;
}

function requireActiveWorkout(db: Db, workoutId: string) {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'active') throw new Error(`No active workout with id ${workoutId}.`);
  return workout;
}

/** Starts an empty workout named "Workout". Throws `ActiveWorkoutExistsError` if one is active. */
export function startEmptyWorkout(db: Db, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const id = newId();
    tx.insert(workouts)
      .values({ id, name: 'Workout', status: 'active', startedAt: now, localDate: toLocalDate(now) })
      .run();
    return id;
  });
}

/**
 * Starts a workout from a routine day. Each exercise copies the day's rule as a snapshot, its planned
 * weight, superset group and position, and gets `set_count` empty working sets. The planned weight and the
 * increment are snapshotted in the display unit (spec 7.1, `planInUnit`); the routine rows are not changed.
 *
 * A day of one of the twenty programs (§18.29) also snapshots the program week and its special kind (R616, R617), and
 * each slot's rule kind and rung, with the set count, range and increment `programRuleSnapshot` gives for the week, the
 * slot's misses in the run, its rung and its added sets. A program whose run has not started starts it now.
 * Throws `ActiveWorkoutExistsError` if one is active, before inserting anything.
 */
export function startWorkoutFromDay(db: Db, routineDayId: string, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const row = tx
      .select({ day: routineDays, routineName: routines.name })
      .from(routineDays)
      .innerJoin(routines, eq(routines.id, routineDays.routineId))
      .where(eq(routineDays.id, routineDayId))
      .get();
    if (!row) throw new Error(`No routine day with id ${routineDayId}.`);
    const { day, routineName } = row;

    ensureRunStarted(tx, day.routineId, now);
    const run = runNow(tx, day.routineId);

    const workoutId = newId();
    tx.insert(workouts)
      .values({
        id: workoutId,
        // Named as Train names the day ("5×5 A", R56); a finished workout keeps the name it was stored with.
        name: dayTitle(routineName, day.name),
        routineId: day.routineId,
        routineDayId: day.id,
        status: 'active',
        startedAt: now,
        localDate: toLocalDate(now),
        programWeek: run?.week ?? null,
        weekKind: run?.weekInfo?.kind ?? null,
      })
      .run();

    const { unit, barLb, barKg, platesLb, platesKg } = getSettings(tx);
    const bar = unit === 'lb' ? barLb : barKg;
    const plates = unit === 'lb' ? platesLb : platesKg;
    const rules = tx
      .select({ rule: routineExercises, equipment: exercises.equipment })
      .from(routineExercises)
      .innerJoin(exercises, eq(routineExercises.exerciseId, exercises.id))
      .where(eq(routineExercises.routineDayId, day.id))
      .orderBy(asc(routineExercises.position))
      .all();
    for (const { rule, equipment } of rules) {
      const slot = run ? programSlotOf(day.routineId, rule.id) : undefined;
      const snapshot =
        run && slot
          ? programRuleSnapshot({
              slot,
              routine: rule,
              week: run.week,
              weekInfo: run.weekInfo,
              unit,
              missedInRun: slotSessions(tx, rule.id, run.runStartedAt, rule.exerciseId).some((s) => s.missed),
              secondsRaises:
                slot.addSet?.then.kind === 'seconds' ? slotSessions(tx, rule.id, 0).filter((s) => s.outcome === 'raised').length : 0,
            })
          : {
              setCount: rule.setCount,
              repMin: rule.repMin,
              repMax: rule.repMax,
              increment: convertIncrement(rule.increment, rule.incrementUnit, unit),
              incrementUnit: unit,
              ruleKind: null,
              ruleRung: null,
            };
      const workoutExerciseId = newId();
      tx.insert(workoutExercises)
        .values({
          id: workoutExerciseId,
          workoutId,
          exerciseId: rule.exerciseId,
          routineExerciseId: rule.id,
          position: rule.position,
          supersetGroup: rule.supersetGroup,
          showRpe: false,
          ruleSetCount: snapshot.setCount,
          ruleRepMin: snapshot.repMin,
          ruleRepMax: snapshot.repMax,
          ruleIncrement: snapshot.increment,
          ruleIncrementUnit: snapshot.incrementUnit,
          ruleKind: snapshot.ruleKind,
          ruleRung: snapshot.ruleRung,
          plannedWeight:
            rule.nextWeight === null
              ? null
              : planInUnit(rule.nextWeight, rule.nextWeightUnit ?? unit, unit, equipment === 'barbell', bar, plates),
          plannedUnit: rule.nextWeight === null ? null : unit,
        })
        .run();
      for (let position = 0; position < snapshot.setCount; position++) {
        tx.insert(sets).values({ id: newId(), workoutExerciseId, position, setType: 'working' }).run();
      }
    }
    return workoutId;
  });
}

/**
 * The day after `routineDayId` in its routine's rotation: the index the routine's pointer moves to, wrapping from the
 * last day to the first, with that day's name and the routine's. Null when the day no longer exists.
 */
function dayAfter(
  db: Db,
  routineDayId: string,
): { routineId: string; nextIndex: number; routineName: string; dayName: string } | null {
  const day = db
    .select({ routineId: routineDays.routineId, routineName: routines.name })
    .from(routineDays)
    .innerJoin(routines, eq(routines.id, routineDays.routineId))
    .where(eq(routineDays.id, routineDayId))
    .get();
  if (!day) return null;
  const days = db
    .select({ id: routineDays.id, name: routineDays.name })
    .from(routineDays)
    .where(eq(routineDays.routineId, day.routineId))
    .orderBy(asc(routineDays.position))
    .all();
  const nextIndex = (days.findIndex((d) => d.id === routineDayId) + 1) % days.length;
  return { routineId: day.routineId, nextIndex, routineName: day.routineName, dayName: days[nextIndex].name };
}

/**
 * What Up next will show once this workout is finished: the title of its routine's day after this one ("Pull A",
 * "5×5 A"). Null for an unknown or empty workout, a day deleted since it started, or a routine that is not the active
 * one, since Up next shows only the active routine.
 */
export function getNextDayTitle(db: Db, workoutId: string): string | null {
  const workout = db.select({ routineDayId: workouts.routineDayId }).from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.routineDayId === null) return null;
  const next = dayAfter(db, workout.routineDayId);
  if (next === null || next.routineId !== getSettings(db).activeRoutineId) return null;
  return dayTitle(next.routineName, next.dayName);
}

/** One exercise's outcome as `storeOutcomes` stored it, with the routine slot it came from (null when none). */
export type StoredOutcome = {
  routineExerciseId: string | null;
  exerciseId: string;
  outcome: Outcome;
  nextWeight: number | null;
  nextUnit: WeightUnit | null;
};

/** A stored outcome with what a program slot's progress needs (§18.29): its slot, rung, next rung and set count. */
type StoredProgramOutcome = StoredOutcome & {
  slot: ProgramSlot | undefined;
  ruleRung: number | null;
  nextRung: number | null;
  nextSetCount: number | null;
};

type SetRow = OutcomeInput['sets'][number];

function setsOf(db: Db, workoutExerciseId: string): SetRow[] {
  return db
    .select({
      setType: sets.setType,
      done: sets.done,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
      durationS: sets.durationS,
      distance: sets.distance,
      distanceUnit: sets.distanceUnit,
    })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .all();
}

/** Sessions that neither count as a miss nor break a run of them (R613): marked, a holding week, nothing counted. */
const skipped = (s: SlotSession) => s.outcome === 'held_marked' || s.outcome === 'held_week' || s.outcome === 'no_sets';

/** A past workout exercise as the rule reads it: its own snapshot, sets and logging type, with `like`'s gear. */
function inputOf(db: Db, workoutExerciseId: string, like: OutcomeInput): OutcomeInput {
  const row = db
    .select({ we: workoutExercises, loggingType: exercises.loggingType, equipment: exercises.equipment })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .get();
  if (!row) return { ...like, sets: [] };
  return {
    ...like,
    rule: ruleOf(row.we),
    plannedWeight: row.we.plannedWeight,
    plannedUnit: row.we.plannedUnit,
    loggingType: row.loggingType,
    equipment: row.equipment,
    marked: row.we.mark !== null,
    sets: setsOf(db, workoutExerciseId),
  };
}

/**
 * The rule on one program slot's workout exercise (§18.29, R610–R623), from its snapshot and the slot's finished history
 * before this workout in the run (`history`, in time order). Returns the outcome and the slot's next rung and set count.
 */
function programOutcome(
  db: Db,
  a: {
    program: Program;
    slot: ProgramSlot;
    exerciseId: string;
    input: OutcomeInput;
    weekHolds: boolean;
    ruleRung: number | null;
    history: readonly SlotSession[];
    /** The workout is in the current run, so its halving is re-derived from history (an earlier run's is kept). */
    inRun: boolean;
  },
): { result: OutcomeResult; nextRung: number | null; nextSetCount: number | null; ruleIncrement?: number } {
  const { program, slot, input, weekHolds, history } = a;
  const rule = input.rule;
  const previousOf = (h: readonly SlotSession[]) => h.filter((x) => !skipped(x)).at(-1);
  const previous = previousOf(history);
  const counted = countedSets(input.sets);
  const status: Outcome = counted.length === 0 ? 'no_sets' : weekHolds ? 'held_week' : input.marked ? 'held_marked' : 'held';
  // The plain hold: nothing added and never a miss, with no weight on a timed set.
  const plain = (): OutcomeResult => ({ ...computeOutcome({ ...input, rule: rule && { ...rule, increment: 0 } }), outcome: status, missed: false });
  // The load rule's misses, halving's reset step and two-session raises (R612, R613, R623).
  const loadInput = (fullIncrementLb: number, h: readonly SlotSession[]): OutcomeInput => {
    const before = previousOf(h);
    return {
      ...input,
      missesBefore: missStreak(h.map((x) => ({ missed: x.missed, skipped: skipped(x), reset: x.outcome === 'reset' }))),
      missesToReset: program.missesToReset,
      resetMultiplier: slot.resetMultiplier,
      fullIncrement: rule ? convertIncrement(fullIncrementLb, 'lb', rule.incrementUnit) : undefined,
      sessionsToRaise: slot.sessionsToRaise,
      previousAllHit:
        slot.sessionsToRaise === 2 && before !== undefined && before.outcome !== 'raised' && isAllHit(inputOf(db, before.workoutExerciseId, input)),
    };
  };

  switch (slot.ruleKind) {
    case 'load': {
      // After a Modify swap, only the current exercise's sessions are the slot's misses (R553, R613).
      const own = history.filter((h) => h.exerciseId === a.exerciseId);
      if (!rule) return { result: computeOutcome(loadInput(slot.incrementLb, own)), nextRung: null, nextSetCount: null };
      // Halving is derived from history, so a recompute re-derives it (R612, §7.12): the full increment, halved after
      // a miss earlier in the run. An earlier run's workout keeps the increment it ran.
      const increment = a.inRun
        ? effectiveIncrement(convertIncrement(slot.incrementLb, 'lb', rule.incrementUnit), slot.halveAfterFirstMiss, own.some((h) => h.missed))
        : rule.increment;
      const result = computeOutcome({ ...loadInput(slot.incrementLb, own), rule: { ...rule, increment } });
      return { result, nextRung: null, nextSetCount: null, ruleIncrement: increment };
    }

    case 'ladder': {
      const ladder = slot.ladder ?? [];
      const rung = a.ruleRung ?? 0;
      const r = ladder[rung];
      if (!rule || !r || status !== 'held') return { result: plain(), nextRung: rung, nextSetCount: null };
      // R618: the top of the rung's range on every set moves up; any set under 5 reps (under the bottom of a hold
      // rung's range) on two normal sessions in a row on this rung moves down.
      const bottom = r.timed ? r.repMin : 5;
      const low = (x: OutcomeInput) => countedSets(x.sets).some((s) => setMeasure(s, x.loggingType) < bottom);
      const allTop = counted.length >= rule.setCount && counted.every((s) => setMeasure(s, input.loggingType) >= r.repMax);
      const lowLastTime =
        previous !== undefined && previous.ruleRung === rung && previous.nextRung === rung && low(inputOf(db, previous.workoutExerciseId, input));
      const move = ladderNext({ rung, rungCount: ladder.length, allTop, lowToday: low(input), lowLastTime });
      if (move.moved !== null) {
        // The next rung starts at the bottom of its range with no weight carried (a different exercise or step).
        const result: OutcomeResult = { ...plain(), outcome: move.moved === 'up' ? 'raised' : 'held', nextWeight: null, nextUnit: null };
        return { result, nextRung: move.rung, nextSetCount: null };
      }
      // A weighted top rung runs the load rule with its own increment (R618); halving is for load slots only.
      if (r.weightedIncrementLb !== null) return { result: computeOutcome(loadInput(r.weightedIncrementLb, history)), nextRung: rung, nextSetCount: null };
      return { result: plain(), nextRung: rung, nextSetCount: null };
    }

    case 'add_set': {
      const addSet = slot.addSet;
      // The count it was at: the last session's next count, since the snapshot is halved on a half-set week.
      const last = [...history].reverse().find((h) => h.nextSetCount !== null);
      const current = last?.nextSetCount ?? slot.sets;
      if (!rule || !addSet || status !== 'held') return { result: plain(), nextRung: null, nextSetCount: current };
      const next = addSetNext({ setCount: rule.setCount, allDone: isAllHit(input), rule: addSet, baseSets: slot.sets });
      if (!next.raise) return { result: plain(), nextRung: null, nextSetCount: next.setCount };
      // At the cap: a heavier bell by the rule's increment and back to the base sets, or seconds a set (R619).
      const result: OutcomeResult = addSet.then.kind === 'load' ? computeOutcome(input) : { ...plain(), outcome: 'raised' };
      return { result, nextRung: null, nextSetCount: next.setCount };
    }

    default:
      // Reps only, holds, manual rules, metcons and runs: §7.3 with the week, and never a miss (R610, R620, R622).
      return { result: computeOutcome(input), nextRung: null, nextSetCount: null };
  }
}

/** What every exercise of a store reads once: the gear in Settings now, and the program's run (null for none). */
type StoreContext = { gear: OutcomeInput['gear']; run: ReturnType<typeof runNow> };

function gearNow(db: Db): OutcomeInput['gear'] {
  const settings = getSettings(db);
  return { lb: gearFor('lb', settings), kg: gearFor('kg', settings) };
}

function storeAll(db: Db, workoutId: string, only?: readonly string[], context?: StoreContext): StoredProgramOutcome[] {
  const gear = context?.gear ?? gearNow(db);
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  const run = context ? context.run : workout?.routineId ? runNow(db, workout.routineId) : null;
  // History counts from the run's start; a workout from before it (an earlier run) reads all the history before it.
  const inRun = run !== null && workout !== undefined && workout.startedAt >= run.runStartedAt;
  const from = run !== null && inRun ? run.runStartedAt : 0;
  const weekHolds = workout !== undefined && workout.weekKind !== null && workout.weekKind !== 'note';
  const rows = db
    .select({ we: workoutExercises, loggingType: exercises.loggingType, equipment: exercises.equipment })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(
      only === undefined
        ? eq(workoutExercises.workoutId, workoutId)
        : and(eq(workoutExercises.workoutId, workoutId), inArray(workoutExercises.id, [...only])),
    )
    .orderBy(asc(workoutExercises.position))
    .all();
  const stored: StoredProgramOutcome[] = [];
  for (const { we, loggingType, equipment } of rows) {
    const input: OutcomeInput = {
      // No routine exercise means no rule (7.3 step 3), whatever the row snapshotted.
      rule: we.routineExerciseId === null ? null : ruleOf(we),
      plannedWeight: we.plannedWeight,
      plannedUnit: we.plannedUnit,
      loggingType,
      equipment,
      marked: we.mark !== null,
      sets: setsOf(db, we.id),
      gear,
    };
    // A program slot is one whose workout snapshotted a rule kind, on a routine that is one of the twenty (R628).
    const slot = we.ruleKind === null || !workout ? undefined : programSlotOf(workout.routineId, we.routineExerciseId);
    const { result, nextRung, nextSetCount, ruleIncrement } =
      slot && run && workout && we.routineExerciseId !== null
        ? programOutcome(db, {
            program: run.program,
            slot,
            exerciseId: we.exerciseId,
            input: { ...input, week: { holds: weekHolds }, distanceUnit: carryUnit(slot) ?? undefined },
            weekHolds,
            ruleRung: we.ruleRung,
            history: slotSessions(db, we.routineExerciseId, from).filter((h) => h.id !== workout.id && isBefore(h, workout)),
            inRun,
          })
        : { result: computeOutcome(input), nextRung: null, nextSetCount: null, ruleIncrement: undefined };
    db.update(workoutExercises)
      .set({
        workingWeight: result.workingWeight,
        workingUnit: result.workingUnit,
        outcome: result.outcome,
        nextWeight: result.nextWeight,
        nextUnit: result.nextUnit,
        missed: result.missed,
        nextRung,
        nextSetCount,
        ...(ruleIncrement === undefined ? {} : { ruleIncrement }),
      })
      .where(eq(workoutExercises.id, we.id))
      .run();
    stored.push({
      routineExerciseId: we.routineExerciseId,
      exerciseId: we.exerciseId,
      outcome: result.outcome,
      nextWeight: result.nextWeight,
      nextUnit: result.nextUnit,
      slot,
      ruleRung: we.ruleRung,
      nextRung,
      nextSetCount,
    });
  }
  return stored;
}

/**
 * Runs the rule (spec 7.3, 18.7) on each exercise of the workout, in position order, and stores its working weight,
 * outcome and next weight on the workout exercise. It writes nothing else: the routine slots are the caller's (finish
 * writes them from this workout, a history edit re-reads the newest finished workout of each slot). "Marked" is the
 * exercise flagged Something off. Each exercise uses its own rule snapshot and planned weight; barbell raises round
 * with the bar and plates in Settings now, for the working unit. With `only`, just those workout exercises are run;
 * the others keep what is stored.
 *
 * A slot of one of the twenty programs (§18.29) also runs its rule kind with the workout's week and the slot's finished
 * history before this workout in the run (misses in a row, the reset, two-session raises, rungs and added sets), and
 * stores `missed`, `next_rung` and `next_set_count`. Your own routines run §7.3 as before (R628).
 */
export function storeOutcomes(db: Db, workoutId: string, only?: readonly string[]): StoredOutcome[] {
  return storeAll(db, workoutId, only).map(({ routineExerciseId, exerciseId, outcome, nextWeight, nextUnit }) => ({
    routineExerciseId,
    exerciseId,
    outcome,
    nextWeight,
    nextUnit,
  }));
}

/**
 * After a history edit or delete of `workout` (§7.12) on one of the twenty programs: each later finished workout of the
 * current run re-runs the rule on its exercises linked to `routineExerciseIds`, in time order, since a slot's misses in
 * a row, halving, two-session raises, rungs and added sets read the sessions before it. Each keeps its own week. A
 * workout from an earlier run changes nothing after it: earlier runs are history, and the current run reads only its
 * own sessions. Your own routines need nothing, since §7.3 reads only the workout itself (R628).
 */
export function rerunLaterInRun(db: Db, workout: WorkoutTime & { routineId: string | null }, routineExerciseIds: readonly string[]): void {
  if (workout.routineId === null || routineExerciseIds.length === 0) return;
  const run = runNow(db, workout.routineId);
  if (!run || workout.startedAt < run.runStartedAt) return;
  const context: StoreContext = { gear: gearNow(db), run };
  const slots = [...new Set(routineExerciseIds)];
  for (const later of finishedWorkoutsAfter(db, workout.routineId, workout)) {
    if (later.startedAt < run.runStartedAt) continue;
    const linked = workoutSlotRows(db, later.id, slots);
    if (linked.length > 0) storeAll(db, later.id, linked, context);
  }
}

/**
 * Runs the rule on the workout (`storeOutcomes`) and, unless an outcome is `no_rule`, writes its next weight to the
 * routine exercise it came from, if that slot still holds the same exercise (R74). At finish the workout is the newest
 * finished one of each of its slots, so its own outcomes are the slots' next weights (7.3). An added-sets slot also
 * takes its next set count (R619). A ladder slot that is still on the rung and exercise the workout logged moves to the
 * next rung, its exercise and its next weight (R618); one moved by Change rung since is left alone.
 */
function writeOutcomes(db: Db, workoutId: string): void {
  for (const o of storeAll(db, workoutId)) {
    if (o.routineExerciseId === null) continue;
    const ladder = o.slot?.ladder;
    if (o.slot?.ruleKind === 'ladder' && ladder) {
      const rung = o.nextRung ?? o.ruleRung ?? 0;
      if (!ladder[rung]) continue;
      const loggedRung = o.ruleRung ?? 0;
      db.update(routineExercises)
        .set({ ladderRung: rung, exerciseId: ladder[rung].exerciseId, nextWeight: o.nextWeight, nextWeightUnit: o.nextUnit })
        .where(
          and(
            eq(routineExercises.id, o.routineExerciseId),
            eq(routineExercises.exerciseId, o.exerciseId),
            loggedRung === 0
              ? or(isNull(routineExercises.ladderRung), eq(routineExercises.ladderRung, 0))
              : eq(routineExercises.ladderRung, loggedRung),
          ),
        )
        .run();
      continue;
    }
    if (o.outcome === 'no_rule') continue;
    // Only while the routine slot still holds this exercise (R74).
    db.update(routineExercises)
      .set({ nextWeight: o.nextWeight, nextWeightUnit: o.nextUnit, ...(o.nextSetCount === null ? {} : { nextSetCount: o.nextSetCount }) })
      .where(and(eq(routineExercises.id, o.routineExerciseId), eq(routineExercises.exerciseId, o.exerciseId)))
      .run();
  }
}

/**
 * Finishes a workout in one transaction: unticked sets are dropped, then exercises left with no sets, then each
 * remaining exercise keeps a copy of its current note (null when it has none) so later note edits never touch
 * history, and runs the rule (`writeOutcomes`), which writes next time's weight back to the routine. The workout is
 * marked finished with its rest timer cleared, its PR flags are written (`writePrFlags`), the saved workout it was
 * started from remembers today's sets (`rememberSavedWorkout`), and the routine's rotation moves to the day after this one. Throws
 * `NothingTickedError`, changing nothing, if no set is ticked.
 */
export function finishWorkout(db: Db, workoutId: string, now: number): void {
  db.transaction((tx) => {
    const workout = requireActiveWorkout(tx, workoutId);

    const ticked = tx
      .select({ n: count() })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(and(eq(workoutExercises.workoutId, workoutId), eq(sets.done, true)))
      .get();
    if (!ticked || ticked.n === 0) throw new NothingTickedError();

    const exerciseIds = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId));
    tx.delete(sets)
      .where(and(inArray(sets.workoutExerciseId, exerciseIds), eq(sets.done, false)))
      .run();
    tx.delete(workoutExercises)
      .where(
        and(
          eq(workoutExercises.workoutId, workoutId),
          notInArray(
            workoutExercises.id,
            tx.select({ id: sets.workoutExerciseId }).from(sets).where(inArray(sets.workoutExerciseId, exerciseIds)),
          ),
        ),
      )
      .run();

    // One correlated subquery per row: null when the exercise has no note.
    const currentNote = sql`(
      select ${exerciseNotes.text} from ${exerciseNotes}
      where ${exerciseNotes.exerciseId} = ${workoutExercises.exerciseId}
    )`;
    tx.update(workoutExercises).set({ note: currentNote }).where(eq(workoutExercises.workoutId, workoutId)).run();

    writeOutcomes(tx, workoutId);

    tx.update(workouts)
      .set({ status: 'finished', finishedAt: now, restEndsAt: null, restSetId: null })
      .where(eq(workouts.id, workoutId))
      .run();

    // Phase 4 (R102, R123): after the status update, since PR eligibility reads finished workouts (R103).
    writePrFlags(tx, workoutId);
    rememberSavedWorkout(tx, workoutId);

    // The routine or day may have been deleted since the workout started; then there is no rotation to move.
    const next = workout.routineDayId === null ? null : dayAfter(tx, workout.routineDayId);
    if (next) {
      tx.update(routines).set({ nextDayIndex: next.nextIndex }).where(eq(routines.id, next.routineId)).run();
    }
  });
}

/** Deletes an active workout with its exercises and sets. The rotation pointer does not move. */
export function discardWorkout(db: Db, workoutId: string): void {
  db.transaction((tx) => {
    requireActiveWorkout(tx, workoutId);
    const exerciseIds = tx
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId));
    tx.delete(sets).where(inArray(sets.workoutExerciseId, exerciseIds)).run();
    tx.delete(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).run();
    tx.delete(workouts).where(eq(workouts.id, workoutId)).run();
  });
}

/**
 * Moves the end of the running rest timer (-15s), keeping the set that started it; or, with null, clears the rest and
 * that set together (Skip).
 */
export function setRestEndsAt(db: Db, workoutId: string, endsAt: number | null): void {
  const patch = endsAt === null ? { restEndsAt: null, restSetId: null } : { restEndsAt: endsAt };
  db.update(workouts).set(patch).where(eq(workouts.id, workoutId)).run();
}

/** Starts a rest timer: its absolute end, and the set whose tick started it, which the countdown shows under (R38). */
export function startRest(db: Db, workoutId: string, endsAt: number, setId: string): void {
  db.update(workouts).set({ restEndsAt: endsAt, restSetId: setId }).where(eq(workouts.id, workoutId)).run();
}

/**
 * Clears the rest end, and the set that started it, only if the end is still `endsAt`, the end that was just dealt
 * with. A tick that started a new rest in the meantime keeps its end and its set.
 */
export function clearRestEndsAtIf(db: Db, workoutId: string, endsAt: number): void {
  db.update(workouts)
    .set({ restEndsAt: null, restSetId: null })
    .where(and(eq(workouts.id, workoutId), eq(workouts.restEndsAt, endsAt)))
    .run();
}

/**
 * Ticks a set with the values `resolveTick` produced. `weight_unit` and `distance_unit` are the units the
 * weight and the distance were logged in, and stay null when the set has no weight or no distance.
 */
export function tickSet(
  db: Db,
  setId: string,
  v: TickValues,
  unit: WeightUnit,
  now: number,
  distanceUnit: DistanceUnit,
): void {
  db.update(sets)
    .set({
      weight: v.weight,
      weightUnit: v.weight === null ? null : unit,
      reps: v.reps,
      durationS: v.durationS,
      distance: v.distance,
      distanceUnit: v.distance === null ? null : distanceUnit,
      // An AMRAP score's extra reps (R607); every other type has none.
      extraReps: v.extraReps ?? null,
      done: true,
      completedAt: now,
    })
    .where(eq(sets.id, setId))
    .run();
}

/** Un-ticks a set. Its values stay, so ticking it again needs no retyping. */
export function untickSet(db: Db, setId: string): void {
  db.update(sets).set({ done: false, completedAt: null }).where(eq(sets.id, setId)).run();
}
