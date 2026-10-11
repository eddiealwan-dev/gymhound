import { formatTrainDate, fromLocalDate } from './dates';
import { MARK_LABELS } from './labels';
import { planInUnit, type Gear } from './plates';
import type { Outcome } from './progression';
import type { Equipment, ExerciseMark, LoggingType, WeightUnit } from './types';
import { convertIncrement, formatWeight, isZeroWeight } from './units';

/** What the Up next card needs of an exercise to say its load. */
export type UpNextLoadInput = { loggingType: LoggingType; nextWeight: number | null; nextWeightUnit: WeightUnit | null };

/** Types that need a load to be logged. Bodyweight-plus, timed and distance exercises do fine without one. */
const NEEDS_LOAD: readonly LoggingType[] = ['weighted', 'weighted_time', 'assisted'];

/** A weight and its unit, but not a bodyweight-plus exercise's 0 added load, which is no load (R75). */
const hasWeight = (exercise: UpNextLoadInput): exercise is UpNextLoadInput & { nextWeight: number; nextWeightUnit: WeightUnit } =>
  exercise.nextWeight !== null &&
  exercise.nextWeightUnit !== null &&
  !(exercise.loggingType === 'bodyweight_plus' && isZeroWeight(exercise.nextWeight, exercise.nextWeightUnit));

/** Some exercise of the day has a weight (both the value and its unit; a bodyweight-plus 0 is none, R75). */
export function upNextDayHasWeight(exercises: readonly UpNextLoadInput[]): boolean {
  return exercises.some(hasWeight);
}

/** A day needs weights when some exercise's type needs a load and no exercise of the day has a weight. */
export function upNextNeedsWeights(exercises: readonly UpNextLoadInput[]): boolean {
  return exercises.some((exercise) => NEEDS_LOAD.includes(exercise.loggingType)) && !upNextDayHasWeight(exercises);
}

/**
 * The weight in the display unit, as a workout start would plan it (`planInUnit` with `gear`, the display unit's bar
 * and plates: R63); '—' when the type needs a load, it has none, and another exercise of the day has one; else null,
 * as for a bodyweight-plus exercise at 0 added load (R75).
 */
export function upNextLoad(
  exercise: UpNextLoadInput & { equipment: Equipment },
  dayHasWeight: boolean,
  unit: WeightUnit,
  gear: Gear,
): string | null {
  if (hasWeight(exercise)) {
    const weight = planInUnit(exercise.nextWeight, exercise.nextWeightUnit, unit, exercise.equipment === 'barbell', gear.bar, gear.plates);
    return formatWeight(weight, unit);
  }
  return dayHasWeight && NEEDS_LOAD.includes(exercise.loggingType) ? '—' : null;
}

/** What the Up next card needs of an exercise to say how it went last time. */
export type UpNextOutcomeInput = {
  loggingType: LoggingType;
  equipment: Equipment;
  lastOutcome: Outcome | null;
  lastMark: ExerciseMark | null;
  increment: number;
  incrementUnit: WeightUnit;
  lastWorkingWeight: number | null;
  lastWorkingUnit: WeightUnit | null;
  lastNextWeight: number | null;
  lastNextUnit: WeightUnit | null;
};

/**
 * How far last time's raise moved the load, in `unit` (R73): the difference between the two loads as Up next shows
 * them (`planInUnit` with `gear`, R77), next − working, or working − next for assisted. Weights already in `unit` show
 * as they are. 0 when the shown load did not move (R76); null when a weight is missing, so the amount is unknown.
 */
function actualRise(exercise: UpNextOutcomeInput, unit: WeightUnit, gear: Gear): number | null {
  const { lastWorkingWeight: working, lastWorkingUnit: workingUnit, lastNextWeight: next, lastNextUnit: nextUnit } = exercise;
  if (working === null || workingUnit === null || next === null || nextUnit === null) return null;
  const shown = (weight: number, from: WeightUnit) =>
    planInUnit(weight, from, unit, exercise.equipment === 'barbell', gear.bar, gear.plates);
  const rise = shown(next, nextUnit) - shown(working, workingUnit);
  return Math.max(0, Number((exercise.loggingType === 'assisted' ? -rise : rise).toFixed(2)));
}

/**
 * Last time's outcome, to follow the load (spec 18.7): " · ↑ 10 lb" for a raise, by how much it actually rose (R73),
 * or " · ↓ 5 lb" on an assisted exercise, where a raise is less assistance (R72); " · held · Rough sleep" for a hold on
 * a flagged exercise, " · held" otherwise. Null with no history, no rule or no sets, and for a raise known to have
 * moved nothing (R76). A raise whose amount is unknown reads the routine's increment, in the display unit by the gym
 * convention. `gear` is the display unit's bar and plates, as for `upNextLoad`.
 */
export function upNextOutcome(exercise: UpNextOutcomeInput, unit: WeightUnit, gear: Gear): string | null {
  switch (exercise.lastOutcome) {
    case 'raised': {
      const rise = actualRise(exercise, unit, gear);
      if (rise === 0) return null;
      const arrow = exercise.loggingType === 'assisted' ? '↓' : '↑';
      const amount = rise ?? convertIncrement(exercise.increment, exercise.incrementUnit, unit);
      return ` · ${arrow} ${formatWeight(amount, unit)}`;
    }
    case 'held':
    case 'held_marked':
      return exercise.lastMark === null ? ' · held' : ` · held · ${MARK_LABELS[exercise.lastMark]}`;
    default:
      return null;
  }
}

/** "First time on this day." or "Last time: WED 7 OCT", ending "Pick weights as you go." when the day needs weights. */
export function upNextSubtitle(lastTime: { localDate: string } | null, needsWeights: boolean, locale: string): string {
  const when = lastTime === null ? 'First time on this day.' : `Last time: ${formatTrainDate(fromLocalDate(lastTime.localDate), locale)}`;
  if (!needsWeights) return when;
  return `${lastTime === null ? when : `${when}.`} Pick weights as you go.`;
}

/** The day's name, or "{routine} {day}" when the day's name has 1 or 2 characters ("5×5 A"). Task 4 uses it. */
export function dayTitle(routineName: string, dayName: string): string {
  return [...dayName].length <= 2 ? `${routineName} ${dayName}` : dayName;
}

/** The label of the button that starts the day: "Start Upper A", "Start 5×5 A". */
export function startDayLabel(routineName: string, dayName: string): string {
  return `Start ${dayTitle(routineName, dayName)}`;
}
