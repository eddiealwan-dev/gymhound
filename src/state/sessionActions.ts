import { setRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { setExerciseNote } from '../db/repositories/exercisesRepo';
import { flagUnmarkedShortOnFood, setFoodOfferShown } from '../db/repositories/foodOfferRepo';
import { getSettings } from '../db/repositories/settingsRepo';
import {
  addExerciseToWorkout,
  addSet,
  addWarmupSet,
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  setExerciseMark,
  setOverride,
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
  getActiveRest,
  getActiveWorkoutId,
  NothingTickedError,
  setRestEndsAt,
  startEmptyWorkout,
  startRest,
  startWorkoutFromDay,
  tickSet,
  untickSet,
} from '../db/repositories/workoutsRepo';
import type { Db } from '../db/types';
import { gearFor } from '../domain/plates';
import { restAfterMinus15, restAfterPlus15, restAfterTick, restLengthFor, restWaitsFor, tickAnnouncement, type RestChange } from '../domain/rest';
import { resolveTick, type TickValues } from '../domain/setEntry';
import { buildRows } from '../domain/setTable';
import type { BellSound, DistanceUnit, ExerciseMark, WeightUnit } from '../domain/types';
import { announce } from '../platform/announce';
import { getRestTimerSurface, type RestTimerSurface } from '../platform/restTimer';
import { takeSnapshotSafely } from './backup';
import { afterFinish } from './nativeServices';
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
 * placeholders fill the gaps (spec 8.4): last time's set, else today's own values carried from the set above (spec
 * 18.6), so the tick records what the row shows (R48). Returns false, changing nothing, when a field the logging type
 * needs still has no value; the row says which one (spec 18.6).
 * `enteredUnit` is the unit `entered.weight` is in (`RowReading.weightUnit`), the unit in Settings when left out: a
 * weight typed or stored keeps its unit, so one logged before a unit switch is ticked as it was logged (spec 7.1), and a
 * weight from the target or a placeholder is recorded in the unit in Settings, which they are in.
 * `enteredDistanceUnit` does the same for `entered.distance` (`RowReading.distanceUnit`): a distance typed or stored
 * keeps its unit, and one from a placeholder, already in the distance unit in Settings, is recorded in that.
 * A tick starts the rest timer for the exercise's own rest (or the rest in Settings when it has none), unless that is Off,
 * or the exercise is in a superset and is not the last member of its round. The screen reader is then told the set and the
 * rest: "Set 2 logged. Rest 2 minutes.", or mid-superset the exercise the rest waits for: "Set 2 logged. Rest after
 * Ab roller." (R100).
 */
export function tick(
  db: Db,
  ex: WorkoutExerciseView,
  set: Pick<SetView, 'id'>,
  entered: TickValues,
  enteredUnit?: WeightUnit,
  enteredDistanceUnit?: DistanceUnit,
): boolean {
  const settings = getSettings(db);
  const { unit, distanceUnit } = settings;
  const row = buildRows(ex, unit, gearFor(unit, settings), distanceUnit).find((r) => r.set.id === set.id);
  if (!row) return false;
  const values = resolveTick({ loggingType: ex.loggingType, entered, target: row.target, placeholders: row.placeholders });
  if (values === null) return false;
  const now = Date.now();
  const weightUnit = entered.weight !== null ? (enteredUnit ?? unit) : unit;
  const tickedDistanceUnit = entered.distance !== null ? (enteredDistanceUnit ?? distanceUnit) : distanceUnit;
  tickSet(db, set.id, values, weightUnit, now, tickedDistanceUnit);
  const view = getActiveWorkoutView(db);
  let restStarted: number | null = null;
  let waitsFor: string | null = null;
  if (view) {
    const length = restLengthFor(ex.restSeconds, settings.restSeconds);
    const change = restAfterTick(view.exercises, ex.id, now, length);
    applyRest(db, view.id, change, restAlert(settings), set.id);
    if (change.kind === 'start') restStarted = length;
    waitsFor = restWaitsFor(view.exercises, ex.id, settings.restSeconds);
  }
  bumpData();
  announce(tickAnnouncement(row.label, restStarted, waitsFor));
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

/** How the rest's end sounds: the bell switch and, for a phase 7 build's lock screen, the bell chosen (R304). */
type RestAlert = { withSound: boolean; sound: BellSound };

function restAlert(settings: { restBell: boolean; restBellSound: BellSound }): RestAlert {
  return { withSound: settings.restBell, sound: settings.restBellSound };
}

/**
 * Writes the rest change to the workout and tells the surface. Does not bump: the caller does, once. A start stores
 * `startedBy`, the ticked set, with its end, and the countdown shows under that set (R38); -15s and +15s move the
 * end and keep it, and a skip clears it.
 */
function applyRest(db: Db, workoutId: string, change: RestChange, alert: RestAlert, startedBy?: string): void {
  const { withSound, sound } = alert;
  switch (change.kind) {
    case 'start':
      if (startedBy === undefined) throw new Error('A rest is started only by a tick, which names its set.');
      startRest(db, workoutId, change.endsAt, startedBy);
      onSurface((surface) => surface.start(change.endsAt, withSound, sound));
      break;
    case 'shorten':
    case 'extend':
      setRestEndsAt(db, workoutId, change.endsAt);
      onSurface((surface) => surface.update(change.endsAt, withSound, sound));
      break;
    case 'skip':
      setRestEndsAt(db, workoutId, null);
      onSurface((surface) => surface.cancel());
      break;
    case 'none':
      break;
  }
}

/**
 * The -15s button: the running rest ends 15 seconds sooner, or is skipped when that would end it. A rest already over is
 * left alone: the rest watcher still rings for it, and its row still holds "Rest's up".
 */
export function restMinus15(db: Db, workoutId: string, endsAt: number): void {
  if (endsAt <= Date.now()) return;
  applyRest(db, workoutId, restAfterMinus15(endsAt, Date.now()), restAlert(getSettings(db)));
  bumpData();
}

/** The +15s button: the running rest ends 15 seconds later, under the same set. A rest already over is left alone. */
export function restPlus15(db: Db, workoutId: string, endsAt: number): void {
  applyRest(db, workoutId, restAfterPlus15(endsAt, Date.now()), restAlert(getSettings(db)));
  bumpData();
}

/**
 * The Skip button: ends the rest that ends at `endsAt` now and cancels its notification. A rest already over is left
 * alone, as with -15s.
 */
export function restSkip(db: Db, workoutId: string, endsAt: number): void {
  if (endsAt <= Date.now()) return;
  applyRest(db, workoutId, { kind: 'skip' }, { withSound: false, sound: 'bell' });
  bumpData();
}

/**
 * The rest that ended at `endsAt` has been dealt with: it rang, or it ran out while the app was away. Clears the stored
 * end only if it is still that one, so a tick that started a new rest in the meantime keeps its own. The notification
 * already fired, so it is left alone.
 */
export function restEnded(db: Db, workoutId: string, endsAt: number): void {
  const rest = getActiveRest(db);
  const stillThisRest = rest !== null && rest.workoutId === workoutId && rest.restEndsAt === endsAt;
  clearRestEndsAtIf(db, workoutId, endsAt);
  // Phase 7: the lock-screen countdown (Live Activity, ongoing notification) of this rest comes down; a newer rest keeps
  // its own. The notification surface has no `ended`, so Expo Go does nothing here.
  if (stillThisRest) onSurface((surface) => surface.ended?.() ?? Promise.resolve());
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
  const now = Date.now();
  try {
    finishWorkout(db, workoutId, now);
  } catch (e) {
    if (e instanceof NothingTickedError) return 'nothing_ticked';
    throw e;
  }
  onSurface((surface) => surface.cancel());
  takeSnapshotSafely(db, Date.now());
  // Phase 7: the Health write-out and the iCloud copy, in the background. Nothing in Expo Go (R307, R303).
  afterFinish(db);
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

/** Flags the exercise Something off with a reason, or clears it with null (Nothing off). Throws outside the active workout. */
export function markExercise(db: Db, workoutExerciseId: string, mark: ExerciseMark | null): void {
  setExerciseMark(db, workoutExerciseId, mark);
  bumpData();
}

/**
 * The Short on food offer's Mark it (§7.10, R152): flags every exercise in the workout that has no mark Short on food
 * (others keep theirs), records that the offer was shown, and tells the screen reader when something was flagged.
 * Throws outside the active workout.
 */
export function acceptFoodOffer(db: Db, workoutId: string): void {
  const flagged = flagUnmarkedShortOnFood(db, workoutId);
  bumpData();
  if (flagged > 0) announce('Marked Short on food.');
}

/** The Short on food offer's ×: records that it was shown, so it never appears again for this workout. */
export function dismissFoodOffer(db: Db, workoutId: string): void {
  setFoodOfferShown(db, workoutId);
  bumpData();
}

/** Sets today's weight for the exercise, or clears it with nulls. Today only: never written back to the rule. Throws outside the active workout. */
export function overrideWeight(db: Db, workoutExerciseId: string, weight: number | null, unit: WeightUnit | null): void {
  setOverride(db, workoutExerciseId, weight, unit);
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

/**
 * Saves the exercise's own rest: seconds, 0 for Off, or null for the rest in Settings. It lives on the exercise, so it
 * follows the exercise into every routine and workout. A rest already running keeps its end.
 */
export function setExerciseRest(db: Db, exerciseId: string, seconds: number | null): void {
  setRestSeconds(db, exerciseId, seconds, Date.now());
  bumpData();
}
