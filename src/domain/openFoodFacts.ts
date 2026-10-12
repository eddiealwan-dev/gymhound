/**
 * Reading Open Food Facts (§18.22, R546): the open food database GymHound asks for packaged foods by barcode or by
 * name. Its data is crowd-sourced and uneven, so nothing is trusted: a product becomes a food only with a name and
 * calories that make sense, and every number is checked. Data from Open Food Facts is under the Open Database License;
 * the add screen names it as the source.
 */

/** A packaged food as Open Food Facts describes it, per serving, ready to keep on the phone. */
export type OnlineFood = {
  barcode: string;
  name: string;
  servingLabel: string;
  /** Null when the serving is a volume (ml), or unknown. */
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** The longest food name GymHound keeps, as for your own foods. */
const MAX_NAME = 60;
/** kJ in one kcal. */
const KJ_PER_KCAL = 4.184;

/** A finite number from a number or a numeric string; null otherwise. */
function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The digits of a scanned or typed barcode, or null when it isn't one a food carries: EAN-8, UPC-A (12), EAN-13 or
 * GTIN-14, spaces and dashes allowed.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^(\d{8}|\d{12,14})$/.test(digits) ? digits : null;
}

/**
 * The ways one barcode is written: as scanned, and UPC-A with or without the leading 0 that makes it an EAN-13 (iPhones
 * read a UPC-A as the EAN-13 with that 0; Open Food Facts may list either).
 */
export function barcodeVariants(code: string): string[] {
  const out = [code];
  if (code.length === 12) out.push(`0${code}`);
  if (code.length === 13 && code.startsWith('0')) out.push(code.slice(1));
  return out;
}

/** Calories per 100 g (or 100 ml), from kcal or else kJ; null when neither is given. */
function kcalPer100(n: Record<string, unknown>): number | null {
  const kcal = num(n['energy-kcal_100g']);
  if (kcal !== null) return kcal;
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  return kj === null ? null : kj / KJ_PER_KCAL;
}

function kcalPerServing(n: Record<string, unknown>): number | null {
  const kcal = num(n['energy-kcal_serving']);
  if (kcal !== null) return kcal;
  const kj = num(n['energy-kj_serving']) ?? num(n.energy_serving);
  return kj === null ? null : kj / KJ_PER_KCAL;
}

/** "Chobani, Plain Greek Yogurt": the first brand before the product's name, unless the name already starts with it. */
function foodName(product: Record<string, unknown>): string {
  const name = text(product.product_name) || text(product.product_name_en);
  if (name === '') return '';
  const brand = text(product.brands).split(',')[0]?.trim() ?? '';
  const full = brand !== '' && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand}, ${name}` : name;
  const chars = [...full];
  return chars.length <= MAX_NAME ? full : `${chars.slice(0, MAX_NAME - 1).join('').trimEnd()}…`;
}

/**
 * A product from Open Food Facts as a food per serving, or null when it can't be one: no name, no calories, or numbers
 * that can't be right (more than 900 kcal or 100 g of a macro in 100 g). The serving is the product's own when it gives
 * one in g or ml (its label as written, "1 bar (40 g)"), else 100 g. `code` is used when the product has none.
 */
export function foodFromProduct(product: unknown, code: string): OnlineFood | null {
  if (typeof product !== 'object' || product === null) return null;
  const p = product as Record<string, unknown>;
  const n = (typeof p.nutriments === 'object' && p.nutriments !== null ? p.nutriments : {}) as Record<string, unknown>;
  const name = foodName(p);
  if (name === '') return null;
  const barcode = normalizeBarcode(text(p.code)) ?? normalizeBarcode(code);
  if (barcode === null) return null;

  const quantity = num(p.serving_quantity);
  const unit = text(p.serving_quantity_unit).toLowerCase() || 'g';
  const hasServing = quantity !== null && quantity > 0 && quantity <= 2000 && (unit === 'g' || unit === 'ml');
  const servingLabel = hasServing ? text(p.serving_size) || `${quantity} ${unit}` : '100 g';
  const amount = hasServing ? quantity : 100;
  const servingGrams = hasServing && unit === 'ml' ? null : amount;

  const per100 = kcalPer100(n);
  let kcal: number;
  let protein: number;
  let carbs: number;
  let fat: number;
  if (per100 !== null) {
    const macros = [num(n.proteins_100g) ?? 0, num(n.carbohydrates_100g) ?? 0, num(n.fat_100g) ?? 0];
    if (per100 < 0 || per100 > 900 || macros.some((m) => m < 0 || m > 100)) return null;
    const scale = amount / 100;
    [kcal, protein, carbs, fat] = [per100 * scale, macros[0] * scale, macros[1] * scale, macros[2] * scale];
  } else {
    // Only per serving: usable when the serving itself is known.
    const serving = kcalPerServing(n);
    if (serving === null || !hasServing) return null;
    const macros = [num(n.proteins_serving) ?? 0, num(n.carbohydrates_serving) ?? 0, num(n.fat_serving) ?? 0];
    if (serving < 0 || serving > 9 * amount || macros.some((m) => m < 0 || m > amount)) return null;
    [kcal, protein, carbs, fat] = [serving, ...macros];
  }
  return { barcode, name, servingLabel, servingGrams, kcal: Math.round(kcal), proteinG: round1(protein), carbsG: round1(carbs), fatG: round1(fat) };
}

/** The foods in a search's products, each barcode once, leaving out any that can't be a food. */
export function foodsFromSearch(body: unknown): OnlineFood[] {
  const products = typeof body === 'object' && body !== null ? (body as { products?: unknown }).products : undefined;
  if (!Array.isArray(products)) return [];
  const seen = new Set<string>();
  const out: OnlineFood[] = [];
  for (const product of products) {
    const food = foodFromProduct(product, '');
    if (food === null || seen.has(food.barcode)) continue;
    seen.add(food.barcode);
    out.push(food);
  }
  return out;
}

/** Open Food Facts' country site for a phone's region ("US" → "us"), so a search finds what is sold there; else world. */
export function openFoodFactsCountry(region: string | null): string {
  if (region === null || !/^[A-Za-z]{2}$/.test(region)) return 'world';
  const cc = region.toLowerCase();
  return cc === 'gb' ? 'uk' : cc;
}
