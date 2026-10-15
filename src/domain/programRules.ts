/**
 * The program rules (spec §18.29, R612–R627) as pure functions: weeks, special weeks, misses and resets, halving after
 * the first miss, ladders, added sets, runs, metcon scores and the reactive deload. Everything here is derived from
 * finished history by the caller, never counted in a stored counter (§7.12).
 */
import type { AddSetRule, ProgramWeek, WeeklyRule } from '../seed/programTypes';
import { loadPlates, type Gear } from './plates';
import type { OutcomeInput } from './progression';
import type { DistanceUnit, LoggingType, WeightUnit } from './types';
import { convertDistance } from './units';

/** Weights are compared and rounded in hundredths, so 2.5 and 1.25 stay exact. */
const toHundredths = (v: number): number => Math.round(v * 100);

/** §7.3 step 1: counted sets are done working and failure sets. */
export function countedSets(sets: OutcomeInput['sets']): OutcomeInput['sets'] {
  return sets.filter((s) => s.done && (s.setType === 'working' || s.setType === 'failure'));
}

/**
 * What a set is measured by against the range: seconds for timed and weight and time, distance (in `distanceUnit`
 * when given) for weight and distance, else reps. A missing value is 0.
 */
export function setMeasure(s: OutcomeInput['sets'][number], loggingType: LoggingType, distanceUnit?: DistanceUnit): number {
  if (loggingType === 'timed' || loggingType === 'weighted_time') return s.durationS ?? 0;
  if (loggingType === 'weighted_distance') {
    const d = s.distance ?? 0;
    return distanceUnit && s.distanceUnit ? convertDistance(d, s.distanceUnit, distanceUnit) : d;
  }
  return s.reps ?? 0;
}

/** R616: the program week, counted by sessions: floor(finished sessions ÷ days per week) + 1. */
export function programWeek(finishedSessions: number, daysPerWeek: number): number {
  return Math.floor(Math.max(0, finishedSessions) / Math.max(1, daysPerWeek)) + 1;
}

/**
 * R617, R627: the special week a program week is, if any; null for a normal week and once the block is done (after the
 * last week, or after an early deload). `blockDone` tells those two nulls apart. `early` is
 * the reactive deload: when the lifter started it after `deloadAt` finished sessions, `session` (the finished sessions
 * before this one) from `deloadAt` up to `deloadAt + daysPerWeek - 1` is the deload (the plan's deload week, else a
 * half-set deload), and after it the block is done, so null.
 */
export function weekInfo(
  plan: readonly ProgramWeek[],
  weeks: number,
  week: number,
  early: { deloadAt: number | null; session: number; daysPerWeek: number } | null,
): ProgramWeek | null {
  if (early && early.deloadAt !== null && early.session >= early.deloadAt) {
    if (early.session >= early.deloadAt + Math.max(1, early.daysPerWeek)) return null;
    return (
      plan.find((w) => w.kind === 'deload') ?? { week, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' }
    );
  }
  if (week > weeks) return null;
  return plan.find((w) => w.week === week) ?? null;
}

/**
 * R616, R627: whether the block is done, so a null `weekInfo` means "12 weeks done." and Start over rather than a
 * normal week: after the last week, or once the early deload's `daysPerWeek` sessions are finished.
 */
export function blockDone(
  weeks: number,
  week: number,
  early: { deloadAt: number | null; session: number; daysPerWeek: number } | null,
): boolean {
  if (early && early.deloadAt !== null && early.session >= early.deloadAt + Math.max(1, early.daysPerWeek)) return true;
  return week > weeks;
}

/** R617: a slot's sets on a half-set week, ceil(sets ÷ 2) and at least 1; a deload-exempt slot keeps its sets. */
export function weekSetCount(sets: number, week: ProgramWeek | null, deloadExempt: boolean): number {
  if (!week?.halfSets || deloadExempt) return sets;
  return Math.max(1, Math.ceil(sets / 2));
}

/**
 * R613: whether a normal session was a miss: fewer counted sets than the set count, or any counted set under the
 * bottom of the range (seconds for holds and weight and time, distance for weight and distance, in `distanceUnit` when
 * given). A marked session, a holding week and a metcon score are never one.
 */
export function isMiss(a: {
  setCount: number;
  repMin: number;
  loggingType: LoggingType;
  sets: OutcomeInput['sets'];
  marked: boolean;
  weekHolds: boolean;
  distanceUnit?: DistanceUnit;
}): boolean {
  if (a.marked || a.weekHolds) return false;
  if (a.loggingType === 'rounds' || a.loggingType === 'for_time' || a.loggingType === 'distance_time') return false;
  const counted = countedSets(a.sets);
  return counted.length < a.setCount || counted.some((s) => setMeasure(s, a.loggingType, a.distanceUnit) < a.repMin);
}

/**
 * R613: consecutive misses, newest last. Skipped sessions (marked, or a special week) neither count nor break the run.
 * A session whose outcome was `reset` (`reset: true`) ends the run: the count starts again after it.
 */
export function missStreak(history: readonly { missed: boolean; skipped: boolean; reset?: boolean }[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const session = history[i];
    if (session.skipped) continue;
    if (session.reset || !session.missed) break;
    streak++;
  }
  return streak;
}

/** R612: the increment, halved after the first miss in the current run. */
export function effectiveIncrement(base: number, halveAfterFirstMiss: boolean, missedInRun: boolean): number {
  return halveAfterFirstMiss && missedInRun ? base / 2 : base;
}

/** Rounds `value` down to a multiple of `step` (in hundredths); with no step, down to 2 decimals. */
function floorToStep(value: number, step: number): number {
  const valueH = Math.floor(value * 100 + 1e-6);
  const stepH = toHundredths(step);
  if (stepH <= 0) return valueH / 100;
  return (Math.floor(valueH / stepH) * stepH) / 100;
}

/**
 * R613: the reset weight, working × multiplier rounded down to a loadable barbell weight (never under the bar; above
 * the heaviest loadable total, down to a step of twice the smallest owned plate, as §7.1 does), else down to a multiple
 * of the step. A barbell with no plates owned rounds to the step too. All in the working weight's unit.
 */
export function resetWeight(working: { value: number; unit: WeightUnit }, multiplier: number, step: number, barbell: boolean, gear: Gear): number {
  const target = working.value * multiplier;
  const plates = Object.entries(gear.plates)
    .flatMap(([w, pairs]) => Array<number>(Math.max(0, Math.floor(pairs))).fill(toHundredths(Number(w))))
    .filter((w) => w > 0);
  if (!barbell || plates.length === 0) return floorToStep(target, step);
  const barH = toHundredths(gear.bar);
  const targetH = Math.floor(target * 100 + 1e-6);
  if (targetH <= barH) return gear.bar;
  const heaviestH = barH + 2 * plates.reduce((sum, p) => sum + p, 0);
  if (targetH > heaviestH) {
    const stepH = 2 * Math.min(...plates);
    return (barH + stepH * Math.floor((targetH - barH) / stepH)) / 100;
  }
  return loadPlates(targetH / 100, gear.bar, gear.plates).total;
}

/**
 * R618: the next rung (0-based, an index into the slot's ladder): up after the top of the range on every set, down
 * after two low normal sessions in a row (`lowToday` and `lowLastTime`); it stays at the last rung and the first.
 */
export function ladderNext(a: { rung: number; rungCount: number; allTop: boolean; lowToday: boolean; lowLastTime: boolean }): {
  rung: number;
  moved: 'up' | 'down' | null;
} {
  if (a.allTop) return a.rung < a.rungCount - 1 ? { rung: a.rung + 1, moved: 'up' } : { rung: a.rung, moved: null };
  if (a.lowToday && a.lowLastTime && a.rung > 0) return { rung: a.rung - 1, moved: 'down' };
  return { rung: a.rung, moved: null };
}

/**
 * R619: the next set count of an added-sets slot, and whether the load (or the seconds) goes up instead. Every set
 * done adds one, up to the cap; at the cap the load goes up and the sets go back (`then.backToSets`), or the seconds
 * go up and the sets stay. The count is never under the slot's base sets.
 */
export function addSetNext(a: { setCount: number; allDone: boolean; rule: AddSetRule; baseSets: number }): { setCount: number; raise: boolean } {
  const current = Math.max(a.setCount, a.baseSets);
  if (!a.allDone) return { setCount: current, raise: false };
  if (current < a.rule.capSets) return { setCount: current + 1, raise: false };
  const { then } = a.rule;
  return then.kind === 'load' ? { setCount: then.backToSets, raise: true } : { setCount: current, raise: true };
}

/**
 * R620: a run's target for the program week, capped, and the share of it on a lighter week (seconds × `runShare`,
 * rounded). Intervals add a set a week up to the cap, then seconds a set. A fixed run (warm-up and cool-down jogs)
 * keeps the slot's sets and seconds, on a lighter week too.
 */
export function runTarget(rule: WeeklyRule, base: { sets: number; seconds: number }, week: number, runShare: number): { sets: number; seconds: number } {
  const weeksIn = Math.max(0, week - 1);
  const share = (seconds: number) => Math.round(seconds * runShare);
  switch (rule.kind) {
    case 'seconds':
      return { sets: base.sets, seconds: share(Math.min(rule.capS, rule.startS + weeksIn * rule.stepS)) };
    case 'sets_then_seconds': {
      const sets = Math.min(rule.capSets, rule.startSets + weeksIn);
      const weeksAtCap = Math.max(0, weeksIn - (rule.capSets - rule.startSets));
      return { sets, seconds: share(rule.seconds + weeksAtCap * rule.stepS) };
    }
    case 'fixed':
      return { sets: base.sets, seconds: base.seconds };
  }
}

/** R622: an AMRAP score beat the last one, which beat the one before (newest last). */
export function beatTwice(scores: readonly { rounds: number; extraReps: number }[]): boolean {
  if (scores.length < 3) return false;
  const beats = (a: { rounds: number; extraReps: number }, b: { rounds: number; extraReps: number }) =>
    a.rounds > b.rounds || (a.rounds === b.rounds && a.extraReps > b.extraReps);
  const [before, last, now] = scores.slice(-3);
  return beats(now, last) && beats(last, before);
}

/** R622: a For Time score (lower is better) beat the last one, which beat the one before (newest last). */
export function beatTwiceForTime(seconds: readonly number[]): boolean {
  if (seconds.length < 3) return false;
  const [before, last, now] = seconds.slice(-3);
  return now < last && last < before;
}

/** R627: two or more main lifts missed in one program week offer the deload. */
export function reactiveDeloadDue(mainMissesThisWeek: number): boolean {
  return mainMissesThisWeek >= 2;
}
