import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import {
  flagUnmarkedRoughSleep,
  healthRecordIdOf,
  healthRowsSince,
  latestBodyweightAt,
  recordHealthWrite,
  setSleepOfferShown,
  sleepOfferOpen,
  workoutForHealth,
} from '../db/repositories/healthRepo';
import type { Db } from '../db/types';
import {
  healthWritesDue,
  lastNightWindow,
  newerHealthBodyweight,
  restingHeartRateRise,
  roughSleepReason,
  sleepMinutes,
  toHealthWorkout,
  RESTING_HR_BASELINE_DAYS,
  type RoughSleepReason,
} from '../domain/health';
import type { WeightUnit } from '../domain/types';
import { announce } from '../platform/announce';
import { getHealthStore, type HealthRead, type HealthStore } from '../platform/health';
import { bumpData } from './dataVersion';

/**
 * PHASE 7: Apple Health and Health Connect, from the app's side (§17.1, R307–R311). Everything here takes the store
 * (`getHealthStore()`, null in Expo Go) and does nothing without one, so Expo Go behaves as before. Nothing here ever
 * throws into a finish, a delete or a screen: Health is never in the way of the log.
 */

const DAY = 24 * 3_600_000;

/**
 * Writes every workout due (`healthWritesDue`, oldest first) and records each result: done with the store's id, or
 * failed, to be tried at the next start and the next finish. Returns how many were written and how many failed.
 */
export async function writeDueWorkouts(db: Db, store: HealthStore): Promise<{ written: number; failed: number }> {
  const settings = getSettings(db);
  if (!settings.healthWorkouts || settings.healthWorkoutsSince === null) return { written: 0, failed: 0 };
  const due = healthWritesDue(healthRowsSince(db, settings.healthWorkoutsSince), settings.healthWorkoutsSince);
  let written = 0;
  let failed = 0;
  for (const id of due) {
    const workout = workoutForHealth(db, id);
    const record = workout ? toHealthWorkout(workout) : null;
    if (record === null) continue;
    try {
      const recordId = await store.writeWorkout(record);
      recordHealthWrite(db, id, { status: 'done', recordId });
      written++;
    } catch (error) {
      console.warn(`GymHound: ${store.name} did not take workout ${id}.`, error);
      recordHealthWrite(db, id, { status: 'failed' });
      failed++;
    }
  }
  return { written, failed };
}

let pass: Promise<unknown> = Promise.resolve();

/**
 * Starts a write pass after the one running, without waiting for it: at app start and after each finish (§17.1). No
 * store (Expo Go, the web), or the write-out off: nothing. Never throws.
 */
export function syncHealthSoon(db: Db, store: HealthStore | null = getHealthStore()): Promise<void> {
  if (store === null) return Promise.resolve();
  const run = pass.then(() => writeDueWorkouts(db, store)).catch((error) => console.warn('GymHound: the Health pass failed.', error));
  pass = run;
  return run.then(() => {});
}

/**
 * Removes the Health record of a workout about to be deleted in History (§17.1: best effort). Read the id before the
 * delete (`healthRecordIdOf`); a refusal is logged and the workout is still deleted. Never throws.
 */
export async function removeHealthRecord(recordId: string | null, store: HealthStore | null = getHealthStore()): Promise<void> {
  if (recordId === null || store === null) return;
  try {
    await store.deleteWorkout(recordId);
  } catch (error) {
    console.warn(`GymHound: ${store.name} kept the deleted workout's record.`, error);
  }
}

export { healthRecordIdOf };

// ---- Settings ----

/** The Settings switches for Health, by name (R307). */
export type HealthSwitch = 'workouts' | HealthRead;

const SWITCH_KEYS = {
  workouts: 'healthWorkouts',
  sleep: 'healthSleep',
  heartRate: 'healthHeartRate',
  bodyweight: 'healthBodyweight',
} as const;

/**
 * Turns a Health switch on or off. Turning one on shows the store's permission sheet for it first; the switch is on
 * once the sheet is answered (Apple never says whether a read was allowed: a refused read just finds nothing).
 * Turning on the write-out starts from now: earlier workouts are not written (R308). Returns whether it is on.
 */
export async function setHealthSwitch(db: Db, which: Exclude<HealthSwitch, 'steps'>, on: boolean, store: HealthStore, now = Date.now()): Promise<boolean> {
  const key = SWITCH_KEYS[which];
  if (!on) {
    setSetting(db, key, false);
    bumpData();
    return false;
  }
  try {
    await store.requestAccess(which === 'workouts' ? { writeWorkouts: true, reads: [] } : { writeWorkouts: false, reads: [which] });
  } catch (error) {
    console.warn(`GymHound: ${store.name} did not answer.`, error);
    return getSettings(db)[key];
  }
  setSetting(db, key, true);
  if (which === 'workouts') setSetting(db, 'healthWorkoutsSince', now);
  bumpData();
  if (which === 'workouts') await syncHealthSoon(db, store);
  return true;
}

// ---- the Rough sleep offer (§17.1, R309, R310) ----

/**
 * Whether to offer Rough sleep for the active workout, and why: judged once when the session opens, from the reads that
 * are on. Null when neither read is on, the offer was shown, nothing is left to flag, Health has nothing or the reads
 * fail. The user taps it; GymHound never marks the day by itself.
 */
export async function roughSleepOfferFor(db: Db, workoutId: string, store: HealthStore | null, now = Date.now()): Promise<RoughSleepReason | null> {
  if (store === null) return null;
  const { healthSleep, healthHeartRate } = getSettings(db);
  if ((!healthSleep && !healthHeartRate) || !sleepOfferOpen(db, workoutId)) return null;
  const quietly = async <T>(read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      console.warn(`GymHound: ${store.name} could not be read.`, error);
      return null;
    }
  };
  const night = lastNightWindow(now);
  const [sleep, heart] = await Promise.all([
    healthSleep ? quietly(() => store.readSleep(night)) : null,
    healthHeartRate ? quietly(() => store.readRestingHeartRate({ start: now - (RESTING_HR_BASELINE_DAYS + 2) * DAY, end: now })) : null,
  ]);
  return roughSleepReason({
    sleepMinutes: sleep === null ? null : sleepMinutes(sleep, night),
    heartRateRise: heart === null ? null : restingHeartRateRise(heart, now),
  });
}

/** Mark it: flags every unflagged exercise Rough sleep and records the offer. Throws outside the active workout. */
export function acceptSleepOffer(db: Db, workoutId: string): void {
  const flagged = flagUnmarkedRoughSleep(db, workoutId);
  bumpData();
  if (flagged > 0) announce('Marked Rough sleep.');
}

/** The offer's ×: it never appears again for this workout. */
export function dismissSleepOffer(db: Db, workoutId: string): void {
  setSleepOfferShown(db, workoutId);
  bumpData();
}

// ---- body weight (R311) ----

/** A body weight from Health newer than the app's latest, in the display unit, or null. Never throws. */
export async function healthBodyweightOffer(
  db: Db,
  store: HealthStore | null,
): Promise<{ at: number; weight: number; unit: WeightUnit } | null> {
  if (store === null) return null;
  const { healthBodyweight, unit } = getSettings(db);
  if (!healthBodyweight) return null;
  try {
    return newerHealthBodyweight(latestBodyweightAt(db), await store.readLatestBodyweight(), unit);
  } catch (error) {
    console.warn(`GymHound: ${store.name} could not be read.`, error);
    return null;
  }
}
