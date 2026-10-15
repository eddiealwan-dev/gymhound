import { PROGRAM_ORDER } from '../seed/programs.generated';

/**
 * What free and Pro hold (§18.21, the owner's rules after Round 8; §18.29). Free has five of the twenty programs, logging,
 * history, Stats, plates, PRs, Something off, body measurements and water. Pro (and the App Store's free trial, R563) adds
 * the other programs, routines of your own, saved workouts and Fuel. When Pro lapses nothing is deleted: routines of
 * your own and saved workouts stay, and can be used again with Pro.
 */

/** The programs free can use, in the order Routines lists them first (R597): the owner's list, not the JSON's `access`. */
export const FREE_PREMADES: readonly string[] = [
  'program-barbell-foundations',
  'program-dumbbell-full-body',
  'program-minimalist-two-day',
  'program-crossfit-foundations',
  'program-mobility-for-lifters',
];

/**
 * The retired programs free held before §18.29 (R599): they stay usable on free for whoever still has them. A retired
 * Pro program is locked without Pro, as any Pro program is (R526).
 */
export const LEGACY_FREE_PREMADES: readonly string[] = ['premade-fullbody-3', 'premade-5x5-3', 'premade-dumbbell-3', 'premade-mobility-3'];

/** How many routines of your own free holds: none (R521). Kept for the routine limit's callers. */
export const FREE_ROUTINE_LIMIT = 0;

/** Whether a routine can be set active, run, edited or duplicated from (R520, R521, R523, R599). */
export function canUseRoutine(routine: { id: string; isPremade: boolean }, isPro: boolean): boolean {
  return isPro || (routine.isPremade && (FREE_PREMADES.includes(routine.id) || LEGACY_FREE_PREMADES.includes(routine.id)));
}

/**
 * Whether a routine's days and exercises show (R634): one of the twenty programs shows them only while it is your
 * active program and you can use it; any other routine (your own, or a retired program) always does. The one predicate
 * for every screen that would show them, Duplicate and Modify included (R635).
 */
export function canSeeProgramExercises(routine: { id: string; isPremade: boolean; isActive: boolean }, isPro: boolean): boolean {
  if (!routine.isPremade || !PROGRAM_ORDER.includes(routine.id)) return true;
  return routine.isActive && canUseRoutine(routine, isPro);
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

/** The free programs by name, for the sheet (R638). */
export const FREE_PROGRAMS_TEXT = 'Barbell Foundations, Dumbbell Full Body, Minimalist Two-Day, CrossFit Foundations and Mobility for Lifters';

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

/** The reason a routine can't be used now: a program outside the free five, or one of your own. */
export function lockedRoutineReason(routine: { name: string; isPremade: boolean }): ProReason {
  return routine.isPremade ? { kind: 'premade', name: routine.name } : { kind: 'kept_routine', name: routine.name };
}
