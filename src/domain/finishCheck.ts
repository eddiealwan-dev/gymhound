import { workoutProgress, type Progress } from './sessionProgress';

/** What Finish would drop: the set count, and the names, in order, of the exercises with sets and none of them done. */
export type FinishCheck = Progress & { untouched: string[] };

/** Counts the workout's sets and names its untouched exercises. An exercise with no sets is never untouched. */
export function finishCheck(exercises: readonly { name: string; sets: readonly { done: boolean }[] }[]): FinishCheck {
  return {
    ...workoutProgress(exercises),
    untouched: exercises.filter((ex) => ex.sets.length > 0 && !ex.sets.some((set) => set.done)).map((ex) => ex.name),
  };
}

/** Names joined for a sentence: "A", "A and B", "A, B and C", and from four on "A, B and 2 more". */
export function listNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/** The question Finish asks before it drops unticked sets. `safeDefault` makes Keep logging the primary answer. */
export type FinishConfirm = { title: string; body: string; safeDefault: boolean };

/**
 * "Finish Upper A?", then how many sets are done, the exercises with nothing logged, and that unticked sets won't count
 * and where Up next moves (nothing about Up next when `nextDayTitle` is null). Keep logging is the safe default when a
 * whole exercise has nothing logged.
 */
export function finishConfirm(workoutName: string, check: FinishCheck, nextDayTitle: string | null): FinishConfirm {
  const { done, total, untouched } = check;
  const nothingLogged =
    untouched.length > 0 ? ` ${listNames(untouched)} ${untouched.length === 1 ? 'has' : 'have'} nothing logged.` : '';
  const after =
    nextDayTitle === null ? " Unticked sets won't count." : ` Unticked sets won't count, and Up next moves to ${nextDayTitle}.`;
  return {
    title: `Finish ${workoutName}?`,
    body: `${done} of ${total} sets done.${nothingLogged}${after}`,
    safeDefault: untouched.length > 0,
  };
}
