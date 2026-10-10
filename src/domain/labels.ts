import type { DayMark, LoggingType } from './types';

/** How each day mark reads on screen. */
export const DAY_MARK_LABELS: Record<DayMark, string> = {
  normal: 'Normal',
  rough_sleep: 'Rough sleep',
  short_on_food: 'Short on food',
  pain: 'Pain',
  cutting: 'Cutting',
};

/** Types whose rep range counts seconds. */
const COUNTED_IN_SECONDS: LoggingType[] = ['timed', 'weighted_time'];

/** Sets by reps: "3×8–12", "5×5" when the range is one value, and "3×30–60s" for the types counted in seconds. */
export function formatRepScheme(setCount: number, repMin: number, repMax: number, loggingType: LoggingType): string {
  const reps = repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
  return `${setCount}×${reps}${COUNTED_IN_SECONDS.includes(loggingType) ? 's' : ''}`;
}
