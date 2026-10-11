import { daysBetween, fromLocalDate } from './dates';

/** A chart's date range (§8.9, R116): 3M is the default. */
export type ChartRange = '3M' | '1Y' | 'All';

/** One value on one local date (YYYY-MM-DD). */
export type SeriesPoint = { localDate: string; value: number };

/** The drawing area: the full size, and the inset on each side that the line and dots stay inside. */
export type PlotBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };

export type PlottedSeries = { path: string; dots: { x: number; y: number }[]; yTicks: { value: number; y: number }[] };

const RANGE_DAYS: Record<Exclude<ChartRange, 'All'>, number> = { '3M': 91, '1Y': 365 };

function byDate(a: SeriesPoint, b: SeriesPoint): number {
  return a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0;
}

/** Only points with a finite value can be drawn: NaN or Infinity would wreck the scale. */
function finitePoints(points: readonly SeriesPoint[]): SeriesPoint[] {
  return points.filter((pt) => Number.isFinite(pt.value));
}

/**
 * The points in a range, oldest first, finite values only: 3M is the last 91 days and 1Y the last 365, today included
 * and nothing after it. All keeps every date.
 */
export function pointsInRange(points: readonly SeriesPoint[], range: ChartRange, today: string): SeriesPoint[] {
  if (range === 'All') return finitePoints(points).sort(byDate);
  return pointsInDays(points, RANGE_DAYS[range], today);
}

/**
 * The points in the last `days` days, oldest first, finite values only, by the same rules as `pointsInRange`: today
 * included and nothing after it, so 30 days is today and the 29 before it (R149). 0, a negative or a non-number count
 * gives nothing.
 */
export function pointsInDays(points: readonly SeriesPoint[], days: number, today: string): SeriesPoint[] {
  return finitePoints(points)
    .sort(byDate)
    .filter((pt) => {
      const ago = daysBetween(pt.localDate, today);
      return ago >= 0 && ago < days;
    });
}

/** Steps stop growing here, so even an absurd range ends: the last step tried covers any finite range. */
const MAX_MAGNITUDE = 1e308;

/**
 * Y-axis ticks: the smallest 1-2-5 step (1, 2, 5, 10, 20, 50 …) that covers floor(min) to ceil(max) in at most
 * `maxTicks` ticks (never fewer than 3, so a flat series can widen), starting and ending on a step. A flat series
 * (min === max) widens by one step each side. A min or max that is not finite gives no ticks.
 */
export function niceTicks(min: number, max: number, maxTicks = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const limit = Math.max(3, Math.floor(maxTicks));
  const lo = Math.floor(min);
  const hi = Math.ceil(max);
  for (let magnitude = 1; magnitude <= MAX_MAGNITUDE; magnitude *= 10) {
    for (const m of [1, 2, 5]) {
      const step = m * magnitude;
      let start = Math.floor(lo / step) * step;
      let end = Math.ceil(hi / step) * step;
      if (start === end) {
        start -= step;
        end += step;
      }
      const count = Math.round((end - start) / step) + 1;
      if (Number.isFinite(count) && count <= limit) {
        return Array.from({ length: count }, (_, i) => start + i * step);
      }
    }
  }
  return lo === hi ? [lo] : [lo, hi];
}

/** A coordinate rounded to 2 places, for a short path string. */
function coord(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Lays a series out in a box: x by date (days from the first point), y by value against the y ticks (the first tick
 * at the bottom, the last at the top). One point sits in the middle with no path; no points gives nothing.
 */
export function plotSeries(points: readonly SeriesPoint[], box: PlotBox): PlottedSeries {
  const sorted = finitePoints(points).sort(byDate);
  if (sorted.length === 0) return { path: '', dots: [], yTicks: [] };
  const values = sorted.map((pt) => pt.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const low = ticks[0];
  const high = ticks[ticks.length - 1];

  const x0 = box.left;
  const plotWidth = box.width - box.left - box.right;
  const y0 = box.height - box.bottom;
  const plotHeight = box.height - box.top - box.bottom;
  const span = daysBetween(sorted[0].localDate, sorted[sorted.length - 1].localDate);

  const xOf = (localDate: string) => coord(span === 0 ? x0 + plotWidth / 2 : x0 + (plotWidth * daysBetween(sorted[0].localDate, localDate)) / span);
  const yOf = (value: number) => coord(y0 - (plotHeight * (value - low)) / (high - low));

  const dots = sorted.map((pt) => ({ x: xOf(pt.localDate), y: yOf(pt.value) }));
  const path = dots.length < 2 ? '' : dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x} ${d.y}`).join(' ');
  return { path, dots, yTicks: ticks.map((value) => ({ value, y: yOf(value) })) };
}

/** A chart date: the day and short month, laid out for the locale ("3 Aug", or "Aug 3" in en-US). */
export function formatChartDate(localDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(fromLocalDate(localDate));
}

/**
 * The chart in words for VoiceOver and TalkBack: "3 Aug to 10 Oct: 180 lb to 176.5 lb. Lowest 175 lb, highest 182 lb."
 * One point reads "3 Aug: 180 lb."; no points reads "". Values that are not finite are left out.
 */
export function chartSummary(points: readonly SeriesPoint[], formatValue: (v: number) => string, locale: string): string {
  const sorted = finitePoints(points).sort(byDate);
  if (sorted.length === 0) return '';
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (sorted.length === 1) return `${formatChartDate(first.localDate, locale)}: ${formatValue(first.value)}.`;
  const values = sorted.map((pt) => pt.value);
  return (
    `${formatChartDate(first.localDate, locale)} to ${formatChartDate(last.localDate, locale)}: ` +
    `${formatValue(first.value)} to ${formatValue(last.value)}. ` +
    `Lowest ${formatValue(Math.min(...values))}, highest ${formatValue(Math.max(...values))}.`
  );
}

/**
 * A point that can be marked (R173): `hollow` draws it as a ring (a session with something off), `label` is the word
 * over it ("Rough sleep", "Stall"). Body charts pass plain points.
 */
export type ChartPoint = SeriesPoint & { hollow?: boolean; label?: string | null };

/** Two placed labels are at least this far apart across the chart (R173). */
export const LABEL_GAP_PT = 56;

/**
 * Which labels fit (R173): newest (last) first, a label is skipped when it is within `minGap` across of one already
 * placed. Returned in the order placed. Skipped labels still show in the screen's list and the VoiceOver label.
 */
export function placeLabels(
  dots: readonly { x: number; y: number; label: string | null }[],
  minGap: number = LABEL_GAP_PT,
): { index: number; label: string }[] {
  const placed: { index: number; label: string; x: number }[] = [];
  for (let i = dots.length - 1; i >= 0; i--) {
    const { x, label } = dots[i];
    if (label === null || label === '') continue;
    if (placed.some((other) => Math.abs(other.x - x) < minGap)) continue;
    placed.push({ index: i, label, x });
  }
  return placed.map(({ index, label }) => ({ index, label }));
}

/**
 * The change across a range in words (R175): "Up 1.5 kg since 12 Jul.", "Down 2 cm since 3 Aug.", or "No change since
 * 3 Aug." when the change reads as nothing once formatted. `formatDelta` gets the size of the change. Null with fewer
 * than two finite points.
 */
export function rangeChange(points: readonly SeriesPoint[], formatDelta: (absDelta: number) => string, locale: string): string | null {
  const sorted = finitePoints(points).sort(byDate);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const delta = sorted[sorted.length - 1].value - first.value;
  const since = `since ${formatChartDate(first.localDate, locale)}.`;
  const shown = formatDelta(Math.abs(delta));
  if (delta === 0 || shown === formatDelta(0)) return `No change ${since}`;
  return `${delta > 0 ? 'Up' : 'Down'} ${shown} ${since}`;
}

/** The label `liftPoints` gives a stalled session (§7.5). */
const STALL_LABEL = 'Stall';

/**
 * What the marks add to a chart's VoiceOver label (R173): " 2 sessions marked. Stall from 3 Oct." — the hollow points
 * counted, then each stall run by the date it began (a marked session inside a run doesn't end it; any other session
 * does). "" when nothing is marked.
 */
export function markedSummary(points: readonly ChartPoint[], locale: string): string {
  const sorted = [...points].sort(byDate);
  const marked = sorted.filter((pt) => pt.hollow).length;
  const parts: string[] = [];
  if (marked > 0) parts.push(`${marked} ${marked === 1 ? 'session' : 'sessions'} marked.`);
  let inRun = false;
  for (const pt of sorted) {
    if (pt.hollow) continue;
    const stall = pt.label === STALL_LABEL;
    if (stall && !inRun) parts.push(`Stall from ${formatChartDate(pt.localDate, locale)}.`);
    inRun = stall;
  }
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}
