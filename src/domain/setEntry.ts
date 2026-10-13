import { formatRest } from './dates';
import type { DistanceUnit, LoggingType, SetType, WeightUnit } from './types';
import { convertDistance, convertWeight, formatWeight, roundToHalf } from './units';

/**
 * A set from the most recent finished workout with this exercise. `matchPrevious` picks the one
 * each current set lines up with.
 */
export type PrevSet = {
  position: number;
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
};

type SetFields = {
  weight: number | null;
  reps: number | null;
  durationS: number | null;
  distance: number | null;
};

export type TickInput = {
  loggingType: LoggingType;
  /** What the user typed; null for a field left empty. */
  entered: SetFields;
  /**
   * Today's target weight for this exercise, if it has one. It must already be in the unit the
   * user is entering in (the same unit as `entered.weight`); the caller converts it.
   */
  target: number | null;
  placeholders: ReturnType<typeof placeholdersFor>;
};

export type TickValues = SetFields;

const MINUS = '−';
const TIMES = '×';
const BODYWEIGHT = 'BW';

const OTHER_SET_LABELS: Record<Exclude<SetType, 'working'>, string> = {
  warmup: 'W',
  drop: 'D',
  failure: 'F',
};

/** Set-column labels (spec 8.4): working sets count 1, 2, 3 in order; the other types show W, D or F. */
export function setLabels(types: SetType[]): string[] {
  let working = 0;
  return types.map((t) => (t === 'working' ? String(++working) : OTHER_SET_LABELS[t]));
}

const SET_NAMES: Record<string, string> = { W: 'Warmup', D: 'Drop set', F: 'Failure set' };

/** A set label (`setLabels`) in words, for the screen reader and "Rest's up": '2' is "Set 2", 'W' is "Warmup". */
export function setName(label: string): string {
  return SET_NAMES[label] ?? `Set ${label}`;
}

/**
 * Matches each current set to the same set last time (spec 8.4): the previous set with the same
 * type and the same number within that type. Working set 2 gets last time's working set 2, and a
 * warmup is never the previous result for a working set. A set with nothing to match is null.
 *
 * Sets are numbered in position order, so `previous` may arrive in any order and may have gaps
 * (a set that was never ticked is not saved). The result has the length and order of `current`.
 */
export function matchPrevious(
  current: ReadonlyArray<{ setType: SetType }>,
  previous: ReadonlyArray<PrevSet>,
): (PrevSet | null)[] {
  const byType = new Map<SetType, PrevSet[]>();
  for (const p of [...previous].sort((a, b) => a.position - b.position)) {
    const sets = byType.get(p.setType);
    if (sets) sets.push(p);
    else byType.set(p.setType, [p]);
  }

  const seen = new Map<SetType, number>();
  return current.map(({ setType }) => {
    const n = seen.get(setType) ?? 0;
    seen.set(setType, n + 1);
    return byType.get(setType)?.[n] ?? null;
  });
}

/** The fields one set carries to the sets below it (spec 18.6). A weight and a distance keep the unit they were logged in. */
export type Carried = Pick<PrevSet, 'weight' | 'weightUnit' | 'reps' | 'durationS' | 'distance' | 'distanceUnit'>;

/**
 * Today's own values for the set at `index` (spec 18.6): per field, the nearest set above `index` of the same set type
 * with a stored value (ticked or typed); null if none. Never looks below or at other types.
 */
export function carryAbove(current: ReadonlyArray<Pick<PrevSet, 'setType'> & Carried>, index: number): Carried | null {
  const carried: Carried = { weight: null, weightUnit: null, reps: null, durationS: null, distance: null, distanceUnit: null };
  const setType = current[index]?.setType;
  for (let i = index - 1; i >= 0; i--) {
    const above = current[i];
    if (above.setType !== setType) continue;
    if (carried.weight === null && above.weight !== null) {
      carried.weight = above.weight;
      carried.weightUnit = above.weightUnit;
    }
    if (carried.distance === null && above.distance !== null) {
      carried.distance = above.distance;
      carried.distanceUnit = above.distanceUnit;
    }
    carried.reps ??= above.reps;
    carried.durationS ??= above.durationS;
  }
  const found = carried.weight !== null || carried.reps !== null || carried.durationS !== null || carried.distance !== null;
  return found ? carried : null;
}

/** A weight in the entry unit: one logged in the other unit converts to the nearest 0.5 (84 kg is 185 lb, not 185.19). */
function inEntryUnit(weight: number | null, from: WeightUnit | null, unit: WeightUnit | undefined): number | null {
  if (weight === null || !unit || !from || from === unit) return weight;
  return roundToHalf(convertWeight(weight, from, unit));
}

/** A distance in the entry unit: one logged in another unit converts to 2 decimals (5 km is 3.11 mi). */
function distanceInEntryUnit(distance: number | null, from: DistanceUnit | null, unit: DistanceUnit | undefined): number | null {
  if (distance === null || !unit || !from || from === unit) return distance;
  return Number(convertDistance(distance, from, unit).toFixed(2));
}

/**
 * The greyed-out values a set row shows: the previous set, else the rule's value.
 *
 * `ruleRepMax` is a rep count for the weighted types, seconds for `timed` and `weighted_time` (it
 * feeds the duration and reps stay empty), and unused for `distance_time`. Without `loggingType`
 * it is treated as reps.
 *
 * `carried` is today's own values from the set above (`carryAbove`, spec 18.6). It counts only when
 * there is no previous set, because history wins row by row. Then the weight is the carried weight
 * (bodyweight plus never carries a 0 load), the reps are the rule's, else the carried reps, the
 * duration is the rule's seconds for the timed types, else the carried time, and the distance is
 * the carried distance.
 *
 * Pass `unit` (the unit the user is entering in) so a previous or carried weight logged in the
 * other unit is converted and rounded to the nearest 0.5 (84 kg is 185 lb, not 185.19); otherwise
 * the weight is returned as logged. Likewise pass `distanceUnit` so a previous or carried distance
 * logged in another distance unit is converted, to 2 decimals.
 */
export function placeholdersFor(a: {
  previous: PrevSet | null;
  ruleRepMax: number | null;
  loggingType?: LoggingType;
  unit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  carried?: Carried | null;
}): SetFields {
  const { previous, loggingType, carried } = a;
  const ruleIsSeconds = loggingType === 'timed' || loggingType === 'weighted_time';
  const ruleReps = ruleIsSeconds || loggingType === 'distance_time' ? null : a.ruleRepMax;

  if (previous === null && carried) {
    const weight = inEntryUnit(carried.weight, carried.weightUnit, a.unit);
    return {
      weight: loggingType === 'bodyweight_plus' && weight === 0 ? null : weight,
      reps: ruleIsSeconds ? null : (ruleReps ?? carried.reps),
      durationS: ruleIsSeconds ? (a.ruleRepMax ?? carried.durationS) : carried.durationS,
      distance: distanceInEntryUnit(carried.distance, carried.distanceUnit, a.distanceUnit),
    };
  }

  return {
    weight: inEntryUnit(previous?.weight ?? null, previous?.weightUnit ?? null, a.unit),
    reps: ruleIsSeconds ? null : (previous?.reps ?? ruleReps),
    durationS: previous?.durationS ?? (ruleIsSeconds ? a.ruleRepMax : null),
    distance: distanceInEntryUnit(previous?.distance ?? null, previous?.distanceUnit ?? null, a.distanceUnit),
  };
}

/**
 * The values a tick records (spec 8.4): each field is what was entered, else (weight only) today's
 * target, else the placeholder. Only the fields the logging type uses come back; the rest are
 * null. Null when a field the logging type needs still has no value: the tick then records
 * nothing and says which field is missing (spec 18.6).
 */
export function resolveTick(i: TickInput): TickValues | null {
  const { entered, placeholders } = i;
  const weight = entered.weight ?? i.target ?? placeholders.weight;
  const reps = entered.reps ?? placeholders.reps;
  const durationS = entered.durationS ?? placeholders.durationS;
  const distance = entered.distance ?? placeholders.distance;

  switch (i.loggingType) {
    case 'weighted':
    case 'assisted':
      return weight !== null && reps !== null ? { weight, reps, durationS: null, distance: null } : null;
    case 'bodyweight_plus':
      return reps !== null ? { weight: weight ?? 0, reps, durationS: null, distance: null } : null;
    case 'timed':
      return durationS !== null ? { weight: null, reps: null, durationS, distance: null } : null;
    case 'weighted_time':
      return weight !== null && durationS !== null ? { weight, reps: null, durationS, distance: null } : null;
    case 'distance_time':
      return distance !== null && durationS !== null ? { weight: null, reps: null, durationS, distance } : null;
  }
}

/** A weight with its unit only when that differs from the unit the user is viewing in: "185" or "84 kg". */
export function weightText(weight: number, unit: WeightUnit, displayUnit: WeightUnit): string {
  const withUnit = formatWeight(weight, unit);
  return unit === displayUnit ? withUnit.slice(0, withUnit.lastIndexOf(' ')) : withUnit;
}

function formatLoaded(p: PrevSet, sign: string, displayUnit: WeightUnit): string {
  if (p.weight === null || p.reps === null) return '';
  return `${sign}${weightText(p.weight, p.weightUnit ?? displayUnit, displayUnit)} ${TIMES} ${p.reps}`;
}

/** Seconds as "40s", or "1:30" from 60 seconds up. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return total < 60 ? `${total}s` : formatRest(total);
}

/**
 * The Previous column (spec 8.4): "185 × 5", "+25 × 8", "BW × 8", "−40 × 8", "70 lb × 40s", "40s"
 * or "1:30", "2 km · 12:30". Weight-and-time always shows its unit; the other weights show it only
 * when it differs from `displayUnit` ("84 kg × 12"). Bodyweight plus with no added weight (0 or
 * none) reads "BW × 8", not "+0 × 8".
 *
 * Empty for no previous set or a set that lacks a value its type needs. A number is never invented.
 */
export function formatPrevious(p: PrevSet | null, loggingType: LoggingType, displayUnit: WeightUnit): string {
  if (p === null) return '';
  switch (loggingType) {
    case 'weighted':
      return formatLoaded(p, '', displayUnit);
    case 'bodyweight_plus':
      if (p.reps === null) return '';
      if (p.weight === null || p.weight === 0) return `${BODYWEIGHT} ${TIMES} ${p.reps}`;
      return formatLoaded(p, '+', displayUnit);
    case 'assisted':
      return formatLoaded(p, MINUS, displayUnit);
    case 'timed':
      return p.durationS === null ? '' : formatDuration(p.durationS);
    case 'weighted_time':
      if (p.weight === null || p.durationS === null) return '';
      return `${formatWeight(p.weight, p.weightUnit ?? displayUnit)} ${TIMES} ${formatDuration(p.durationS)}`;
    case 'distance_time':
      if (p.distance === null || p.distanceUnit === null || p.durationS === null) return '';
      return `${p.distance} ${p.distanceUnit} · ${formatRest(p.durationS)}`;
  }
}
