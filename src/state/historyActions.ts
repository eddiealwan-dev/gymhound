import { deleteFinishedWorkout, NothingLeftError, saveWorkoutEdit } from '../db/repositories/workoutHistoryRepo';
import type { Db } from '../db/types';
import type { WorkoutDraft } from '../domain/historyDraft';
import { takeSnapshotSafely } from './backup';
import { bumpData } from './dataVersion';
import { afterHistoryDelete, healthRecordBeforeDelete } from './nativeServices';

/**
 * What the History screens call to change a finished workout (spec 7.12). Each runs its one transaction, then, once it
 * has committed, takes a snapshot (`takeSnapshotSafely`, which never throws, so a failed snapshot never fails the
 * action) and bumps the data version (R170). Any other failure is thrown to the screen, with nothing changed.
 */

/**
 * Saves a history edit. 'nothing_left' when no set would be left: nothing is changed, no snapshot is taken and nothing
 * is bumped; the editor then offers Delete workout.
 */
export function saveHistoryEdit(db: Db, draft: WorkoutDraft): 'saved' | 'nothing_left' {
  try {
    saveWorkoutEdit(db, draft);
  } catch (e) {
    if (e instanceof NothingLeftError) return 'nothing_left';
    throw e;
  }
  takeSnapshotSafely(db, Date.now());
  bumpData();
  return 'saved';
}

/** Deletes a finished workout, its PRs and next weights worked out again from the workouts left. */
export function deleteHistoryWorkout(db: Db, workoutId: string): void {
  const healthRecordId = healthRecordBeforeDelete(db, workoutId);
  deleteFinishedWorkout(db, workoutId);
  takeSnapshotSafely(db, Date.now());
  // Phase 7: the record GymHound wrote to Health goes too, best effort (§17.1); nothing in Expo Go.
  afterHistoryDelete(db, healthRecordId);
  bumpData();
}
