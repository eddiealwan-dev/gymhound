/**
 * What the exercise ⋯ menu and the Reorder sheet decide, as plain functions. Every list is in workout order
 * (by position), as `ActiveWorkoutView.exercises` is.
 */

type Linked = { id: string; supersetGroup: number | null };

/**
 * The superset item for an exercise: `add` is "Superset with next", `remove` is "Remove from superset" (the exercise
 * is already linked to the one after it), and `hidden` is for the last exercise, which has no next to link to.
 */
export function supersetAction(exercises: Linked[], id: string): 'hidden' | 'add' | 'remove' {
  const index = exercises.findIndex((e) => e.id === id);
  const next = exercises[index + 1];
  if (index < 0 || !next) return 'hidden';
  return joinsNextInSuperset(exercises, id) ? 'remove' : 'add';
}

/** Whether the exercise and the one after it share a superset. The superset bar runs through the gap between them. */
export function joinsNextInSuperset(exercises: Linked[], id: string): boolean {
  const index = exercises.findIndex((e) => e.id === id);
  const group = exercises[index]?.supersetGroup ?? null;
  return group !== null && exercises[index + 1]?.supersetGroup === group;
}

/**
 * Whether Reorder's up or down changes anything. A block is one exercise outside a superset, or the run of
 * consecutive exercises sharing a superset group, and moves as a whole (`moveExercise`).
 */
export function canMoveBlock(exercises: Linked[], id: string, dir: 'up' | 'down'): boolean {
  const blocks: string[][] = [];
  let previous: number | null = null;
  for (const e of exercises) {
    if (e.supersetGroup !== null && e.supersetGroup === previous) blocks[blocks.length - 1].push(e.id);
    else blocks.push([e.id]);
    previous = e.supersetGroup;
  }
  const index = blocks.findIndex((block) => block.includes(id));
  if (index < 0) return false;
  return dir === 'up' ? index > 0 : index < blocks.length - 1;
}

/** Whether any set of the exercise is ticked. Removing such an exercise asks first. */
export function hasDoneSets(ex: { sets: { done: boolean }[] }): boolean {
  return ex.sets.some((s) => s.done);
}

/** Whether Replace asks first. Replacing clears the exercise's sets, so it asks exactly when Remove does: when any set is ticked. */
export function replaceNeedsConfirm(ex: { sets: { done: boolean }[] }): boolean {
  return hasDoneSets(ex);
}
