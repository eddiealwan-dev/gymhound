import { convertWeight } from './units';
import type { WeightUnit } from './types';

/**
 * PHASE 7: the rules for Apple Health and Health Connect (spec §17.1, R307–R311). Plain data in, plain data out; the
 * stores themselves are in `src/platform/health/`.
 *
 * GymHound writes each finished workout out as one strength session, and reads three things only to offer something:
 * last night's sleep and resting heart rate (the Rough sleep offer) and body weight (the body-weight card). Health is
 * never the log, never the backup, and workouts are never read back.
 */

// ---- write-out ----

/** One finished workout as Health takes it: a strength-training session with its times and name. */
export type HealthWorkoutRecord = {
  /** GymHound's workout id: Health Connect keeps it as the client record id, Apple Health in the metadata. */
  workoutId: string;
  title: string;
  /** Epoch ms. */
  start: number;
  end: number;
};

/** The least a session can last in Health. Both stores refuse an end at or before the start. */
export const MIN_HEALTH_DURATION_MS = 1_000;

/** The record for a finished workout, or null for one that is not finished. */
export function toHealthWorkout(workout: { id: string; name: string; startedAt: number; finishedAt: number | null }): HealthWorkoutRecord | null {
  if (workout.finishedAt === null) return null;
  return {
    workoutId: workout.id,
    title: workout.name,
    start: workout.startedAt,
    end: Math.max(workout.finishedAt, workout.startedAt + MIN_HEALTH_DURATION_MS),
  };
}

export type HealthDueRow = {
  id: string;
  status: 'active' | 'finished';
  finishedAt: number | null;
  healthStatus: 'done' | 'failed' | null;
};

/** At most this many workouts are written in one pass, so a long-failed queue never holds up a start. */
export const MAX_HEALTH_WRITES_PER_PASS = 20;

/**
 * The workouts to write now, oldest first (R308): finished since the write-out was turned on (`since`; null means it
 * is off), and not yet written. A failed one is tried again; one already done never is. Workouts from before it was
 * turned on are left alone.
 */
export function healthWritesDue(rows: readonly HealthDueRow[], since: number | null): string[] {
  if (since === null) return [];
  return rows
    .filter((r) => r.status === 'finished' && r.finishedAt !== null && r.finishedAt >= since && r.healthStatus !== 'done')
    .sort((a, b) => a.finishedAt! - b.finishedAt!)
    .slice(0, MAX_HEALTH_WRITES_PER_PASS)
    .map((r) => r.id);
}

// ---- the Rough sleep offer ----

export type SleepSample = { start: number; end: number; kind: 'asleep' | 'inBed' | 'awake' };
export type Span = { start: number; end: number };

/**
 * "Last night" (R310): from 6pm the day before `now`'s day to 2pm on it, or to `now` when that is earlier. So a morning
 * session and an evening one both look at the night before, and a nap after 2pm never counts.
 */
export function lastNightWindow(now: number): Span {
  const day = new Date(now);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 18).getTime();
  const twoPm = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14).getTime();
  return { start, end: Math.min(now, twoPm) };
}

/** The total length of the spans inside `window`, overlaps counted once (a watch and the phone both log the night). */
function coveredMs(spans: readonly Span[], window: Span): number {
  const clipped = spans
    .map((s) => ({ start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let current: Span | null = null;
  for (const s of clipped) {
    if (current !== null && s.start <= current.end) {
      current.end = Math.max(current.end, s.end);
    } else {
      if (current !== null) total += current.end - current.start;
      current = { ...s };
    }
  }
  if (current !== null) total += current.end - current.start;
  return total;
}

/**
 * Minutes asleep in the window, or null when Health has nothing for it. Asleep stages count; when there are none (a
 * phone that logs only bedtime), time in bed counts instead. Awake never counts.
 */
export function sleepMinutes(samples: readonly SleepSample[], window: Span): number | null {
  const asleep = coveredMs(samples.filter((s) => s.kind === 'asleep'), window);
  if (asleep > 0) return Math.round(asleep / 60_000);
  const inBed = coveredMs(samples.filter((s) => s.kind === 'inBed'), window);
  return inBed > 0 ? Math.round(inBed / 60_000) : null;
}

export type HeartRateSample = { at: number; bpm: number };

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Today's resting heart rate is the newest reading from the last 36 hours. */
export const RESTING_HR_FRESH_MS = 36 * HOUR;
/** The average it is compared with: the 28 days before it. */
export const RESTING_HR_BASELINE_DAYS = 28;
/** With fewer readings than this in those 28 days there is no average to trust (R310). */
export const RESTING_HR_MIN_BASELINE = 7;

/**
 * How far today's resting heart rate is above its 28-day average, in bpm (negative when below), or null when there is
 * no fresh reading or too few before it.
 */
export function restingHeartRateRise(samples: readonly HeartRateSample[], now: number): number | null {
  const fresh = samples.filter((s) => s.at <= now && s.at > now - RESTING_HR_FRESH_MS).sort((a, b) => b.at - a.at)[0];
  if (fresh === undefined) return null;
  // The readings before today's (at least 12 hours before it, so a second reading the same day is not its own baseline).
  const baseline = samples.filter((s) => s.at < fresh.at - 12 * HOUR && s.at >= fresh.at - RESTING_HR_BASELINE_DAYS * DAY);
  if (baseline.length < RESTING_HR_MIN_BASELINE) return null;
  const average = baseline.reduce((sum, s) => sum + s.bpm, 0) / baseline.length;
  return fresh.bpm - average;
}

/** The thresholds the owner confirmed (§17.1). */
export const SHORT_SLEEP_MINUTES = 6 * 60;
export const RESTING_HR_RISE_BPM = 10;

export type RoughSleepReason = 'short_sleep' | 'resting_heart_rate';

/**
 * Why to offer Rough sleep, or null: last night under 6 hours, or resting heart rate 10 bpm or more above its average.
 * One offer, not two: short sleep is named when both hold. A read that is off or empty is null and offers nothing.
 */
export function roughSleepReason(read: { sleepMinutes: number | null; heartRateRise: number | null }): RoughSleepReason | null {
  if (read.sleepMinutes !== null && read.sleepMinutes < SHORT_SLEEP_MINUTES) return 'short_sleep';
  if (read.heartRateRise !== null && read.heartRateRise >= RESTING_HR_RISE_BPM) return 'resting_heart_rate';
  return null;
}

/** The offer's line, in the Short on food offer's voice (R152). */
export function roughSleepOfferLine(reason: RoughSleepReason): string {
  return reason === 'short_sleep'
    ? 'Under 6 hours of sleep last night. Mark this session Rough sleep?'
    : 'Resting heart rate is up today. Mark this session Rough sleep?';
}

// ---- body weight ----

export type HealthBodyweight = { at: number; kg: number };

/**
 * The body weight Health has that is newer than the app's latest entry (`appLatestAt`, null with none), in the
 * display unit rounded to 0.1, for the body-weight card to offer (R311). Null when Health has nothing newer.
 */
export function newerHealthBodyweight(
  appLatestAt: number | null,
  reading: HealthBodyweight | null,
  unit: WeightUnit,
): { at: number; weight: number; unit: WeightUnit } | null {
  if (reading === null || !(reading.kg > 0)) return null;
  if (appLatestAt !== null && reading.at <= appLatestAt) return null;
  return { at: reading.at, weight: Math.round(convertWeight(reading.kg, 'kg', unit) * 10) / 10, unit };
}
