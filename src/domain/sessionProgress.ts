import { setLabels, setName } from './setEntry';
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

/** The exercises in workout order, as runs: one exercise alone, or consecutive exercises in the same superset. */
function runsOf(exercises: readonly ProgressExercise[]): ProgressExercise[][] {
  const ordered = byPosition(exercises);
  const runs: ProgressExercise[][] = [];
  for (const ex of ordered) {
    const last = runs[runs.length - 1];
    if (last !== undefined && ex.supersetGroup !== null && last[0].supersetGroup === ex.supersetGroup) last.push(ex);
    else runs.push([ex]);
  }
  return runs;
}

/**
 * The run's next set, or null when it has none left. A lone exercise gives its first unticked set. In a superset, a
 * member whose first unticked set is a warmup does its warmups first (the earlier such member first); otherwise the
 * turn goes to the member with the fewest ticked non-warmup sets among those with one left, the earlier member winning
 * a tie.
 */
function nextInRun(run: readonly ProgressExercise[]): string | null {
  let pick: { done: number; setId: string } | null = null;
  for (const ex of run) {
    const open = firstOpen(ex);
    if (open === undefined) continue;
    if (open.setType === 'warmup') return open.id;
    const done = ex.sets.filter((set) => set.done && set.setType !== 'warmup').length;
    if (pick === null || done < pick.done) pick = { done, setId: open.id };
  }
  return pick === null ? null : pick.setId;
}

/** The next set to do (spec 18.6), or null when every set is ticked: the next set of the first run with one left. */
export function nextSetId(exercises: readonly ProgressExercise[]): string | null {
  for (const run of runsOf(exercises)) {
    const next = nextInRun(run);
    if (next !== null) return next;
  }
  return null;
}

/**
 * What the rest row says once the rest is up (spec 18.6, Round 4). While the exercise holding `afterSetId` (or, in a
 * superset, its run) has a set left, it names that set: "Rest's up · Set 2 next" in the same exercise, or the member
 * whose turn it is, "Rest's up · Barbell row next". Only once that exercise or run is done does it name where the
 * workout goes next (`nextSetId`), and with nothing left it is "Rest's up".
 */
export function restUpText(exercises: readonly ProgressExercise[], afterSetId: string): string {
  const run = runsOf(exercises).find((r) => r.some((ex) => ex.sets.some((set) => set.id === afterSetId)));
  const next = (run === undefined ? null : nextInRun(run)) ?? nextSetId(exercises);
  if (next === null) return "Rest's up";
  const holder = exercises.find((ex) => ex.sets.some((set) => set.id === next))!;
  if (!holder.sets.some((set) => set.id === afterSetId)) return `Rest's up · ${holder.name} next`;
  const ordered = byPosition(holder.sets);
  const label = setLabels(ordered.map((set) => set.setType))[ordered.findIndex((set) => set.id === next)];
  return `Rest's up · ${setName(label)} next`;
}

const sets = (n: number) => (n === 1 ? 'set' : 'sets');

/**
 * The line under the session name in two parts, so the count can give way before the time: "5/18 sets" and " · 24:10",
 * or no count and the time alone with no sets.
 */
export function progressParts(p: Progress, elapsed: string): { count: string; time: string } {
  return p.total === 0 ? { count: '', time: elapsed } : { count: `${p.done}/${p.total} ${sets(p.total)}`, time: ` · ${elapsed}` };
}

/** A count in words for the screen reader: "1 of 4 sets done". */
export function countLabel(p: Progress): string {
  return `${p.done} of ${p.total} ${sets(p.total)} done`;
}

/** `progressParts` in words for the screen reader. */
export function progressLabel(p: Progress, elapsed: string): string {
  return p.total === 0 ? `Workout time ${elapsed}` : `${countLabel(p)}. Workout time ${elapsed}`;
}
