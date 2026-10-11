import {
  cardLine,
  formatWorkoutDuration,
  groupByMonth,
  historySetText,
  marksLine,
  monthsBetween,
  monthTitle,
  type HistoryCard,
} from './history';

const MIN = 60_000;

function card(id: string, localDate: string, startedAt: number, extra: Partial<HistoryCard> = {}): HistoryCard {
  return { id, name: 'Push A', localDate, startedAt, durationMs: 48 * MIN, volume: 0, setCount: 0, marks: [], prCount: 0, ...extra };
}

describe('groupByMonth (R163)', () => {
  it('groups newest month first and newest card first, across a year boundary', () => {
    const cards = [
      card('a', '2025-12-30', 1),
      card('b', '2026-10-02', 3),
      card('c', '2026-10-09', 5),
      card('d', '2026-01-04', 2),
      card('e', '2026-10-09', 4),
    ];
    const months = groupByMonth(cards, 'en-US', '2026-10-11');
    expect(months.map((m) => [m.month, m.title])).toEqual([
      ['2026-10', 'October'],
      ['2026-01', 'January'],
      ['2025-12', 'December 2025'],
    ]);
    expect(months[0].cards.map((c) => c.id)).toEqual(['c', 'e', 'b']);
  });

  it('is empty with no cards', () => {
    expect(groupByMonth([], 'en-US', '2026-10-11')).toEqual([]);
  });
});

describe('monthTitle', () => {
  it('names the month alone this year and with the year otherwise', () => {
    expect(monthTitle('2026-10', 'en-US', '2026-10-11')).toBe('October');
    expect(monthTitle('2025-10', 'en-US', '2026-10-11')).toBe('October 2025');
  });
});

describe('formatWorkoutDuration', () => {
  it('reads minutes, hours and minutes, and at least a minute', () => {
    expect(formatWorkoutDuration(48 * MIN)).toBe('48 min');
    expect(formatWorkoutDuration(65 * MIN)).toBe('1 h 5 min');
    expect(formatWorkoutDuration(60 * MIN)).toBe('1 h');
    expect(formatWorkoutDuration(20_000)).toBe('1 min');
    expect(formatWorkoutDuration(0)).toBe('1 min');
  });
});

describe('cardLine', () => {
  it('reads duration, volume and the PR count', () => {
    expect(cardLine(card('a', '2026-10-09', 1, { volume: 12340, prCount: 3 }), 'lb', 'en-US')).toBe('48 min · 12,340 lb · 3 PRs');
    expect(cardLine(card('a', '2026-10-09', 1, { volume: 12340, prCount: 1 }), 'lb', 'en-US')).toBe('48 min · 12,340 lb · 1 PR');
  });

  it('leaves out the PR part at 0 and the volume part at 0', () => {
    expect(cardLine(card('a', '2026-10-09', 1, { volume: 5600 }), 'kg', 'en-US')).toBe('48 min · 5,600 kg');
    expect(cardLine(card('a', '2026-10-09', 1, { prCount: 2 }), 'lb', 'en-US')).toBe('48 min · 2 PRs');
    expect(cardLine(card('a', '2026-10-09', 1), 'lb', 'en-US')).toBe('48 min');
  });
});

describe('marksLine', () => {
  it('lists each reason once, in order', () => {
    expect(marksLine(['rough_sleep', 'pain', 'rough_sleep'])).toBe('Something off: Rough sleep · Pain');
  });

  it('is null with no marks', () => {
    expect(marksLine([])).toBeNull();
  });
});

describe('historySetText', () => {
  const base = { position: 0, setType: 'working' as const, weight: 185, weightUnit: 'lb' as const, reps: 5, durationS: null, distance: null, distanceUnit: null };

  it('reads as Previous does, in the unit logged', () => {
    expect(historySetText({ ...base, rpe: null }, 'weighted', 'lb')).toBe('185 × 5');
    expect(historySetText({ ...base, weight: 84, weightUnit: 'kg', rpe: null }, 'weighted', 'lb')).toBe('84 kg × 5');
  });

  it('adds the RPE', () => {
    expect(historySetText({ ...base, rpe: 8 }, 'weighted', 'lb')).toBe('185 × 5 @ 8');
    expect(historySetText({ ...base, rpe: 8.5 }, 'weighted', 'lb')).toBe('185 × 5 @ 8.5');
  });

  it('reads a timed set', () => {
    expect(historySetText({ ...base, weight: null, weightUnit: null, reps: null, durationS: 45, rpe: null }, 'timed', 'lb')).toBe('45s');
  });
});

describe('monthsBetween', () => {
  it('lists months inclusive across a year', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-10', '2026-10')).toEqual(['2026-10']);
  });

  it('is empty when first is after last', () => {
    expect(monthsBetween('2026-11', '2026-10')).toEqual([]);
  });
});
