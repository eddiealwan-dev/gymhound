/**
 * The line above an exercise's sets (spec 7.4, with 18.7): the rule as a sentence, then today's read. A flagged
 * exercise (Something off) is a marked day, and its read names the reason (R61). Also the finish summary's line for
 * each exercise (spec 8.5, R64).
 */

import { formatRest } from './dates';
import { MARK_LABELS } from './labels';
import type { Gear } from './plates';
import { raiseLoadable, type Outcome, type OutcomeInput } from './progression';
import type { PrevSet } from './setEntry';
import type { DistanceUnit, Equipment, ExerciseMark, LoggingType, WeightUnit } from './types';
import { convertIncrement, formatWeight, isZeroWeight } from './units';

export type Rule = NonNullable<OutcomeInput['rule']>;

/** Last time's sets of an exercise, for the rule line: how many, and the first one's values. */
export type LastSummary = {
  sets: number;
  reps: number | null;
  weight: number | null;
  weightUnit: WeightUnit | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
};

type Load = { weight: number; unit: WeightUnit };

const TIMES = '×';

/**
 * Summarises last time's done sets (`WorkoutExerciseView.previous`): the working and failure sets, counted, with the
 * values of the first by position. Warmups and drops are left out unless they are all there was. Null for no last time.
 */
export function lastSummary(previous: readonly PrevSet[]): LastSummary | null {
  const counted = previous.filter((p) => p.setType === 'working' || p.setType === 'failure');
  const pool = [...(counted.length > 0 ? counted : previous)].sort((a, b) => a.position - b.position);
  const first = pool[0];
  if (!first) return null;
  const { reps, weight, weightUnit, durationS, distance, distanceUnit } = first;
  return { sets: pool.length, reps, weight, weightUnit, durationS, distance, distanceUnit };
}

/** Whether the rule raises this type's load: not timed or distance_time. */
const isLoaded = (loggingType: LoggingType): boolean => loggingType !== 'timed' && loggingType !== 'distance_time';

/** "5 km in 25:30", or whichever of the two was logged; null for neither. */
function lastDistance(last: LastSummary): string | null {
  const distance = last.distance !== null && last.distanceUnit !== null ? `${last.distance} ${last.distanceUnit}` : null;
  const time = last.durationS !== null ? formatRest(last.durationS) : null;
  if (distance && time) return `${distance} in ${time}`;
  return distance ?? time;
}

/**
 * Last time in this type's terms: "3 × 60 s" (timed), "5 km in 25:30" (distance_time), else "3 × 8 at 135 lb", with
 * seconds for reps for weighted_time. The weight keeps the unit it was logged in; an empty load (none or 0) leaves it
 * out. Null when the sets lack the value this type logs, so no number is invented.
 */
function lastTime(last: LastSummary, loggingType: LoggingType): string | null {
  if (loggingType === 'distance_time') return lastDistance(last);
  const seconds = last.durationS === null ? null : `${last.durationS} s`;
  if (loggingType === 'timed') return seconds && `${last.sets} ${TIMES} ${seconds}`;
  const each = loggingType === 'weighted_time' ? seconds : last.reps === null ? null : `${last.reps}`;
  if (each === null) return null;
  const at = last.weight && last.weightUnit ? ` at ${formatWeight(last.weight, last.weightUnit)}` : '';
  return `${last.sets} ${TIMES} ${each}${at}`;
}

/**
 * The rule as a sentence (spec 7.4, the rule table). Timed and distance holds say last time; an exercise with no rule
 * says last time; either says it is the first time when there is no last time to tell. An increment of 0 says to beat
 * last time's reps. `{inc}` is the rule's increment in `unit` (the display unit) by the gym convention.
 */
export function ruleSentence(a: { rule: Rule | null; loggingType: LoggingType; unit: WeightUnit; last: LastSummary | null }): string {
  const { rule, loggingType, unit, last } = a;
  const done = last && lastTime(last, loggingType);
  const firstTime = 'First time logging this.';
  if (loggingType === 'timed') return done ? `Last time: ${done}. Timed holds don't go up automatically.` : firstTime;
  if (loggingType === 'distance_time') return done ? `Last time: ${done}.` : firstTime;
  if (!rule) return done ? `No rule here. Last time: ${done}.` : firstTime;
  if (rule.increment <= 0) return "No weight to add. Beat last time's reps.";

  const inc = formatWeight(convertIncrement(rule.increment, rule.incrementUnit, unit), unit);
  if (loggingType === 'assisted') {
    return `If every working set hits ${rule.repMax} on a normal day, take ${inc} of assistance off. A marked day holds it.`;
  }
  const hits = loggingType === 'weighted_time' ? `reaches ${rule.repMax}s` : `hits ${rule.repMax}`;
  return `If every working set ${hits} on a normal day, add ${inc}. A marked day holds the weight.`;
}

/**
 * The planned weight plus the increment, rounded as at finish (spec 7.3 step 6): assisted takes assistance off, never
 * below 0; a barbell goes to the loadable weight nearest the raise that is heavier than the plan, or holds the plan
 * when nothing heavier loads. In the plan's unit, with `gear` the bar and plates for it.
 */
function raisedFrom(planned: Load, rule: Rule, loggingType: LoggingType, equipment: Equipment, gear: Gear): Load {
  const increment = convertIncrement(rule.increment, rule.incrementUnit, planned.unit);
  if (loggingType === 'assisted') return { weight: Math.max(0, planned.weight - increment), unit: planned.unit };
  const raised = planned.weight + increment;
  if (equipment !== 'barbell') return { weight: raised, unit: planned.unit };
  return { weight: raiseLoadable(raised, planned.weight, gear) ?? planned.weight, unit: planned.unit };
}

/**
 * Today's read (spec 7.4, the read table), after the rule for the types it raises with an increment above 0; null
 * for the rest. A flagged exercise reads "{Reason} today, so {planned} holds." (R61). `planned` and `override` are
 * shown in their own units; `gear` is the bar and plates for the plan's unit.
 */
export function todaysRead(a: {
  rule: Rule | null;
  loggingType: LoggingType;
  planned: Load | null;
  override: Load | null;
  mark: ExerciseMark | null;
  equipment: Equipment;
  gear: Gear;
}): string | null {
  const { rule, loggingType, planned, override, mark } = a;
  if (!rule || !isLoaded(loggingType) || rule.increment <= 0) return null;
  if (!planned) return 'Pick a starting weight. Next time builds from it.';

  const plan = formatWeight(planned.weight, planned.unit);
  const holds = mark ? `${MARK_LABELS[mark]} today, so ${plan} holds.` : null;
  if (override) {
    return `Today is set to ${formatWeight(override.weight, override.unit)} by you. ${holds ?? `The rule still says ${plan}.`}`;
  }
  const raised = raisedFrom(planned, rule, loggingType, a.equipment, a.gear);
  const verb = loggingType === 'weighted_time' ? 'Reach' : 'Hit';
  const normal = `${verb} ${rule.repMax}s on a normal day and next time is ${formatWeight(raised.weight, raised.unit)}.`;
  return holds ? `${normal} ${holds}` : normal;
}

/** What the rule left for one exercise at finish: next time's weight, in the unit it was set in, and why. */
export type NextTime = {
  name: string;
  loggingType: LoggingType;
  outcome: Outcome;
  nextWeight: number;
  nextUnit: WeightUnit;
  mark: ExerciseMark | null;
};

/**
 * The finish summary's line for one exercise (spec 8.5, R64): "Bench press — next time 185 lb ↑" when the rule
 * raised it, else "Bench press — holds at 180 lb", with " · {Reason}" when a Something off flag held it. A raised
 * assisted exercise takes assistance off, so its arrow points down (R72). A bodyweight-plus exercise with 0 added load
 * "holds at bodyweight" (R75).
 */
export function finishLine(n: NextTime): string {
  const weight = formatWeight(n.nextWeight, n.nextUnit);
  if (n.outcome === 'raised') return `${n.name} — next time ${weight} ${n.loggingType === 'assisted' ? '↓' : '↑'}`;
  const reason = n.outcome === 'held_marked' && n.mark ? ` · ${MARK_LABELS[n.mark]}` : '';
  const at = n.loggingType === 'bodyweight_plus' && isZeroWeight(n.nextWeight, n.nextUnit) ? 'bodyweight' : weight;
  return `${n.name} — holds at ${at}${reason}`;
}
