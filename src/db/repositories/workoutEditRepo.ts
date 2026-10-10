import { and, asc, eq, inArray, max } from 'drizzle-orm';
import type { DistanceUnit, SetType, WeightUnit } from '../../domain/types';
import { newId } from '../ids';
import { sets, workoutExercises } from '../schema';
import type { Db } from '../types';

export type SetPatch = Partial<{
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
}>;

// Positions are 0-based and contiguous: appending takes max + 1 (0 when empty) and every removal renumbers.

function requireWorkoutExercise(db: Db, workoutExerciseId: string) {
  const row = db.select().from(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).get();
  if (!row) throw new Error(`No workout exercise with id ${workoutExerciseId}.`);
  return row;
}

function nextSetPosition(db: Db, workoutExerciseId: string): number {
  const row = db
    .select({ last: max(sets.position) })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .get();
  return (row?.last ?? -1) + 1;
}

function renumberExercises(db: Db, workoutId: string): void {
  const rows = db
    .select({ id: workoutExercises.id, position: workoutExercises.position })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
    .all();
  rows.forEach((row, position) => {
    if (row.position !== position) {
      db.update(workoutExercises).set({ position }).where(eq(workoutExercises.id, row.id)).run();
    }
  });
}

function renumberSets(db: Db, workoutExerciseId: string): void {
  const rows = db
    .select({ id: sets.id, position: sets.position })
    .from(sets)
    .where(eq(sets.workoutExerciseId, workoutExerciseId))
    .orderBy(asc(sets.position), asc(sets.id))
    .all();
  rows.forEach((row, position) => {
    if (row.position !== position) db.update(sets).set({ position }).where(eq(sets.id, row.id)).run();
  });
}

/** A superset of one exercise means nothing, so a group left with a single member is cleared. */
function dissolveGroupIfSingle(db: Db, workoutId: string, group: number): void {
  const members = db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.supersetGroup, group)))
    .all();
  if (members.length === 1) {
    db.update(workoutExercises).set({ supersetGroup: null }).where(eq(workoutExercises.id, members[0].id)).run();
  }
}

function setSupersetGroup(db: Db, ids: string[], group: number | null): void {
  if (ids.length === 0) return;
  db.update(workoutExercises).set({ supersetGroup: group }).where(inArray(workoutExercises.id, ids)).run();
}

/** Appends the exercise to the workout with one empty working set and no rule. Returns the new workout exercise id. */
export function addExerciseToWorkout(db: Db, workoutId: string, exerciseId: string): string {
  return db.transaction((tx) => {
    const last = tx
      .select({ last: max(workoutExercises.position) })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .get();
    const id = newId();
    tx.insert(workoutExercises)
      .values({ id, workoutId, exerciseId, position: (last?.last ?? -1) + 1, showRpe: false })
      .run();
    tx.insert(sets).values({ id: newId(), workoutExerciseId: id, position: 0, setType: 'working' }).run();
    return id;
  });
}

/**
 * Swaps in a different exercise. The position, superset group and set count stay. Every set loses its
 * values, its tick and its PR flags, and the rule snapshot, planned weight and today's override go, because
 * they belonged to the old exercise.
 */
export function replaceExercise(db: Db, workoutExerciseId: string, exerciseId: string): void {
  db.transaction((tx) => {
    requireWorkoutExercise(tx, workoutExerciseId);
    tx.update(workoutExercises)
      .set({
        exerciseId,
        ruleSetCount: null,
        ruleRepMin: null,
        ruleRepMax: null,
        ruleIncrement: null,
        ruleIncrementUnit: null,
        plannedWeight: null,
        plannedUnit: null,
        overrideWeight: null,
        overrideUnit: null,
      })
      .where(eq(workoutExercises.id, workoutExerciseId))
      .run();
    tx.update(sets)
      .set({
        weight: null,
        weightUnit: null,
        reps: null,
        rpe: null,
        durationS: null,
        distance: null,
        distanceUnit: null,
        done: false,
        prFlags: 0,
        completedAt: null,
      })
      .where(eq(sets.workoutExerciseId, workoutExerciseId))
      .run();
  });
}

/** Deletes the exercise and its sets and renumbers the rest. A superset left with one member is dissolved. */
export function removeExercise(db: Db, workoutExerciseId: string): void {
  db.transaction((tx) => {
    const row = requireWorkoutExercise(tx, workoutExerciseId);
    tx.delete(sets).where(eq(sets.workoutExerciseId, workoutExerciseId)).run();
    tx.delete(workoutExercises).where(eq(workoutExercises.id, workoutExerciseId)).run();
    renumberExercises(tx, row.workoutId);
    if (row.supersetGroup !== null) dissolveGroupIfSingle(tx, row.workoutId, row.supersetGroup);
  });
}

/** Swaps the exercise with its neighbour. Does nothing at either end. */
export function moveExercise(db: Db, workoutExerciseId: string, dir: 'up' | 'down'): void {
  db.transaction((tx) => {
    const row = requireWorkoutExercise(tx, workoutExerciseId);
    const ordered = tx
      .select({ id: workoutExercises.id, position: workoutExercises.position })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, row.workoutId))
      .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
      .all();
    const index = ordered.findIndex((e) => e.id === workoutExerciseId);
    const other = ordered[dir === 'up' ? index - 1 : index + 1];
    if (!other) return;
    tx.update(workoutExercises).set({ position: other.position }).where(eq(workoutExercises.id, row.id)).run();
    tx.update(workoutExercises).set({ position: row.position }).where(eq(workoutExercises.id, other.id)).run();
  });
}

/**
 * Links the exercise with the one after it into a superset, or breaks that link if they already share a group.
 * Linking joins an existing group when either exercise is in one (two groups merge), otherwise it starts a
 * new group numbered one above the highest in the workout. Breaking splits a group of three or more at that
 * boundary, and a side left with one exercise leaves its group. Does nothing on the last exercise.
 */
export function toggleSupersetWithNext(db: Db, workoutExerciseId: string): void {
  db.transaction((tx) => {
    const row = requireWorkoutExercise(tx, workoutExerciseId);
    const ordered = tx
      .select()
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, row.workoutId))
      .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
      .all();
    const index = ordered.findIndex((e) => e.id === workoutExerciseId);
    const next = ordered[index + 1];
    if (!next) return;

    const highest = Math.max(0, ...ordered.map((e) => e.supersetGroup ?? 0));
    const group = row.supersetGroup;

    if (group !== null && group === next.supersetGroup) {
      const before = ordered.slice(0, index + 1).filter((e) => e.supersetGroup === group);
      const after = ordered.slice(index + 1).filter((e) => e.supersetGroup === group);
      if (before.length < 2) setSupersetGroup(tx, before.map((e) => e.id), null);
      if (after.length < 2) setSupersetGroup(tx, after.map((e) => e.id), null);
      else setSupersetGroup(tx, after.map((e) => e.id), highest + 1);
      return;
    }

    const merging = [group, next.supersetGroup];
    const joined = ordered.filter(
      (e) => e.id === row.id || e.id === next.id || (e.supersetGroup !== null && merging.includes(e.supersetGroup)),
    );
    setSupersetGroup(tx, joined.map((e) => e.id), group ?? next.supersetGroup ?? highest + 1);
  });
}

/** Turns the RPE column on or off for the exercise. */
export function setShowRpe(db: Db, workoutExerciseId: string, show: boolean): void {
  db.update(workoutExercises).set({ showRpe: show }).where(eq(workoutExercises.id, workoutExerciseId)).run();
}

/** Appends an empty working set to the exercise. Returns its id. */
export function addSet(db: Db, workoutExerciseId: string): string {
  return db.transaction((tx) => {
    requireWorkoutExercise(tx, workoutExerciseId);
    const id = newId();
    tx.insert(sets)
      .values({ id, workoutExerciseId, position: nextSetPosition(tx, workoutExerciseId), setType: 'working' })
      .run();
    return id;
  });
}

/** Deletes the set and renumbers the exercise's remaining sets. */
export function removeSet(db: Db, setId: string): void {
  db.transaction((tx) => {
    const row = tx.select({ workoutExerciseId: sets.workoutExerciseId }).from(sets).where(eq(sets.id, setId)).get();
    if (!row) throw new Error(`No set with id ${setId}.`);
    tx.delete(sets).where(eq(sets.id, setId)).run();
    renumberSets(tx, row.workoutExerciseId);
  });
}

/** Writes the fields in `patch` and leaves the rest alone. A field set to null is cleared. */
export function updateSet(db: Db, setId: string, patch: SetPatch): void {
  if (Object.values(patch).every((v) => v === undefined)) return;
  db.update(sets).set(patch).where(eq(sets.id, setId)).run();
}
