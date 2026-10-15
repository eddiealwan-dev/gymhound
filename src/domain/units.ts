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

// ft and yd are a set's distance only (R607); exact by definition.
const METRES: Record<DistanceUnit, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };

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

/** A weight is 0 when it is within the same 0.01 kg of 0. */
export function isZeroWeight(v: number, u: WeightUnit): boolean {
  return sameWeight({ value: v, unit: u }, { value: 0, unit: u });
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

/** A load as program text says it, in `unit`: pounds become kilograms to the nearest 0.5 kg (ruling R-g4). */
const loadIn = (n: number, unit: WeightUnit): string => String(unit === 'kg' ? roundToHalf(n * LB_TO_KG) : n);

/** An increment as program text says it, in `unit`, by the gym convention: 5 lb is 2.5 kg, 10 lb is 5 kg (ruling R-f3). */
const incrementIn = (n: number, unit: WeightUnit): string => String(convertIncrement(n, 'lb', unit));

/** The words after a pound figure that make it a step rather than a load: "5 lb per session", "2.5 lb jumps". */
const STEP_WORDS = /^\s(?:per session|jumps?|steps?|increments?|fails?)\b/;

/**
 * Loads and increments in program text (a slot's note, a metcon's "95/65 lb"), in the session unit (rulings R-g4,
 * R-f3). In kg, a load is converted exactly, to the nearest 0.5 kg ("empty bar to 75 lb" → "34 kg"); an increment (a
 * figure after "+", or before "per session", "jumps", "steps", "increments" or "fails") by the gym convention ("+10 lb"
 * → "+5 kg"), with the bare number it is set against ("5 lb per session, not 10" → "2.5 kg per session, not 5"). A pair
 * converted is spaced around its slash ("43 / 29.5 kg"). In a lb session the text stays exactly as written ("95/65 lb",
 * W3 review), and kilograms in the text, and everything else, always do.
 */
export function loadsInUnit(text: string, unit: WeightUnit): string {
  if (unit === 'lb') return text;
  return text.replace(
    /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s?lbs?\b([^.;]*?\bnot )?(\d+(?:\.\d+)?\b(?!\s?(?:lb|kg|%|s\b)))?/g,
    (whole: string, loads: string, not: string | undefined, against: string | undefined, at: number) => {
      const lbEnd = at + whole.length - (not ?? '').length - (against ?? '').length;
      const step = text.charAt(at - 1) === '+' || STEP_WORDS.test(text.slice(lbEnd));
      const convert = step ? incrementIn : loadIn;
      const pair = loads
        .split('/')
        .map((n) => convert(Number(n.trim()), unit))
        .join(' / ');
      const tail = not !== undefined && against !== undefined ? `${not}${convert(Number(against), unit)}` : `${not ?? ''}${against ?? ''}`;
      return `${pair} ${unit}${tail}`;
    },
  );
}
