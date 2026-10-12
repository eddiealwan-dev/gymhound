import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import type { Db } from '../db/types';
import { shouldStartTrial, trialStartForPreset, type TrialPreset } from '../domain/trial';
import { entitlementsFor } from '../platform/entitlements';

/**
 * Starts the 7-day full access trial at this finish when it has never started (§18.19, R480, R481): once per install,
 * kept in the database so a restore keeps it. People who already had workouts when it shipped get it at their next
 * finish. A failure here is logged and never stops the finish.
 */
export function startTrialIfDue(db: Db, workoutId: string, now: number): boolean {
  try {
    if (!shouldStartTrial(getSettings(db).trialStartedAt)) return false;
    setSetting(db, 'trialStartedAt', now);
    setSetting(db, 'trialStartWorkoutId', workoutId);
    entitlementsFor(db).refreshTrial();
    return true;
  } catch (error) {
    console.warn('GymHound could not start the full access trial.', error);
    return false;
  }
}

/** Settings → Developer (R492): puts the trial at a preset for phone testing, and tells every Pro gate. */
export function setTrialPreset(db: Db, preset: TrialPreset, now: number): void {
  setSetting(db, 'trialStartedAt', trialStartForPreset(preset, now));
  setSetting(db, 'trialStartWorkoutId', null);
  // Free acts as a free phone after its trial: the ended notice is already answered.
  setSetting(db, 'trialEndedSeen', preset === 'free');
  entitlementsFor(db).refreshTrial();
}

/** Train's trial-ended line was answered (R490): it never shows again. */
export function dismissTrialEnded(db: Db): void {
  setSetting(db, 'trialEndedSeen', true);
  entitlementsFor(db).refreshTrial();
}
