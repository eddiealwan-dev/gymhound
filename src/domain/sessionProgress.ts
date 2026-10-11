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
