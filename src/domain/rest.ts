import { setName } from './setEntry';

const MINUS_15_MS = 15_000;
/** What +15s adds to the running rest. */
export const PLUS_15_MS = 15_000;

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

/** The new end time after tapping +15s. */
export function plus15(endsAt: number): number {
  return endsAt + PLUS_15_MS;
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

/** What a tick, -15s, +15s or Skip does to the rest timer. The caller writes `rest_ends_at` and calls the rest surface to match. */
export type RestChange =
  /** Start a rest that ends at `endsAt`. */
  | { kind: 'start'; endsAt: number }
  /** The running rest now ends earlier, at `endsAt`. */
  | { kind: 'shorten'; endsAt: number }
  /** The running rest now ends later, at `endsAt`. */
  | { kind: 'extend'; endsAt: number }
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

/** Tapping +15s: the running rest ends 15 seconds later. A rest already over stays over. */
export function restAfterPlus15(endsAt: number, now: number): RestChange {
  return endsAt > now ? { kind: 'extend', endsAt: plus15(endsAt) } : { kind: 'none' };
}

/** How long the rest row holds "Rest's up" after the end, before it goes. */
export const REST_UP_MS = 10_000;

/**
 * What the rest row under its set shows at `now` (spec 18.6): the countdown while time is left (whole seconds, rounded
 * up), "Rest's up" for `REST_UP_MS` from the end, then nothing.
 */
export function restRowPhase(endsAt: number, now: number): { kind: 'running'; remaining: number } | { kind: 'up' } | { kind: 'gone' } {
  const remaining = restRemainingSeconds(endsAt, now);
  if (remaining !== null) return { kind: 'running', remaining };
  return now - endsAt < REST_UP_MS ? { kind: 'up' } : { kind: 'gone' };
}

/** The share of the rest track still drawn: the time left of the rest's length, within 0 and 1. Full when the length is unknown. */
export function restTrackFraction(remainingSeconds: number, lengthSeconds: number): number {
  if (!Number.isFinite(lengthSeconds) || lengthSeconds <= 0) return 1;
  return Math.min(1, Math.max(0, remainingSeconds / lengthSeconds));
}

const unitWord = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** A rest length in words, for the screen reader: "2 minutes", "1 minute 30 seconds", "45 seconds". */
export function spokenRest(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return unitWord(rest, 'second');
  return rest === 0 ? unitWord(minutes, 'minute') : `${unitWord(minutes, 'minute')} ${unitWord(rest, 'second')}`;
}

/** What VoiceOver says after a tick: "Set 2 logged. Rest 2 minutes.", or "Set 2 logged." when the tick started no rest. */
export function tickAnnouncement(setLabel: string, restSeconds: number | null): string {
  const logged = `${setName(setLabel)} logged.`;
  return restSeconds === null ? logged : `${logged} Rest ${spokenRest(restSeconds)}.`;
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

/** The rest lengths an exercise can have of its own, in seconds (Task 21). 0 is Off. */
export const REST_CHOICES = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

/** How long a tick of this exercise rests: its own rest when it has one (0 is Off, no rest), else the rest in Settings. */
export function restLengthFor(exerciseRest: number | null, settingsRest: number): number {
  return exerciseRest ?? settingsRest;
}
