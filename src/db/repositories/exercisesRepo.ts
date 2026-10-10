import { asc, eq, sql } from 'drizzle-orm';
import type { Equipment, LoggingType, Muscle, Pattern } from '../../domain/types';
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
};

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
    .all();
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
