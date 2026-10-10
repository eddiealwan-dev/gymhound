import { setExerciseNote } from '../db/repositories/exercisesRepo';
import { getSettings } from '../db/repositories/settingsRepo';
import {
  addExerciseToWorkout,
  addSet,
  addWarmupSet,
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  setShowRpe,
  toggleSupersetWithNext,
  updateSet,
  type SetPatch,
} from '../db/repositories/workoutEditRepo';
import { getActiveWorkoutView, type SetView, type WorkoutExerciseView } from '../db/repositories/workoutViewsRepo';
import {
  clearRestEndsAtIf,
  discardWorkout,
  finishWorkout,
  getActiveWorkoutId,
  NothingTickedError,
  setRestEndsAt,
  startEmptyWorkout,
  startWorkoutFromDay,
  tickSet,
  untickSet,
} from '../db/repositories/workoutsRepo';
import type { Db } from '../db/types';
import { restAfterMinus15, restAfterTick, type RestChange } from '../domain/rest';
import { resolveTick, type TickValues } from '../domain/setEntry';
import { buildRows } from '../domain/setTable';
import { getRestTimerSurface, type RestTimerSurface } from '../platform/restTimer';
import { takeSnapshotSafely } from './backup';
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
 * A tick starts the rest timer, unless the exercise is in a superset and is not the last member of its round.
 */
export function tick(db: Db, ex: WorkoutExerciseView, set: SetView, entered: TickValues): boolean {
  const settings = getSettings(db);
  const { unit, distanceUnit } = settings;
  const row = buildRows(ex, unit).find((r) => r.set.id === set.id);
  if (!row) return false;
  const values = resolveTick({ loggingType: ex.loggingType, entered, target: row.target, placeholders: row.placeholders });
  if (values === null) return false;
  const now = Date.now();
  tickSet(db, set.id, values, unit, now, distanceUnit);
  const view = getActiveWorkoutView(db);
  if (view) applyRest(db, view.id, restAfterTick(view.exercises, ex.id, now, settings.restSeconds), settings.restBell);
  bumpData();
  return true;
}

// ---- the rest timer ----

function warnRest(e: unknown): void {
  console.warn('GymHound: the rest notification could not be updated.', e);
}

/** Runs a call on the rest surface without waiting for it. The rest bar is the truth; a notification that fails never fails the action. */
function onSurface(call: (surface: RestTimerSurface) => Promise<void>): void {
  try {
    call(getRestTimerSurface()).catch(warnRest);
  } catch (e) {
    warnRest(e);
  }
}

/** Writes the rest change to the workout and tells the surface. Does not bump: the caller does, once. */
function applyRest(db: Db, workoutId: string, change: RestChange, withSound: boolean): void {
  switch (change.kind) {
    case 'start':
      setRestEndsAt(db, workoutId, change.endsAt);
      onSurface((surface) => surface.start(change.endsAt, withSound));
      break;
    case 'shorten':
      setRestEndsAt(db, workoutId, change.endsAt);
      onSurface((surface) => surface.update(change.endsAt, withSound));
      break;
    case 'skip':
      setRestEndsAt(db, workoutId, null);
      onSurface((surface) => surface.cancel());
      break;
    case 'none':
      break;
  }
}

/** The -15s button: the running rest ends 15 seconds sooner, or is skipped when that would end it. */
export function restMinus15(db: Db, workoutId: string, endsAt: number): void {
  applyRest(db, workoutId, restAfterMinus15(endsAt, Date.now()), getSettings(db).restBell);
  bumpData();
}

/** The Skip button: ends the rest now and cancels its notification. */
export function restSkip(db: Db, workoutId: string): void {
  applyRest(db, workoutId, { kind: 'skip' }, false);
  bumpData();
}

/**
 * The rest that ended at `endsAt` has been dealt with: it rang, or it ran out while the app was away. Clears the stored
 * end only if it is still that one, so a tick that started a new rest in the meantime keeps its own. The notification
 * already fired, so it is left alone.
 */
export function restEnded(db: Db, workoutId: string, endsAt: number): void {
  clearRestEndsAtIf(db, workoutId, endsAt);
  bumpData();
}

// ---- finishing and discarding ----

/**
 * Finishes the workout (spec 8.4). The finish is one transaction (`finishWorkout`); after it has committed, in this order:
 * the rest notification is cancelled, a snapshot is written (the user's finished workout must survive the phone), and the
 * screens read again. A snapshot that fails never changes the outcome, and nor does the rest surface.
 * Returns 'nothing_ticked', changing nothing and taking no snapshot, when no set is ticked. Any other error is thrown.
 * Only a finished routine day moves Up next (that is `finishWorkout`'s own rule), so an empty workout never does.
 */
export function finish(db: Db, workoutId: string): 'finished' | 'nothing_ticked' {
  try {
    finishWorkout(db, workoutId, Date.now());
  } catch (e) {
    if (e instanceof NothingTickedError) return 'nothing_ticked';
    throw e;
  }
  onSurface((surface) => surface.cancel());
  takeSnapshotSafely(db, Date.now());
  bumpData();
  return 'finished';
}

/** Deletes the workout in progress and cancels its rest notification. It takes no snapshot, and Up next does not move. */
export function discard(db: Db, workoutId: string): void {
  discardWorkout(db, workoutId);
  onSurface((surface) => surface.cancel());
  bumpData();
}

// ---- exercises ----

/** Appends the exercise to the workout in progress with one empty working set. Throws when there is none. */
export function addExercise(db: Db, exerciseId: string): void {
  const workoutId = getActiveWorkoutId(db);
  if (workoutId === null) throw new Error('No workout in progress.');
  addExerciseToWorkout(db, workoutId, exerciseId);
  bumpData();
}

/** Swaps the exercise for another in place. The new exercise brings its own note. */
export function replaceWith(db: Db, workoutExerciseId: string, exerciseId: string): void {
  replaceExercise(db, workoutExerciseId, exerciseId);
  bumpData();
}

/** Deletes the exercise and its sets from the workout. */
export function removeFromWorkout(db: Db, workoutExerciseId: string): void {
  removeExercise(db, workoutExerciseId);
  bumpData();
}

/** Moves the exercise's block one place. A superset moves as one block. */
export function moveBlock(db: Db, workoutExerciseId: string, dir: 'up' | 'down'): void {
  moveExercise(db, workoutExerciseId, dir);
  bumpData();
}

/** Links the exercise with the next one into a superset, or breaks that link. */
export function toggleSuperset(db: Db, workoutExerciseId: string): void {
  toggleSupersetWithNext(db, workoutExerciseId);
  bumpData();
}

/** Turns the RPE column on or off for the exercise. */
export function setRpeShown(db: Db, workoutExerciseId: string, show: boolean): void {
  setShowRpe(db, workoutExerciseId, show);
  bumpData();
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

/** Adds an empty warmup set after the exercise's leading warmups, or at the top when it has none. */
export function addWarmupTo(db: Db, workoutExerciseId: string): void {
  addWarmupSet(db, workoutExerciseId);
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
