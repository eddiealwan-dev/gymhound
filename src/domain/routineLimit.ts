/**
 * What free and Pro hold (§18.21, the owner's rules after Round 8). Free has four of the premade programs, logging,
 * history, Stats, plates, PRs, Something off, body measurements and water. Pro (and the App Store's free trial, R563) adds
 * the other programs, routines of your own, saved workouts and Fuel. When Pro lapses nothing is deleted: routines of
 * your own and saved workouts stay, and can be used again with Pro.
 */

/** The premade programs free can use, in the order Routines lists them first (R520). */
export const FREE_PREMADES: readonly string[] = ['premade-fullbody-3', 'premade-5x5-3', 'premade-dumbbell-3', 'premade-mobility-3'];

/** How many routines of your own free holds: none (R521). Kept for the routine limit's callers. */
export const FREE_ROUTINE_LIMIT = 0;

/** Whether a routine can be set active, run, edited or duplicated from (R520, R521, R523). */
export function canUseRoutine(routine: { id: string; isPremade: boolean }, isPro: boolean): boolean {
  return isPro || (routine.isPremade && FREE_PREMADES.includes(routine.id));
}

/** Whether a routine of your own can be made, by New routine, Duplicate or Add from code (R521). */
export function canAddRoutine(_userCount: number, isPro: boolean): boolean {
  return isPro;
}

/** Whether saved workouts can be saved or started (R522). Ones saved before stay either way. */
export function canUseSavedWorkouts(isPro: boolean): boolean {
  return isPro;
}

/** What the Pro sheet says, by what was asked for (R524). */
export type ProReason =
  | { kind: 'own_routine' }
  | { kind: 'premade'; name: string }
  | { kind: 'kept_routine'; name: string }
  | { kind: 'saved_workout' };

/** The free programs by name, for the sheet: "Beginner full body, 5×5, Dumbbell full body and Mobility". */
export const FREE_PROGRAMS_TEXT = 'Beginner full body, 5×5, Dumbbell full body and Mobility';

export function proReasonText(reason: ProReason): string {
  switch (reason.kind) {
    case 'own_routine':
      return 'Routines of your own are part of GymHound Pro.';
    case 'premade':
      return `${reason.name} is part of GymHound Pro. Free includes ${FREE_PROGRAMS_TEXT}.`;
    case 'kept_routine':
      return `${reason.name} is kept. It's ready to use again with GymHound Pro.`;
    case 'saved_workout':
      return 'Saved workouts are part of GymHound Pro.';
  }
}

/** The reason a routine can't be used now: a premade outside the free four, or one of your own. */
export function lockedRoutineReason(routine: { name: string; isPremade: boolean }): ProReason {
  return routine.isPremade ? { kind: 'premade', name: routine.name } : { kind: 'kept_routine', name: routine.name };
}
