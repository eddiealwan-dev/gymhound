/**
 * Plate maths (spec 7.7). Weights are in one unit, implied by the plate set passed. `platesOwned` maps a
 * plate weight (as a string) to the number of pairs owned, so each pair puts one plate on each side.
 * Sums are kept in integer hundredths so 2.5 and 1.25 add exactly.
 */

const toHundredths = (v: number): number => Math.round(v * 100);

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
