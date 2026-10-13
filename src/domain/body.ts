import { parseDecimal } from './input';
import type { LengthUnit, MeasurementKind, MeasurementUnit, WeightUnit } from './types';
import { convertWeight } from './units';

/** Bodyweight and the seven measurements (R113: arms and thighs are one value each). */
export type BodyKind = 'bodyweight' | MeasurementKind;

export const BODY_KINDS: readonly BodyKind[] = ['bodyweight', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck', 'body_fat'];

export const BODY_LABELS: Record<BodyKind, string> = {
  bodyweight: 'Bodyweight',
  waist: 'Waist',
  chest: 'Chest',
  hips: 'Hips',
  arms: 'Arms',
  thighs: 'Thighs',
  neck: 'Neck',
  body_fat: 'Body fat',
};

export type BodyUnit = WeightUnit | MeasurementUnit;

/** One logged value. It keeps the unit it was logged in (R112). */
export type BodyEntry = { id: string; kind: BodyKind; localDate: string; measuredAt: number; value: number; unit: BodyUnit };

/** True for the eight kinds; a route parameter can be any string. */
export function isBodyKind(s: string): s is BodyKind {
  return (BODY_KINDS as readonly string[]).includes(s);
}

/** Lengths follow the weight unit: lb → in, kg → cm (R112). */
export function lengthUnitFor(unit: WeightUnit): LengthUnit {
  return unit === 'lb' ? 'in' : 'cm';
}

/** The unit a kind is logged and shown in for a user whose weight unit is `displayUnit`. */
export function bodyUnit(kind: BodyKind, displayUnit: WeightUnit): BodyUnit {
  if (kind === 'bodyweight') return displayUnit;
  if (kind === 'body_fat') return '%';
  return lengthUnitFor(displayUnit);
}

type Dimension = 'weight' | 'length' | 'percent';

const DIMENSION: Record<BodyUnit, Dimension> = { lb: 'weight', kg: 'weight', in: 'length', cm: 'length', '%': 'percent' };

function kindDimension(kind: BodyKind): Dimension {
  if (kind === 'bodyweight') return 'weight';
  if (kind === 'body_fat') return 'percent';
  return 'length';
}

/** True when `unit` is one a value of `kind` can be logged in (lb or kg for bodyweight, in or cm for a length, % for body fat). */
export function unitFitsKind(kind: BodyKind, unit: BodyUnit): boolean {
  return DIMENSION[unit] === kindDimension(kind);
}

const CM_PER_IN = 2.54;

/** lb ↔ kg by the exact factor (§7.1), in ↔ cm by 2.54, % unchanged. Throws across dimensions (a weight is not a length). */
export function convertBody(value: number, from: BodyUnit, to: BodyUnit): number {
  if (from === to) return value;
  if (DIMENSION[from] !== DIMENSION[to]) throw new Error(`Can't convert ${from} to ${to}`);
  if (from === 'in') return value * CM_PER_IN;
  if (from === 'cm') return value / CM_PER_IN;
  return convertWeight(value, from as WeightUnit, to as WeightUnit);
}

/** R117: outside these the field shows "Check this number". Inclusive. */
const BOUNDS: Record<BodyUnit, [number, number]> = {
  lb: [20, 1000],
  kg: [10, 450],
  in: [5, 100],
  cm: [12, 250],
  '%': [2, 75],
};

/** Parses a typed value for `kind` in `unit`: a comma or a dot as the decimal point, within the R117 bounds. */
export function parseBodyValue(kind: BodyKind, text: string, unit: BodyUnit): { valid: boolean; value: number | null } {
  const n = parseDecimal(text);
  if (n === null || !unitFitsKind(kind, unit)) return { valid: false, value: null };
  const [min, max] = BOUNDS[unit];
  return n >= min && n <= max ? { valid: true, value: n } : { valid: false, value: null };
}

/** One decimal at most: "182.5 lb", "34 in", "86.4 cm", "18.5%". */
export function formatBodyValue(value: number, unit: BodyUnit): string {
  const n = Number(value.toFixed(1));
  return unit === '%' ? `${n}%` : `${n} ${unit}`;
}

/** Each day's latest entry, converted to `to`, oldest day first (R115). Unrounded; format for display. */
export function dailySeries(entries: readonly BodyEntry[], to: BodyUnit): { localDate: string; value: number }[] {
  const latest = new Map<string, BodyEntry>();
  for (const e of entries) {
    const kept = latest.get(e.localDate);
    if (!kept || e.measuredAt > kept.measuredAt) latest.set(e.localDate, e);
  }
  return [...latest.values()]
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))
    .map((e) => ({ localDate: e.localDate, value: convertBody(e.value, e.unit, to) }));
}
