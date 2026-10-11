import { formatDuration } from './setEntry';
import type { LoggingType, SetType, WeightUnit } from './types';
import { convertWeight, formatWeight, isZeroWeight, toKg } from './units';

/** Personal bests (spec 7.6, R103, R105). Computed at finish only (R104). */
export type PrKind = 'heaviest' | 'reps_at_weight' | 'e1rm' | 'longest_hold';

/** The `sets.pr_flags` bits, as `csv.ts` reads them. */
export const PR_BIT: Record<PrKind, number> = {
  heaviest: 1,
  reps_at_weight: 2,
  e1rm: 4,
  longest_hold: 8,
};

export type PrCandidate = {
  id: string;
  workoutId: string;
  setType: SetType;
  done: boolean;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationS: number | null;
};

/** Loads in the same unit, and e1RMs, are the same within this many kg (spec 7.1). */
const TOLERANCE_KG = 0.01;

/** e1RM for reps 1–12: the load at 1 rep, otherwise load × (1 + reps ÷ 30). Null outside 1–12. */
export function estimatedOneRm(load: number, reps: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? load : load * (1 + reps / 30);
}

type Load = { value: number; unit: WeightUnit; kg: number };

const roundTenth = (v: number) => Math.round(v * 10) / 10;

/**
 * R125: two loads are the same within 0.01 kg (spec 7.1), or, in different units, when one
 * converted to the other's unit and rounded to 0.1 is the other: 60 kg is 132.28 lb, logged as
 * 132.3 lb, which is 0.0103 kg away. (The app pre-fills 132.5 lb, which counts as heavier.)
 */
function sameLoad(a: Load, b: Load): boolean {
  if (Math.abs(a.kg - b.kg) < TOLERANCE_KG) return true;
  if (a.unit === b.unit) return false;
  return (
    roundTenth(convertWeight(a.value, a.unit, b.unit)) === roundTenth(b.value) ||
    roundTenth(convertWeight(b.value, b.unit, a.unit)) === roundTenth(a.value)
  );
}

/** `a` is heavier than `b`: not the same load, and more in kg. */
const heavier = (a: Load, b: Load) => !sameLoad(a, b) && a.kg > b.kg;

/** Bodyweight plus with no added weight is a load of 0. */
function loadOf(loggingType: LoggingType, s: PrCandidate): Load | null {
  if (s.weight === null || s.weightUnit === null) {
    return loggingType === 'bodyweight_plus' ? { value: 0, unit: 'kg', kg: 0 } : null;
  }
  return { value: s.weight, unit: s.weightUnit, kg: toKg(s.weight, s.weightUnit) };
}

/** What a set offers to compare. */
type Measured = { load: Load | null; reps: number | null; durationS: number | null };

/** The values a set brings, or null when it is not eligible or lacks every value its type needs. */
function measure(loggingType: LoggingType, s: PrCandidate): Measured | null {
  if (!s.done || s.setType === 'warmup') return null;
  switch (loggingType) {
    case 'weighted':
    case 'bodyweight_plus': {
      const load = loadOf(loggingType, s);
      if (load === null || s.reps === null || s.reps <= 0) return null;
      return { load, reps: s.reps, durationS: null };
    }
    case 'timed':
      return s.durationS === null || s.durationS <= 0 ? null : { load: null, reps: null, durationS: s.durationS };
    case 'weighted_time': {
      const load = loadOf(loggingType, s);
      const durationS = s.durationS !== null && s.durationS > 0 ? s.durationS : null;
      if (load === null && durationS === null) return null;
      return { load, reps: null, durationS };
    }
    default:
      return null; // assisted and distance_time never flag in v1
  }
}

/** Earlier sets at one logged load: the most reps, and the rep counts that have an e1RM. */
type LoadBucket = { load: Load; maxReps: number; e1rmReps: Set<number> };

/**
 * One exercise's sets from finished workouts, already in time order (R103). Returns flags for every
 * set id (0 when none). A set is compared with every earlier eligible set, including earlier sets of
 * its own workout, but flags nothing until an earlier workout has an eligible set (first session).
 *
 * One pass with running bests: the heaviest load, the best e1RM, the longest duration, and one
 * bucket per distinct logged load (few per exercise) for reps at weight.
 */
export function computePrFlags(loggingType: LoggingType, sets: readonly PrCandidate[]): Map<string, number> {
  const flags = new Map<string, number>();
  let firstWorkout: string | null = null; // the first workout with an eligible set
  let pastFirstWorkout = false; // an eligible set came from a second workout
  let maxLoad: Load | null = null;
  let maxE1rm: number | null = null;
  let maxDuration: number | null = null;
  const buckets = new Map<string, LoadBucket>();

  for (const s of sets) {
    const m = measure(loggingType, s);
    if (m === null) {
      flags.set(s.id, 0);
      continue;
    }
    if (firstWorkout === null) firstWorkout = s.workoutId;
    else if (s.workoutId !== firstWorkout) pastFirstWorkout = true;
    // An earlier workout has an eligible set when this set is not in the first one, or when an
    // eligible set from a second workout came before it.
    const gated = s.workoutId !== firstWorkout || pastFirstWorkout;
    const { load, reps, durationS } = m;
    const sameLoadBuckets = load === null ? [] : [...buckets.values()].filter((b) => sameLoad(b.load, load));
    const mine = load === null || reps === null ? null : estimatedOneRm(load.kg, reps);

    let f = 0;
    if (gated) {
      if (load !== null && maxLoad !== null && heavier(load, maxLoad)) f |= PR_BIT.heaviest;
      if (reps !== null && sameLoadBuckets.length > 0 && sameLoadBuckets.every((b) => reps > b.maxReps)) {
        f |= PR_BIT.reps_at_weight;
      }
      if (
        mine !== null &&
        mine > 0 &&
        maxE1rm !== null &&
        mine - maxE1rm >= TOLERANCE_KG &&
        !sameLoadBuckets.some((b) => b.e1rmReps.has(reps as number))
      ) {
        f |= PR_BIT.e1rm;
      }
      if (durationS !== null && maxDuration !== null && durationS > maxDuration) f |= PR_BIT.longest_hold;
    }
    flags.set(s.id, f);

    if (load !== null) {
      if (maxLoad === null || load.kg > maxLoad.kg) maxLoad = load;
      if (reps !== null) {
        const key = `${load.value} ${load.unit}`;
        const bucket = buckets.get(key) ?? { load, maxReps: 0, e1rmReps: new Set<number>() };
        bucket.maxReps = Math.max(bucket.maxReps, reps);
        if (mine !== null) bucket.e1rmReps.add(reps);
        buckets.set(key, bucket);
      }
    }
    if (mine !== null && (maxE1rm === null || mine > maxE1rm)) maxE1rm = mine;
    if (durationS !== null && (maxDuration === null || durationS > maxDuration)) maxDuration = durationS;
  }
  return flags;
}

export type PrHighlight = {
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  kind: PrKind;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationS: number | null;
  localDate: string;
};

type FlaggedSet = PrCandidate & { prFlags: number };

const HIGHLIGHT_ORDER: PrKind[] = ['heaviest', 'e1rm', 'reps_at_weight', 'longest_hold'];

function loadOrZero(s: PrCandidate): Load {
  return loadOf('bodyweight_plus', s) as Load;
}

function e1rmOf(s: PrCandidate): number {
  return s.reps === null ? 0 : (estimatedOneRm(loadOrZero(s).kg, s.reps) ?? 0);
}

/** True when `a` is a better set than `b` for `kind` (R105). */
function better(kind: PrKind, a: PrCandidate, b: PrCandidate): boolean {
  switch (kind) {
    case 'heaviest':
      if (!sameLoad(loadOrZero(a), loadOrZero(b))) return loadOrZero(a).kg > loadOrZero(b).kg;
      return (a.reps ?? 0) > (b.reps ?? 0) || (a.durationS ?? 0) > (b.durationS ?? 0);
    case 'reps_at_weight':
      if ((a.reps ?? 0) !== (b.reps ?? 0)) return (a.reps ?? 0) > (b.reps ?? 0);
      return heavier(loadOrZero(a), loadOrZero(b));
    case 'e1rm':
      return e1rmOf(a) > e1rmOf(b);
    case 'longest_hold':
      return (a.durationS ?? 0) > (b.durationS ?? 0);
  }
}

/**
 * The finish summary's PR lines (R105): exercises in workout order; per exercise, one highlight per
 * kind in the order heaviest, e1RM, reps at weight, longest hold — the best set carrying that bit.
 */
export function pickHighlights(
  exercises: readonly {
    exerciseId: string;
    name: string;
    loggingType: LoggingType;
    localDate: string;
    sets: readonly FlaggedSet[];
  }[],
): PrHighlight[] {
  const out: PrHighlight[] = [];
  for (const ex of exercises) {
    for (const kind of HIGHLIGHT_ORDER) {
      let best: FlaggedSet | null = null;
      for (const s of ex.sets) {
        if ((s.prFlags & PR_BIT[kind]) === 0) continue;
        if (best === null || better(kind, s, best)) best = s;
      }
      if (best === null) continue;
      out.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        loggingType: ex.loggingType,
        kind,
        weight: best.weight,
        weightUnit: best.weightUnit,
        reps: best.reps,
        durationS: best.durationS,
        localDate: ex.localDate,
      });
    }
  }
  return out;
}

/**
 * A weight in the unit the set was logged in: "185 lb", "+25 lb" for bodyweight plus, and
 * "bodyweight" for bodyweight plus with no added weight. Never a guessed unit.
 */
function weightText(h: PrHighlight, v: number): string {
  const bodyweightPlus = h.loggingType === 'bodyweight_plus';
  if (bodyweightPlus && (h.weight === null || h.weightUnit === null || isZeroWeight(v, h.weightUnit))) {
    return 'bodyweight';
  }
  const text = h.weightUnit === null ? String(Number(v.toFixed(2))) : formatWeight(v, h.weightUnit);
  return bodyweightPlus ? `+${text}` : text;
}

function loadText(h: PrHighlight): string {
  return weightText(h, h.weight ?? 0);
}

/** "185 lb × 5", "+25 lb × 8", "70 lb × 40s". */
function setText(h: PrHighlight): string {
  const tail = h.loggingType === 'weighted_time' ? formatDuration(h.durationS ?? 0) : String(h.reps ?? 0);
  return `${loadText(h)} × ${tail}`;
}

/** e1RM rounded to a whole number in the unit logged: "210 lb". */
function e1rmText(h: PrHighlight): string {
  return weightText(h, Math.round(estimatedOneRm(h.weight ?? 0, h.reps ?? 0) ?? 0));
}

/** The finish summary line (R105), e.g. "Bench press — heaviest: 185 lb × 5". */
export function prLine(h: PrHighlight): string {
  switch (h.kind) {
    case 'heaviest':
      return `${h.name} — heaviest: ${setText(h)}`;
    case 'reps_at_weight':
      return `${h.name} — most reps at ${loadText(h)}: ${h.reps ?? 0}`;
    case 'e1rm':
      return `${h.name} — best estimated 1RM: ${e1rmText(h)}`;
    case 'longest_hold':
      return `${h.name} — longest hold: ${formatDuration(h.durationS ?? 0)}`;
  }
}

/** The share card's value and caption (Task 4). */
export function prCard(h: PrHighlight): { value: string; caption: string } {
  switch (h.kind) {
    case 'heaviest':
      return { value: setText(h), caption: 'Heaviest set' };
    case 'reps_at_weight': {
      const reps = h.reps ?? 0;
      return { value: `${reps} ${reps === 1 ? 'rep' : 'reps'}`, caption: `Most reps at ${loadText(h)}` };
    }
    case 'e1rm':
      return { value: e1rmText(h), caption: 'Best estimated 1RM' };
    case 'longest_hold':
      return { value: formatDuration(h.durationS ?? 0), caption: 'Longest hold' };
  }
}
