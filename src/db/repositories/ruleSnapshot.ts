import { effectiveIncrement, runTarget, weekSetCount } from '../../domain/programRules';
import type { WeightUnit } from '../../domain/types';
import { convertIncrement } from '../../domain/units';
import type { ProgramSlot, ProgramWeek, RuleKind } from '../../seed/programTypes';
import type { routineExercises, workoutExercises } from '../schema';

/** The rule a workout exercise copies from its routine when the workout starts (spec 7.3). */
export type RuleSnapshot = { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit };

type SnapshotColumns = Pick<
  typeof workoutExercises.$inferSelect,
  'ruleSetCount' | 'ruleRepMin' | 'ruleRepMax' | 'ruleIncrement' | 'ruleIncrementUnit'
>;

/** The rule snapshot stored on a workout exercise row, or null when it has none (any snapshot column empty). */
export function ruleOf(row: SnapshotColumns): RuleSnapshot | null {
  if (
    row.ruleSetCount === null ||
    row.ruleRepMin === null ||
    row.ruleRepMax === null ||
    row.ruleIncrement === null ||
    row.ruleIncrementUnit === null
  ) {
    return null;
  }
  return {
    setCount: row.ruleSetCount,
    repMin: row.ruleRepMin,
    repMax: row.ruleRepMax,
    increment: row.ruleIncrement,
    incrementUnit: row.ruleIncrementUnit,
  };
}

/**
 * What a program slot's workout exercise snapshots when the workout starts (§18.29), besides the planned weight: the
 * rule (in the display unit) and its kind and rung. The set count follows the week (R617, half on a half-set week unless
 * the slot is exempt), the added sets so far (R619) or the run's target (R620); the range is the current rung's for a
 * ladder (R618), the run's target seconds for a run, and the seconds raised at the cap for an added-sets slot in seconds;
 * the increment is halved after the slot's first miss in the run (R612), the weighted top rung's for a ladder, and 0
 * where nothing is added by weight (reps only, holds, manual rules, metcons and runs).
 */
export function programRuleSnapshot(a: {
  slot: ProgramSlot;
  routine: Pick<typeof routineExercises.$inferSelect, 'setCount' | 'repMin' | 'repMax' | 'increment' | 'incrementUnit' | 'ladderRung' | 'nextSetCount'>;
  week: number;
  weekInfo: ProgramWeek | null;
  unit: WeightUnit;
  /** The slot missed at least once in the current run (R612). */
  missedInRun: boolean;
  /** Times an added-sets slot in seconds raised its seconds at the cap (R619). */
  secondsRaises: number;
}): RuleSnapshot & { ruleKind: RuleKind; ruleRung: number | null } {
  const { slot, routine, weekInfo, unit } = a;
  const base = convertIncrement(routine.increment, routine.incrementUnit, unit);
  const sets = (n: number) => weekSetCount(n, weekInfo, slot.deloadExempt);
  const plain = { setCount: sets(routine.setCount), repMin: routine.repMin, repMax: routine.repMax, incrementUnit: unit, ruleRung: null };
  switch (slot.ruleKind) {
    case 'load':
      return { ...plain, increment: effectiveIncrement(base, slot.halveAfterFirstMiss, a.missedInRun), ruleKind: 'load' };
    case 'ladder': {
      const ladder = slot.ladder ?? [];
      const rung = Math.min(Math.max(0, routine.ladderRung ?? 0), Math.max(0, ladder.length - 1));
      const r = ladder[rung];
      if (!r) return { ...plain, increment: 0, ruleKind: 'ladder' };
      const increment = r.weightedIncrementLb === null ? 0 : convertIncrement(r.weightedIncrementLb, 'lb', unit);
      return { ...plain, repMin: r.repMin, repMax: r.repMax, increment, ruleKind: 'ladder', ruleRung: rung };
    }
    case 'add_set': {
      const then = slot.addSet?.then;
      const seconds = then?.kind === 'seconds' ? routine.repMin + then.step * a.secondsRaises : null;
      return {
        ...plain,
        setCount: sets(routine.nextSetCount ?? routine.setCount),
        repMin: seconds ?? routine.repMin,
        repMax: seconds ?? routine.repMax,
        increment: then?.kind === 'load' ? base : 0,
        ruleKind: 'add_set',
      };
    }
    case 'weekly_seconds': {
      // Runs keep their sets on a lighter week; their share of the time is the week's `runShare` (R620).
      const target = slot.weekly
        ? runTarget(slot.weekly, { sets: routine.setCount, seconds: routine.repMin }, a.week, weekInfo?.runShare ?? 1)
        : { sets: routine.setCount, seconds: routine.repMin };
      return { ...plain, setCount: target.sets, repMin: target.seconds, repMax: target.seconds, increment: 0, ruleKind: 'weekly_seconds' };
    }
    default:
      return { ...plain, increment: 0, ruleKind: slot.ruleKind };
  }
}
