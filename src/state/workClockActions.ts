import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { updateSet } from '../db/repositories/workoutEditRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { getActiveRest, setRestEndsAt } from '../db/repositories/workoutsRepo';
import type { Db } from '../db/types';
import {
  clockAt,
  notificationCues,
  pauseTimer,
  releaseHold,
  resumeTimer,
  startTimer,
  stopTimer,
  type Cue,
  type WorkPlan,
  type WorkTimer,
} from '../domain/workClock';
import { getRestTimerSurface, getWorkCueSurface, type RestTimerSurface, type WorkCueSurface } from '../platform/restTimer';
import { bumpData } from './dataVersion';

/**
 * What the work clock's controls do (Task 7b): Start, Pause, Resume, Done, Reset and Start at a hold, each written to the
 * settings key `work_timer` as times, never as a counter, then the lock-screen cues scheduled to match (R-t7b1). One
 * clock at a time. A notification that fails never fails the action: the clock on screen is the truth.
 */

function warn(e: unknown): void {
  console.warn('GymHound: the work clock notifications could not be updated.', e);
}

function onCues(call: (surface: WorkCueSurface) => Promise<void>): void {
  try {
    call(getWorkCueSurface()).catch(warn);
  } catch (e) {
    warn(e);
  }
}

function onRest(call: (surface: RestTimerSurface) => Promise<void>): void {
  try {
    call(getRestTimerSurface()).catch(warn);
  } catch (e) {
    warn(e);
  }
}

const stored = (db: Db): WorkTimer | null => getSettings(db).workTimer;

/** Saves the clock and puts its cues on the lock screen: every bell still to come, or none while it is paused. */
function save(db: Db, t: WorkTimer): void {
  setSetting(db, 'workTimer', t);
  const { restBell, restBellSound } = getSettings(db);
  const cues = notificationCues(t, Date.now());
  onCues((surface) => (cues.length === 0 ? surface.cancel() : surface.schedule(cues, restBell, restBellSound)));
}

/**
 * Takes the clock away and its cues down: Reset, Finish, Discard, and an exercise removed, replaced or ticked when it
 * is `workoutExerciseId`'s (left out, whichever it is). Does not bump: the caller does, once.
 */
export function clearWorkClock(db: Db, workoutExerciseId?: string): void {
  const t = stored(db);
  if (t === null || (workoutExerciseId !== undefined && t.workoutExerciseId !== workoutExerciseId)) return;
  setSetting(db, 'workTimer', null);
  onCues((surface) => surface.cancel());
}

/** Whether `workoutExerciseId`'s EMOM is running at `now`: its ticks start no rest, since the minute is the rest. */
export function emomRunsFor(db: Db, workoutExerciseId: string, now: number): boolean {
  const t = stored(db);
  if (t === null || t.workoutExerciseId !== workoutExerciseId || t.plan.kind !== 'emom') return false;
  return clockAt(t, now).phase !== 'ended';
}

/**
 * Start: the clock's work begins after the lead-in. A rest still running is skipped (the work has begun), and a clock
 * of another exercise is replaced.
 */
export function startWorkClock(db: Db, workoutId: string, workoutExerciseId: string, plan: WorkPlan): void {
  const now = Date.now();
  const rest = getActiveRest(db);
  if (rest !== null && rest.restEndsAt !== null && rest.restEndsAt > now) {
    setRestEndsAt(db, rest.workoutId, null);
    onRest((surface) => surface.cancel());
  }
  save(db, startTimer({ workoutId, workoutExerciseId, plan }, now));
  bumpData();
}

/** Applies `change` to the stored clock, if there is one. */
function change(db: Db, next: (t: WorkTimer, now: number) => WorkTimer): void {
  const t = stored(db);
  if (t === null) return;
  save(db, next(t, Date.now()));
  bumpData();
}

export const pauseWorkClock = (db: Db) => change(db, pauseTimer);
export const resumeWorkClock = (db: Db) => change(db, resumeTimer);
/** Start at a hold: intervals with no easy part wait between sets. */
export const releaseWorkHold = (db: Db) => change(db, releaseHold);

/** Reset: the clock goes back to Start. */
export function resetWorkClock(db: Db): void {
  clearWorkClock(db);
  bumpData();
}

/**
 * Puts the clock's time into the score of For Time or a run (the first set not ticked), so a tick logs it. Done writes
 * it over what is there (`overwrite`); the end of the clock only fills an empty field, never over a time typed.
 */
function fillTime(db: Db, t: WorkTimer, seconds: number | null, overwrite: boolean): void {
  if (seconds === null || (t.plan.kind !== 'for_time' && t.plan.kind !== 'run')) return;
  const ex = getActiveWorkoutView(db)?.exercises.find((e) => e.id === t.workoutExerciseId);
  const set = ex?.sets.find((s) => !s.done && s.setType === 'working');
  if (!set || (!overwrite && set.durationS !== null)) return;
  updateSet(db, set.id, { durationS: seconds });
}

/** Done: the clock stops where it is, and For Time's or a run's time goes into its score field. */
export function doneWorkClock(db: Db): void {
  const t = stored(db);
  if (t === null) return;
  const stopped = stopTimer(t, Date.now());
  save(db, stopped);
  fillTime(db, stopped, stopped.doneAtS, true);
  bumpData();
}

/**
 * A cue has been rung, said, or passed while the app was away (`dueCue`): it is remembered so it never rings twice. At
 * the end, For Time's cap or a run's target fills its time field when that is empty (R647).
 */
export function workCueDealtWith(db: Db, index: number, kind: Cue['kind']): void {
  const t = stored(db);
  if (t === null) return;
  const next = { ...t, rang: Math.max(t.rang, index) };
  setSetting(db, 'workTimer', next);
  if (kind === 'end') fillTime(db, next, clockAt(next, Date.now()).timeS, false);
  bumpData();
}
