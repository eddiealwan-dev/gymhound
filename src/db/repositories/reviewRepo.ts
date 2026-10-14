import { and, eq, isNotNull } from 'drizzle-orm';
import { reviewDecision, type ReviewDecision } from '../../domain/reviewPrompt';
import { workoutExercises } from '../schema';
import type { Db } from '../types';
import { finishedWorkoutCount } from './onboardingRepo';
import { getSettings, setSetting } from './settingsRepo';
import { getFinishSummary } from './workoutViewsRepo';

/**
 * The rating rules for a finished workout (R585), read from the database: finished workouts, the workout's records,
 * whether the rule raised any exercise, and whether any exercise was marked Something off.
 */
export function reviewDecisionFor(db: Db, workoutId: string, now: number, tester: boolean): ReviewDecision {
  const settings = getSettings(db);
  const summary = getFinishSummary(db, workoutId, settings.unit);
  const marked = db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), isNotNull(workoutExercises.mark)))
    .get();
  return reviewDecision({
    finishedWorkouts: finishedWorkoutCount(db),
    hadRecord: summary.prs.length > 0,
    anyRaised: summary.next.some((n) => n.outcome === 'raised'),
    anyMarked: marked !== undefined,
    lastAskedAt: settings.reviewAskedAt,
    now,
    tester,
  });
}

/**
 * Runs the rating rules after a finish (R586, R587): keeps the reason for Settings → Developer, and when they say ask,
 * keeps the time and returns true so the caller asks the store.
 */
export function checkReviewAfterFinish(db: Db, workoutId: string, now: number, tester: boolean): boolean {
  const decision = reviewDecisionFor(db, workoutId, now, tester);
  setSetting(db, 'reviewLastCheck', decision.reason);
  if (decision.ask) setSetting(db, 'reviewAskedAt', now);
  return decision.ask;
}
