import { formatRest } from './dates';
import type { DistanceUnit, LoggingType, SetType, WeightUnit } from './types';
import { formatWeight } from './units';

/** The set in the same position from the most recent finished workout with this exercise. */
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
  /** Today's target weight for this exercise, if it has one. */
  target: number | null;
  placeholders: ReturnType<typeof placeholdersFor>;
};

export type TickValues = SetFields;

const NO_VALUE = '—';
const MINUS = '−';
const TIMES = '×';

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

/** The greyed-out values a set row shows: the previous set, else the rule's top rep count. */
export function placeholdersFor(a: { previous: PrevSet | null; ruleRepMax: number | null }): SetFields {
  const { previous } = a;
  return {
    weight: previous?.weight ?? null,
    reps: previous?.reps ?? a.ruleRepMax,
    durationS: previous?.durationS ?? null,
    distance: previous?.distance ?? null,
  };
}

/**
 * The values a tick records (spec 8.4): each field is what was entered, else (weight only) today's
 * target, else the placeholder. Null when a field the logging type needs still has no value, which
 * keeps the tick disabled.
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
      return weight !== null && reps !== null ? { weight, reps, durationS, distance } : null;
    case 'bodyweight_plus':
      return reps !== null ? { weight: weight ?? 0, reps, durationS, distance } : null;
    case 'timed':
      return durationS !== null ? { weight, reps, durationS, distance } : null;
    case 'distance_time':
      return distance !== null && durationS !== null ? { weight, reps, durationS, distance } : null;
  }
}

/** A weight with its unit only when that differs from the unit the user is viewing in: "185" or "84 kg". */
function weightText(weight: number, unit: WeightUnit, displayUnit: WeightUnit): string {
  const withUnit = formatWeight(weight, unit);
  return unit === displayUnit ? withUnit.slice(0, withUnit.lastIndexOf(' ')) : withUnit;
}

function formatLoaded(p: PrevSet, sign: string, displayUnit: WeightUnit): string {
  if (p.weight === null || p.reps === null) return NO_VALUE;
  return `${sign}${weightText(p.weight, p.weightUnit ?? displayUnit, displayUnit)}${TIMES}${p.reps}`;
}

/** The Previous column: "185×12", "+25×8", "−40×8", "45 s" or "2 km · 12:30". "—" if the set lacks the values. */
export function formatPrevious(p: PrevSet, loggingType: LoggingType, displayUnit: WeightUnit): string {
  switch (loggingType) {
    case 'weighted':
      return formatLoaded(p, '', displayUnit);
    case 'bodyweight_plus':
      return formatLoaded(p, '+', displayUnit);
    case 'assisted':
      return formatLoaded(p, MINUS, displayUnit);
    case 'timed':
      return p.durationS === null ? NO_VALUE : `${p.durationS} s`;
    case 'distance_time':
      if (p.distance === null || p.distanceUnit === null || p.durationS === null) return NO_VALUE;
      return `${p.distance} ${p.distanceUnit} · ${formatRest(p.durationS)}`;
  }
}
