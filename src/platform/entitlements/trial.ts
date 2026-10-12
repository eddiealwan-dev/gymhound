import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { trialStatus, type TrialStatus } from '../../domain/trial';
import type { AppEntitlements } from './index';

/** The longest a single timer may wait (2^31 − 1 ms, about 24.8 days); a trial lasts 7. */
const MAX_TIMER_MS = 2_147_483_647;

/** The trial's state, plus what its lines need: the workout that started it, and whether "it has ended" was answered. */
export type TrialView = TrialStatus & { startWorkoutId: string | null; endedSeen: boolean };

export type TrialEntitlements = AppEntitlements & {
  /** The full access trial at this moment (§18.19). */
  trialStatus(): TrialView;
  /** Reads the stored start again and tells subscribers: call after the trial starts or the developer controls move it. */
  refreshTrial(): void;
  /**
   * Whether the trial is what gives Pro now: it runs, and nothing was bought. The debug unlock doesn't count as bought,
   * so testing the trial with "Unlock Pro for testing" on still shows its lines (Round 8). The paywall still pitches and
   * Settings counts the days.
   */
  isTrialOnly(): boolean;
};

/**
 * Wraps the build's entitlements with the 7-day full access trial (§18.19, R483): Pro is on while the store, the debug
 * unlock or the trial says so, so every Pro gate (the Pro programs, your own routines, saved workouts, Fuel) follows with no change of its own. The stored
 * start is read once and again on `refreshTrial`; a timer tells subscribers the moment the trial ends, so a screen that
 * is open then locks without waiting for a restart. `now` is injectable for tests.
 */
export function withTrial(db: Db, base: AppEntitlements, now: () => number = Date.now): TrialEntitlements {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  type Stored = { startedAt: number | null; startWorkoutId: string | null; endedSeen: boolean };
  const read = (): Stored => {
    try {
      const settings = getSettings(db);
      return { startedAt: settings.trialStartedAt, startWorkoutId: settings.trialStartWorkoutId, endedSeen: settings.trialEndedSeen };
    } catch (error) {
      // A database that can't be read means no trial, never a crash on a Pro gate.
      console.warn('GymHound could not read the trial start.', error);
      return { startedAt: null, startWorkoutId: null, endedSeen: false };
    }
  };

  let stored = read();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const status = trialStatus(stored.startedAt, now());
    if (status.phase !== 'active' || status.endsAt === null) return;
    timer = setTimeout(
      () => {
        timer = null;
        schedule();
        notify();
      },
      Math.min(MAX_TIMER_MS, Math.max(0, status.endsAt - now())),
    );
    // Under Node (tests, tooling) a days-long timer must not keep the process alive; React Native's timers have no unref.
    (timer as { unref?: () => void }).unref?.();
  };
  schedule();

  const unsubscribeBase = base.subscribe(notify);
  const status = (): TrialView => ({ ...trialStatus(stored.startedAt, now()), startWorkoutId: stored.startWorkoutId, endedSeen: stored.endedSeen });

  return {
    ...base,
    isPro: () => base.isPro() || status().phase === 'active',
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    trialStatus: status,
    isTrialOnly: () => status().phase === 'active' && !(base.isPro() && !base.isDebugPro()),
    refreshTrial() {
      stored = read();
      schedule();
      notify();
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      unsubscribeBase();
      base.dispose();
    },
  };
}
