import { and, eq, ne } from 'drizzle-orm';
import { customPattern, normalizeCustomExercise, validateCustomExercise, type CustomExerciseInput } from '../../domain/customExercise';
import { newId } from '../ids';
import {
  exerciseNotes,
  exercisePhotos,
  exercisePrefs,
  exercises,
  routineExercises,
  savedWorkoutExercises,
  workoutExercises,
} from '../schema';
import type { Db } from '../types';

/** The names of the exercises you can see (not archived), leaving out `exceptId`: what a new name must not repeat. */
function visibleNames(db: Db, exceptId: string | null): string[] {
  const visible = eq(exercises.archived, false);
  return db
    .select({ name: exercises.name })
    .from(exercises)
    .where(exceptId === null ? visible : and(visible, ne(exercises.id, exceptId)))
    .all()
    .map((r) => r.name);
}

/** The input as saved, or a throw with the first thing that stops it (the editor shows them all before it gets here). */
function checked(db: Db, input: CustomExerciseInput, exceptId: string | null): CustomExerciseInput {
  const clean = normalizeCustomExercise(input);
  const problems = validateCustomExercise(clean, visibleNames(db, exceptId));
  if (problems.length > 0) throw new Error(problems[0]);
  return clean;
}

/** One of your own exercises, or a throw: a library exercise is never changed or deleted here. */
function ownExercise(db: Db, id: string) {
  const row = db.select({ isCustom: exercises.isCustom, loggingType: exercises.loggingType }).from(exercises).where(eq(exercises.id, id)).get();
  if (!row) throw new Error(`No exercise ${id}.`);
  if (!row.isCustom) throw new Error('Only your own exercises can be changed.');
  return row;
}

/** Saves a new exercise of your own (R108): `is_custom`, no aliases, steps or source, a uuid id. Returns its id. */
export function createCustomExercise(db: Db, input: CustomExerciseInput, now: number): string {
  const clean = checked(db, input, null);
  const id = newId();
  db.insert(exercises)
    .values({
      id,
      ...clean,
      aliases: [],
      pattern: customPattern(clean),
      isCustom: true,
      archived: false,
      createdAt: now,
      instructions: [],
      sourceId: null,
    })
    .run();
  return id;
}

/** Whether the exercise is archived (R109): already out of the picker, so there is nothing left to delete. */
export function isExerciseArchived(db: Db, id: string): boolean {
  return db.select({ archived: exercises.archived }).from(exercises).where(eq(exercises.id, id)).get()?.archived === true;
}

/**
 * Whether anything refers to the exercise: a workout of any status (history or the one in progress), a routine or a
 * saved workout. A used exercise keeps its logging type (R108) and is archived rather than deleted (R109).
 */
export function isExerciseUsed(db: Db, id: string): boolean {
  const refs = [
    db.select({ id: workoutExercises.id }).from(workoutExercises).where(eq(workoutExercises.exerciseId, id)).limit(1).get(),
    db.select({ id: routineExercises.id }).from(routineExercises).where(eq(routineExercises.exerciseId, id)).limit(1).get(),
    db.select({ id: savedWorkoutExercises.id }).from(savedWorkoutExercises).where(eq(savedWorkoutExercises.exerciseId, id)).limit(1).get(),
  ];
  return refs.some((r) => r !== undefined);
}

/**
 * Changes one of your own exercises. Throws for a library exercise, for an input that does not validate, and for a
 * logging-type change once the exercise is used (R108: logged sets would no longer read).
 */
export function updateCustomExercise(db: Db, id: string, input: CustomExerciseInput): void {
  db.transaction((tx) => {
    const current = ownExercise(tx, id);
    const clean = checked(tx, input, id);
    if (clean.loggingType !== current.loggingType && isExerciseUsed(tx, id)) {
      throw new Error("A used exercise's logging type can't change.");
    }
    tx.update(exercises)
      .set({
        name: clean.name,
        primaryMuscles: clean.primaryMuscles,
        secondaryMuscles: clean.secondaryMuscles,
        equipment: clean.equipment,
        loggingType: clean.loggingType,
        pattern: customPattern(clean),
      })
      .where(eq(exercises.id, id))
      .run();
  });
}

/**
 * Deletes one of your own exercises (R109). Used anywhere (`isExerciseUsed`), it is archived: hidden from the picker
 * and kept everywhere else. Not used, it goes with its note, rest pref and own photos row, and then `removePhotoFiles`
 * gets the names of its own photo files to remove from disk, after the rows are gone.
 *
 * `removePhotoFiles` is the hook for the photo files (R111): the repository never touches the file system, so the
 * caller passes the function that deletes them (`deleteExercisePhotoFile` from `src/platform/exercisePhotoFiles` for each name).
 */
export function deleteCustomExercise(
  db: Db,
  id: string,
  removePhotoFiles: (fileNames: readonly string[]) => void = () => {},
): 'deleted' | 'archived' {
  const outcome = db.transaction((tx) => {
    ownExercise(tx, id);
    if (isExerciseUsed(tx, id)) {
      tx.update(exercises).set({ archived: true }).where(eq(exercises.id, id)).run();
      return { result: 'archived' as const, files: [] };
    }
    const photos = tx.select().from(exercisePhotos).where(eq(exercisePhotos.exerciseId, id)).get();
    const files = [photos?.startFile, photos?.endFile].filter((f): f is string => typeof f === 'string' && f !== '');
    tx.delete(exerciseNotes).where(eq(exerciseNotes.exerciseId, id)).run();
    tx.delete(exercisePrefs).where(eq(exercisePrefs.exerciseId, id)).run();
    tx.delete(exercisePhotos).where(eq(exercisePhotos.exerciseId, id)).run();
    tx.delete(exercises).where(eq(exercises.id, id)).run();
    return { result: 'deleted' as const, files };
  });
  if (outcome.files.length > 0) removePhotoFiles(outcome.files);
  return outcome.result;
}
