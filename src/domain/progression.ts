/**
 * The progression rule (spec 7.3, with 18.7): what one exercise's finished sets mean for next time. A marked day
 * is an exercise flagged Something off. The working weight keeps the unit of the set it came from, and the next
 * weight uses that unit, with the increment converted by the gym convention (R62).
 *
 * A slot of one of the twenty programs (§18.29) passes more, all optional, so a §7.3 caller (your own routine, R628)
 * gets exactly what it always did: a special week that holds (R617), misses and the reset (R613), two all-hit
 * sessions before a raise (R623), and weight and distance (R607).
 */

import { countedSets, isMiss, resetWeight, setMeasure } from './programRules';
import { raiseLoadable, type Gear } from './plates';
import type { DistanceUnit, Equipment, LoggingType, SetType, WeightUnit } from './types';
import { convertIncrement, isZeroWeight, sameWeight, toKg } from './units';

export { raiseLoadable };

/** `held_week`: a half-set, test or meet week holds the plan (R617). `reset`: misses in a row drop the weight (R613). */
export type Outcome = 'raised' | 'held' | 'held_marked' | 'held_week' | 'reset' | 'no_rule' | 'no_sets';
export type OutcomeInput = {
  rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null;
  plannedWeight: number | null; plannedUnit: WeightUnit | null;
  loggingType: LoggingType; equipment: Equipment;
  marked: boolean;
  /** `distance` and `distanceUnit` are read for `weighted_distance` only. */
  sets: readonly {
    setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null; reps: number | null; durationS: number | null;
    distance?: number | null; distanceUnit?: DistanceUnit | null;
  }[];
  gear: { lb: Gear; kg: Gear };
  /** The program week the workout started in (R617): a week that holds gives `held_week`. Null or absent: a normal week. */
  week?: { holds: boolean } | null;
  /**
   * Misses in a row before this session, from the slot's finished history since the run started (R613, `missStreak`).
   * Read only with `missesToReset`.
   */
  missesBefore?: number;
  /**
   * Misses in a row that reset the weight: 3 in a Beginner program, 2 otherwise (R613). Passing it marks a program
   * slot: without it nothing is a miss and nothing resets (R628).
   */
  missesToReset?: 2 | 3;
  /** The reset's multiplier: 0.9 (the default), or 0.95 for Strength Peaking's top sets. */
  resetMultiplier?: number;
  /**
   * The slot's full increment, in the rule's increment unit, when the session's rule carries a halved one (R612). A reset
   * off a barbell rounds down to it, and a slot whose full increment is 0 never resets. Default: the rule's increment.
   */
  fullIncrement?: number;
  /** The step a reset off a barbell rounds down to, in the rule's increment unit, where it is not the full increment. */
  resetStep?: number;
  /** All-hit normal sessions in a row before a raise: 2 for Atlas stone load (R623), else 1 (the default). */
  sessionsToRaise?: 1 | 2;
  /** With `sessionsToRaise` 2: the slot's previous normal session hit every set (`isAllHit`) and did not raise. */
  previousAllHit?: boolean;
  /** The bottom of the range for a miss, where it is not the rule's `repMin`. */
  repMinForMiss?: number;
  /** The slot's distance unit for `weighted_distance` (ft or yd); absent, each set's distance is read in its own unit. */
  distanceUnit?: DistanceUnit;
};
/** `missed`: a program slot's normal session was a miss (R613), kept on the workout exercise for the count. */
export type OutcomeResult = {
  workingWeight: number | null;
  workingUnit: WeightUnit | null;
  outcome: Outcome;
  nextWeight: number | null;
  nextUnit: WeightUnit | null;
  missed: boolean;
};

type Load = { value: number; unit: WeightUnit };

const toHundredths = (v: number): number => Math.round(v * 100);

/** Logging types with no load and no rule: timed holds and runs, distance and time, and the metcon scores (R622). */
function hasNoLoad(loggingType: LoggingType): boolean {
  return loggingType === 'timed' || loggingType === 'distance_time' || loggingType === 'rounds' || loggingType === 'for_time';
}

/**
 * The easiest load among the counted sets (step 2): the lowest weight, or the highest assistance for `assisted`,
 * compared in kg (loads within 0.01 kg are the same; the first is kept). An empty load counts as 0 in the plan's
 * unit, else the first counted set's unit, else lb.
 * Null for timed, distance_time and the metcon scores, and when nothing was counted.
 */
function workingLoad(input: OutcomeInput, counted: OutcomeInput['sets']): Load | null {
  if (hasNoLoad(input.loggingType)) return null;
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

/**
 * Step 4, all hit: at least `set_count` counted sets, each at or over `rep_max` (seconds for weight and time, distance
 * for weight and distance). False without a rule. The caller keeps it for `previousAllHit` (R623).
 */
export function isAllHit(input: OutcomeInput): boolean {
  const { rule } = input;
  if (!rule) return false;
  const counted = countedSets(input.sets);
  return (
    counted.length >= rule.setCount && counted.every((s) => setMeasure(s, input.loggingType, input.distanceUnit) >= rule.repMax)
  );
}

export function computeOutcome(input: OutcomeInput): OutcomeResult {
  const { rule, loggingType } = input;
  // Step 1: counted sets.
  const counted = countedSets(input.sets);
  const working = workingLoad(input, counted);
  const result = (outcome: Outcome, next: Load | null, missed = false): OutcomeResult => ({
    workingWeight: working?.value ?? null,
    workingUnit: working?.unit ?? null,
    outcome,
    nextWeight: next?.value ?? null,
    nextUnit: next?.unit ?? null,
    missed,
  });
  const planned: Load | null =
    input.plannedWeight !== null && input.plannedUnit !== null ? { value: input.plannedWeight, unit: input.plannedUnit } : null;

  // Step 3. A metcon's score has no automatic rule (R622). Nothing counted is no_sets, on a holding week (a skipped
  // exercise, R617) and a marked day too.
  if (!rule || hasNoLoad(loggingType)) return result('no_rule', null);
  if (!working) return result('no_sets', planned);
  // A special week that holds keeps the plan and is never a miss (R617).
  if (input.week?.holds) return result('held_week', planned ?? working);
  // Step 5: a marked day holds the plan, and is never a miss (R615).
  if (input.marked) return result('held_marked', planned ?? working);

  // R613: a miss counts only on a program slot (R628).
  const missesToReset = input.missesToReset;
  const missed =
    missesToReset !== undefined &&
    isMiss({
      setCount: rule.setCount,
      repMin: input.repMinForMiss ?? rule.repMin,
      loggingType,
      sets: input.sets,
      marked: false,
      weekHolds: false,
      distanceUnit: input.distanceUnit,
    });
  if (missed) {
    // The miss always counts, but some slots hold instead of resetting: more assistance is not a drop of 10%, a slot
    // with nothing to add (reps only) has no weight to drop, and a drop that loads no lighter (the empty bar) is none.
    const fullIncrement = input.fullIncrement ?? rule.increment;
    if ((input.missesBefore ?? 0) + 1 >= missesToReset && loggingType !== 'assisted' && fullIncrement > 0) {
      const step = convertIncrement(input.resetStep ?? fullIncrement, rule.incrementUnit, working.unit);
      const next = resetWeight(working, input.resetMultiplier ?? 0.9, step, input.equipment === 'barbell', input.gear[working.unit]);
      if (toHundredths(next) < toHundredths(working.value)) return result('reset', { value: next, unit: working.unit }, true);
    }
    return result('held', working, true);
  }

  // Step 4: all hit, for as many normal sessions in a row as the slot needs (R623).
  const allHit = isAllHit(input) && ((input.sessionsToRaise ?? 1) === 1 || input.previousAllHit === true);

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
