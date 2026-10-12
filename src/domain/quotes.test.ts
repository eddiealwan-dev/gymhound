import { shiftDay } from './dates';
import { QUOTES, quoteFor } from './quotes';

describe("Train's daily quote (R530, R541)", () => {
  it('is the same all day and changes the next day', () => {
    expect(quoteFor('2026-10-12')).toBe(quoteFor('2026-10-12'));
    expect(quoteFor('2026-10-13')).not.toBe(quoteFor('2026-10-12'));
  });

  it('shows every quote once before any comes back', () => {
    const seen = new Set<string>();
    for (let i = 0; i < QUOTES.length; i++) seen.add(quoteFor(shiftDay('2026-10-12', i)).text);
    expect(seen.size).toBe(QUOTES.length);
  });

  it('works for any date, before 2026 too', () => {
    expect(QUOTES).toContain(quoteFor('2024-02-29'));
    expect(QUOTES).toContain(quoteFor('2031-12-31'));
  });

  it('names who said each one, and keeps to the house style: no repeats, straight marks, short enough for Train', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(QUOTES.map((q) => q.text)).size).toBe(QUOTES.length);
    for (const { text, by } of QUOTES) {
      expect([text, text.length <= 130]).toEqual([text, true]);
      expect(text).not.toMatch(/[‘’“”]/);
      expect(text).toMatch(/[.?!"]$/);
      expect([text, by.trim().length > 1]).toEqual([text, true]);
      expect(by).not.toMatch(/^unknown$|^anonymous$/i);
    }
  });
});
