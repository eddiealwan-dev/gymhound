import type { ReactElement } from 'react';
import type { FinishSummary } from '../../db/repositories/workoutViewsRepo';

/**
 * The finish summary's personal bests (R105), after the next-time lines. Hidden when there are none.
 *
 * Phase 4 slot (R123): draws nothing until Task 3 fills it (Task 4 adds Share).
 */
export function FinishPrs(props: { workoutId: string; summary: FinishSummary }): ReactElement | null {
  void props;
  return null;
}
