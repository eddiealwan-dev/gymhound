/**
 * The plates you own, as Settings edits them (R107). `owned` maps a plate weight (as a string) to the pairs owned, as
 * Settings stores `platesLb` and `platesKg` and the plate maths reads them (`plates.ts`).
 */

import type { WeightUnit } from './types';

/** The sizes Settings always lists for each unit, heaviest first, whether you own any or not. */
export const STANDARD_PLATES: Record<WeightUnit, number[]> = {
  lb: [45, 35, 25, 15, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
};

/** The most pairs of one size Settings counts to. */
export const MAX_PAIRS = 20;

/** The largest plate size each unit accepts. */
const MAX_SIZE: Record<WeightUnit, number> = { lb: 100, kg: 50 };

/** Sizes compare in hundredths, so "2.50" and "2.5" are one size. */
const hundredths = (v: number): number => Math.round(v * 100);

/** Whole pairs of a stored count: a fraction of a pair (or junk) is no plate, as the plate maths reads it. */
const wholePairs = (count: number): number => (count > 0 ? Math.floor(count) : 0);

/** The pairs owned of `size`, whatever way its key was written. */
function pairsOf(owned: Record<string, number>, size: number): number {
  let pairs = 0;
  for (const [key, count] of Object.entries(owned)) {
    if (hundredths(Number(key)) === hundredths(size)) pairs += wholePairs(count);
  }
  return pairs;
}

/** One row per standard size (0 pairs when none are owned) plus each other size owned, heaviest first. */
export function plateRows(owned: Record<string, number>, unit: WeightUnit): { size: number; pairs: number; standard: boolean }[] {
  const standard = STANDARD_PLATES[unit];
  const rows = standard.map((size) => ({ size, pairs: pairsOf(owned, size), standard: true }));
  for (const [key, count] of Object.entries(owned)) {
    const size = Number(key);
    if (!(size > 0) || wholePairs(count) === 0) continue;
    if (rows.some((row) => hundredths(row.size) === hundredths(size))) continue;
    rows.push({ size, pairs: pairsOf(owned, size), standard: false });
  }
  return rows.sort((a, b) => b.size - a.size);
}

/**
 * A copy of `owned` with `pairs` of `size`, a whole number clamped to 0..MAX_PAIRS. The size is keyed as `String(size)`
 * (replacing a key written another way), and every size at 0 is dropped.
 */
export function setPairs(owned: Record<string, number>, size: number, pairs: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [key, count] of Object.entries(owned)) {
    if (hundredths(Number(key)) === hundredths(size)) continue;
    if (count > 0) next[key] = count;
  }
  const clamped = Math.min(MAX_PAIRS, Math.max(0, Math.round(pairs)));
  if (clamped > 0) next[String(size)] = clamped;
  return next;
}

/**
 * A plate size as typed (a comma or a dot, at most 2 decimals): a multiple of 0.25 above 0 and up to 100 lb or 50 kg,
 * else null. The quarter steps keep the plate maths' reachable sums small (`plates.ts`).
 */
export function parsePlateSize(text: string, unit: WeightUnit): number | null {
  const trimmed = text.trim();
  if (!/^(\d+([.,]\d{0,2})?|[.,]\d{1,2})$/.test(trimmed)) return null;
  const size = Number(trimmed.replace(',', '.'));
  if (!(size > 0) || size > MAX_SIZE[unit] || hundredths(size) % 25 !== 0) return null;
  return size;
}

/** Every whole pair owned of a real size: what `plateRows` lists, so a junk key can't stand in for the last pair. */
export function totalPairs(owned: Record<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(owned)) {
    if (Number(key) > 0) total += wholePairs(count);
  }
  return total;
}
