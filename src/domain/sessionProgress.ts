import type { SetType } from './types';

/** How many sets are done of how many. Every set counts, warmups included (as `FinishSummary.setCount`). */
export type Progress = { done: number; total: number };

/** The done sets of one exercise, of all its sets. */
export function exerciseProgress(ex: { sets: readonly { done: boolean }[] }): Progress {
  return { done: ex.sets.filter((set) => set.done).length, total: ex.sets.length };
}

/** The done sets of the whole workout, of all its sets. One count for the session header, the block counts and Finish. */
export function workoutProgress(exercises: readonly { sets: readonly { done: boolean }[] }[]): Progress {
  return exercises.reduce<Progress>(
    (sum, ex) => {
      const { done, total } = exerciseProgress(ex);
      return { done: sum.done + done, total: sum.total + total };
    },
    { done: 0, total: 0 },
  );
}

/** What the next set and the counts read of an exercise. `WorkoutExerciseView` fits. */
export type ProgressExercise = {
  id: string;
  name: string;
  position: number;
  supersetGroup: number | null;
  sets: readonly { id: string; position: number; setType: SetType; done: boolean }[];
};

const byPosition = <T extends { position: number }>(items: readonly T[]): T[] => [...items].sort((a, b) => a.position - b.position);

/** The exercise's first unticked set, in set order, or undefined when every set is ticked. */
const firstOpen = (ex: ProgressExercise) => byPosition(ex.sets).find((set) => !set.done);

/**
 * The next set to do (spec 18.6), or null when every set is ticked. Exercises go in workout order, as runs: one exercise
 * alone, or consecutive exercises in the same superset. The first run with an unticked set gives it. A lone exercise
 * gives its first unticked set; a superset gives it from the member with the fewest ticked sets among those with one
 * left, the earlier member winning a tie.
 */
export function nextSetId(exercises: readonly ProgressExercise[]): string | null {
  const ordered = byPosition(exercises);
  let i = 0;
  while (i < ordered.length) {
    const group = ordered[i].supersetGroup;
    let end = i + 1;
    if (group !== null) while (end < ordered.length && ordered[end].supersetGroup === group) end++;
    let pick: { done: number; setId: string } | null = null;
    for (const ex of ordered.slice(i, end)) {
      const open = firstOpen(ex);
      if (open === undefined) continue;
      const { done } = exerciseProgress(ex);
      if (pick === null || done < pick.done) pick = { done, setId: open.id };
    }
    if (pick !== null) return pick.setId;
    i = end;
  }
  return null;
}

const sets = (n: number) => (n === 1 ? 'set' : 'sets');

/** The line under the session name: "5/18 sets · 24:10", or the time alone with no sets. */
export function progressText(p: Progress, elapsed: string): string {
  return p.total === 0 ? elapsed : `${p.done}/${p.total} ${sets(p.total)} · ${elapsed}`;
}

/** A count in words for the screen reader: "1 of 4 sets done". */
export function countLabel(p: Progress): string {
  return `${p.done} of ${p.total} ${sets(p.total)} done`;
}

/** `progressText` in words for the screen reader. */
export function progressLabel(p: Progress, elapsed: string): string {
  return p.total === 0 ? `Workout time ${elapsed}` : `${countLabel(p)}. Workout time ${elapsed}`;
}
