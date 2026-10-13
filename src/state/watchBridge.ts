import { getSettings } from '../db/repositories/settingsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import type { Db } from '../db/types';
import { gearFor } from '../domain/plates';
import { nextSetId, workoutProgress } from '../domain/sessionProgress';
import { setName } from '../domain/setEntry';
import { buildRows } from '../domain/setTable';
import { WATCH_PROTOCOL, type WatchCommand, type WatchNextSet, type WatchState } from '../domain/watchProtocol';
import { restPlus15, restSkip, tick } from './sessionActions';

/**
 * PHASE 8: the phone's side of the watch apps (spec §17.4, R316–R318). The native bridge (WatchConnectivity on
 * iPhone, the Wearable Data Layer on Android; see docs/superpowers/plans/2026-10-12-gymhound-phase-7-8.md) only
 * carries JSON: it sends `watchStateFor(db)` whenever the data version changes, and hands each message from the watch
 * to `parseWatchCommand` and then `applyWatchCommand`. Nothing here is native, so it runs and is tested today.
 */

/** What the watch shows now: the active workout, its progress and the next set with what a tick would log. */
export function watchStateFor(db: Db): WatchState {
  const view = getActiveWorkoutView(db);
  if (view === null) return { v: WATCH_PROTOCOL, workout: null };
  const settings = getSettings(db);
  const { unit, distanceUnit } = settings;
  const { done, total } = workoutProgress(view.exercises);
  const nextId = nextSetId(view.exercises);
  let next: WatchNextSet | null = null;
  const ex = nextId === null ? undefined : view.exercises.find((e) => e.sets.some((s) => s.id === nextId));
  const row = ex === undefined ? undefined : buildRows(ex, unit, gearFor(unit, settings), distanceUnit).find((r) => r.set.id === nextId);
  if (ex !== undefined && row !== undefined) {
    next = {
      setId: row.set.id,
      exercise: ex.name,
      setName: setName(row.label),
      loggingType: ex.loggingType,
      weight: row.target ?? row.placeholders.weight,
      weightUnit: unit,
      reps: row.placeholders.reps,
      durationS: row.placeholders.durationS,
      distance: row.placeholders.distance,
      distanceUnit,
    };
  }
  return {
    v: WATCH_PROTOCOL,
    workout: { id: view.id, name: view.name, startedAt: view.startedAt, restEndsAt: view.restEndsAt, done, total, next },
  };
}

/**
 * Applies a watch command through the session screen's own actions, so a tick on the wrist starts the same rest, rings
 * the same bell and is undone the same way (R317). 'stale' when the watch acted on a state the phone has moved past
 * (another workout, a set already ticked, a rest already changed); the bridge then sends the current state.
 * 'refused' when the tick had no value to log (a set with no target and no placeholder): the watch says to log it on
 * the phone.
 */
export function applyWatchCommand(db: Db, command: WatchCommand): 'ok' | 'stale' | 'refused' {
  if (command.kind === 'hello') return 'ok';
  const view = getActiveWorkoutView(db);
  if (view === null || view.id !== command.workoutId) return 'stale';
  if (command.kind === 'tick') {
    const ex = view.exercises.find((e) => e.sets.some((s) => s.id === command.setId));
    const set = ex?.sets.find((s) => s.id === command.setId);
    if (ex === undefined || set === undefined || set.done) return 'stale';
    const entered = { weight: command.weight, reps: command.reps, durationS: null, distance: null };
    return tick(db, ex, set, entered) ? 'ok' : 'refused';
  }
  if (view.restEndsAt !== command.endsAt) return 'stale';
  if (command.kind === 'restPlus15') restPlus15(db, view.id, command.endsAt);
  else restSkip(db, view.id, command.endsAt);
  return 'ok';
}
