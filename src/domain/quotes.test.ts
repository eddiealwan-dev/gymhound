import { daysBetween, shiftDay } from './dates';
import { QUOTES, quoteFor, quoteOrder } from './quotes';

/** The first day of the pass a date falls in. */
const passStart = (date: string) => shiftDay('2026-01-01', Math.floor(daysBetween('2026-01-01', date) / QUOTES.length) * QUOTES.length);

describe("Train's daily quote (R530, R541, R564)", () => {
  it('is the same all day and changes the next day', () => {
    expect(quoteFor('2026-10-12')).toBe(quoteFor('2026-10-12'));
    expect(quoteFor('2026-10-13')).not.toBe(quoteFor('2026-10-12'));
  });

  it('goes through every quote once, in a random order, before any comes back', () => {
    for (const date of ['2026-10-12', '2027-09-30', '2023-05-05']) {
      const start = passStart(date);
      const shown = Array.from({ length: QUOTES.length }, (_, i) => quoteFor(shiftDay(start, i)).text);
      expect(new Set(shown).size).toBe(QUOTES.length);
      // Not the list's own order, nor a fixed step through it.
      const steps = new Set(shown.slice(1).map((text, i) => (QUOTES.findIndex((q) => q.text === text) - QUOTES.findIndex((q) => q.text === shown[i]) + QUOTES.length) % QUOTES.length));
      expect(steps.size).toBeGreaterThan(20);
    }
  });

  it('takes a different order each time through the list', () => {
    expect(quoteOrder(0)).not.toEqual(quoteOrder(1));
    expect(quoteOrder(1)).not.toEqual(quoteOrder(2));
    expect(quoteOrder(5)).toEqual(quoteOrder(5));
    expect([...quoteOrder(3)].sort((a, b) => a - b)).toEqual(QUOTES.map((_, i) => i));
  });

  it('never shows the same quote two days running, across the end of a pass too', () => {
    let day = '2025-06-01';
    for (let i = 0; i < QUOTES.length * 4; i++) {
      const next = shiftDay(day, 1);
      expect(quoteFor(next)).not.toBe(quoteFor(day));
      day = next;
    }
    for (let pass = -3; pass < 40; pass++) expect(quoteOrder(pass)[0]).not.toBe(quoteOrder(pass - 1)[QUOTES.length - 1]);
  });

  it('works for any date, before 2026 too', () => {
    expect(QUOTES).toContain(quoteFor('2024-02-29'));
    expect(QUOTES).toContain(quoteFor('2031-12-31'));
  });

  it('holds 200, without the seven the owner dropped after Round 11, and keeps Rocky', () => {
    expect(QUOTES).toHaveLength(200);
    const texts = QUOTES.map((q) => q.text).join('\n');
    for (const gone of ['happy life', 'Slow but steady', 'does not kill me', '100% of the shots', 'run 100 meters', 'win or lose', 'ninety percent mental']) {
      expect(texts).not.toContain(gone);
    }
    expect(QUOTES.some((q) => q.by === 'Rocky Balboa')).toBe(true);
  });

  it('names who said each one, and keeps to the house style: no repeats, straight marks, short enough for Train', () => {
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
    for (const { text, by } of QUOTES) {
      expect([text, text.length <= 150]).toEqual([text, true]);
      expect(text).not.toMatch(/[‘’“”]/);
      expect(text).toMatch(/[.?!"]$/);
      expect([text, by.trim().length > 1]).toEqual([text, true]);
      expect(by).not.toMatch(/^unknown$|^anonymous$/i);
    }
  });
});
