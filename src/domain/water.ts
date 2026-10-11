import { parseDecimal } from './input';
import type { WaterUnit, WeightUnit } from './types';

// Water (R150): stored in ml whatever the unit shown; shown and typed in fl oz for lb users, ml for kg users.

/** US fluid ounces in a millilitre's terms. */
export const ML_PER_FL_OZ = 29.5735;

/** fl oz for a lb user, ml for a kg user (R150). */
export function waterUnitFor(unit: WeightUnit): WaterUnit {
  return unit === 'lb' ? 'fl_oz' : 'ml';
}

/** The unit as it is written after a number: "ml" or "fl oz". */
export function waterUnitLabel(unit: WaterUnit): string {
  return unit === 'fl_oz' ? 'fl oz' : 'ml';
}

/** The quick adds, in the unit: 250 and 500 ml, or 8 and 16 fl oz. */
export function quickAmounts(unit: WaterUnit): number[] {
  return unit === 'fl_oz' ? [8, 16] : [250, 500];
}

/** An amount in the unit, in ml. */
export function toMl(amount: number, unit: WaterUnit): number {
  return unit === 'fl_oz' ? amount * ML_PER_FL_OZ : amount;
}

/** An amount in ml, in the unit. */
function fromMl(ml: number, unit: WaterUnit): number {
  return unit === 'fl_oz' ? ml / ML_PER_FL_OZ : ml;
}

/**
 * An amount in ml as it is shown: "1,250 ml" or "40 fl oz", whole, with the locale's separators. Under 1 fl oz it keeps
 * one decimal ("0.5 fl oz"), so a small entry never reads as nothing.
 */
export function formatWater(ml: number, unit: WaterUnit, locale?: string): string {
  const value = fromMl(ml, unit);
  const digits = unit === 'fl_oz' && value > 0 && value < 0.95 ? 1 : 0;
  const n = Number(value.toFixed(digits)) || 0;
  return `${n.toLocaleString(locale, { maximumFractionDigits: digits })} ${waterUnitLabel(unit)}`;
}

/** An amount in ml as the number to edit in a field, in the unit: "2000", "64", "8.5". */
export function waterAmountText(ml: number, unit: WaterUnit): string {
  return `${Number(fromMl(ml, unit).toFixed(unit === 'fl_oz' ? 1 : 0))}`;
}

function parseInRange(text: string, unit: WaterUnit, ml: [number, number], flOz: [number, number]): number | null {
  const n = parseDecimal(text);
  if (n === null) return null;
  const [min, max] = unit === 'fl_oz' ? flOz : ml;
  if (n < min || n > max) return null;
  return toMl(n, unit);
}

/** A typed amount, in ml: 1–3,000 ml or 0.1–100 fl oz. Anything else is null ("Check this number"). */
export function parseWaterAmount(text: string, unit: WaterUnit): number | null {
  return parseInRange(text, unit, [1, 3000], [0.1, 100]);
}

/** A typed daily goal, in ml: 250–10,000 ml or 8–340 fl oz. Anything else is null ("Check this number"). */
export function parseWaterGoal(text: string, unit: WaterUnit): number | null {
  return parseInRange(text, unit, [250, 10000], [8, 340]);
}
