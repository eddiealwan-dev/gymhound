import { pointsInDays } from './chart';
import type { SeriesPoint } from './chart';
import { fuelNumber } from './fuel';

/** The trends' ranges (R149): 1M is the default. */
export type FuelRange = '1M' | '3M' | '1Y';

/** How many days each range covers (R149). */
export const FUEL_RANGE_DAYS: Record<FuelRange, number> = { '1M': 30, '3M': 91, '1Y': 365 };

/**
 * The logged days a trend draws, oldest first: the range's days ending yesterday. Today is left out because its day is
 * not over: a morning's breakfast as a point would drag the line and the average down until evening. Only days with
 * entries are points (an unlogged day is not a zero); a logged day whose value is 0 stays.
 */
export function trendPoints(points: readonly SeriesPoint[], range: FuelRange, today: string): SeriesPoint[] {
  // The range's days plus today, then today taken off: counted in whole calendar days, as pointsInDays counts them.
  return pointsInDays(points, FUEL_RANGE_DAYS[range] + 1, today).filter((pt) => pt.localDate !== today);
}

/** A trend value as shown and read: "2,140 kcal" or "143 g", a whole number with the locale's separators (R156). */
export function formatTrendValue(value: number, unit: 'kcal' | 'g', locale?: string): string {
  return `${fuelNumber(value, locale)} ${unit}`;
}

/**
 * The line under the chart: "Average 2,140 kcal a day over 24 logged days." ("… over 1 logged day."). The average is of
 * the unrounded daily totals, rounded once (R156). Null with no points; values that are not finite are left out.
 */
export function trendSummary(points: readonly SeriesPoint[], unit: 'kcal' | 'g', locale?: string): string | null {
  const values = points.map((pt) => pt.value).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const days = values.length === 1 ? '1 logged day' : `${values.length.toLocaleString(locale)} logged days`;
  return `Average ${formatTrendValue(average, unit, locale)} a day over ${days}.`;
}
