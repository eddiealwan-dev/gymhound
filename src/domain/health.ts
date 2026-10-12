import { fromLocalDate, shiftDay, toLocalDate } from './dates';
import { convertWeight } from './units';
import type { WeightUnit } from './types';

/**
 * Pure rules for Apple Health and Health Connect (§17.1, R206, R210, R211). No store is touched here: the adapters in
 * `src/platform/health` read and write, the repositories and state decide when, and these functions decide what.
 */

/** Under this much asleep time last night, the Rough sleep offer is made (§17.1). */
export const SHORT_SLEEP_MS = 6 * 60 * 60 * 1000;
/** A newest resting heart rate at least this many bpm above the baseline makes the offer (§17.1). */
export const RHR_RISE_BPM = 10;
/** The baseline is the mean over this many local days before the workout's date. */
export const RHR_BASELINE_DAYS = 28;
/** With fewer days of resting heart rate than this in the baseline, there is no heart-rate offer. */
export const RHR_MIN_DAYS = 7;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** A workout written to Health ends at least this long after it starts (open question 11). */
const MIN_HEALTH_WORKOUT_MS = 60_000;

export type Interval = { start: number; end: number };
/** A reading at an instant. The single definition: `src/platform/health/index.ts` re-exports it for `HealthStore`. */
export type TimedValue = { at: number; value: number };
/** What GymHound writes to Health for one finished workout. The single definition, re-exported by `src/platform/health`. */
export type HealthWorkout = { id: string; name: string; startedAt: number; finishedAt: number };

/**
 * "Last night" for the Rough sleep offer (R210): from 18:00 local on the day before `localDate` (the workout's date)
 * to the workout's start. Built from local calendar fields, so a DST change night still starts at 18:00 local.
 */
export function sleepWindow(localDate: string, startedAt: number): Interval {
  const day = fromLocalDate(localDate);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 18).getTime();
  return { start, end: Math.max(start, startedAt) };
}

/**
 * Asleep time inside `window`: the union of the intervals (so overlapping sources — a watch and a phone — count
 * once), each clipped to the window. Null when nothing reaches into the window: no sleep tracked is not zero sleep.
 */
export function asleepMs(intervals: readonly Interval[], window: Interval): number | null {
  const clipped = intervals
    .map((i) => ({ start: Math.max(i.start, window.start), end: Math.min(i.end, window.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  if (clipped.length === 0) return null;
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const i of clipped) {
    if (i.start > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else if (i.end > curEnd) {
      curEnd = i.end;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

/** The newest resting heart rate in the 24 h up to the workout's start, or null when there is none. */
export function latestRestingHr(samples: readonly TimedValue[], startedAt: number): number | null {
  let newest: TimedValue | null = null;
  for (const s of samples) {
    if (s.at > startedAt || s.at <= startedAt - DAY_MS) continue;
    if (newest === null || s.at > newest.at) newest = s;
  }
  return newest === null ? null : newest.value;
}

/**
 * The usual resting heart rate: the mean of each local day's mean over the 28 local days before `localDate` (the
 * workout's own day left out). Null when fewer than 7 of those days have a reading.
 */
export function restingHrBaseline(samples: readonly TimedValue[], localDate: string): number | null {
  const first = shiftDay(localDate, -RHR_BASELINE_DAYS);
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const s of samples) {
    const d = toLocalDate(s.at);
    if (d < first || d >= localDate) continue;
    const acc = byDay.get(d) ?? { sum: 0, n: 0 };
    acc.sum += s.value;
    acc.n += 1;
    byDay.set(d, acc);
  }
  if (byDay.size < RHR_MIN_DAYS) return null;
  let total = 0;
  for (const { sum, n } of byDay.values()) total += sum / n;
  return total / byDay.size;
}

export type SleepOffer = { reason: 'short_sleep'; asleepMs: number } | { reason: 'heart_rate'; riseBpm: number };

/**
 * One Rough sleep offer or none (§17.1, R210): short sleep (under 6 h) wins when both hold; otherwise a newest resting
 * heart rate 10 bpm or more above the baseline. Null inputs mean "no data", which never makes an offer; 0 asleep is
 * also no data (never "You slept 0 min").
 */
export function roughSleepOffer(input: { asleepMs: number | null; latestBpm: number | null; baselineBpm: number | null }): SleepOffer | null {
  if (input.asleepMs !== null && input.asleepMs > 0 && input.asleepMs < SHORT_SLEEP_MS) return { reason: 'short_sleep', asleepMs: input.asleepMs };
  if (input.latestBpm !== null && input.baselineBpm !== null) {
    const rise = input.latestBpm - input.baselineBpm;
    if (rise >= RHR_RISE_BPM) return { reason: 'heart_rate', riseBpm: Math.round(rise) };
  }
  return null;
}

/** The banner's line. Sleep is in whole minutes counted down, so time under 6 h never reads "6 h". */
export function sleepOfferLine(offer: SleepOffer): string {
  if (offer.reason === 'heart_rate') return `Your resting heart rate is ${offer.riseBpm} beats a minute above your usual. Mark this session Rough sleep?`;
  const totalMin = Math.floor(offer.asleepMs / MINUTE_MS);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const slept = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return `You slept ${slept} last night. Mark this session Rough sleep?`;
}

/**
 * The body weight Stats offers to log (R211): a Health reading (kg) taken today and strictly newer than the app's
 * newest bodyweight entry, in the display unit to 0.1, keeping the reading's time. Otherwise null.
 */
export function healthWeightOffer(input: {
  reading: TimedValue | null;
  latestAppAt: number | null;
  today: string;
  unit: WeightUnit;
}): { value: number; unit: WeightUnit; at: number } | null {
  const { reading, latestAppAt, today, unit } = input;
  if (reading === null || !(reading.value > 0)) return null;
  if (toLocalDate(reading.at) !== today) return null;
  if (latestAppAt !== null && reading.at <= latestAppAt) return null;
  return { value: Math.round(convertWeight(reading.value, 'kg', unit) * 10) / 10, unit, at: reading.at };
}

/** "Apple Health: 182.4 lb at 7:02 AM." / "Health Connect: 82.7 kg at 07:02." — the time laid out for the locale. */
export function healthWeightLine(store: 'apple' | 'health_connect', offer: { value: number; unit: WeightUnit; at: number }, locale: string): string {
  const name = store === 'apple' ? 'Apple Health' : 'Health Connect';
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(offer.at);
  return `${name}: ${Math.round(offer.value * 10) / 10} ${offer.unit} at ${time}.`;
}

/** The record written for a finished workout (R206): its id is the sync key; it ends at least 60 s after it starts. */
export function toHealthWorkout(w: { id: string; name: string; startedAt: number; finishedAt: number }): HealthWorkout {
  return { id: w.id, name: w.name, startedAt: w.startedAt, finishedAt: Math.max(w.finishedAt, w.startedAt + MIN_HEALTH_WORKOUT_MS) };
}
