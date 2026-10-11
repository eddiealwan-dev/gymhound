/**
 * What the exercise ⋯ menu and the Reorder sheet decide, as plain functions. Every list is in workout order
 * (by position), as `ActiveWorkoutView.exercises` is.
 */

import { matchPrevious, placeholdersFor, type PrevSet } from './setEntry';
import type { SetType, WeightUnit } from './types';
import { convertWeight } from './units';

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

/** Whether the exercise opens a run of exercises sharing a superset: its block carries the "Superset" label (R100). */
export function startsSuperset(exercises: Linked[], id: string): boolean {
  const index = exercises.findIndex((e) => e.id === id);
  const group = exercises[index]?.supersetGroup ?? null;
  return group !== null && exercises[index - 1]?.supersetGroup !== group;
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

/** What `plateTarget` reads from a `WorkoutExerciseView`. Its sets are in position order. */
type PlateTargetInput = {
  sets: { setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null }[];
  /** Last time's sets of the exercise, as the set table matches them. */
  previous: PrevSet[];
  overrideWeight: number | null;
  overrideUnit: WeightUnit | null;
  plannedWeight: number | null;
  plannedUnit: WeightUnit | null;
};

/**
 * The weight the plate calculator starts from, in `unit`: the first undone working set's own value, else the override,
 * else the planned weight, else the newest done working set's weight (the last done one in position order, R35), else
 * last time's weight for that first undone working set (the placeholder its row shows, converted as the placeholder
 * is, to the nearest 0.5), else null. The others are rounded to 2 decimals, and one with no stored unit is read as `unit`.
 */
export function plateTarget(ex: PlateTargetInput, unit: WeightUnit): number | null {
  const inUnit = (weight: number, from: WeightUnit | null) => Number(convertWeight(weight, from ?? unit, unit).toFixed(2));
  const working = ex.sets.filter((s) => s.setType === 'working');
  const next = working.find((s) => !s.done);
  if (next && next.weight !== null) return inUnit(next.weight, next.weightUnit);
  if (ex.overrideWeight !== null) return inUnit(ex.overrideWeight, ex.overrideUnit);
  if (ex.plannedWeight !== null) return inUnit(ex.plannedWeight, ex.plannedUnit);
  const newest = working.filter((s) => s.done && s.weight !== null).at(-1);
  if (newest && newest.weight !== null) return inUnit(newest.weight, newest.weightUnit);
  if (!next) return null;
  const last = matchPrevious(ex.sets, ex.previous)[ex.sets.indexOf(next)];
  return placeholdersFor({ previous: last, ruleRepMax: null, unit }).weight;
}
