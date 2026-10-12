import { shiftDay } from './dates';
import { QUOTES, quoteFor } from './quotes';

describe("Train's daily line (R530)", () => {
  it('is the same all day and changes the next day', () => {
    expect(quoteFor('2026-10-12')).toBe(quoteFor('2026-10-12'));
    expect(quoteFor('2026-10-13')).not.toBe(quoteFor('2026-10-12'));
  });

  it('shows every line once before any comes back', () => {
    const seen = new Set<string>();
    for (let i = 0; i < QUOTES.length; i++) seen.add(quoteFor(shiftDay('2026-10-12', i)));
    expect(seen.size).toBe(QUOTES.length);
  });

  it('works for any date, before 2026 too', () => {
    expect(QUOTES).toContain(quoteFor('2024-02-29'));
    expect(QUOTES).toContain(quoteFor('2031-12-31'));
  });

  it('keeps to the voice: short, no repeats, straight apostrophes, no exclamation marks, nothing the brand rules out', () => {
    expect(new Set(QUOTES).size).toBe(QUOTES.length);
    for (const q of QUOTES) {
      expect([q, q.length <= 64]).toEqual([q, true]);
      expect(q).not.toMatch(/[‘’“”!]/);
      expect(q).not.toMatch(/\b(pain|punish|skull|fire|flame|beast|no excuses)\b/i);
      expect(q).toMatch(/[.]$/);
    }
  });
});
