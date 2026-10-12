import { numberFormat } from './intl';
import { parseDecimal } from './input';
import type { FuelTargets, Macros } from './types';

/** One serving of a food, as `foods` stores it (§6). */
export type FoodPerServing = {
  id: string;
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Bundled with the app, your own, or found online (Open Food Facts, R546) and kept on the phone. */
  source: 'bundled' | 'custom' | 'online';
};

/** Calories and grams of an entry, a day, or one serving. Unrounded; round once for display (R156). */
export type EntryTotals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

/** The most servings one entry may log (R141). */
export const MAX_SERVINGS = 50;

/** The longest name, in code points, of a quick add or one of your own foods (R143, R144). */
const MAX_NAME_LENGTH = 60;

const CHECK = 'Check this number';

/** Inclusive bounds (R143–R145). */
const KCAL: Bounds = [0, 10_000];
const GRAMS: Bounds = [0, 1_000];
const TARGET_BOUNDS = {
  kcal: [500, 10_000],
  protein: [1, 500],
  carbs: [0, 1_500],
  fat: [0, 500],
} as const satisfies Record<keyof Macros, Bounds>;

type Bounds = readonly [number, number];

/** Rounds to 2 decimals, away from binary noise (0.33 stays 0.33). */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * A typed number of servings: a comma or a dot, rounded to 2 decimals, then more than 0 and at most `MAX_SERVINGS`.
 * Null when it isn't one.
 */
export function parseServings(text: string): number | null {
  const n = parseDecimal(text);
  if (n === null) return null;
  const servings = round2(n);
  return servings > 0 && servings <= MAX_SERVINGS ? servings : null;
}

function scale(t: EntryTotals, factor: number): EntryTotals {
  return { kcal: t.kcal * factor, proteinG: t.proteinG * factor, carbsG: t.carbsG * factor, fatG: t.fatG * factor };
}

/** One serving times `servings`, unrounded. */
export function entryTotals(perServing: EntryTotals, servings: number): EntryTotals {
  return scale(perServing, servings);
}

/**
 * An entry's totals at a new number of servings, worked out from the entry's own stored totals, never the food: a food
 * edited since the entry was logged changes nothing (R142, §6).
 */
export function rescaleEntry(entry: EntryTotals & { servings: number }, servings: number): EntryTotals {
  return scale(entry, servings / entry.servings);
}

/** The day's totals, summed unrounded (R156). */
export function dayTotals(entries: readonly EntryTotals[]): EntryTotals {
  const sum: EntryTotals = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const e of entries) {
    sum.kcal += e.kcal;
    sum.proteinG += e.proteinG;
    sum.carbsG += e.carbsG;
    sum.fatG += e.fatG;
  }
  return sum;
}

/** The training targets on a training day, the rest targets otherwise (§7.11). */
export function targetsFor(targets: FuelTargets, trainingDay: boolean): Macros {
  return trainingDay ? targets.training : targets.rest;
}

/** A whole number with the locale's thousands separators: "1,840". Never "-0". */
export function fuelNumber(value: number, locale?: string): string {
  const n = Math.round(value) || 0;
  return numberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

/** Grams in words for VoiceOver, rounded as shown and singular for exactly 1: "1 gram", "86 grams". */
export function gramsSpoken(value: number, locale?: string): string {
  const n = fuelNumber(value, locale);
  return `${n} ${n === '1' ? 'gram' : 'grams'}`;
}

/** Calories in words for VoiceOver, rounded as shown and singular for exactly 1: "1 calorie", "1,840 calories". */
export function caloriesSpoken(value: number, locale?: string): string {
  const n = fuelNumber(value, locale);
  return `${n} ${n === '1' ? 'calorie' : 'calories'}`;
}

/** "{kcal} kcal · {protein} g protein", each rounded once (R156). */
export function kcalProteinText(t: { kcal: number; proteinG: number }, locale?: string): string {
  return `${fuelNumber(t.kcal, locale)} kcal · ${fuelNumber(t.proteinG, locale)} g protein`;
}

/** `kcalProteinText` as VoiceOver says it: "300 calories, 60 grams protein". */
export function kcalProteinSpoken(t: { kcal: number; proteinG: number }, locale?: string): string {
  return `${caloriesSpoken(t.kcal, locale)}, ${gramsSpoken(t.proteinG, locale)} protein`;
}

/** The servings chips (R141): what each shows, its value, and what VoiceOver says. */
export const SERVING_CHIPS = [
  { label: '½', value: 0.5, spoken: 'Half a serving' },
  { label: '1', value: 1, spoken: '1 serving' },
  { label: '1½', value: 1.5, spoken: '1 and a half servings' },
  { label: '2', value: 2, spoken: '2 servings' },
] as const;

/**
 * What is left of a target, rounded once: "1,240" or "86 g", and past the target "120 over" or "12 g over" (§8.10).
 * `over` is true only when the rounded difference is below 0.
 */
export function leftText(target: number, eaten: number, unit: '' | ' g', locale?: string): { value: string; over: boolean } {
  const left = Math.round(target - eaten) || 0;
  if (left < 0) return { value: `${fuelNumber(-left, locale)}${unit} over`, over: true };
  return { value: `${fuelNumber(left, locale)}${unit}`, over: false };
}

/** `leftText` as VoiceOver says it, rounded the same way: "1 gram", "1,240 calories", "12 grams over". */
export function leftSpoken(target: number, eaten: number, unit: 'calories' | 'grams', locale?: string): string {
  const left = Math.round(target - eaten) || 0;
  const amount = (unit === 'grams' ? gramsSpoken : caloriesSpoken)(Math.abs(left), locale);
  return left < 0 ? `${amount} over` : amount;
}

/** Servings with up to 2 decimals, no trailing zeros, in the locale's decimal mark: "1", "1.5", "0.33" ("1,5" in de-DE). */
export function servingsText(servings: number, locale?: string): string {
  return numberFormat(locale, { maximumFractionDigits: 2 }).format(round2(servings));
}

/** The four macro fields of a form, as typed. */
export type MacroInput = { kcal: string; protein: string; carbs: string; fat: string };

type Field = { ok: true; value: number | null } | { ok: false };

/** A typed number within `bounds`; blank reads as null. */
function readNumber(text: string, [min, max]: Bounds): Field {
  if (text.trim() === '') return { ok: true, value: null };
  const n = parseDecimal(text);
  return n !== null && n >= min && n <= max ? { ok: true, value: n } : { ok: false };
}

function nameTooLong(name: string): boolean {
  return [...name].length > MAX_NAME_LENGTH;
}

const NAME_TOO_LONG = `Keep the name to ${MAX_NAME_LENGTH} characters.`;

/**
 * Quick add (R143): calories 0–10,000 and grams 0–1,000, blank carbs and fat (and a blank calories or protein) as 0;
 * calories or protein must be more than 0; a blank name is "Quick add". Errors are keyed by field, with `form` for the
 * calories-or-protein rule, which shows only when every number reads.
 */
export function parseQuickAdd(
  input: MacroInput & { name: string },
):
  | { ok: true; name: string; totals: EntryTotals }
  | { ok: false; errors: Partial<Record<keyof MacroInput | 'name' | 'form', string>> } {
  const errors: Partial<Record<keyof MacroInput | 'name' | 'form', string>> = {};
  const name = input.name.trim();
  if (nameTooLong(name)) errors.name = NAME_TOO_LONG;

  const fields = {
    kcal: readNumber(input.kcal, KCAL),
    protein: readNumber(input.protein, GRAMS),
    carbs: readNumber(input.carbs, GRAMS),
    fat: readNumber(input.fat, GRAMS),
  };
  const values: Record<keyof MacroInput, number> = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  let numbersRead = true;
  for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
    const f = fields[key];
    if (f.ok) values[key] = f.value ?? 0;
    else {
      errors[key] = CHECK;
      numbersRead = false;
    }
  }
  if (numbersRead && values.kcal === 0 && values.protein === 0) errors.form = 'Enter calories or protein.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    name: name === '' ? 'Quick add' : name,
    totals: { kcal: values.kcal, proteinG: values.protein, carbsG: values.carbs, fatG: values.fat },
  };
}

/**
 * Training-day and rest-day targets (R145): calories 500–10,000 and protein 1–500 are needed ("Needed." when blank);
 * carbs 0–1,500 and fat 0–500 are optional (blank is null). Errors are keyed like "training.kcal".
 */
export function validateTargets(input: {
  training: MacroInput;
  rest: MacroInput;
}): { ok: true; targets: FuelTargets } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const read = (day: 'training' | 'rest'): Macros => {
    const out: Macros = { kcal: 0, protein: 0, carbs: null, fat: null };
    for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) {
      const f = readNumber(input[day][key], TARGET_BOUNDS[key]);
      if (!f.ok) errors[`${day}.${key}`] = CHECK;
      else if (f.value === null && (key === 'kcal' || key === 'protein')) errors[`${day}.${key}`] = 'Needed.';
      else out[key] = f.value as number;
    }
    return out;
  };
  const training = read('training');
  const rest = read('rest');
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, targets: { training, rest } };
}

/** Your own food's form, as typed. */
export type CustomFoodInput = { name: string; servingLabel: string; servingGrams: string } & MacroInput;

/**
 * One of your own foods (R144), trimmed: a name of up to 60 characters that none of `otherCustomNames` has (ignoring
 * case; pass your other foods, without this one); one serving's label; optional serving grams (more than 0, up to
 * 1,000; blank is null); calories needed (0–10,000); protein, carbs and fat 0–1,000, blank as 0.
 */
export function validateCustomFood(
  input: CustomFoodInput,
  otherCustomNames: readonly string[],
):
  | { ok: true; food: Omit<FoodPerServing, 'id' | 'source'> }
  | { ok: false; errors: Partial<Record<keyof CustomFoodInput, string>> } {
  const errors: Partial<Record<keyof CustomFoodInput, string>> = {};

  const name = input.name.trim();
  if (name === '') errors.name = 'Give the food a name.';
  else if (nameTooLong(name)) errors.name = NAME_TOO_LONG;
  else {
    const same = otherCustomNames.find((other) => other.trim().toLowerCase() === name.toLowerCase());
    if (same !== undefined) errors.name = `You already have a food called ${same.trim()}.`;
  }

  const servingLabel = input.servingLabel.trim();
  if (servingLabel === '') errors.servingLabel = 'Say what one serving is, like 1 cup.';

  const grams = readNumber(input.servingGrams, GRAMS);
  if (!grams.ok || grams.value === 0) errors.servingGrams = CHECK;

  const kcal = readNumber(input.kcal, KCAL);
  if (!kcal.ok) errors.kcal = CHECK;
  else if (kcal.value === null) errors.kcal = 'Enter the calories in one serving.';

  const macro = (key: 'protein' | 'carbs' | 'fat'): number => {
    const f = readNumber(input[key], GRAMS);
    if (!f.ok) {
      errors[key] = CHECK;
      return 0;
    }
    return f.value ?? 0;
  };
  const proteinG = macro('protein');
  const carbsG = macro('carbs');
  const fatG = macro('fat');

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    food: {
      name,
      servingLabel,
      servingGrams: grams.ok ? grams.value : null,
      kcal: kcal.ok ? (kcal.value as number) : 0,
      proteinG,
      carbsG,
      fatG,
    },
  };
}
