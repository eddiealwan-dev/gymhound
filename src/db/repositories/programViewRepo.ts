import { and, asc, eq, inArray } from 'drizzle-orm';
import { formatRest } from '../../domain/dates';
import { beatTwice, beatTwiceForTime, missStreak } from '../../domain/programRules';
import {
  addSetLine,
  BEAT_TWICE,
  finishLine,
  ladderDownWhy,
  ladderMoveLine,
  metconText,
  resetWhy,
  rungName,
  secondsUpLine,
  slotNoteText,
  weekLine,
  type NextTime,
  type ProgramRule,
  type RungWords,
} from '../../domain/ruleLine';
import type { RepSchemeExtra } from '../../domain/labels';
import { weekInfo as weekInfoFor } from '../../domain/programRules';
import { restKindOf, type RestKind } from '../../domain/restKind';
import type { Equipment, LoggingType, Pattern, WeightUnit } from '../../domain/types';
import { convertIncrement } from '../../domain/units';
import { programById } from '../../seed/programs.generated';
import type { LadderRung, MetconRule, Program, ProgramSlot, ProgramWeek, RuleKind, WeekKind } from '../../seed/programTypes';
import { exercises, routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { carryUnit, changeRung, isBefore, programSlotOf, programState, runNow, slotSessions, type SlotSession } from './programRunRepo';
import { programRuleSnapshot, type RuleSnapshot } from './ruleSnapshot';
import { replaceExercise } from './workoutEditRepo';

/**
 * What the screens show of a program slot (spec §18.29, R610–R627): the rule's words for the session (`ProgramRule`),
 * the warm-up line, the slot's note, a ladder's rungs for Change rung, and the week. Everything is read from the
 * program data and the slot's finished history, as the engine derives it (§7.12); nothing here writes, except Change
 * rung in a workout.
 */

/** Mobility for Lifters: its first slots are Mobility moves, so it has no warm-up line (ruling R-t2b). */
const MOBILITY = 'program-mobility-for-lifters';

/**
 * The special week a workout ran in (R617), from what it snapshotted: its program week and the week's kind. The plan's
 * week of that kind; for the reactive deload (R627), the plan's deload or a half-set deload; null on a normal week.
 */
export function weekInfoOf(program: Program, week: number | null, kind: WeekKind | null): ProgramWeek | null {
  if (kind === null) return null;
  return (
    program.weekPlan.find((w) => w.week === week && w.kind === kind) ??
    program.weekPlan.find((w) => w.kind === kind) ?? { week: week ?? 1, kind, halfSets: kind !== 'note', holds: kind !== 'note', runShare: 1, note: '' }
  );
}

/** The types whose first slot makes a lifting day: a load the warm-up's percentages are of (R645). */
const LIFTED: readonly LoggingType[] = ['weighted', 'weighted_time', 'weighted_distance'];

/**
 * Whether a slot shows the warm-up line (R626, R645, ruling R-t2b): each lifting day's first slot, but not a run, a
 * metcon, a hold (#16's skill holds, a timed rung), a Mobility move, or a bodyweight or calisthenics movement (a
 * ladder, a pull-up), whose percentages have no working weight to be of.
 */
export function showsWarmUp(program: Program, slot: ProgramSlot, loggingType: LoggingType): boolean {
  if (!slot.warmUpLine || program.id === MOBILITY) return false;
  if (slot.ruleKind === 'weekly_seconds' || slot.ruleKind === 'metcon' || slot.ruleKind === 'hold' || slot.ruleKind === 'ladder') return false;
  return LIFTED.includes(loggingType);
}

/** A ladder's rungs as its lines name them (R618), with each exercise's name from the library. */
export function rungWordsOf(db: Db, ladder: readonly LadderRung[]): RungWords[] {
  const ids = [...new Set(ladder.map((r) => r.exerciseId))];
  const names = new Map(
    db
      .select({ id: exercises.id, name: exercises.name })
      .from(exercises)
      .where(inArray(exercises.id, ids))
      .all()
      .map((r) => [r.id, r.name]),
  );
  return ladder.map((r) => {
    const weighted = r.weightedIncrementLb !== null;
    return { name: rungName(names.get(r.exerciseId) ?? r.exerciseId, weighted), timed: r.timed, repMin: r.repMin, repMax: r.repMax, weighted };
  });
}

/** A finished session the miss count skips (R613): marked, a holding week, or nothing logged. As the engine reads it. */
const skipped = (s: SlotSession) => s.outcome === 'held_marked' || s.outcome === 'held_week' || s.outcome === 'no_sets';

/**
 * The slot's misses in a row before now, in the run (R613), counted as the engine counts them: a load slot's by the
 * exercise now in it (after a Modify swap), a ladder's weighted top rung over the sessions on that rung. On a program,
 * the lift's sessions on any day (R625 as amended).
 */
function missesBefore(db: Db, routineExerciseId: string, runStartedAt: number, by: { exerciseId: string } | { rung: number }): number {
  const history =
    'exerciseId' in by
      ? slotSessions(db, routineExerciseId, runStartedAt, by.exerciseId)
      : slotSessions(db, routineExerciseId, runStartedAt).filter((h) => (h.ruleRung ?? 0) === by.rung);
  return missStreak(history.map((h) => ({ missed: h.missed, skipped: skipped(h), reset: h.outcome === 'reset' })));
}

/** What a program slot's rule line reads (R610–R622), with what the workout snapshotted. */
export function programRuleOf(
  db: Db,
  a: {
    program: Program;
    slot: ProgramSlot;
    routineExerciseId: string;
    exerciseId: string;
    ruleKind: RuleKind;
    ruleRung: number | null;
    rule: RuleSnapshot | null;
    week: number;
    weekInfo: ProgramWeek | null;
    runStartedAt: number | null;
  },
): ProgramRule {
  const { program, slot, rule } = a;
  const full = rule ? convertIncrement(slot.incrementLb, 'lb', rule.incrementUnit) : 0;
  // A weighted top rung runs the load rule (R618), so it warns before a reset as a load slot does.
  const weightedRung = a.ruleKind === 'ladder' && slot.ladder?.[a.ruleRung ?? 0]?.weightedIncrementLb != null;
  const misses =
    a.runStartedAt === null
      ? 0
      : a.ruleKind === 'load'
        ? missesBefore(db, a.routineExerciseId, a.runStartedAt, { exerciseId: a.exerciseId })
        : weightedRung
          ? missesBefore(db, a.routineExerciseId, a.runStartedAt, { rung: a.ruleRung ?? 0 })
          : 0;
  return {
    kind: a.ruleKind,
    carryUnit: carryUnit(slot),
    sessionsToRaise: slot.sessionsToRaise,
    halved: a.ruleKind === 'load' && slot.halveAfterFirstMiss && rule !== null && rule.increment > 0 && rule.increment < full - 1e-9,
    missesBefore: misses,
    missesToReset: program.missesToReset,
    resetMultiplier: slot.resetMultiplier,
    week: a.week,
    weekInfo: a.weekInfo,
    sets: slot.sets,
    rung: slot.ladder ? (a.ruleRung ?? 0) : null,
    rungs: slot.ladder ? rungWordsOf(db, slot.ladder) : null,
    addSet: slot.addSet,
    weekly: slot.weekly,
    metconText: slot.metcon ? metconText(slot.catalogName) : null,
    manualText: slot.manualText,
  };
}

/**
 * A program slot in the session (§18.29): its rule's words, the warm-up line under the day's first slot and its note;
 * and what its block reads (Task 7b): a metcon's structured rule and the program's name for the slot (R-t7b2), whether
 * its sets count toward volume (technique sets don't) and the rest after a tick (R639).
 */
export type ProgramSlotView = {
  rule: ProgramRule;
  warmUp: boolean;
  note: string | null;
  metcon: MetconRule | null;
  catalogName: string;
  countsTowardVolume: boolean;
  restKind: RestKind;
};

/** Whether the slot opens its program day: it rests as a heavy compound (R639). */
function opensDay(program: Program, slot: ProgramSlot): boolean {
  return program.days.some((d) => d.slots[0]?.id === slot.id);
}

/**
 * The program a workout runs, as the top of the session shows it (R616, R617): "Week 3 of 12" and the week's line, or
 * the block done (after the last week or an early deload, `blockDone`, as Up next says it).
 */
export type ProgramWorkoutView = { name: string; week: number; weeks: number; weekLine: string | null; done: boolean };

/** The run's start, or null for a routine with no run. */
function runStartOf(db: Db, routineId: string): number | null {
  return db.select({ at: routines.runStartedAt }).from(routines).where(eq(routines.id, routineId)).get()?.at ?? null;
}

/**
 * The program parts of the active workout's view: the workout's week, and each program slot's words, by workout
 * exercise id. Null and an empty map for a workout that is not one of the twenty's (R628).
 */
export function programPartsOf(
  db: Db,
  workout: { routineId: string | null; programWeek: number | null; weekKind: WeekKind | null },
  rows: readonly {
    id: string;
    exerciseId: string;
    routineExerciseId: string | null;
    ruleKind: RuleKind | null;
    ruleRung: number | null;
    rule: RuleSnapshot | null;
    loggingType: LoggingType;
    equipment: Equipment;
    pattern: Pattern;
  }[],
): { workout: ProgramWorkoutView | null; slots: Map<string, ProgramSlotView> } {
  const slots = new Map<string, ProgramSlotView>();
  const program = workout.routineId === null ? undefined : programById(workout.routineId);
  if (!program || workout.programWeek === null) return { workout: null, slots };
  const weekInfo = weekInfoOf(program, workout.programWeek, workout.weekKind);
  const runStartedAt = runStartOf(db, program.id);
  for (const row of rows) {
    const slot = row.ruleKind === null ? undefined : programSlotOf(program.id, row.routineExerciseId);
    if (!slot || row.ruleKind === null || row.routineExerciseId === null) continue;
    slots.set(row.id, {
      rule: programRuleOf(db, {
        program,
        slot,
        routineExerciseId: row.routineExerciseId,
        exerciseId: row.exerciseId,
        ruleKind: row.ruleKind,
        ruleRung: row.ruleRung,
        rule: row.rule,
        week: workout.programWeek,
        weekInfo,
        runStartedAt,
      }),
      warmUp: showsWarmUp(program, slot, row.loggingType),
      note: slotNoteText(slot.note, slot.catalogName, slot.ruleKind),
      metcon: slot.metcon,
      catalogName: slot.catalogName,
      countsTowardVolume: slot.countsTowardVolume,
      restKind: restKindOf({
        exerciseId: row.exerciseId,
        ruleKind: row.ruleKind,
        loggingType: row.loggingType,
        isMain: slot.isMain,
        firstOfDay: opensDay(program, slot),
        equipment: row.equipment,
        pattern: row.pattern,
      }),
    });
  }
  const done = runNow(db, program.id)?.done ?? workout.programWeek > program.weeks;
  return { workout: { name: program.name, week: workout.programWeek, weeks: program.weeks, weekLine: weekLine(weekInfo), done }, slots };
}

/**
 * Change rung in a workout (R618): the ladder slot moves to `rung` from now on (`changeRung`), and today's exercise
 * becomes that rung's, with the rung's range and its weighted step, so today logs the rung the lifter picked and the
 * finish moves the ladder from it. Its sets are cleared, as a swap clears them; the set count, the Something off mark
 * and the link to the slot stay. Throws for an exercise that is not a program's ladder slot.
 */
export function changeRungToday(db: Db, workoutExerciseId: string, rung: number): void {
  db.transaction((tx) => {
    const row = tx
      .select({ we: workoutExercises, routineId: workouts.routineId })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(eq(workoutExercises.id, workoutExerciseId))
      .get();
    const slot = row ? programSlotOf(row.routineId, row.we.routineExerciseId) : undefined;
    const ladder = slot?.ladder;
    if (!row || !ladder || row.we.routineExerciseId === null) throw new Error(`${workoutExerciseId} is not a ladder slot.`);
    changeRung(tx, row.we.routineExerciseId, rung);
    const r = ladder[rung];
    const unit = row.we.ruleIncrementUnit ?? 'lb';
    replaceExercise(tx, workoutExerciseId, r.exerciseId);
    tx.update(workoutExercises)
      .set({
        routineExerciseId: row.we.routineExerciseId,
        ruleSetCount: row.we.ruleSetCount,
        ruleRepMin: r.repMin,
        ruleRepMax: r.repMax,
        ruleIncrement: r.weightedIncrementLb === null ? 0 : convertIncrement(r.weightedIncrementLb, 'lb', unit),
        ruleIncrementUnit: unit,
        ruleKind: 'ladder',
        ruleRung: rung,
      })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
  });
}

/** A metcon's score (R622): its first done set's rounds and extra reps, or its time. Null with none logged. */
function scoreOf(db: Db, workoutExerciseId: string): { rounds: number; extraReps: number; seconds: number | null } | null {
  const s = db
    .select({ reps: sets.reps, extraReps: sets.extraReps, durationS: sets.durationS })
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), eq(sets.done, true)))
    .orderBy(asc(sets.position))
    .get();
  if (!s) return null;
  return { rounds: s.reps ?? 0, extraReps: s.extraReps ?? 0, seconds: s.durationS };
}

/** One line of the finish summary, with a muted why under it when it has one. */
export type FinishRow = { workoutExerciseId: string; text: string; why: string | null };

/** What the summary says after a metcon beaten twice in a row (R622): the rule's next step. */
const BEAT_TWICE_WHY = `${BEAT_TWICE} Go heavier or take the next scaling step.`;

/**
 * The finish summary's lines (spec 8.5, R64) in workout order: each `next` entry as `finishLine` says it, and for a
 * slot of one of the twenty programs the rule's words besides (§18.29): a reset's why (R613), a ladder's move and why
 * (R618), an added set, a heavier bell or longer intervals (R619), and a metcon beaten twice in a row (R622).
 */
export function programFinishLines(
  db: Db,
  workout: { id: string; routineId: string | null; startedAt: number; finishedAt: number | null },
  next: readonly NextTime[],
): FinishRow[] {
  const byId = new Map(next.map((n) => [n.workoutExerciseId, n]));
  const program = workout.routineId === null ? undefined : programById(workout.routineId);
  const rows = db
    .select({ we: workoutExercises, name: exercises.name, loggingType: exercises.loggingType })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workout.id))
    .orderBy(asc(workoutExercises.position))
    .all();
  const lines: FinishRow[] = [];
  for (const { we, name, loggingType } of rows) {
    const n = byId.get(we.id);
    const plain = (): void => {
      if (n) lines.push({ workoutExerciseId: we.id, text: finishLine(n), why: null });
    };
    const slot = program && we.ruleKind !== null ? programSlotOf(program.id, we.routineExerciseId) : undefined;
    if (!program || !slot || we.routineExerciseId === null) {
      plain();
      continue;
    }
    const push = (text: string, why: string | null = null) => lines.push({ workoutExerciseId: we.id, text, why });

    if (slot.ladder && we.ruleRung !== null && we.nextRung !== null && we.nextRung !== we.ruleRung) {
      const rungs = rungWordsOf(db, slot.ladder);
      const from = rungs[we.ruleRung];
      const to = rungs[we.nextRung];
      if (from && to) {
        const up = we.nextRung > we.ruleRung;
        push(ladderMoveLine(name, to.name, we.nextRung, rungs.length, up ? 'up' : 'down'), up ? null : ladderDownWhy(from.timed, from.repMin));
        continue;
      }
    }
    if (slot.addSet && we.outcome === 'raised') {
      const then = slot.addSet.then;
      if (then.kind === 'seconds') push(secondsUpLine(name, (we.ruleRepMax ?? 0) + then.step));
      else if (n) push(finishLine(n), `Back to ${then.backToSets} sets at the heavier weight.`);
      continue;
    }
    if (slot.addSet && we.outcome === 'held' && we.nextSetCount !== null && we.ruleSetCount !== null && we.nextSetCount > we.ruleSetCount) {
      push(addSetLine(name, we.nextSetCount));
      continue;
    }
    if (we.outcome === 'reset' && n) {
      push(finishLine(n), resetWhy(program.missesToReset, slot.resetMultiplier, n.nextWeight, n.nextUnit));
      continue;
    }
    if (slot.ruleKind === 'metcon') {
      const history = slotSessions(db, we.routineExerciseId, 0, we.exerciseId).filter((h) => h.id === workout.id || isBefore(h, workout));
      const scores = history.map((h) => scoreOf(db, h.workoutExerciseId)).filter((x): x is NonNullable<typeof x> => x !== null);
      const now = scores.at(-1);
      const beat =
        loggingType === 'for_time'
          ? beatTwiceForTime(scores.flatMap((x) => (x.seconds === null ? [] : [x.seconds])))
          : beatTwice(scores.map((x) => ({ rounds: x.rounds, extraReps: x.extraReps })));
      // The score, and why under it once it beat the last one twice in a row.
      if (now && (loggingType !== 'for_time' || now.seconds !== null)) {
        const score = loggingType === 'for_time' ? formatRest(now.seconds ?? 0) : now.extraReps > 0 ? `${now.rounds} + ${now.extraReps}` : `${now.rounds}`;
        push(`${name} — ${score}`, beat ? BEAT_TWICE_WHY : null);
      }
      continue;
    }
    plain();
  }
  return lines;
}

/** A slot's sets and range for its next session, with its scheme words (§18.29). */
export type SlotScheme = { setCount: number; repMin: number; repMax: number; schemeExtra?: RepSchemeExtra };

/**
 * A program slot's sets and range for the next session (R617–R620), as `startWorkoutFromDay` will snapshot them: half on
 * a half-set week, the current rung's range, the added sets so far, a run's target for the week; with its scheme words
 * (a carry's distance unit, a metcon's format, a run on a clock). Null for a routine exercise that is not a program slot.
 */
export function slotScheme(
  db: Db,
  routineId: string,
  row: {
    routineExerciseId: string;
    exerciseId: string;
    setCount: number;
    repMin: number;
    repMax: number;
    increment: number;
    incrementUnit: WeightUnit;
    ladderRung: number | null;
    nextSetCount: number | null;
  },
  week: number,
  weekInfo: ProgramWeek | null,
): SlotScheme | null {
  const slot = programSlotOf(routineId, row.routineExerciseId);
  if (!slot) return null;
  const snapshot = programRuleSnapshot({
    slot,
    routine: row,
    week,
    weekInfo,
    unit: row.incrementUnit,
    missedInRun: false,
    secondsRaises:
      slot.addSet?.then.kind === 'seconds' ? slotSessions(db, row.routineExerciseId, 0, row.exerciseId).filter((s) => s.outcome === 'raised').length : 0,
  });
  const unit = carryUnit(slot);
  const extra: RepSchemeExtra = {
    ...(unit ? { distanceUnit: unit } : {}),
    ...(slot.metcon ? { metcon: { format: slot.metcon.format, workMinutes: slot.metcon.workMinutes } } : {}),
    ...(slot.ruleKind === 'weekly_seconds' ? { clock: true } : {}),
  };
  return {
    setCount: snapshot.setCount,
    repMin: snapshot.repMin,
    repMax: snapshot.repMax,
    ...(Object.keys(extra).length > 0 ? { schemeExtra: extra } : {}),
  };
}

/** A ladder slot's rungs for Change rung (R618): their words, the slot's rung (0-based) and its sets. */
export type LadderChoice = { rungs: RungWords[]; current: number; sets: number };

/**
 * The active program's part of its page (R634, R616, R614): the week ("Week 3 of 12", or the block done), the week's
 * line, a line for each slot that dropped back twice in this run, and each slot's scheme for its next session and, on
 * a ladder, its rungs for Change rung. Null for a routine that is not one of the twenty.
 */
export type ProgramPageView = {
  week: number;
  weeks: number;
  done: boolean;
  weekLine: string | null;
  /** The exercises of the slots with two resets in this run, in day order (R614). */
  droppedTwice: string[];
  slots: Record<string, { scheme: SlotScheme; ladder: LadderChoice | null }>;
};

export function programPageOf(db: Db, routineId: string): ProgramPageView | null {
  const program = programById(routineId);
  if (!program) return null;
  // A program set active before its run was kept (an older build) reads as week 1.
  const state = programState(db, routineId) ?? {
    week: 1,
    weekInfo: weekInfoFor(program.weekPlan, program.weeks, 1, null),
    done: false,
    resetsBySlot: {} as Record<string, number>,
  };
  const rows = db
    .select({
      routineExerciseId: routineExercises.id,
      exerciseId: routineExercises.exerciseId,
      name: exercises.name,
      setCount: routineExercises.setCount,
      repMin: routineExercises.repMin,
      repMax: routineExercises.repMax,
      increment: routineExercises.increment,
      incrementUnit: routineExercises.incrementUnit,
      ladderRung: routineExercises.ladderRung,
      nextSetCount: routineExercises.nextSetCount,
    })
    .from(routineExercises)
    .innerJoin(routineDays, eq(routineDays.id, routineExercises.routineDayId))
    .innerJoin(exercises, eq(exercises.id, routineExercises.exerciseId))
    .where(eq(routineDays.routineId, routineId))
    .orderBy(asc(routineDays.position), asc(routineExercises.position))
    .all();
  const slots: ProgramPageView['slots'] = {};
  const droppedTwice: string[] = [];
  for (const row of rows) {
    const slot = programSlotOf(routineId, row.routineExerciseId);
    const scheme = slotScheme(db, routineId, row, state.week, state.weekInfo);
    if (!slot || !scheme) continue;
    slots[row.routineExerciseId] = {
      scheme,
      ladder: slot.ladder ? { rungs: rungWordsOf(db, slot.ladder), current: row.ladderRung ?? 0, sets: slot.sets } : null,
    };
    // One line a lift: the slots sharing a progression on other days count the same resets (R625 as amended).
    if ((state.resetsBySlot[row.routineExerciseId] ?? 0) >= 2 && !droppedTwice.includes(row.name)) droppedTwice.push(row.name);
  }
  return {
    week: state.week,
    weeks: program.weeks,
    done: state.done,
    weekLine: state.done ? null : weekLine(state.weekInfo),
    droppedTwice,
    slots,
  };
}
