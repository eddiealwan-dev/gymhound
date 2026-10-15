import { PROGRAM_ORDER } from '../seed/programs.generated';
import { PROGRAM_INFO, routineLine } from './programInfo';


/** The nine retired programs (R598), which keep their line for whoever still has one. */
const RETIRED = [
  'premade-fullbody-3',
  'premade-5x5-3',
  'premade-dumbbell-3',
  'premade-mobility-3',
  'premade-ppl-6',
  'premade-upperlower-4',
  'premade-advancedfullbody-4',
  'premade-brosplit-5',
  'premade-calisthenics-3',
];

describe('program lengths (R555, R633)', () => {
  it('gives every program, the twenty and the retired nine, a length of 4 to 12 weeks and a level', () => {
    for (const id of [...PROGRAM_ORDER, ...RETIRED]) {
      expect([id, PROGRAM_INFO[id]?.weeks]).toEqual([id, expect.any(Number)]);
      expect(PROGRAM_INFO[id].weeks).toBeGreaterThanOrEqual(4);
      expect(PROGRAM_INFO[id].weeks).toBeLessThanOrEqual(12);
      expect(['Beginner', 'Intermediate', 'Advanced']).toContain(PROGRAM_INFO[id].level);
    }
  });

  it('reads "3 days a week · 12 weeks · Beginner" for a program, and just the days for your own', () => {
    expect(routineLine({ id: 'premade-fullbody-3', isPremade: true, dayCount: 3 })).toBe('3 days a week · 12 weeks · Beginner');
    expect(routineLine({ id: 'mine', isPremade: false, dayCount: 1 })).toBe('1 day');
    expect(routineLine({ id: 'mine', isPremade: false, dayCount: 4 })).toBe('4 days');
  });

  it("reads the twenty's days a week, weeks and level from the program data, not the number of days in its rotation", () => {
    // Barbell Foundations alternates two days (A, B) three times a week.
    expect(routineLine({ id: 'program-barbell-foundations', isPremade: true, dayCount: 2 })).toBe('3 days a week · 12 weeks · Beginner');
    expect(routineLine({ id: 'program-advanced-upper-lower-dup', isPremade: true, dayCount: 4 })).toBe('4 days a week · 6 weeks · Advanced');
    expect(PROGRAM_INFO['program-strongman-prep']).toEqual({ weeks: 12, level: 'Intermediate', daysPerWeek: 4 });
  });
});
