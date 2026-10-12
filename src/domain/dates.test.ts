import {
  calendarDayInSentence,
  calendarDayTitle,
  daysBetween,
  formatDateTime,
  formatElapsed,
  formatEntryDate,
  formatRest,
  formatTrainDate,
  fromLocalDate,
  greetingFor,
  mondayOf,
  shiftDay,
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

  it('adds the year when asked, as the personal best card shows it', () => {
    expect(formatTrainDate(new Date(2026, 9, 11), 'en-GB', { year: true })).toBe('SUN 11 OCT 2026');
    expect(formatTrainDate(new Date(2026, 9, 11), 'en-US', { year: true })).toBe('SUN OCT 11 2026');
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

describe('formatDateTime', () => {
  const spaced = (text: string) => text.replace(/\s/g, ' '); // newer ICU puts a narrow no-break space before AM/PM

  it('shows the local date and time, laid out for the locale', () => {
    const at = new Date(2026, 9, 9, 9, 5).getTime();
    expect(spaced(formatDateTime(at, 'en-US'))).toBe('Oct 9, 2026, 9:05 AM');
    expect(spaced(formatDateTime(at, 'en-GB'))).toMatch(/^9 Oct 2026, 0?9:05$/); // 24-hour; ICU versions differ on the leading zero
  });

  it('puts a late-night time on its own local day', () => {
    const at = new Date(2026, 9, 9, 23, 50).getTime();
    expect(spaced(formatDateTime(at, 'en-US'))).toBe('Oct 9, 2026, 11:50 PM');
  });
});

describe('shiftDay', () => {
  it('steps across months, years and a DST change', () => {
    expect(shiftDay('2026-10-11', -1)).toBe('2026-10-10');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
    expect(shiftDay('2026-03-07', 2)).toBe('2026-03-09');
    expect(shiftDay('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftDay('2026-10-11', -300)).toBe('2025-12-15');
  });
});

describe('calendarDayTitle', () => {
  it('says Today and Yesterday, else the weekday and date, with the year only for another year', () => {
    expect(calendarDayTitle('2026-10-11', '2026-10-11', 'en-US')).toBe('Today');
    expect(calendarDayTitle('2026-10-10', '2026-10-11', 'en-US')).toBe('Yesterday');
    expect(calendarDayTitle('2026-10-09', '2026-10-11', 'en-US')).toBe('Fri, Oct 9');
    expect(calendarDayTitle('2025-12-31', '2026-01-01', 'en-US')).toBe('Yesterday');
    expect(calendarDayTitle('2025-12-15', '2026-10-11', 'en-US')).toBe('Mon, Dec 15, 2025');
    expect(calendarDayTitle('2026-10-09', '2026-10-11', 'en-GB')).toBe('Fri 9 Oct');
  });
});

describe('formatEntryDate', () => {
  it('lays out the day for the locale, with the year only for another year', () => {
    expect(formatEntryDate('2026-08-03', '2026-10-11', 'en-GB')).toBe('3 Aug');
    expect(formatEntryDate('2026-08-03', '2026-10-11', 'en-US')).toBe('Aug 3');
    expect(formatEntryDate('2025-08-03', '2026-10-11', 'en-GB')).toBe('3 Aug 2025');
  });
});

describe('calendarDayInSentence', () => {
  it('lowers Today and Yesterday mid-sentence and leaves a date as it is', () => {
    expect(calendarDayInSentence('2026-10-11', '2026-10-11', 'en-US')).toBe('today');
    expect(calendarDayInSentence('2026-10-10', '2026-10-11', 'en-US')).toBe('yesterday');
    expect(calendarDayInSentence('2026-10-03', '2026-10-11', 'en-US')).toBe('Sat, Oct 3');
  });
});
