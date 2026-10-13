/** How long a program runs and who it suits (R555): shown on its row and its page. */
export type ProgramInfo = { weeks: number; level: 'Beginner' | 'Intermediate' | 'Advanced' };

/**
 * Each premade program's length and level (the owner asked for durations after Round 10). The length is a block: run
 * it that long, then keep going or change program. Routines of your own have none.
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
};

/**
 * A routine's line under its name: "3 days a week · 12 weeks · Beginner" for a program, "3 days" for your own (which
 * has no set length).
 */
export function routineLine(routine: { id: string; isPremade: boolean; dayCount: number }): string {
  const info = routine.isPremade ? PROGRAM_INFO[routine.id] : undefined;
  if (info === undefined) return routine.dayCount === 1 ? '1 day' : `${routine.dayCount} days`;
  return `${routine.dayCount} ${routine.dayCount === 1 ? 'day' : 'days'} a week · ${info.weeks} weeks · ${info.level}`;
}
