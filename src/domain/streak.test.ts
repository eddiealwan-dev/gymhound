import { computeStreak } from './streak';

describe('computeStreak (spec 7.8)', () => {
  it('is 0 with no training dates', () => {
    expect(computeStreak([], '2026-10-09')).toBe(0);
  });

  it('is 1 when the only training date is today', () => {
    expect(computeStreak(['2026-10-09'], '2026-10-09')).toBe(1);
  });

  it('stays alive through 2 rest days', () => {
    expect(computeStreak(['2026-10-06'], '2026-10-09')).toBe(4);
  });

  it('ends once the third rest day has passed', () => {
    expect(computeStreak(['2026-10-05'], '2026-10-09')).toBe(0);
  });

  it('walks back through unsorted and duplicate dates with gaps of up to 3 days', () => {
    expect(
      computeStreak(['2026-10-08', '2026-10-01', '2026-10-03', '2026-10-06', '2026-10-06'], '2026-10-09'),
    ).toBe(9);
  });

  it('starts the run after a gap longer than 3 days', () => {
    expect(computeStreak(['2026-09-20', '2026-10-06', '2026-10-08'], '2026-10-09')).toBe(4);
  });

  it('counts calendar days across a DST change', () => {
    expect(computeStreak(['2026-03-07', '2026-03-09'], '2026-03-10')).toBe(4);
  });
});
