import { and, asc, count, eq, sql } from 'drizzle-orm';
import { toLocalDate } from '../../domain/dates';
import { validateSavedName, type SavedWorkoutDetail } from '../../domain/savedWorkout';
import type { SavedSet } from '../../domain/types';
import { newId } from '../ids';
import { exercises, savedWorkoutExercises, savedWorkouts, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
// Not './workoutsRepo': it imports this file (finishWorkout calls rememberSavedWorkout), so that would be a cycle.
import { assertNoActiveWorkout } from './activeWorkout';

export type { SavedWorkoutDetail };

export type SavedWorkoutSummary = { id: string; name: string; exerciseCount: number; updatedAt: number };

/** The name as stored: trimmed. Throws the validation copy (`validateSavedName`) when it can't be used. */
function checkedName(name: string): string {
  const problem = validateSavedName(name);
  if (problem !== null) throw new Error(problem);
  return name.trim();
}

/**
 * A workout exercise's done sets as remembered sets, in set order (R118). An AMRAP score's extra reps (R607) are kept
 * only when there are some, so every other set is remembered as before.
 */
function doneSets(db: Db, workoutExerciseId: string): SavedSet[] {
  const rows = db
    .select({
      setType: sets.setType,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
      durationS: sets.durationS,
      distance: sets.distance,
      distanceUnit: sets.distanceUnit,
      extraReps: sets.extraReps,
    })
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), eq(sets.done, true)))
    .orderBy(asc(sets.position))
    .all();
  return rows.map(({ extraReps, ...set }) => (extraReps === null ? set : { ...set, extraReps }));
}

/** Superset groups as kept: a group with one member left is no superset, so it becomes null. */
function realGroups(groups: (number | null)[]): (number | null)[] {
  const sizes = new Map<number, number>();
  for (const g of groups) if (g !== null) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  return groups.map((g) => (g !== null && (sizes.get(g) ?? 0) > 1 ? g : null));
}

/** Every saved workout, by name without regard to letter case, with how many exercises each has. */
export function listSavedWorkouts(db: Db): SavedWorkoutSummary[] {
  return db
    .select({
      id: savedWorkouts.id,
      name: savedWorkouts.name,
      exerciseCount: count(savedWorkoutExercises.id),
      updatedAt: savedWorkouts.updatedAt,
    })
    .from(savedWorkouts)
    .leftJoin(savedWorkoutExercises, eq(savedWorkoutExercises.savedWorkoutId, savedWorkouts.id))
    .groupBy(savedWorkouts.id)
    .orderBy(sql`${savedWorkouts.name} collate nocase`, asc(savedWorkouts.name))
    .all();
}

/** A saved workout with its exercises in order, archived exercises included (they still start, R119); null if none. */
export function getSavedWorkout(db: Db, id: string): SavedWorkoutDetail | null {
  const saved = db.select().from(savedWorkouts).where(eq(savedWorkouts.id, id)).get();
  if (!saved) return null;
  const rows = db
    .select({ row: savedWorkoutExercises, exercise: exercises })
    .from(savedWorkoutExercises)
    .innerJoin(exercises, eq(exercises.id, savedWorkoutExercises.exerciseId))
    .where(eq(savedWorkoutExercises.savedWorkoutId, id))
    .orderBy(asc(savedWorkoutExercises.position))
    .all();
  return {
    id: saved.id,
    name: saved.name,
    exercises: rows.map(({ row, exercise }) => ({
      id: row.id,
      exerciseId: row.exerciseId,
      name: exercise.name,
      loggingType: exercise.loggingType,
      equipment: exercise.equipment,
      supersetGroup: row.supersetGroup,
      sets: row.sets,
    })),
  };
}

/**
 * Saves a finished workout to start again (R118): each exercise in position order with its superset group and its done
 * sets in set order. Returns the new saved workout's id. Throws, saving nothing, when the workout is not finished,
 * when no exercise has a done set ("Nothing logged to save."), or when the name is invalid (the message is
 * `validateSavedName`'s copy).
 */
export function saveWorkoutAs(db: Db, workoutId: string, name: string, now: number): string {
  return db.transaction((tx) => {
    const workout = tx.select({ status: workouts.status }).from(workouts).where(eq(workouts.id, workoutId)).get();
    if (!workout || workout.status !== 'finished') throw new Error(`No finished workout with id ${workoutId}.`);
    const trimmed = checkedName(name);

    const id = newId();
    tx.insert(savedWorkouts).values({ id, name: trimmed, createdAt: now, updatedAt: now }).run();
    const rows = tx
      .select({ id: workoutExercises.id, exerciseId: workoutExercises.exerciseId, supersetGroup: workoutExercises.supersetGroup })
      .from(workoutExercises)
      .where(eq(workoutExercises.workoutId, workoutId))
      .orderBy(asc(workoutExercises.position))
      .all()
      .map((r) => ({ ...r, sets: doneSets(tx, r.id) }))
      // Finishing already drops exercises with no done set; a history edit could leave one.
      .filter((r) => r.sets.length > 0);
    if (rows.length === 0) throw new Error('Nothing logged to save.');
    const groups = realGroups(rows.map((r) => r.supersetGroup));
    rows.forEach((r, position) => {
      tx.insert(savedWorkoutExercises)
        .values({ id: newId(), savedWorkoutId: id, exerciseId: r.exerciseId, position, supersetGroup: groups[position], sets: r.sets })
        .run();
    });
    return id;
  });
}

/** Renames a saved workout (trimmed). Throws the validation copy for an invalid name, and for an unknown id. */
export function renameSavedWorkout(db: Db, id: string, name: string, now: number): void {
  const trimmed = checkedName(name);
  db.transaction((tx) => {
    if (!tx.select({ id: savedWorkouts.id }).from(savedWorkouts).where(eq(savedWorkouts.id, id)).get()) {
      throw new Error(`No saved workout with id ${id}.`);
    }
    tx.update(savedWorkouts).set({ name: trimmed, updatedAt: now }).where(eq(savedWorkouts.id, id)).run();
  });
}

/** Deletes a saved workout and its exercises. Workouts started from it keep their history (no foreign key). */
export function deleteSavedWorkout(db: Db, id: string): void {
  db.delete(savedWorkouts).where(eq(savedWorkouts.id, id)).run();
}

/**
 * Starts a workout from a saved workout (R119): named as it is, linked by `saved_workout_id`, with no routine, no rule
 * and no planned weight. Each exercise (archived ones too) gets its remembered sets' types and count, empty, with RPE
 * off; Previous and the placeholders come from history as for any exercise. Throws `ActiveWorkoutExistsError` if a
 * workout is active, before inserting anything, and an error for an unknown saved workout.
 */
export function startSavedWorkout(db: Db, savedId: string, now: number): string {
  return db.transaction((tx) => {
    assertNoActiveWorkout(tx);
    const saved = getSavedWorkout(tx, savedId);
    if (!saved) throw new Error(`No saved workout with id ${savedId}.`);

    const workoutId = newId();
    tx.insert(workouts)
      .values({
        id: workoutId,
        name: saved.name,
        status: 'active',
        startedAt: now,
        localDate: toLocalDate(now),
        savedWorkoutId: saved.id,
      })
      .run();
    saved.exercises.forEach((e, position) => {
      const workoutExerciseId = newId();
      tx.insert(workoutExercises)
        .values({ id: workoutExerciseId, workoutId, exerciseId: e.exerciseId, position, supersetGroup: e.supersetGroup, showRpe: false })
        .run();
      // A saved exercise always has a set; an empty list still starts with one working set.
      const types = e.sets.length > 0 ? e.sets.map((s) => s.setType) : (['working'] as const);
      types.forEach((setType, setPosition) => {
        tx.insert(sets).values({ id: newId(), workoutExerciseId, position: setPosition, setType }).run();
      });
    });
    return workoutId;
  });
}

/** The saved workout a workout was started from, if it still exists. */
export function savedWorkoutOf(db: Db, workoutId: string): { id: string; name: string } | null {
  return (
    db
      .select({ id: savedWorkouts.id, name: savedWorkouts.name })
      .from(workouts)
      .innerJoin(savedWorkouts, eq(savedWorkouts.id, workouts.savedWorkoutId))
      .where(eq(workouts.id, workoutId))
      .get() ?? null
  );
}

/**
 * When a finished workout was started from a saved workout, rewrites that saved workout's logged exercises with the
 * sets done today (R120). An exercise may appear more than once (a top set block and a back-off block): the k-th saved
 * row of an exercise, in position order, takes the done sets of the k-th LOGGED block of that exercise today, in
 * position order, where a block with no done set does not count. So with the first of two blocks skipped, the one
 * logged block goes to the first saved row and the second saved row keeps its sets. Saved rows left without a logged
 * block keep their sets; extra logged blocks, and exercises added on the day, are not added. `updated_at` becomes the
 * workout's `finished_at`. A no-op when the workout has no saved workout or it was deleted.
 *
 * Called by `finishWorkout` inside its transaction, after the status update and `writePrFlags`.
 */
export function rememberSavedWorkout(db: Db, workoutId: string): void {
  const workout = db
    .select({ savedWorkoutId: workouts.savedWorkoutId, finishedAt: workouts.finishedAt })
    .from(workouts)
    .where(eq(workouts.id, workoutId))
    .get();
  if (!workout || workout.savedWorkoutId === null) return;
  const saved = savedWorkoutOf(db, workoutId);
  if (!saved) return;

  // Each exercise's logged blocks today, in position order, with their done sets.
  const logged = new Map<string, SavedSet[][]>();
  const blocks = db
    .select({ id: workoutExercises.id, exerciseId: workoutExercises.exerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  for (const block of blocks) {
    const done = doneSets(db, block.id);
    if (done.length > 0) logged.set(block.exerciseId, [...(logged.get(block.exerciseId) ?? []), done]);
  }

  const rows = db
    .select({ id: savedWorkoutExercises.id, exerciseId: savedWorkoutExercises.exerciseId })
    .from(savedWorkoutExercises)
    .where(eq(savedWorkoutExercises.savedWorkoutId, saved.id))
    .orderBy(asc(savedWorkoutExercises.position))
    .all();
  const taken = new Map<string, number>();
  for (const row of rows) {
    const k = taken.get(row.exerciseId) ?? 0;
    taken.set(row.exerciseId, k + 1);
    const today = logged.get(row.exerciseId)?.[k];
    if (today) db.update(savedWorkoutExercises).set({ sets: today }).where(eq(savedWorkoutExercises.id, row.id)).run();
  }
  if (workout.finishedAt !== null) {
    db.update(savedWorkouts).set({ updatedAt: workout.finishedAt }).where(eq(savedWorkouts.id, saved.id)).run();
  }
}

/** Whether a workout has any done set: Save as a workout has something to keep (`saveWorkoutAs` refuses otherwise). */
export function hasDoneSets(db: Db, workoutId: string): boolean {
  return (
    db
      .select({ id: sets.id })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(and(eq(workoutExercises.workoutId, workoutId), eq(sets.done, true)))
      .limit(1)
      .get() !== undefined
  );
}
