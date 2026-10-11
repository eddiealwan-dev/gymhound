import { chartSummary, formatChartDate, niceTicks, plotSeries, pointsInRange } from './chart';
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

  it('does not change the input', () => {
    const input = [points[4], points[0]];
    pointsInRange(input, 'All', today);
    expect(input.map((x) => x.value)).toEqual([5, 1]);
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

  it('reads one point as its date and value', () => {
    expect(chartSummary([p('2026-08-03', 180)], fmt, 'en-GB')).toBe('3 Aug: 180 lb.');
  });

  it('reads the first and last values with the lowest and highest', () => {
    const points = [p('2026-08-03', 180), p('2026-09-01', 175), p('2026-10-09', 182), p('2026-10-10', 176.5)];
    expect(chartSummary(points, fmt, 'en-GB')).toBe('3 Aug to 10 Oct: 180 lb to 176.5 lb. Lowest 175 lb, highest 182 lb.');
  });
});
