import { chartSummary, formatChartDate, niceTicks, plotSeries, pointsInDays, pointsInRange } from './chart';
import type { SeriesPoint } from './chart';

const p = (localDate: string, value: number): SeriesPoint => ({ localDate, value });

describe('pointsInRange', () => {
  const today = '2026-10-11';
  // 2026-07-13 is 90 days before today (the 91st day back counting today), 2026-07-12 is 91 days before.
  const points = [p('2025-10-11', 1), p('2025-10-12', 2), p('2026-07-12', 3), p('2026-07-13', 4), p('2026-10-11', 5)];

  it('3M keeps the last 91 days, today included', () => {
    expect(pointsInRange(points, '3M', today).map((x) => x.value)).toEqual([4, 5]);
  });

  it('1Y keeps the last 365 days, today included', () => {
    expect(pointsInRange(points, '1Y', today).map((x) => x.value)).toEqual([2, 3, 4, 5]);
  });

  it('All keeps everything', () => {
    expect(pointsInRange(points, 'All', today).map((x) => x.value)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns the points oldest first, whatever order they came in', () => {
    const shuffled = [points[4], points[0], points[3]];
    expect(pointsInRange(shuffled, 'All', today).map((x) => x.localDate)).toEqual(['2025-10-11', '2026-07-13', '2026-10-11']);
  });

  it('drops dates after today from 3M and 1Y, but All keeps them', () => {
    const withFuture = [...points, p('2026-10-12', 6)];
    expect(pointsInRange(withFuture, '3M', today).map((x) => x.value)).toEqual([4, 5]);
    expect(pointsInRange(withFuture, '1Y', today).map((x) => x.value)).toEqual([2, 3, 4, 5]);
    expect(pointsInRange(withFuture, 'All', today).map((x) => x.value)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('drops values that are not finite numbers', () => {
    const odd = [p('2026-10-01', NaN), p('2026-10-02', Infinity), p('2026-10-03', -Infinity), p('2026-10-04', 80)];
    expect(pointsInRange(odd, 'All', today).map((x) => x.value)).toEqual([80]);
    expect(pointsInRange(odd, '3M', today).map((x) => x.value)).toEqual([80]);
  });

  it('does not change the input', () => {
    const input = [points[4], points[0]];
    pointsInRange(input, 'All', today);
    expect(input.map((x) => x.value)).toEqual([5, 1]);
  });
});

describe('pointsInDays', () => {
  const today = '2026-10-11';
  // 2026-09-12 is 29 days before today (the 30th day back counting today), 2026-09-11 is 30 days before.
  const points = [p('2026-09-11', 1), p('2026-09-12', 2), p('2026-10-10', 3), p('2026-10-11', 4)];

  it('keeps the last N days, today included', () => {
    expect(pointsInDays(points, 30, today).map((x) => x.value)).toEqual([2, 3, 4]);
  });

  it('one day is today alone', () => {
    expect(pointsInDays(points, 1, today).map((x) => x.value)).toEqual([4]);
  });

  it('drops dates after today', () => {
    expect(pointsInDays([...points, p('2026-10-12', 5), p('2027-01-01', 6)], 30, today).map((x) => x.value)).toEqual([2, 3, 4]);
  });

  it('returns finite values only, oldest first, whatever order they came in', () => {
    const odd = [points[3], p('2026-10-01', NaN), points[1], p('2026-10-02', Infinity), points[2]];
    expect(pointsInDays(odd, 30, today).map((x) => x.localDate)).toEqual(['2026-09-12', '2026-10-10', '2026-10-11']);
  });

  it('gives nothing for 0 days or a count that is not a positive number', () => {
    expect(pointsInDays(points, 0, today)).toEqual([]);
    expect(pointsInDays(points, -5, today)).toEqual([]);
    expect(pointsInDays(points, NaN, today)).toEqual([]);
  });

  it('matches pointsInRange for 91 and 365 days', () => {
    const many = [p('2025-10-11', 1), p('2025-10-12', 2), p('2026-07-12', 3), p('2026-07-13', 4), p('2026-10-11', 5)];
    expect(pointsInDays(many, 91, today)).toEqual(pointsInRange(many, '3M', today));
    expect(pointsInDays(many, 365, today)).toEqual(pointsInRange(many, '1Y', today));
  });

  it('does not change the input', () => {
    const input = [points[3], points[0]];
    pointsInDays(input, 30, today);
    expect(input.map((x) => x.value)).toEqual([4, 1]);
  });
});

describe('niceTicks', () => {
  it('uses the smallest 1-2-5 step that gives at most five ticks', () => {
    expect(niceTicks(178.5, 186)).toEqual([178, 180, 182, 184, 186]);
  });

  it('widens a flat series by one step each side', () => {
    expect(niceTicks(80, 80)).toEqual([79, 80, 81]);
  });

  it('covers a value that is not on a step', () => {
    expect(niceTicks(81.3, 82.4)).toEqual([81, 82, 83]);
  });

  it('steps by 5, 10, 20 … as the range grows', () => {
    expect(niceTicks(0, 20)).toEqual([0, 5, 10, 15, 20]);
    // step 20 would need 140 … 240, six ticks; step 50 needs three
    expect(niceTicks(150, 230)).toEqual([150, 200, 250]);
  });

  it('gives nothing for values that are not finite, rather than looping', () => {
    expect(niceTicks(NaN, 80)).toEqual([]);
    expect(niceTicks(0, Infinity)).toEqual([]);
    expect(niceTicks(-Infinity, Infinity)).toEqual([]);
  });

  it('treats maxTicks below 3 as 3, so a flat series still widens', () => {
    expect(niceTicks(0, 0, 2)).toEqual([-1, 0, 1]);
    expect(niceTicks(80, 80, 1)).toEqual([79, 80, 81]);
    expect(niceTicks(0, 100, 0)).toEqual([0, 50, 100]);
  });

  it('ends on a huge range instead of looping', () => {
    const ticks = niceTicks(-1e300, 1e300);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.length).toBeLessThanOrEqual(5);
  });

  it('honours maxTicks', () => {
    const ticks = niceTicks(0, 100, 3);
    expect(ticks).toEqual([0, 50, 100]);
  });
});

describe('plotSeries', () => {
  const box = { width: 300, height: 180, left: 10, right: 6, top: 8, bottom: 12 };

  it('puts the earliest date at left, the latest at width - right, and the highest value at top', () => {
    const out = plotSeries([p('2026-08-03', 182), p('2026-08-01', 178.5), p('2026-08-11', 186)], box);
    // 178.5 is a quarter step above the bottom tick (178)
    expect(out.dots[0]).toEqual({ x: 10, y: 168 - 160 * (0.5 / 8) });
    expect(out.dots[2]).toEqual({ x: 294, y: 8 });
    // 2 of 10 days along, 182 is halfway between 178 and 186
    expect(out.dots[1].x).toBeCloseTo(10 + (284 * 2) / 10);
    expect(out.dots[1].y).toBeCloseTo(8 + 160 / 2);
  });

  it('draws the path through every dot, starting with M', () => {
    const out = plotSeries([p('2026-08-01', 178), p('2026-08-11', 186)], box);
    expect(out.path).toBe('M10 168 L294 8');
  });

  it('gives each y tick its height, the first tick at the bottom and the last at the top', () => {
    const out = plotSeries([p('2026-08-01', 178.5), p('2026-08-11', 186)], box);
    expect(out.yTicks.map((t) => t.value)).toEqual([178, 180, 182, 184, 186]);
    expect(out.yTicks[0].y).toBe(168);
    expect(out.yTicks[4].y).toBe(8);
    expect(out.yTicks[2].y).toBe(88);
  });

  it('a single point is a dot in the middle with no path, on a widened scale', () => {
    const out = plotSeries([p('2026-08-01', 80)], box);
    expect(out.path).toBe('');
    expect(out.dots).toEqual([{ x: 152, y: 88 }]);
    expect(out.yTicks.map((t) => t.value)).toEqual([79, 80, 81]);
  });

  it('a flat series is a level line in the middle', () => {
    const out = plotSeries([p('2026-08-01', 80), p('2026-08-05', 80)], box);
    expect(out.dots.map((d) => d.y)).toEqual([88, 88]);
  });

  it('skips values that are not finite numbers', () => {
    const out = plotSeries([p('2026-08-01', 178), p('2026-08-05', NaN), p('2026-08-08', Infinity), p('2026-08-11', 186)], box);
    expect(out.path).toBe('M10 168 L294 8');
    expect(out.dots).toHaveLength(2);
    expect(plotSeries([p('2026-08-05', NaN)], box)).toEqual({ path: '', dots: [], yTicks: [] });
  });

  it('no points draws nothing', () => {
    expect(plotSeries([], box)).toEqual({ path: '', dots: [], yTicks: [] });
  });
});

describe('formatChartDate', () => {
  it('is the day and short month, laid out for the locale', () => {
    expect(formatChartDate('2026-08-03', 'en-GB')).toBe('3 Aug');
    expect(formatChartDate('2026-08-03', 'en-US')).toBe('Aug 3');
  });
});

describe('chartSummary', () => {
  const fmt = (v: number) => `${v} lb`;

  it('says nothing for no points', () => {
    expect(chartSummary([], fmt, 'en-GB')).toBe('');
  });

  it('leaves out values that are not finite numbers', () => {
    expect(chartSummary([p('2026-08-02', NaN), p('2026-08-03', 180)], fmt, 'en-GB')).toBe('3 Aug: 180 lb.');
    expect(chartSummary([p('2026-08-02', NaN)], fmt, 'en-GB')).toBe('');
  });

  it('reads one point as its date and value', () => {
    expect(chartSummary([p('2026-08-03', 180)], fmt, 'en-GB')).toBe('3 Aug: 180 lb.');
  });

  it('reads the first and last values with the lowest and highest', () => {
    const points = [p('2026-08-03', 180), p('2026-09-01', 175), p('2026-10-09', 182), p('2026-10-10', 176.5)];
    expect(chartSummary(points, fmt, 'en-GB')).toBe('3 Aug to 10 Oct: 180 lb to 176.5 lb. Lowest 175 lb, highest 182 lb.');
  });
});
