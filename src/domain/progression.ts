/**
 * The progression rule (spec 7.3, with 18.7): what one exercise's finished sets mean for next time. A marked day
 * is an exercise flagged Something off. The working weight keeps the unit of the set it came from, and the next
 * weight uses that unit, with the increment converted by the gym convention (R62).
 */

import { raiseLoadable, type Gear } from './plates';
import type { Equipment, LoggingType, SetType, WeightUnit } from './types';
import { convertIncrement, isZeroWeight, sameWeight, toKg } from './units';

export { raiseLoadable };

/** `held_week`: a half-set, test or meet week holds the plan (R617). `reset`: misses in a row drop the weight (R613). */
export type Outcome = 'raised' | 'held' | 'held_marked' | 'held_week' | 'reset' | 'no_rule' | 'no_sets';
export type OutcomeInput = {
  rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null;
  plannedWeight: number | null; plannedUnit: WeightUnit | null;
  loggingType: LoggingType; equipment: Equipment;
  marked: boolean;
  sets: readonly { setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null; reps: number | null; durationS: number | null }[];
  gear: { lb: Gear; kg: Gear };
};
export type OutcomeResult = { workingWeight: number | null; workingUnit: WeightUnit | null; outcome: Outcome; nextWeight: number | null; nextUnit: WeightUnit | null };

type Load = { value: number; unit: WeightUnit };

/** Timed, distance and time, and a program's AMRAP and For Time scores (R607, R622) have no load for the rule to raise. */
const hasLoad = (t: LoggingType) => t !== 'timed' && t !== 'distance_time' && t !== 'rounds' && t !== 'for_time';

/**
 * The easiest load among the counted sets (step 2): the lowest weight, or the highest assistance for `assisted`,
 * compared in kg (loads within 0.01 kg are the same; the first is kept). An empty load counts as 0 in the plan's
 * unit, else the first counted set's unit, else lb.
 * Null for the types with no load (`hasLoad`), and when nothing was counted.
 */
function workingLoad(input: OutcomeInput, counted: OutcomeInput['sets']): Load | null {
  if (!hasLoad(input.loggingType)) return null;
  const emptyUnit = input.plannedUnit ?? counted.find((s) => s.weightUnit !== null)?.weightUnit ?? 'lb';
  const easier = input.loggingType === 'assisted' ? (a: number, b: number) => a > b : (a: number, b: number) => a < b;
  let easiest: Load | null = null;
  for (const s of counted) {
    const load: Load = s.weight === null ? { value: 0, unit: emptyUnit } : { value: s.weight, unit: s.weightUnit ?? emptyUnit };
    if (!easiest || (!sameWeight(load, easiest) && easier(toKg(load.value, load.unit), toKg(easiest.value, easiest.unit)))) {
      easiest = load;
    }
  }
  return easiest;
}

export function computeOutcome(input: OutcomeInput): OutcomeResult {
  const { rule, loggingType } = input;
  // Step 1: counted sets.
  const counted = input.sets.filter((s) => s.done && (s.setType === 'working' || s.setType === 'failure'));
  const working = workingLoad(input, counted);
  const result = (outcome: Outcome, next: Load | null): OutcomeResult => ({
    workingWeight: working?.value ?? null,
    workingUnit: working?.unit ?? null,
    outcome,
    nextWeight: next?.value ?? null,
    nextUnit: next?.unit ?? null,
  });
  const planned: Load | null =
    input.plannedWeight !== null && input.plannedUnit !== null ? { value: input.plannedWeight, unit: input.plannedUnit } : null;

  // Step 3.
  if (!rule || !hasLoad(loggingType)) return result('no_rule', null);
  if (!working) return result('no_sets', planned);

  // Step 4: all hit.
  const allHit =
    counted.length >= rule.setCount &&
    counted.every((s) => ((loggingType === 'weighted_time' ? s.durationS : s.reps) ?? 0) >= rule.repMax);

  // Step 5: a marked day holds the plan.
  if (input.marked) return result('held_marked', planned ?? working);
  // Step 7: missed, or nothing to add.
  if (!allHit || rule.increment <= 0) return result('held', working);

  // Step 6: raise.
  const increment = convertIncrement(rule.increment, rule.incrementUnit, working.unit);
  if (loggingType === 'assisted') {
    // Already at 0 assistance there is nothing lower, so it holds, as a barbell does when nothing heavier loads (R76).
    if (isZeroWeight(working.value, working.unit)) return result('held', working);
    // To 2 decimals, so 264.6 less 10 is 254.6 and not 254.60000000000002.
    return result('raised', { value: Math.max(0, Number((working.value - increment).toFixed(2))), unit: working.unit });
  }
  const raised = working.value + increment;
  if (input.equipment !== 'barbell') return result('raised', { value: raised, unit: working.unit });
  const loadable = raiseLoadable(raised, working.value, input.gear[working.unit]);
  return loadable === null ? result('held', working) : result('raised', { value: loadable, unit: working.unit });
}
