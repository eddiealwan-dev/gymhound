import type { DistanceUnit, MeasurementSystem, WeightUnit } from './types';

export const LB_TO_KG = 0.45359237;

/** Two weights are the same when they differ by less than this many kg. */
const SAME_WEIGHT_TOLERANCE_KG = 0.01;

export function toKg(v: number, u: WeightUnit): number {
  return u === 'lb' ? v * LB_TO_KG : v;
}

export function convertWeight(v: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return v;
  const kg = toKg(v, from);
  return to === 'kg' ? kg : kg / LB_TO_KG;
}

const METRES: Record<DistanceUnit, number> = { m: 1, km: 1000, mi: 1609.344 };

export function convertDistance(v: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return v;
  return (v * METRES[from]) / METRES[to];
}

export function sameWeight(
  a: { value: number; unit: WeightUnit },
  b: { value: number; unit: WeightUnit },
): boolean {
  return Math.abs(toKg(a.value, a.unit) - toKg(b.value, b.unit)) < SAME_WEIGHT_TOLERANCE_KG;
}

/** Rounds to 2 decimals and drops trailing zeros: 82.5 -> "82.5 kg", 80 -> "80 kg". */
export function formatWeight(v: number, u: WeightUnit): string {
  return `${Number(v.toFixed(2))} ${u}`;
}

export function defaultUnitFor(m: MeasurementSystem): WeightUnit {
  return m === 'us' ? 'lb' : 'kg';
}

/** Converts a progression increment by the gym convention, not the exact factor: kg = lb / 2, lb = kg x 2. */
export function convertIncrement(v: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return v;
  return to === 'kg' ? v / 2 : v * 2;
}

/** Rounds to the nearest 0.5. */
export function roundToHalf(v: number): number {
  return Math.round(v * 2) / 2;
}
