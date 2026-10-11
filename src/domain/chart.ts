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
  const sorted = finitePoints(points).sort(byDate);
  if (range === 'All') return sorted;
  const days = RANGE_DAYS[range];
  return sorted.filter((pt) => {
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
