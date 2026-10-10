import {
  daysBetween,
  formatElapsed,
  formatRest,
  formatTrainDate,
  fromLocalDate,
  greetingFor,
  mondayOf,
  toLocalDate,
} from './dates';

describe('local dates', () => {
  it('assigns a late-night time to its own date', () => {
    expect(toLocalDate(new Date(2026, 9, 9, 23, 50).getTime())).toBe('2026-10-09');
  });

  it('parses a local date to local midnight', () => {
    expect(fromLocalDate('2026-10-09').getTime()).toBe(new Date(2026, 9, 9).getTime());
  });
});

describe('daysBetween', () => {
  it('counts calendar days from a to b', () => {
    expect(daysBetween('2026-10-06', '2026-10-09')).toBe(3);
  });

  it('is not shifted by DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-10')).toBe(3); // spans US DST start
    expect(daysBetween('2026-10-24', '2026-10-27')).toBe(3); // spans EU DST end
  });
});

describe('mondayOf', () => {
  it('returns the Monday of the week containing the date', () => {
    expect(mondayOf('2026-10-09')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
  });
});

describe('greetingFor', () => {
  it.each([
    [4, 59, 'GOOD EVENING'],
    [5, 0, 'GOOD MORNING'],
    [11, 59, 'GOOD MORNING'],
    [12, 0, 'GOOD AFTERNOON'],
    [16, 59, 'GOOD AFTERNOON'],
    [17, 0, 'GOOD EVENING'],
  ])('greeting at %i:%i', (h, m, g) => expect(greetingFor(new Date(2026, 9, 9, h, m))).toBe(g));
});

describe('formatTrainDate', () => {
  it('formats per locale in upper case', () => {
    expect(formatTrainDate(new Date(2026, 9, 9), 'en-GB')).toBe('FRI 9 OCT'); // 9 Oct 2026 is a Friday
    expect(formatTrainDate(new Date(2026, 9, 9), 'en-US')).toBe('FRI OCT 9');
  });
});

describe('formatElapsed', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatElapsed(754_000)).toBe('12:34');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
  });
});

describe('formatRest', () => {
  it('formats seconds as m:ss', () => {
    expect(formatRest(105)).toBe('1:45');
    expect(formatRest(5)).toBe('0:05');
  });
});
