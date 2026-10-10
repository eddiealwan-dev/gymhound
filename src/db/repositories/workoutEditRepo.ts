import { and, asc, eq, gte, inArray, max, ne, sql } from 'drizzle-orm';
import type { DistanceUnit, SetType, WeightUnit } from '../../domain/types';
import { newId } from '../ids';
import { sets, workoutExercises, workouts } from '../schema';
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
 * values, its tick and its PR flags. The rule snapshot, planned weight, today's override and the link to the
 * routine exercise go, because they belonged to the old exercise: with no link the row has no rule, and a
 * finished replacement can never feed the old routine slot's progression. A rest started by one of its sets
 * loses its set (`rest_set_id`), so the countdown does not move under the new exercise's empty set; its end stays,
 * and the rest runs on in the rest bar.
 */
export function replaceExercise(db: Db, workoutExerciseId: string, exerciseId: string): void {
  db.transaction((tx) => {
    const row = requireWorkoutExercise(tx, workoutExerciseId);
    tx.update(workouts)
      .set({ restSetId: null })
      .where(
        and(
          eq(workouts.id, row.workoutId),
          inArray(workouts.restSetId, tx.select({ id: sets.id }).from(sets).where(eq(sets.workoutExerciseId, workoutExerciseId))),
        ),
      )
      .run();
    tx.update(workoutExercises)
      .set({
        exerciseId,
        routineExerciseId: null,
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

/**
 * Moves the exercise's block one place up or down. A block is a single exercise outside any superset, or the
 * run of consecutive exercises that share a superset group, so a superset always moves as a whole and stays
 * contiguous. The block swaps places with the adjacent block, and members keep their order inside their own
 * group. Does nothing when the block is already first or last. Positions are renumbered 0..n-1.
 */
export function moveExercise(db: Db, workoutExerciseId: string, dir: 'up' | 'down'): void {
  db.transaction((tx) => {
    const row = requireWorkoutExercise(tx, workoutExerciseId);
    const ordered = tx
      .select({
        id: workoutExercises.id,
        position: workoutExercises.position,
        supersetGroup: workoutExercises.supersetGroup,
      })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, row.workoutId))
      .orderBy(asc(workoutExercises.position), asc(workoutExercises.id))
      .all();

    const blocks: { id: string; position: number }[][] = [];
    let previousGroup: number | null = null;
    for (const e of ordered) {
      if (e.supersetGroup !== null && e.supersetGroup === previousGroup) blocks[blocks.length - 1].push(e);
      else blocks.push([e]);
      previousGroup = e.supersetGroup;
    }

    const index = blocks.findIndex((block) => block.some((e) => e.id === workoutExerciseId));
    const other = dir === 'up' ? index - 1 : index + 1;
    if (other < 0 || other >= blocks.length) return;
    [blocks[index], blocks[other]] = [blocks[other], blocks[index]];

    blocks.flat().forEach((e, position) => {
      if (e.position !== position) {
        tx.update(workoutExercises).set({ position }).where(eq(workoutExercises.id, e.id)).run();
      }
    });
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

/**
 * Inserts an empty warmup right after the exercise's last leading warmup: at position 0 when it starts with a
 * working set (or has no sets), at the end when every set is a warmup. Later sets shift down one place, so
 * positions stay 0..n-1. Returns the new set's id.
 */
export function addWarmupSet(db: Db, workoutExerciseId: string): string {
  return db.transaction((tx) => {
    requireWorkoutExercise(tx, workoutExerciseId);
    const firstAfterWarmups = tx
      .select({ position: sets.position })
      .from(sets)
      .where(and(eq(sets.workoutExerciseId, workoutExerciseId), ne(sets.setType, 'warmup')))
      .orderBy(asc(sets.position))
      .limit(1)
      .get();
    const position = firstAfterWarmups?.position ?? nextSetPosition(tx, workoutExerciseId);
    tx.update(sets)
      .set({ position: sql`${sets.position} + 1` })
      .where(and(eq(sets.workoutExerciseId, workoutExerciseId), gte(sets.position, position)))
      .run();
    const id = newId();
    tx.insert(sets).values({ id, workoutExerciseId, position, setType: 'warmup' }).run();
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
