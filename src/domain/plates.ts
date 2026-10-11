/**
 * Plate maths (spec 7.7). Weights are in one unit, implied by the plate set passed. `platesOwned` maps a
 * plate weight (as a string) to the number of pairs owned, so each pair puts one plate on each side.
 * Sums are kept in integer hundredths so 2.5 and 1.25 add exactly.
 */

import type { WeightUnit } from './types';
import { convertWeight, roundToHalf } from './units';

const toHundredths = (v: number): number => Math.round(v * 100);

/** A bar and the plate pairs owned, both in one unit. */
export type Gear = { bar: number; plates: Record<string, number> };

/** The bar and plates in Settings for `unit` (Settings keeps a set for each unit). */
export function gearFor(
  unit: WeightUnit,
  settings: { barLb: number; barKg: number; platesLb: Record<string, number>; platesKg: Record<string, number> },
): Gear {
  return unit === 'lb' ? { bar: settings.barLb, plates: settings.platesLb } : { bar: settings.barKg, plates: settings.platesKg };
}

/** One plate of each owned pair, heaviest first, in hundredths. */
function platesPerSide(platesOwned: Record<string, number>): number[] {
  const plates: number[] = [];
  for (const [weight, pairs] of Object.entries(platesOwned)) {
    const w = toHundredths(Number(weight));
    if (!(w > 0) || !(pairs > 0)) continue;
    for (let i = 0; i < Math.floor(pairs); i++) plates.push(w);
  }
  return plates.sort((a, b) => b - a);
}

/** Whether `a` is the better way to load a sum than `b`: fewer plates, then heavier plates first. */
function isBetter(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return a.length < b.length;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/** Every per-side sum the owned plates can make (in hundredths), each with its best plate list. */
function reachableSums(platesOwned: Record<string, number>): Map<number, number[]> {
  const best = new Map<number, number[]>([[0, []]]);
  for (const plate of platesPerSide(platesOwned)) {
    // Snapshot first so each physical plate is used at most once.
    for (const [sum, list] of [...best]) {
      const next = sum + plate;
      const candidate = [...list, plate];
      const current = best.get(next);
      if (!current || isBetter(candidate, current)) best.set(next, candidate);
    }
  }
  return best;
}

/**
 * The plates to load per side for `target`: the per-side sum closest to (target - bar) / 2 without going
 * over, with the fewest plates on a tie. `perSide` is heaviest first. Below the bar it is the bar alone.
 */
export function loadPlates(
  target: number,
  bar: number,
  platesOwned: Record<string, number>,
): { perSide: number[]; total: number } {
  if (target < bar) return { perSide: [], total: bar };
  const barH = toHundredths(bar);
  const spareH = toHundredths(target) - barH; // both sides together
  const sums = reachableSums(platesOwned);
  let bestSum = 0;
  for (const sum of sums.keys()) {
    if (2 * sum <= spareH && sum > bestSum) bestSum = sum;
  }
  const perSide = sums.get(bestSum)!;
  return { perSide: perSide.map((p) => p / 100), total: (barH + 2 * bestSum) / 100 };
}

/**
 * The loadable total (bar plus two of an achievable per-side sum) closest to `value` on either side, the
 * lower one on a tie. At or below the bar it is the bar.
 */
export function nearestLoadable(value: number, bar: number, platesOwned: Record<string, number>): number {
  if (value <= bar) return bar;
  const barH = toHundredths(bar);
  const valueH = value * 100;
  let bestTotal = barH;
  let bestDistance = Math.abs(valueH - barH);
  for (const sum of reachableSums(platesOwned).keys()) {
    const total = barH + 2 * sum;
    const distance = Math.abs(valueH - total);
    if (distance < bestDistance || (distance === bestDistance && total < bestTotal)) {
      bestTotal = total;
      bestDistance = distance;
    }
  }
  return bestTotal / 100;
}

/**
 * Above the heaviest loadable total, totals go on in steps of twice the smallest owned plate above the bar, so a
 * heavy weight is never cut down to what the plates can load. In hundredths; null when no plates are owned.
 */
function stepsAbovePlates(
  bar: number,
  platesOwned: Record<string, number>,
): { barH: number; heaviestH: number; stepH: number } | null {
  const plates = platesPerSide(platesOwned);
  if (plates.length === 0) return null;
  const barH = toHundredths(bar);
  return { barH, heaviestH: barH + 2 * plates.reduce((sum, p) => sum + p, 0), stepH: 2 * plates[plates.length - 1] };
}

/**
 * A routine plan in the display unit, when a workout starts (spec 7.1). The same unit returns `weight` as it is.
 * A converted barbell plan rounds to the nearest loadable total with `to`'s bar and plates; above the heaviest
 * loadable total it rounds instead to a step of twice the smallest owned plate above the bar, so a heavy plan
 * is never cut down to what the plates can load. Anything else converts and rounds to the nearest 0.5.
 */
export function planInUnit(
  weight: number,
  from: WeightUnit,
  to: WeightUnit,
  isBarbell: boolean,
  bar: number,
  platesOwned: Record<string, number>,
): number {
  if (from === to) return weight;
  const v = convertWeight(weight, from, to);
  if (!isBarbell) return roundToHalf(v);
  const steps = stepsAbovePlates(bar, platesOwned);
  if (steps && v * 100 > steps.heaviestH) {
    return (steps.barH + steps.stepH * Math.round((v * 100 - steps.barH) / steps.stepH)) / 100;
  }
  return nearestLoadable(v, bar, platesOwned);
}

/**
 * A barbell raise (spec 7.3 step 6): the loadable total nearest to `raised` that is heavier than `working`, the
 * lower one on a tie. Above the heaviest loadable total it steps as `planInUnit` does, at least one step above
 * `working`. Null when nothing heavier than `working` can be loaded. All in the gear's unit.
 */
export function raiseLoadable(raised: number, working: number, gear: Gear): number | null {
  const workingH = toHundredths(working);
  const steps = stepsAbovePlates(gear.bar, gear.plates);
  if (steps && raised * 100 > steps.heaviestH) {
    const nearest = Math.round((raised * 100 - steps.barH) / steps.stepH);
    const firstHeavier = Math.floor((workingH - steps.barH) / steps.stepH) + 1;
    return (steps.barH + steps.stepH * Math.max(nearest, firstHeavier)) / 100;
  }
  const barH = toHundredths(gear.bar);
  const raisedH = raised * 100;
  let best: { total: number; distance: number } | null = null;
  for (const sum of reachableSums(gear.plates).keys()) {
    const total = barH + 2 * sum;
    if (total <= workingH) continue;
    const distance = Math.abs(raisedH - total);
    if (!best || distance < best.distance || (distance === best.distance && total < best.total)) best = { total, distance };
  }
  return best === null ? null : best.total / 100;
}
