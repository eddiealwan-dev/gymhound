import { PROGRAMS } from '../seed/programs.generated';

/**
 * How long a program runs and who it suits (R555): shown on its row and its page. `daysPerWeek` is the program's own
 * (R633): Barbell Foundations rotates two days three times a week, so its days are not its rotation's length.
 */
export type ProgramInfo = { weeks: number; level: 'Beginner' | 'Intermediate' | 'Advanced'; daysPerWeek?: number };

/**
 * Each program's length and level: the twenty from the program data (§18.29), and the nine retired programs (R598)
 * as the owner set them after Round 10, for whoever still runs one. The length is a block: run it that long, then keep
 * going or change program. Routines of your own have none.
 */
export const PROGRAM_INFO: Readonly<Record<string, ProgramInfo>> = {
  'premade-fullbody-3': { weeks: 12, level: 'Beginner' },
  'premade-5x5-3': { weeks: 12, level: 'Beginner' },
  'premade-dumbbell-3': { weeks: 8, level: 'Beginner' },
  'premade-mobility-3': { weeks: 4, level: 'Beginner' },
  'premade-ppl-6': { weeks: 12, level: 'Intermediate' },
  'premade-upperlower-4': { weeks: 8, level: 'Intermediate' },
  'premade-advancedfullbody-4': { weeks: 8, level: 'Advanced' },
  'premade-brosplit-5': { weeks: 8, level: 'Intermediate' },
  'premade-calisthenics-3': { weeks: 6, level: 'Intermediate' },
  ...Object.fromEntries(PROGRAMS.map((p) => [p.id, { weeks: p.weeks, level: p.level, daysPerWeek: p.daysPerWeek }])),
};

/**
 * A routine's line under its name: "3 days a week · 12 weeks · Beginner" for a program, "3 days" for your own (which
 * has no set length).
 */
export function routineLine(routine: { id: string; isPremade: boolean; dayCount: number }): string {
  const info = routine.isPremade ? PROGRAM_INFO[routine.id] : undefined;
  if (info === undefined) return routine.dayCount === 1 ? '1 day' : `${routine.dayCount} days`;
  const days = info.daysPerWeek ?? routine.dayCount;
  return `${days} ${days === 1 ? 'day' : 'days'} a week · ${info.weeks} weeks · ${info.level}`;
}
