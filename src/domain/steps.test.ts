import { lastSevenDays, stepsAverage, stepsAverageLine, stepsCount, stepsSpoken, stepsWindows, weekdayInitial } from './steps';

describe('lastSevenDays (R182)', () => {
  it('is today and the 6 days before it, oldest first', () => {
    expect(lastSevenDays('2026-10-11')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  });

  it('runs back across a month end and a year end', () => {
    expect(lastSevenDays('2026-11-03')).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    expect(lastSevenDays('2027-01-02')).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });
});

describe('stepsAverage', () => {
  it('is the mean rounded to a whole step', () => {
    expect(stepsAverage([8214, 6002, 0, 10000, 4000, 7001, 5000])).toBe(5745);
    expect(stepsAverage([1, 2])).toBe(2);
  });

  it('is 0 with no counts', () => {
    expect(stepsAverage([])).toBe(0);
  });
});

describe('stepsWindows', () => {
  it('reads each past day from its midnight to the next, and today from its midnight to now', () => {
    const now = new Date(2026, 9, 11, 14, 30).getTime();
    const windows = stepsWindows('2026-10-11', now);
    expect(windows).toHaveLength(7);
    expect(windows[0]).toEqual({ start: new Date(2026, 9, 5), end: new Date(2026, 9, 6) });
    expect(windows[5]).toEqual({ start: new Date(2026, 9, 10), end: new Date(2026, 9, 11) });
    expect(windows[6]).toEqual({ start: new Date(2026, 9, 11), end: new Date(now) });
  });
});

describe('words', () => {
  const days = lastSevenDays('2026-10-11'); // Mon 5 Oct … Sun 11 Oct

  it('writes a count with separators', () => {
    expect(stepsCount(8214, 'en-US')).toBe('8,214');
    expect(stepsCount(0, 'en-US')).toBe('0');
  });

  it('gives each day its weekday initial', () => {
    expect(days.map((d) => weekdayInitial(d, 'en-US'))).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });

  it('reads the seven days as one sentence, oldest first', () => {
    expect(stepsSpoken(days, [8214, 6002, 0, 1, 12000, 300, 4500], 'en-US')).toBe(
      'Mon 8,214, Tue 6,002, Wed 0, Thu 1, Fri 12,000, Sat 300, Sun 4,500',
    );
  });

  it('says the average a day', () => {
    expect(stepsAverageLine(7102, 'en-US')).toBe('Average 7,102 a day over 7 days');
  });
});
