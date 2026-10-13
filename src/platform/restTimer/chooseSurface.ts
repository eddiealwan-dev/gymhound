import type { BellSound } from '../../domain/types';
import { isNativeBuild, type NativeEnv } from '../native/optional';
import type { RestTimerSurface } from './index';

/**
 * PHASE 7: what shows a running rest on the lock screen beside the "Rest's up." notification (§15 phase 7, R301).
 * - iOS build: a Live Activity, a live countdown on the lock screen and in the Dynamic Island.
 * - Android build: an ongoing notification with a countdown chronometer.
 * - Expo Go and the web: nothing more. The notification (or, on the web, nothing) is today's behaviour.
 * The notification always stays: neither the Live Activity nor the ongoing notification can ring at zero.
 */
export type LockScreenCountdown = 'liveActivity' | 'androidOngoing' | null;

export function lockScreenCountdownFor(env: NativeEnv): LockScreenCountdown {
  if (!isNativeBuild(env)) return null;
  return env.os === 'ios' ? 'liveActivity' : 'androidOngoing';
}

/** Waits for every call, then rejects with the first failure, so one surface failing never stops another. */
async function all(calls: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(calls);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failed) throw failed.reason;
}

/** One surface that drives several, each told every change. `ended` reaches only those that have it. */
export function combineSurfaces(...surfaces: RestTimerSurface[]): RestTimerSurface {
  const each = (call: (s: RestTimerSurface) => Promise<void> | undefined) =>
    all(surfaces.map((s) => Promise.resolve().then(() => call(s))));
  return {
    start: (endsAt: number, withSound: boolean, sound?: BellSound) => each((s) => s.start(endsAt, withSound, sound)),
    update: (endsAt: number, withSound: boolean, sound?: BellSound) => each((s) => s.update(endsAt, withSound, sound)),
    cancel: () => each((s) => s.cancel()),
    ended: () => each((s) => s.ended?.()),
  };
}
