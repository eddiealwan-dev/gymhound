import { finishCheck, finishConfirm, listNames } from './finishCheck';

const done = { done: true };
const open = { done: false };
const sets = (n: number, set: { done: boolean }) => Array.from({ length: n }, () => set);

/** Upper A with the bench done and every other exercise left open. */
const UPPER_A = [
  { name: 'Barbell bench press', sets: sets(4, done) },
  { name: 'Barbell row', sets: sets(4, open) },
  { name: 'Overhead press', sets: sets(3, open) },
  { name: 'Lat pulldown', sets: sets(3, open) },
  { name: 'Dumbbell curl', sets: sets(2, open) },
  { name: 'Triceps pushdown', sets: sets(2, open) },
];

describe('finishCheck: what Finish would drop', () => {
  it('counts every set and names, in order, the exercises with nothing done', () => {
    expect(finishCheck(UPPER_A)).toEqual({
      done: 4,
      total: 18,
      untouched: ['Barbell row', 'Overhead press', 'Lat pulldown', 'Dumbbell curl', 'Triceps pushdown'],
    });
  });

  it('does not call an exercise with one done set untouched', () => {
    expect(finishCheck([{ name: 'A', sets: [done, open, open] }])).toEqual({ done: 1, total: 3, untouched: [] });
  });

  it('never calls an exercise with no sets untouched', () => {
    expect(finishCheck([{ name: 'A', sets: [done] }, { name: 'B', sets: [] }])).toEqual({ done: 1, total: 1, untouched: [] });
  });
});

describe('listNames: names joined for a sentence', () => {
  it('says one name as it is', () => {
    expect(listNames(['Barbell row'])).toBe('Barbell row');
  });

  it('joins two with "and"', () => {
    expect(listNames(['A', 'B'])).toBe('A and B');
  });

  it('joins three with a comma and "and"', () => {
    expect(listNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('names two of four or more and counts the rest', () => {
    expect(listNames(['A', 'B', 'C', 'D'])).toBe('A, B and 2 more');
    expect(listNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more');
  });
});

describe('finishConfirm: the question before Finish drops sets', () => {
  it('names the untouched exercises and the next day, with Keep logging as the safe default', () => {
    expect(finishConfirm('Upper A', finishCheck(UPPER_A), 'Lower A')).toEqual({
      title: 'Finish Upper A?',
      body: "4 of 18 sets done. Barbell row, Overhead press and 3 more have nothing logged. Unticked sets won't count, and Up next moves to Lower A.",
      safeDefault: true,
    });
  });

  it('says "has" for one untouched exercise', () => {
    const check = { done: 4, total: 8, untouched: ['Barbell row'] };
    expect(finishConfirm('Upper A', check, 'Lower A').body).toContain('Barbell row has nothing logged.');
  });

  it('with every exercise ticked, says only the count and what finishing does, with Finish anyway as the default', () => {
    expect(finishConfirm('Upper A', { done: 16, total: 18, untouched: [] }, 'Lower A')).toEqual({
      title: 'Finish Upper A?',
      body: "16 of 18 sets done. Unticked sets won't count, and Up next moves to Lower A.",
      safeDefault: false,
    });
  });

  it('says nothing of Up next when there is no next day', () => {
    const { body } = finishConfirm('Workout', { done: 16, total: 18, untouched: [] }, null);
    expect(body.endsWith("Unticked sets won't count.")).toBe(true);
    expect(body).not.toContain('Up next');
  });
});
