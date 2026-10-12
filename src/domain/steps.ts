import { dateFormat } from './intl';
import { fromLocalDate, shiftDay } from './dates';

/**
 * Whether the phone will give GymHound its step counts (R182). `unavailable` covers Android (Health Connect comes in
 * phase 7), the web and an iPhone without a step counter; the card then draws nothing.
 */
export type StepsPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** The phone's step counter, behind a narrow adapter: `src/platform/steps.native.ts` on phones, `steps.ts` elsewhere. */
export interface StepsSource {
  /** What the phone says now. Never asks. */
  permission(): Promise<StepsPermission>;
  /** Asks for motion access; only **Show steps** calls it (R182). */
  request(): Promise<StepsPermission>;
  /** The steps counted from `start` to `end`. May reject. */
  stepsBetween(start: Date, end: Date): Promise<number>;
}

/** Today and the 6 days before it, oldest first: the week an iPhone keeps (R182). */
export function lastSevenDays(today: string): string[] {
  return [6, 5, 4, 3, 2, 1, 0].map((back) => shiftDay(today, -back));
}

/** The mean of the counts, rounded to a whole step; 0 with none. */
export function stepsAverage(counts: readonly number[]): number {
  if (counts.length === 0) return 0;
  return Math.round(counts.reduce((sum, n) => sum + n, 0) / counts.length);
}

/** The span to read for each of `lastSevenDays(today)`: a past day midnight to midnight, today midnight to `now`. */
export function stepsWindows(today: string, now: number): { start: Date; end: Date }[] {
  return lastSevenDays(today).map((day) => ({
    start: fromLocalDate(day),
    end: day === today ? new Date(now) : fromLocalDate(shiftDay(day, 1)),
  }));
}

/** A count with the locale's separators ("8,214"). */
export function stepsCount(n: number, locale: string): string {
  return Math.round(n).toLocaleString(locale, { maximumFractionDigits: 0 });
}

/** The weekday's initial under a bar ("M"). */
export function weekdayInitial(localDate: string, locale: string): string {
  return dateFormat(locale, { weekday: 'narrow' }).format(fromLocalDate(localDate));
}

/** The bars as VoiceOver reads them: "Mon 8,214, Tue 6,002, …", oldest first. */
export function stepsSpoken(days: readonly string[], counts: readonly number[], locale: string): string {
  const weekday = dateFormat(locale, { weekday: 'short' });
  return days.map((day, i) => `${weekday.format(fromLocalDate(day))} ${stepsCount(counts[i] ?? 0, locale)}`).join(', ');
}

/** "Average 7,102 a day over 7 days". */
export function stepsAverageLine(average: number, locale: string): string {
  return `Average ${stepsCount(average, locale)} a day over 7 days`;
}
