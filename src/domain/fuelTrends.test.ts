import type { SeriesPoint } from './chart';
import { FUEL_RANGE_DAYS, formatTrendValue, trendPoints, trendSummary } from './fuelTrends';

const p = (localDate: string, value: number): SeriesPoint => ({ localDate, value });

describe('FUEL_RANGE_DAYS (R149)', () => {
  it('1M is 30 days, 3M 91 and 1Y 365', () => {
    expect(FUEL_RANGE_DAYS).toEqual({ '1M': 30, '3M': 91, '1Y': 365 });
  });
});

describe('trendPoints', () => {
  const today = '2026-10-11';

  it("leaves today out: its day is not over, so a morning's breakfast would drag the line and the average down", () => {
    const points = [p('2026-10-09', 2000), p('2026-10-10', 2100), p('2026-10-11', 400)];
    expect(trendPoints(points, '1M', today).map((x) => x.localDate)).toEqual(['2026-10-09', '2026-10-10']);
  });

  it('1M is the 30 days before today: yesterday back to 30 days ago', () => {
    // 2026-09-11 is 30 days before today; 2026-09-10 is 31.
    const points = [p('2026-09-10', 1), p('2026-09-11', 2), p('2026-10-10', 3)];
    expect(trendPoints(points, '1M', today).map((x) => x.value)).toEqual([2, 3]);
  });

  it('3M is the 91 days before today and 1Y the 365', () => {
    const points = [p('2025-10-10', 1), p('2025-10-11', 2), p('2026-07-11', 3), p('2026-07-12', 4), p('2026-10-10', 5)];
    expect(trendPoints(points, '3M', today).map((x) => x.value)).toEqual([4, 5]);
    expect(trendPoints(points, '1Y', today).map((x) => x.value)).toEqual([2, 3, 4, 5]);
  });

  it('only logged days are points: a day with nothing logged is not a zero', () => {
    const points = [p('2026-10-01', 1800), p('2026-10-05', 2200)];
    expect(trendPoints(points, '1M', today)).toEqual(points);
  });

  it('keeps a logged day whose value is 0 (food with no protein is still a logged day)', () => {
    expect(trendPoints([p('2026-10-05', 0)], '1M', today)).toEqual([p('2026-10-05', 0)]);
  });

  it('drops future dates and steps back across a month and a year', () => {
    expect(trendPoints([p('2026-10-12', 1), p('2026-12-31', 2)], '1Y', today)).toEqual([]);
    expect(trendPoints([p('2025-12-31', 7)], '1M', '2026-01-01')).toEqual([p('2025-12-31', 7)]);
    expect(trendPoints([p('2026-02-28', 7)], '1M', '2026-03-01')).toEqual([p('2026-02-28', 7)]);
  });
});

describe('formatTrendValue', () => {
  it('shows a whole number with separators and its unit (R156)', () => {
    expect(formatTrendValue(2140.4, 'kcal', 'en-US')).toBe('2,140 kcal');
    expect(formatTrendValue(142.5, 'g', 'en-US')).toBe('143 g');
    expect(formatTrendValue(-0.2, 'g', 'en-US')).toBe('0 g');
  });
});

describe('trendSummary', () => {
  it('gives the average a day over the logged days, rounded once', () => {
    expect(trendSummary([p('2026-10-01', 2000.4), p('2026-10-02', 2279.8), p('2026-10-03', 2140.3)], 'kcal', 'en-US')).toBe(
      'Average 2,140 kcal a day over 3 logged days.',
    );
  });

  it('sums unrounded: three days of 100.4 g average 100 g, and 0.5s round once at the end', () => {
    expect(trendSummary([p('2026-10-01', 100.4), p('2026-10-02', 100.4), p('2026-10-03', 100.4)], 'g', 'en-US')).toBe(
      'Average 100 g a day over 3 logged days.',
    );
    expect(trendSummary([p('2026-10-01', 140.4), p('2026-10-02', 140.6)], 'g', 'en-US')).toBe('Average 141 g a day over 2 logged days.');
  });

  it('says "1 logged day" for one', () => {
    expect(trendSummary([p('2026-10-01', 160)], 'g', 'en-US')).toBe('Average 160 g a day over 1 logged day.');
  });

  it('is null with no points', () => {
    expect(trendSummary([], 'kcal', 'en-US')).toBeNull();
  });

  it('leaves out values that are not finite', () => {
    expect(trendSummary([p('2026-10-01', NaN), p('2026-10-02', 90)], 'g', 'en-US')).toBe('Average 90 g a day over 1 logged day.');
    expect(trendSummary([p('2026-10-01', Infinity)], 'g', 'en-US')).toBeNull();
  });

  it("uses the locale's separators", () => {
    expect(trendSummary([p('2026-10-01', 2140)], 'kcal', 'de-DE')).toBe('Average 2.140 kcal a day over 1 logged day.');
  });
});
