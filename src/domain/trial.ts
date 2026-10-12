import { daysBetween, toLocalDate } from './dates';
import { dateFormat } from './intl';

/**
 * The full access trial (§18.19, R480–R494): seven days of everything Pro grants, starting at the next finished workout
 * once per install (in the database, so a restore keeps it). It is an in-app unlock, not a store trial: nothing is
 * bought, charged or renewed when it ends (R488). These are the pure rules; `trialRepo` stores the start and
 * `withTrial` turns it into Pro.
 */

/** How long the trial lasts, in calendar days. */
export const TRIAL_DAYS = 7;

export type TrialPhase = 'not_started' | 'active' | 'ended';

export type TrialStatus = {
  phase: TrialPhase;
  /** When it started (epoch ms), or null before it has. */
  startedAt: number | null;
  /** When it ends (epoch ms), or null before it has started. */
  endsAt: number | null;
  /**
   * Calendar days from today to the day it ends, while it runs: 7 on the day it starts, 1 the day before it ends, 0 on
   * the last day (R482). Null when it isn't running.
   */
  daysLeft: number | null;
};

/** Whether a finish should start the trial: only while it has never started (R480, R481). */
export function shouldStartTrial(startedAt: number | null): boolean {
  return startedAt === null;
}

/**
 * When a trial that started at `startedAt` ends: the same clock time seven calendar days later, as a person reads it
 * (R482). Across a change to or from summer time that is 167 or 169 hours, not 168.
 */
export function trialEndsAt(startedAt: number): number {
  const d = new Date(startedAt);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + TRIAL_DAYS, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

/** The start that makes a trial end at `endsAt`: the same clock time seven calendar days earlier. For the developer controls. */
export function trialStartFor(endsAt: number): number {
  const d = new Date(endsAt);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - TRIAL_DAYS, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).getTime();
}

/**
 * The trial at `now`. A clock set back before the start reads as the first day, never as earlier or longer (R484): the
 * trial is always measured from its stored start, so moving the clock can't push its end past seven days from it.
 */
export function trialStatus(startedAt: number | null, now: number): TrialStatus {
  if (startedAt === null || !Number.isFinite(startedAt)) return { phase: 'not_started', startedAt: null, endsAt: null, daysLeft: null };
  const endsAt = trialEndsAt(startedAt);
  const at = Math.max(now, startedAt);
  if (at >= endsAt) return { phase: 'ended', startedAt, endsAt, daysLeft: null };
  return { phase: 'active', startedAt, endsAt, daysLeft: Math.max(0, daysBetween(toLocalDate(at), toLocalDate(endsAt))) };
}

/** Whether the trial grants Pro at `now` (R483). */
export function trialActive(startedAt: number | null, now: number): boolean {
  return trialStatus(startedAt, now).phase === 'active';
}

/** "1 day left", "5 days left". */
function daysLeftText(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

/** Settings → GymHound Pro's line (R485): null before the trial starts. */
export function trialSettingsLine(status: TrialStatus): string | null {
  if (status.phase === 'not_started') return null;
  if (status.phase === 'ended') return 'Trial ended';
  return status.daysLeft === 0 ? 'Last day of your trial' : `Full access trial · ${daysLeftText(status.daysLeft ?? 0)}`;
}

/** The small chip in Fuel's header while the trial runs (R486); null otherwise. */
export function trialChipText(status: TrialStatus): string | null {
  if (status.phase !== 'active') return null;
  return status.daysLeft === 0 ? 'Trial · last day' : `Trial · ${daysLeftText(status.daysLeft ?? 0)}`;
}

/** What VoiceOver reads for the chip: the words in full, not "Trial dot". */
export function trialChipSpoken(status: TrialStatus): string | null {
  if (status.phase !== 'active') return null;
  return status.daysLeft === 0 ? 'Last day of your full access trial' : `Full access trial, ${daysLeftText(status.daysLeft ?? 0)}`;
}

/** The line at the top of the Pro pitch (R489): what the trial means for this person now. */
export function trialPitchLine(status: TrialStatus): string {
  if (status.phase === 'not_started') return 'Your next finished workout starts a 7-day full access trial. Nothing to set up.';
  if (status.phase === 'ended') return 'Your full access trial has ended.';
  return status.daysLeft === 0 ? 'Last day of your full access trial' : `${daysLeftText(status.daysLeft ?? 0)} in your full access trial`;
}

/** What happens when the trial ends, in the words of a Pro lapse (§9): nothing is deleted. */
const AT_THE_END = 'Then Fuel, the Pro programs, your own routines and saved workouts lock. Everything you made stays.';

/**
 * Train's one muted line on the trial's last two days (R487): "ends tomorrow" the day before, "ends today at 6:40 PM"
 * on the last day. Null on every other day, and when the trial isn't running.
 */
export function trialEndingLine(status: TrialStatus, locale: string): string | null {
  if (status.phase !== 'active' || status.daysLeft === null || status.endsAt === null) return null;
  if (status.daysLeft === 1) return `Your full access trial ends tomorrow. ${AT_THE_END}`;
  if (status.daysLeft === 0) {
    const time = dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(status.endsAt);
    return `Your full access trial ends today at ${time}. ${AT_THE_END}`;
  }
  return null;
}

/** The finish summary's line on the workout that started the trial (R486). */
export const TRIAL_STARTED_LINE = 'Your 7-day full access trial starts now: every program, your own routines, saved workouts and Fuel. Nothing to set up.';

/** Train's one-time line after the trial has ended (R490). */
export const TRIAL_ENDED_LINE = 'Your full access trial has ended. Your routines, saved workouts and food log are kept. GymHound Pro brings them back.';

/** The developer controls' presets (R492). */
export type TrialPreset = 'free' | 'not_started' | 'first_day' | 'last_day' | 'ended';

/**
 * The stored start for the Developer control's **Free** (R551): a trial used up long ago (the epoch), so the phone
 * acts as free from now on and no finished workout starts a trial. Round 10 tested free with "Off", which only meant
 * "not started", and the next finish started the trial.
 */
export const FREE_PRESET_START = 0;

/**
 * The stored start that puts the trial in `preset` at `now`: null (not started); now (the first day, 7 days left); a
 * start that ends it later today, halfway to midnight and at least a minute away (the last day); or eight days ago
 * (ended).
 */
export function trialStartForPreset(preset: TrialPreset, now: number): number | null {
  if (preset === 'free') return FREE_PRESET_START;
  if (preset === 'not_started') return null;
  if (preset === 'first_day') return now;
  if (preset === 'ended') {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (TRIAL_DAYS + 1), d.getHours(), d.getMinutes()).getTime();
  }
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  const endsAt = now + Math.max(60_000, Math.floor((midnight - now) / 2));
  return trialStartFor(Math.min(endsAt, midnight - 1));
}
