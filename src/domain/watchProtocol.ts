import type { DistanceUnit, LoggingType, WeightUnit } from './types';

/**
 * PHASE 8: what the phone and a watch say to each other (spec §17.4, R316–R318). The phone owns the workout: the watch
 * shows the state the phone sends and sends back commands, and the phone applies them through the same actions as the
 * session screen. Messages are plain JSON, carried by WatchConnectivity (Apple Watch) or the Wearable Data Layer (Wear
 * OS); neither side ever writes the other's database.
 *
 * `v` is the protocol's version. A message with another version is ignored, so an older watch app never acts on a
 * newer phone's message, or the other way round; the watch then says to update the app.
 */
export const WATCH_PROTOCOL = 1;

/** What the watch shows in place of a tick for a set it can't log (`phoneOnly`). */
export const PHONE_ONLY_LINE = 'Log this one on your phone.';

/**
 * Whether a tick on the wrist can log a set of this type. The wrist sends only a weight and reps; the three program
 * types (R607) need what it can't take, a carry's distance, an AMRAP's rounds and extra reps, a For Time's time, so
 * they are logged on the phone.
 */
export function watchCanLog(loggingType: LoggingType): boolean {
  return loggingType !== 'weighted_distance' && loggingType !== 'rounds' && loggingType !== 'for_time';
}

/** The set the watch shows next, with what a tick on the wrist logs (the target, else the placeholders). */
export type WatchNextSet = {
  setId: string;
  exercise: string;
  /** "Set 2", "Warmup", "Drop set", "Failure set". */
  setName: string;
  loggingType: LoggingType;
  weight: number | null;
  weightUnit: WeightUnit;
  reps: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit;
  /** A set the watch can't log (`watchCanLog`): it shows `PHONE_ONLY_LINE` and no tick, and the phone refuses one. */
  phoneOnly: boolean;
};

export type WatchWorkout = {
  id: string;
  name: string;
  startedAt: number;
  /** When the running rest ends (epoch ms), or null. The watch counts down to it on its own clock. */
  restEndsAt: number | null;
  done: number;
  total: number;
  /** Null when every set is ticked. */
  next: WatchNextSet | null;
};

/** Phone → watch: the whole state each time something changes (small, and nothing to merge). */
export type WatchState = { v: typeof WATCH_PROTOCOL; workout: WatchWorkout | null };

/** Watch → phone. Each command names the workout it was made for; one for another workout is stale. */
export type WatchCommand =
  /** Ticks the set with these values; a value left null logs the shown target or placeholder, as on the phone. */
  | { v: typeof WATCH_PROTOCOL; kind: 'tick'; workoutId: string; setId: string; weight: number | null; reps: number | null }
  | { v: typeof WATCH_PROTOCOL; kind: 'restPlus15' | 'restSkip'; workoutId: string; endsAt: number }
  /** The watch app opened, or lost track: the phone sends its state. */
  | { v: typeof WATCH_PROTOCOL; kind: 'hello' };

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 200;
const isTime = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
/** A typed value on the wrist: null, or a finite number from 0 to 10,000. */
const valueOr = (x: unknown): number | null | undefined =>
  x === null || x === undefined ? null : typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 10_000 ? x : undefined;

/**
 * A watch message read defensively: anything malformed, from another protocol version, or out of range is null and
 * ignored. A message is a JSON string or an already-parsed object, as each platform's bridge hands it over.
 */
export function parseWatchCommand(raw: unknown): WatchCommand | null {
  let msg: unknown = raw;
  if (typeof raw === 'string') {
    try {
      msg = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof msg !== 'object' || msg === null) return null;
  const m = msg as Record<string, unknown>;
  if (m.v !== WATCH_PROTOCOL) return null;
  switch (m.kind) {
    case 'hello':
      return { v: WATCH_PROTOCOL, kind: 'hello' };
    case 'tick': {
      const weight = valueOr(m.weight);
      const reps = valueOr(m.reps);
      if (!isId(m.workoutId) || !isId(m.setId) || weight === undefined || reps === undefined) return null;
      if (reps !== null && !Number.isInteger(reps)) return null;
      return { v: WATCH_PROTOCOL, kind: 'tick', workoutId: m.workoutId, setId: m.setId, weight, reps };
    }
    case 'restPlus15':
    case 'restSkip':
      if (!isId(m.workoutId) || !isTime(m.endsAt)) return null;
      return { v: WATCH_PROTOCOL, kind: m.kind, workoutId: m.workoutId, endsAt: m.endsAt };
    default:
      return null;
  }
}
