import type { DayMark, Equipment, ExerciseMark, LoggingType } from './types';

/** How each Something off reason reads on screen, in the sheet's order (spec 18.7). */
export const MARK_LABELS: Record<ExerciseMark, string> = {
  rough_sleep: 'Rough sleep',
  sick: 'Sick',
  short_on_food: 'Short on food',
  pain: 'Pain',
  cutting: 'Cutting',
};

/** How each day mark reads on screen. */
export const DAY_MARK_LABELS: Record<DayMark, string> = {
  normal: 'Normal',
  ...MARK_LABELS,
};

/** Types whose rep range counts seconds. */
const COUNTED_IN_SECONDS: LoggingType[] = ['timed', 'weighted_time'];

/** Sets by reps: "3×8–12", "5×5" when the range is one value, and "3×30–60s" for the types counted in seconds. */
export function formatRepScheme(setCount: number, repMin: number, repMax: number, loggingType: LoggingType): string {
  const reps = repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
  return `${setCount}×${reps}${COUNTED_IN_SECONDS.includes(loggingType) ? 's' : ''}`;
}

/** How an exercise's equipment reads in the picker: "Barbell", "Bodyweight". */
export function equipmentLabel(equipment: Equipment): string {
  return equipment.charAt(0).toUpperCase() + equipment.slice(1);
}
