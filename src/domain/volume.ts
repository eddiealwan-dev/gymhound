import { numberFormat } from './intl';
import { convertWeight } from './units';
import type { LoggingType, SetType, WeightUnit } from './types';

export type VolumeSet = {
  loggingType: LoggingType;
  setType: SetType;
  done: boolean;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
};

function countsTowardVolume(set: VolumeSet): boolean {
  return (
    set.done &&
    set.setType !== 'warmup' &&
    (set.loggingType === 'weighted' || set.loggingType === 'bodyweight_plus')
  );
}

/**
 * Total volume of the sets in `displayUnit`, rounded to a whole number (spec 7.9).
 * Only done, non-warmup `weighted` and `bodyweight_plus` sets count, each as load × reps.
 * A set with no reps adds nothing; a set with no weight has a load of 0.
 */
export function totalVolume(sets: VolumeSet[], displayUnit: WeightUnit): number {
  let total = 0;
  for (const set of sets) {
    if (!countsTowardVolume(set) || set.reps === null) continue;
    const load =
      set.weight === null ? 0 : convertWeight(set.weight, set.weightUnit ?? displayUnit, displayUnit);
    total += load * set.reps;
  }
  return Math.round(total);
}

/** "12,480 lb": the number with the locale's thousands separator, a space, then the unit. */
export function formatVolume(n: number, unit: WeightUnit, locale: string): string {
  return `${numberFormat(locale).format(n)} ${unit}`;
}
