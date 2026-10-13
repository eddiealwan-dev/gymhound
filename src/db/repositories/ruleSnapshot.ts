import type { WeightUnit } from '../../domain/types';
import type { workoutExercises } from '../schema';

/** The rule a workout exercise copies from its routine when the workout starts (spec 7.3). */
export type RuleSnapshot = { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit };

type SnapshotColumns = Pick<
  typeof workoutExercises.$inferSelect,
  'ruleSetCount' | 'ruleRepMin' | 'ruleRepMax' | 'ruleIncrement' | 'ruleIncrementUnit'
>;

/** The rule snapshot stored on a workout exercise row, or null when it has none (any snapshot column empty). */
export function ruleOf(row: SnapshotColumns): RuleSnapshot | null {
  if (
    row.ruleSetCount === null ||
    row.ruleRepMin === null ||
    row.ruleRepMax === null ||
    row.ruleIncrement === null ||
    row.ruleIncrementUnit === null
  ) {
    return null;
  }
  return {
    setCount: row.ruleSetCount,
    repMin: row.ruleRepMin,
    repMax: row.ruleRepMax,
    increment: row.ruleIncrement,
    incrementUnit: row.ruleIncrementUnit,
  };
}
