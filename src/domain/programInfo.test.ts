import { PREMADE_ORDER } from '../seed/routines';
import { PROGRAM_INFO, routineLine } from './programInfo';

describe('program lengths (R555)', () => {
  it('gives every program a length of 4 to 12 weeks and a level', () => {
    for (const id of PREMADE_ORDER) {
      expect([id, PROGRAM_INFO[id]?.weeks]).toEqual([id, expect.any(Number)]);
      expect([4, 6, 8, 12]).toContain(PROGRAM_INFO[id].weeks);
    }
  });

  it('reads "3 days a week · 12 weeks · Beginner" for a program, and just the days for your own', () => {
    expect(routineLine({ id: 'premade-fullbody-3', isPremade: true, dayCount: 3 })).toBe('3 days a week · 12 weeks · Beginner');
    expect(routineLine({ id: 'mine', isPremade: false, dayCount: 1 })).toBe('1 day');
    expect(routineLine({ id: 'mine', isPremade: false, dayCount: 4 })).toBe('4 days');
  });
});
