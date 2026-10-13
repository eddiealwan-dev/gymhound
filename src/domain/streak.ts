import { daysBetween } from './dates';

/** The longest gap between training dates, in days, that keeps a run going (2 rest days). */
const MAX_GAP_DAYS = 3;

/**
 * Current streak in days (spec 7.8). `trainingDates` are the `local_date` values of finished
 * workouts, in any order and with duplicates. The run is alive while the latest training date
 * is at most 3 days before `today`; its length is the days from the run start to `today`, inclusive.
 */
export function computeStreak(trainingDates: string[], today: string): number {
  // YYYY-MM-DD strings sort chronologically as plain text.
  const dates = [...new Set(trainingDates)].sort();
  if (dates.length === 0) return 0;

  const latest = dates[dates.length - 1];
  if (daysBetween(latest, today) > MAX_GAP_DAYS) return 0;

  let runStart = latest;
  for (let i = dates.length - 2; i >= 0; i--) {
    if (daysBetween(dates[i], runStart) > MAX_GAP_DAYS) break;
    runStart = dates[i];
  }
  return daysBetween(runStart, today) + 1;
}
