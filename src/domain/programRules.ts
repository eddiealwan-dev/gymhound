/**
 * The program rules (spec §18.29, R612–R627) as pure functions: weeks, special weeks, misses and resets, halving after
 * the first miss, ladders, added sets, runs, metcon scores and the reactive deload. Everything here is derived from
 * finished history by the caller, never counted in a stored counter (§7.12).
 *
 * Signatures only: Task 6 writes the bodies and their tests.
 */
import type { AddSetRule, ProgramWeek, WeeklyRule } from '../seed/programTypes';
import type { Gear } from './plates';
import type { OutcomeInput } from './progression';
import type { LoggingType, WeightUnit } from './types';

/** R616: the program week, counted by sessions: floor(finished sessions ÷ days per week) + 1. */
export function programWeek(finishedSessions: number, daysPerWeek: number): number {
  throw new Error('Task 6');
}

/**
 * R617, R627: the special week a program week is, if any; null after the last week. `early` is the reactive deload:
 * when the lifter started it, the sessions from `deloadAt` are the deload.
 */
export function weekInfo(
  plan: readonly ProgramWeek[],
  weeks: number,
  week: number,
  early: { deloadAt: number | null; session: number } | null,
): ProgramWeek | null {
  throw new Error('Task 6');
}

/** R617: a slot's sets on a half-set week, ceil(sets ÷ 2) and at least 1; a deload-exempt slot keeps its sets. */
export function weekSetCount(sets: number, week: ProgramWeek | null, deloadExempt: boolean): number {
  throw new Error('Task 6');
}

/** R613: whether a normal session was a miss. A marked session or a holding week is never one. */
export function isMiss(a: {
  setCount: number;
  repMin: number;
  loggingType: LoggingType;
  sets: OutcomeInput['sets'];
  marked: boolean;
  weekHolds: boolean;
}): boolean {
  throw new Error('Task 6');
}

/** R613: consecutive misses, newest last. Skipped sessions (marked, or a special week) neither count nor break the run. */
export function missStreak(history: readonly { missed: boolean; skipped: boolean }[]): number {
  throw new Error('Task 6');
}

/** R612: the increment, halved after the first miss in the current run. */
export function effectiveIncrement(base: number, halveAfterFirstMiss: boolean, missedInRun: boolean): number {
  throw new Error('Task 6');
}

/** R613: the reset weight, working × multiplier rounded down to a loadable barbell weight, else to a multiple of the step. */
export function resetWeight(working: { value: number; unit: WeightUnit }, multiplier: number, step: number, barbell: boolean, gear: Gear): number {
  throw new Error('Task 6');
}

/** R618: the next rung: up after the top of the range on every set, down after two low sessions in a row. */
export function ladderNext(a: { rung: number; rungCount: number; allTop: boolean; lowToday: boolean; lowLastTime: boolean }): {
  rung: number;
  moved: 'up' | 'down' | null;
} {
  throw new Error('Task 6');
}

/** R619: the next set count of an added-sets slot, and whether the load (or the seconds) goes up instead. */
export function addSetNext(a: { setCount: number; allDone: boolean; rule: AddSetRule; baseSets: number }): { setCount: number; raise: boolean } {
  throw new Error('Task 6');
}

/** R620: a run's target for the program week, capped, and the share of it on a lighter week. */
export function runTarget(rule: WeeklyRule, base: { sets: number; seconds: number }, week: number, runShare: number): { sets: number; seconds: number } {
  throw new Error('Task 6');
}

/** R622: an AMRAP score beat the last one, which beat the one before (newest last). */
export function beatTwice(scores: readonly { rounds: number; extraReps: number }[]): boolean {
  throw new Error('Task 6');
}

/** R622: a For Time score (lower is better) beat the last one, which beat the one before (newest last). */
export function beatTwiceForTime(seconds: readonly number[]): boolean {
  throw new Error('Task 6');
}

/** R627: two or more main lifts missed in one program week offer the deload. */
export function reactiveDeloadDue(mainMissesThisWeek: number): boolean {
  throw new Error('Task 6');
}
