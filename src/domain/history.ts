import { dateFormat } from './intl';
import { MARK_LABELS } from './labels';
import { formatPrevious, type PrevSet } from './setEntry';
import type { ExerciseMark, LoggingType, WeightUnit } from './types';
import { formatVolume } from './volume';

/** One finished workout as History's list shows it (R163). */
export type HistoryCard = {
  id: string;
  name: string;
  localDate: string;
  startedAt: number;
  durationMs: number;
  /** Total volume in the display unit, a whole number (spec 7.9). */
  volume: number;
  /** Done sets, warm-ups included. */
  setCount: number;
  /** The Something off reasons of its exercises, each once, in workout order. */
  marks: ExerciseMark[];
  /** Distinct exercise-and-kind personal bests (R178). */
  prCount: number;
};

export type HistoryMonth = { month: string; title: string; cards: HistoryCard[] };

function newestFirst(a: HistoryCard, b: HistoryCard): number {
  if (a.localDate !== b.localDate) return a.localDate < b.localDate ? 1 : -1;
  return b.startedAt - a.startedAt;
}

/** Cards grouped by the month of their `local_date`: newest month first, newest card first in each. */
export function groupByMonth(cards: readonly HistoryCard[], locale: string, today: string): HistoryMonth[] {
  const months: HistoryMonth[] = [];
  for (const c of [...cards].sort(newestFirst)) {
    const month = c.localDate.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.month === month) last.cards.push(c);
    else months.push({ month, title: monthTitle(month, locale, today), cards: [c] });
  }
  return months;
}

/** A YYYY-MM month as a title: "October" in today's year, "October 2025" in another. */
export function monthTitle(month: string, locale: string, today: string): string {
  const [y, m] = month.split('-').map(Number);
  const sameYear = month.slice(0, 4) === today.slice(0, 4);
  return dateFormat(locale, { month: 'long', ...(sameYear ? null : { year: 'numeric' }) }).format(new Date(y, m - 1, 1));
}

/** A workout's length: "48 min", "1 h 5 min", "1 h"; anything under a minute reads "1 min". */
export function formatWorkoutDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "48 min · 12,340 lb · 3 PRs" ("1 PR"); the volume part is left out at 0, the PR part at 0. */
export function cardLine(card: HistoryCard, unit: WeightUnit, locale: string): string {
  const parts = [formatWorkoutDuration(card.durationMs)];
  if (card.volume > 0) parts.push(formatVolume(card.volume, unit, locale));
  if (card.prCount > 0) parts.push(card.prCount === 1 ? '1 PR' : `${card.prCount} PRs`);
  return parts.join(' · ');
}

/** "Something off: Rough sleep · Pain", each reason once in the order given; null when there is none. */
export function marksLine(marks: readonly ExerciseMark[]): string | null {
  const unique = [...new Set(marks)];
  if (unique.length === 0) return null;
  return `Something off: ${unique.map((m) => MARK_LABELS[m]).join(' · ')}`;
}

/** A logged set as the History detail reads it: as Previous ("185 × 5", "84 kg × 5"), then " @ 8" when it has an RPE. */
export function historySetText(set: PrevSet & { rpe: number | null }, loggingType: LoggingType, displayUnit: WeightUnit): string {
  const text = formatPrevious(set, loggingType, displayUnit);
  return set.rpe === null ? text : `${text} @ ${set.rpe}`;
}

/** Every YYYY-MM month from `first` to `last`, both included; empty when `first` is after `last`. */
export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [y, m] = first.split('-').map(Number);
  const [ly, lm] = last.split('-').map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
