import type { MeasurementSystem } from '../../domain/types';
import { runSeed } from '../../seed/seed';
import {
  bodyweight,
  exerciseNotes,
  exercisePhotos,
  exercisePrefs,
  exercises,
  foodLog,
  foods,
  measurements,
  progressPhotos,
  routineDays,
  routineExercises,
  routines,
  savedWorkoutExercises,
  savedWorkouts,
  sets,
  settings,
  waterLog,
  workoutExercises,
  workouts,
} from '../schema';
import type { Db } from '../types';
import { ensureSettings, getSettings, setSetting } from './settingsRepo';

/** Every table, each before the tables its rows point at, so no delete is held up by a row still pointing at it. */
export const ERASED_TABLES = [
  sets,
  workoutExercises,
  workouts,
  routineExercises,
  routineDays,
  routines,
  savedWorkoutExercises,
  savedWorkouts,
  exerciseNotes,
  exercisePrefs,
  exercisePhotos,
  bodyweight,
  measurements,
  foodLog,
  waterLog,
  progressPhotos,
  foods,
  exercises,
  settings,
] as const;

/**
 * Profile → Delete all data (R568): the database as a fresh install has it. Every row of every table goes, then the
 * settings' defaults for the phone's measurement system and the bundled library, programs and foods come back, as at
 * first launch. Pro is the store's, not the phone's: the cached answer and the debug unlock are kept, so Pro stays on
 * until the store says otherwise. All in one transaction: a failure deletes nothing. Files (photos, the phone's
 * backups) are `eraseFiles`'s.
 */
export function eraseAllData(db: Db, m: MeasurementSystem, now: number): void {
  db.transaction((tx) => {
    const { proCached, proDebugUnlock } = getSettings(tx);
    for (const table of ERASED_TABLES) tx.delete(table).run();
    ensureSettings(tx, m);
    setSetting(tx, 'proCached', proCached);
    setSetting(tx, 'proDebugUnlock', proDebugUnlock);
    // Nothing to backfill: there are no workouts.
    setSetting(tx, 'prFlagsBackfilled', true);
    runSeed(tx, now);
  });
}
