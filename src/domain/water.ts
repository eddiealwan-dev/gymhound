import { numberFormat } from './intl';
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

/** What VoiceOver hears for the unit: "fluid ounces" in full (the screen keeps "fl oz"); "ml" stays "ml". */
export function waterUnitSpoken(unit: WaterUnit, one = false): string {
  if (unit === 'ml') return 'ml';
  return one ? 'fluid ounce' : 'fluid ounces';
}

/**
 * An amount's number as shown: whole, with the locale's separators; under 1 fl oz with one decimal. A positive amount
 * that would still round to 0 is "less than" the smallest step shown (0.1 fl oz or 1 ml), never 0.
 */
function waterNumber(ml: number, unit: WaterUnit, locale?: string): { text: string; under: boolean; one: boolean } {
  const value = fromMl(ml, unit);
  const digits = unit === 'fl_oz' && value < 0.95 ? 1 : 0;
  const n = Number(value.toFixed(digits)) || 0;
  if (n === 0 && value > 0) {
    const step = unit === 'fl_oz' ? 0.1 : 1;
    return { text: numberFormat(locale, { maximumFractionDigits: 1 }).format(step), under: true, one: false };
  }
  return { text: numberFormat(locale, { maximumFractionDigits: digits }).format(n), under: false, one: n === 1 };
}

/** An amount in ml as it is shown: "1,250 ml", "40 fl oz", "0.5 fl oz", or "<0.1 fl oz" for a sip. */
export function formatWater(ml: number, unit: WaterUnit, locale?: string): string {
  const { text, under } = waterNumber(ml, unit, locale);
  return `${under ? '<' : ''}${text} ${waterUnitLabel(unit)}`;
}

/** An amount in ml as VoiceOver hears it: "1,250 ml", "8 fluid ounces", "1 fluid ounce", "less than 0.1 fluid ounces". */
export function formatWaterSpoken(ml: number, unit: WaterUnit, locale?: string): string {
  const { text, under, one } = waterNumber(ml, unit, locale);
  return `${under ? 'less than ' : ''}${text} ${waterUnitSpoken(unit, one)}`;
}

/** An amount in ml as the number to edit in a field, in the unit: "2000", "64", "8.5". */
export function waterAmountText(ml: number, unit: WaterUnit): string {
  return `${Number(fromMl(ml, unit).toFixed(unit === 'fl_oz' ? 1 : 0))}`;
}

/** A typed amount, in ml: 1–3,000 ml or 0.1–100 fl oz. Anything else is null ("Check this number"). */
export function parseWaterAmount(text: string, unit: WaterUnit): number | null {
  const n = parseDecimal(text);
  if (n === null) return null;
  const [min, max] = unit === 'fl_oz' ? [0.1, 100] : [1, 3000];
  return n < min || n > max ? null : toMl(n, unit);
}

/** The daily goal's bounds, in ml whatever the unit: 8 fl oz (236.6 ml) to 10,000 ml (338.1 fl oz). */
const GOAL_MIN_ML = 8 * ML_PER_FL_OZ;
const GOAL_MAX_ML = 10000;

/**
 * A typed daily goal, in ml: 8 fl oz to 10,000 ml, checked in ml in both units, so a goal set in one unit is accepted
 * again as the field shows it in the other (237–10,000 ml, 8–338.1 fl oz). Anything else is null ("Check this number").
 */
export function parseWaterGoal(text: string, unit: WaterUnit): number | null {
  const n = parseDecimal(text);
  if (n === null) return null;
  const ml = toMl(n, unit);
  return ml < GOAL_MIN_ML - 1e-9 || ml > GOAL_MAX_ML ? null : ml;
}
