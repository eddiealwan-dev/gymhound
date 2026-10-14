/**
 * When to ask for a rating (§18.28, R585–R588): on the finish summary of a good day only. The store's own prompt is
 * used, with no question of ours first, and iOS shows it at most three times a year whatever the app asks.
 */

/** Finished workouts before the first ask (R585). */
export const REVIEW_MIN_WORKOUTS = 3;
/** Days between asks (R585). */
export const REVIEW_GAP_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewInput = {
  /** Finished workouts, this one included. */
  finishedWorkouts: number;
  /** This workout set a personal record. */
  hadRecord: boolean;
  /** The rule raised an exercise's next weight. */
  anyRaised: boolean;
  /** An exercise in this workout was marked Something off. */
  anyMarked: boolean;
  /** When the prompt was last asked for (epoch ms), or null. */
  lastAskedAt: number | null;
  now: number;
  /** A tester build (R592) never asks: its testers aren't store reviewers. */
  tester: boolean;
};

export type ReviewDecision = { ask: boolean; reason: string };

/** Whether to ask after this finish, and why, in words for Settings → Developer (R587). */
export function reviewDecision(i: ReviewInput): ReviewDecision {
  if (i.tester) return { ask: false, reason: 'A tester build never asks.' };
  if (i.finishedWorkouts < REVIEW_MIN_WORKOUTS) {
    return { ask: false, reason: `${i.finishedWorkouts} finished ${i.finishedWorkouts === 1 ? 'workout' : 'workouts'}. It asks from ${REVIEW_MIN_WORKOUTS}.` };
  }
  if (i.anyMarked) return { ask: false, reason: 'Something off was marked, so not today.' };
  if (!i.hadRecord && !i.anyRaised) return { ask: false, reason: 'No record, and no weight went up.' };
  if (i.lastAskedAt !== null) {
    const days = Math.floor((i.now - i.lastAskedAt) / DAY_MS);
    if (days < REVIEW_GAP_DAYS) return { ask: false, reason: `Asked ${days} ${days === 1 ? 'day' : 'days'} ago. It asks again after ${REVIEW_GAP_DAYS}.` };
  }
  return { ask: true, reason: 'It asked for a rating.' };
}
