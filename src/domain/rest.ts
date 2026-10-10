const MINUS_15_MS = 15_000;

/**
 * Whole seconds left on the rest timer, rounded up so it never shows 0:00 while still running.
 * Null when no timer is set or its end time has passed, so a timer that expired while the app
 * was closed shows nothing (Review Focus 1).
 */
export function restRemainingSeconds(endsAt: number | null, now: number): number | null {
  if (endsAt === null || endsAt <= now) return null;
  return Math.ceil((endsAt - now) / 1000);
}

/** The new end time after tapping -15s, or null when that would end the timer. */
export function minus15(endsAt: number, now: number): number | null {
  const shortened = endsAt - MINUS_15_MS;
  return shortened > now ? shortened : null;
}

/**
 * Whether ticking a set starts the rest timer (spec 8.4): always, unless the exercise is in a
 * superset and is not the last member of its round.
 */
export function shouldStartRestAfterTick(
  exercises: { id: string; position: number; supersetGroup: number | null }[],
  workoutExerciseId: string,
): boolean {
  const ticked = exercises.find((e) => e.id === workoutExerciseId);
  if (!ticked || ticked.supersetGroup === null) return true;
  return exercises.every((e) => e.supersetGroup !== ticked.supersetGroup || e.position <= ticked.position);
}

/** What a tick, -15s or Skip does to the rest timer. The caller writes `rest_ends_at` and calls the rest surface to match. */
export type RestChange =
  /** Start a rest that ends at `endsAt`. */
  | { kind: 'start'; endsAt: number }
  /** The running rest now ends earlier, at `endsAt`. */
  | { kind: 'shorten'; endsAt: number }
  /** End the rest now, without ringing. */
  | { kind: 'skip' }
  | { kind: 'none' };

/** The rest a ticked set starts: `restSeconds` from `now`, or nothing mid-superset (`shouldStartRestAfterTick`). */
export function restAfterTick(
  exercises: { id: string; position: number; supersetGroup: number | null }[],
  workoutExerciseId: string,
  now: number,
  restSeconds: number,
): RestChange {
  if (restSeconds <= 0 || !shouldStartRestAfterTick(exercises, workoutExerciseId)) return { kind: 'none' };
  return { kind: 'start', endsAt: now + restSeconds * 1000 };
}

/** Tapping -15s: the shortened end, or a skip when that would end the timer. */
export function restAfterMinus15(endsAt: number, now: number): RestChange {
  const shortened = minus15(endsAt, now);
  return shortened === null ? { kind: 'skip' } : { kind: 'shorten', endsAt: shortened };
}

/** How long after the end the watcher still rings. Later than this, the app was away and the notification already rang. */
export const RING_WINDOW_MS = 3000;

/**
 * A stretch of time the app was in the background, until it was active again. `to` is null while it is still away.
 * `inactive` alone (iOS Control Center, Notification Center, the app switcher) is not away: the app is still in front.
 */
export type AwaySpan = { from: number; to: number | null };

/** Whether `span` covers the moment `t`, ends included. */
export function wasAwayAt(span: AwaySpan | null, t: number): boolean {
  return span !== null && t >= span.from && (span.to === null || t <= span.to);
}

/**
 * What the rest watcher does at a tick of its clock, for a timer that ends at `endsAt`:
 * - `running`: time is left.
 * - `ring`: it just ran out in front of the user; haptic, bell, then clear.
 * - `clear`: it ran out unwatched (`wasRunning` is false: it opened on an expired timer), long ago, or while the app
 *   was away (`awayAtEnd`: the notification carried the sound and the buzz, so ringing again on return would double
 *   it); clear it quietly.
 */
export function restPhase(endsAt: number, now: number, wasRunning: boolean, awayAtEnd = false): 'running' | 'ring' | 'clear' {
  if (restRemainingSeconds(endsAt, now) !== null) return 'running';
  return wasRunning && !awayAtEnd && now - endsAt <= RING_WINDOW_MS ? 'ring' : 'clear';
}
