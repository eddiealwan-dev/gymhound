import type { Outcome } from './progression';
import { sameLoggedWeight } from './prs';
import type { WeightUnit } from './types';

/** One exercise's finished session, as the stall rule reads it (spec 7.5). */
export type StallInput = { hasRule: boolean; outcome: Outcome | null; workingWeight: number | null; workingUnit: WeightUnit | null };

/**
 * Stall labels (spec 7.5): one flag per session, in the order given (time order). A session is considered only with
 * a rule and an outcome of `raised` or `held`; the rest (marked, no sets, no rule) are skipped and neither count nor
 * break a run. A considered session is a stall when it and the two considered before it are all `held` at the same
 * working weight (R125, so 60 kg and 132.3 lb match); every later session continuing that run is one too. A raise, or
 * a held session at another weight or with none, ends the run.
 */
export function stallFlags(points: readonly StallInput[]): boolean[] {
  const flags: boolean[] = [];
  let run = 0;
  let last: { value: number; unit: WeightUnit } | null = null;
  for (const p of points) {
    const considered = p.hasRule && (p.outcome === 'raised' || p.outcome === 'held');
    if (!considered) {
      flags.push(false);
      continue;
    }
    const weight = p.workingWeight !== null && p.workingUnit !== null ? { value: p.workingWeight, unit: p.workingUnit } : null;
    if (p.outcome !== 'held' || weight === null) {
      run = 0;
      last = null;
    } else {
      run = last !== null && sameLoggedWeight(last, weight) ? run + 1 : 1;
      last = weight;
    }
    flags.push(run >= 3);
  }
  return flags;
}
