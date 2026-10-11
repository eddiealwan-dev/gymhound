import { formatTrainDate, fromLocalDate } from './dates';
import { DAY_MARK_LABELS } from './labels';
import type { DayMark, LoggingType, WeightUnit } from './types';
import { formatWeight } from './units';

/** What the Up next card needs of an exercise to say its load. */
export type UpNextLoadInput = { loggingType: LoggingType; nextWeight: number | null; nextWeightUnit: WeightUnit | null };

/** Types that need a load to be logged. Bodyweight-plus, timed and distance exercises do fine without one. */
const NEEDS_LOAD: readonly LoggingType[] = ['weighted', 'weighted_time', 'assisted'];

const hasWeight = (exercise: UpNextLoadInput): exercise is UpNextLoadInput & { nextWeight: number; nextWeightUnit: WeightUnit } =>
  exercise.nextWeight !== null && exercise.nextWeightUnit !== null;

/** Some exercise of the day has a weight (both the value and its unit). */
export function upNextDayHasWeight(exercises: readonly UpNextLoadInput[]): boolean {
  return exercises.some(hasWeight);
}

/** A day needs weights when some exercise's type needs a load and no exercise of the day has a weight. */
export function upNextNeedsWeights(exercises: readonly UpNextLoadInput[]): boolean {
  return exercises.some((exercise) => NEEDS_LOAD.includes(exercise.loggingType)) && !upNextDayHasWeight(exercises);
}

/** The weight; '—' when the type needs a load, it has none, and another exercise of the day has one; else null. */
export function upNextLoad(exercise: UpNextLoadInput, dayHasWeight: boolean): string | null {
  if (hasWeight(exercise)) return formatWeight(exercise.nextWeight, exercise.nextWeightUnit);
  return dayHasWeight && NEEDS_LOAD.includes(exercise.loggingType) ? '—' : null;
}

/** "First time on this day." or "Last time: WED 7 OCT · Rough sleep", ending "Pick weights as you go." when the day needs weights. */
export function upNextSubtitle(lastTime: { localDate: string; dayMark: DayMark } | null, needsWeights: boolean, locale: string): string {
  const when =
    lastTime === null
      ? 'First time on this day.'
      : `Last time: ${formatTrainDate(fromLocalDate(lastTime.localDate), locale)} · ${DAY_MARK_LABELS[lastTime.dayMark]}`;
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
