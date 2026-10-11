import { asc, eq, sql } from 'drizzle-orm';
import type { Equipment, LoggingType, Muscle, Pattern } from '../../domain/types';
import { EXERCISE_PHOTOS } from '../../seed/exercisePhotos.generated';
import { exerciseNotes, exercises } from '../schema';
import type { Db } from '../types';

export type ExerciseRow = {
  id: string;
  name: string;
  aliases: string[];
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  pattern: Pattern;
  loggingType: LoggingType;
  isCustom: boolean;
  /** Whether its start and end photos are bundled (`EXERCISE_PHOTOS`): the picker's thumbnail and the form demo. */
  hasPhotos: boolean;
};

/** The row with whether its photos are bundled. Custom exercises and a few library ones have none (§18.8). */
const withPhotos = <T extends { id: string }>(row: T): T & { hasPhotos: boolean } => ({
  ...row,
  hasPhotos: Object.prototype.hasOwnProperty.call(EXERCISE_PHOTOS, row.id),
});

/** Every exercise that is not archived, sorted by name without regard to letter case. */
export function listExercises(db: Db): ExerciseRow[] {
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      aliases: exercises.aliases,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      equipment: exercises.equipment,
      pattern: exercises.pattern,
      loggingType: exercises.loggingType,
      isCustom: exercises.isCustom,
    })
    .from(exercises)
    .where(eq(exercises.archived, false))
    .orderBy(sql`${exercises.name} collate nocase`, asc(exercises.id))
    .all()
    .map(withPhotos);
}

export type ExerciseDetail = ExerciseRow & {
  /** The form demo's steps (§18.8); empty when the exercise has none. */
  instructions: string[];
  /** The free-exercise-db entry the steps and photos come from; null for custom exercises and those without one. */
  sourceId: string | null;
};

/** One exercise, archived ones included (history still names them), with its steps and source; null if it does not exist. */
export function getExercise(db: Db, id: string): ExerciseDetail | null {
  const row = db
    .select({
      id: exercises.id,
      name: exercises.name,
      aliases: exercises.aliases,
      primaryMuscles: exercises.primaryMuscles,
      secondaryMuscles: exercises.secondaryMuscles,
      equipment: exercises.equipment,
      pattern: exercises.pattern,
      loggingType: exercises.loggingType,
      isCustom: exercises.isCustom,
      instructions: exercises.instructions,
      sourceId: exercises.sourceId,
    })
    .from(exercises)
    .where(eq(exercises.id, id))
    .get();
  return row ? withPhotos(row) : null;
}

/** The exercise's sticky note, or null if it has none. */
export function getExerciseNote(db: Db, exerciseId: string): string | null {
  return (
    db.select({ text: exerciseNotes.text }).from(exerciseNotes).where(eq(exerciseNotes.exerciseId, exerciseId)).get()
      ?.text ?? null
  );
}

/** Saves the exercise's sticky note, or deletes it when `text` is empty once trimmed. */
export function setExerciseNote(db: Db, exerciseId: string, text: string, now: number): void {
  if (text.trim() === '') {
    db.delete(exerciseNotes).where(eq(exerciseNotes.exerciseId, exerciseId)).run();
    return;
  }
  db.insert(exerciseNotes)
    .values({ exerciseId, text, updatedAt: now })
    .onConflictDoUpdate({ target: exerciseNotes.exerciseId, set: { text, updatedAt: now } })
    .run();
}
