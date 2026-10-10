import { setExerciseNote } from '../db/repositories/exercisesRepo';
import { getSettings } from '../db/repositories/settingsRepo';
import { addSet, removeSet, updateSet, type SetPatch } from '../db/repositories/workoutEditRepo';
import type { SetView, WorkoutExerciseView } from '../db/repositories/workoutViewsRepo';
import { startEmptyWorkout, startWorkoutFromDay, tickSet, untickSet } from '../db/repositories/workoutsRepo';
import type { Db } from '../db/types';
import { resolveTick, type TickValues } from '../domain/setEntry';
import { buildRows } from '../domain/setTable';
import { bumpData } from './dataVersion';

/**
 * What a screen calls to change the session. Each one writes, then bumps the data version so screens read again.
 * The time comes from the clock here, at the edge of the app. Both starts throw `ActiveWorkoutExistsError` while a workout is active.
 */

/** Starts a workout from a routine day. */
export function startFromDay(db: Db, routineDayId: string): void {
  startWorkoutFromDay(db, routineDayId, Date.now());
  bumpData();
}

/** Starts an empty workout. */
export function startEmpty(db: Db): void {
  startEmptyWorkout(db, Date.now());
  bumpData();
}

/** Saves one field (or the type) of a set. The caller builds the patch, so a weight carries the unit it was entered in. */
export function commitSetField(db: Db, setId: string, patch: SetPatch): void {
  updateSet(db, setId, patch);
  bumpData();
}

/**
 * Ticks a set. `entered` is what the user typed or had stored (null for a field left empty); today's target and the
 * placeholders fill the gaps (spec 8.4). Returns false, changing nothing, when a field the logging type needs still
 * has no value. The weight is recorded in the unit in Settings, which is the unit the target and placeholders are in.
 */
export function tick(db: Db, ex: WorkoutExerciseView, set: SetView, entered: TickValues): boolean {
  const { unit, distanceUnit } = getSettings(db);
  const row = buildRows(ex, unit).find((r) => r.set.id === set.id);
  if (!row) return false;
  const values = resolveTick({ loggingType: ex.loggingType, entered, target: row.target, placeholders: row.placeholders });
  if (values === null) return false;
  tickSet(db, set.id, values, unit, Date.now(), distanceUnit);
  bumpData();
  return true;
}

/** Un-ticks a set. Its values stay. */
export function untick(db: Db, setId: string): void {
  untickSet(db, setId);
  bumpData();
}

/** Appends an empty working set to the exercise in this workout. */
export function addSetTo(db: Db, workoutExerciseId: string): void {
  addSet(db, workoutExerciseId);
  bumpData();
}

/** Deletes the set. */
export function removeSetFrom(db: Db, setId: string): void {
  removeSet(db, setId);
  bumpData();
}

/** Saves the exercise's note. It lives on the exercise (not the workout), so it follows the exercise everywhere. Blank clears it. */
export function saveNote(db: Db, exerciseId: string, text: string): void {
  setExerciseNote(db, exerciseId, text, Date.now());
  bumpData();
}
