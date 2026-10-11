import { MARK_LABELS } from './labels';
import type { Outcome } from './progression';
import { estimatedOneRm, sameLoggedWeight } from './prs';
import { formatDuration, formatPrevious } from './setEntry';
import { stallFlags } from './stall';
import type { DistanceUnit, ExerciseMark, LoggingType, SetType, WeightUnit } from './types';
import { convertDistance, convertWeight, formatWeight, isZeroWeight, toKg } from './units';

/** A done set of a lift's session, in the unit it was logged in. */
export type LiftSet = {
  setType: SetType;
  done: boolean;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
};

/**
 * One finished workout's go at a lift (R173). When the exercise is in the workout twice, the first block with a
 * working weight (else the first block) gives the mark, rule, outcome and working weight; `sets` are every block's.
 */
export type LiftSession = {
  workoutId: string;
  localDate: string;
  startedAt: number;
  mark: ExerciseMark | null;
  hasRule: boolean;
  outcome: Outcome | null;
  workingWeight: number | null;
  workingUnit: WeightUnit | null;
  sets: LiftSet[];
};

/** What a lift's chart shows per session (R173). */
export type LiftMetric = 'working_weight' | 'best_reps' | 'longest_hold' | 'none';

const TIMES = '×';
const MINUS = '−';

const counted = (s: LiftSet) => s.done && s.setType !== 'warmup';

const unloaded = (s: LiftSession) =>
  s.workingWeight === null || s.workingUnit === null || isZeroWeight(s.workingWeight, s.workingUnit);

/**
 * Timed charts the longest hold, distance and time charts nothing (records only, §8.9), bodyweight plus never loaded
 * (every working weight 0 or none) the most reps in a set; everything else the working weight (assisted: the
 * assistance).
 */
export function liftMetric(loggingType: LoggingType, sessions: readonly LiftSession[]): LiftMetric {
  if (loggingType === 'timed') return 'longest_hold';
  if (loggingType === 'distance_time') return 'none';
  if (loggingType === 'bodyweight_plus' && sessions.every(unloaded)) return 'best_reps';
  return 'working_weight';
}

/** A point of a lift's chart: hollow for a session with something off, labelled with its reason or "Stall". */
export type LiftPoint = { localDate: string; value: number; hollow: boolean; label: string | null; workoutId: string };

const roundTenth = (v: number) => Math.round(v * 10) / 10;

function maxOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null && v > 0);
  return present.length === 0 ? null : Math.max(...present);
}

/**
 * One point per session (oldest first, as given) with a value for the lift's metric: the working weight in
 * `displayUnit` rounded to 0.1, the most reps in a done non-warmup set, or the longest done non-warmup hold. A marked
 * session is hollow and labelled with its reason; a stalled one (working weight only, spec 7.5) is labelled "Stall".
 */
export function liftPoints(loggingType: LoggingType, sessions: readonly LiftSession[], displayUnit: WeightUnit): LiftPoint[] {
  const metric = liftMetric(loggingType, sessions);
  if (metric === 'none') return [];
  const stalls = metric === 'working_weight' ? stallFlags(sessions) : sessions.map(() => false);
  const points: LiftPoint[] = [];
  sessions.forEach((s, i) => {
    let value: number | null;
    if (metric === 'working_weight') {
      value =
        s.workingWeight === null || s.workingUnit === null
          ? null
          : roundTenth(convertWeight(s.workingWeight, s.workingUnit, displayUnit));
    } else if (metric === 'best_reps') {
      value = maxOf(s.sets.filter(counted).map((x) => x.reps));
    } else {
      value = maxOf(s.sets.filter(counted).map((x) => x.durationS));
    }
    if (value === null) return;
    const label = s.mark !== null ? MARK_LABELS[s.mark] : stalls[i] ? 'Stall' : null;
    points.push({ localDate: s.localDate, value, hollow: s.mark !== null, label, workoutId: s.workoutId });
  });
  return points;
}

/** A session's sets as the Previous column reads them, joined ", ": "185 × 5, 185 × 5, 175 × 8". */
export function sessionText(loggingType: LoggingType, s: LiftSession, displayUnit: WeightUnit): string {
  return s.sets
    .filter((x) => x.done)
    .map((x, position) => formatPrevious({ ...x, position }, loggingType, displayUnit))
    .filter((t) => t !== '')
    .join(', ');
}

export type LiftRecordKind =
  | 'heaviest'
  | 'e1rm'
  | 'most_reps'
  | 'longest_hold'
  | 'least_assistance'
  | 'longest_distance'
  | 'longest_time';

/** A record under a lift's chart (R174), in the unit logged, with the date and workout of its set. */
export type LiftRecord = { kind: LiftRecordKind; title: string; value: string; localDate: string; workoutId: string };

type Candidate = { set: LiftSet; session: LiftSession };

/** The best candidate by `better` (strictly better replaces, so the earliest wins a tie). */
function best(candidates: readonly Candidate[], better: (a: Candidate, b: Candidate) => boolean): Candidate | null {
  let top: Candidate | null = null;
  for (const c of candidates) if (top === null || better(c, top)) top = c;
  return top;
}

type Load = { value: number; unit: WeightUnit };
/** A set's load; bodyweight plus with none added is 0. */
const loadOf = (s: LiftSet): Load =>
  s.weight === null || s.weightUnit === null ? { value: 0, unit: s.weightUnit ?? 'lb' } : { value: s.weight, unit: s.weightUnit };
const kgOf = (l: Load) => toKg(l.value, l.unit);

/** `a` is a heavier load than `b`, or the same load (R125) with more reps or a longer hold. */
function heavierSet(a: LiftSet, b: LiftSet): boolean {
  const la = loadOf(a);
  const lb = loadOf(b);
  if (!sameLoggedWeight(la, lb)) return kgOf(la) > kgOf(lb);
  return (a.reps ?? 0) > (b.reps ?? 0) || (a.durationS ?? 0) > (b.durationS ?? 0);
}

const e1rmKg = (s: LiftSet) => estimatedOneRm(kgOf(loadOf(s)), s.reps ?? 0) ?? 0;

/** "185 lb", "+25 lb" for bodyweight plus; "Bodyweight" for bodyweight plus with no added weight. */
function loadText(loggingType: LoggingType, load: Load): string {
  if (loggingType !== 'bodyweight_plus') return formatWeight(load.value, load.unit);
  return isZeroWeight(load.value, load.unit) ? 'Bodyweight' : `+${formatWeight(load.value, load.unit)}`;
}

function record(kind: LiftRecordKind, title: string, value: string, c: Candidate): LiftRecord {
  return { kind, title, value, localDate: c.session.localDate, workoutId: c.session.workoutId };
}

/**
 * The records under a lift's chart (R174), from the done non-warmup sets of the sessions (finished workouts), each in
 * the unit logged; the earliest set wins a tie:
 * - weighted and bodyweight plus: Heaviest ("185 lb × 5", "+25 lb × 8", "Bodyweight × 15") and Best estimated 1RM
 *   ("210 lb", rounded as R105; none with no load); bodyweight plus never loaded: Most reps ("15") instead of both;
 * - weight and time: Heaviest ("70 lb × 40s") and Longest hold ("1:30"); timed: Longest hold;
 * - assisted: Least assistance ("−20 lb × 8"), the lowest assistance with reps;
 * - distance and time: Longest distance ("5 km") and Longest time ("32:10").
 */
export function liftRecords(loggingType: LoggingType, sessions: readonly LiftSession[]): LiftRecord[] {
  const all: Candidate[] = sessions.flatMap((session) => session.sets.filter(counted).map((set) => ({ set, session })));
  const withReps = all.filter((c) => c.set.reps !== null && c.set.reps > 0);
  const withHold = all.filter((c) => c.set.durationS !== null && c.set.durationS > 0);
  const out: LiftRecord[] = [];
  const longestHold = () => {
    const c = best(withHold, (a, b) => (a.set.durationS ?? 0) > (b.set.durationS ?? 0));
    if (c) out.push(record('longest_hold', 'Longest hold', formatDuration(c.set.durationS ?? 0), c));
  };

  switch (loggingType) {
    case 'weighted':
    case 'bodyweight_plus': {
      const loaded = withReps.filter((c) => !isZeroWeight(loadOf(c.set).value, loadOf(c.set).unit));
      if (loggingType === 'bodyweight_plus' && loaded.length === 0) {
        const c = best(withReps, (a, b) => (a.set.reps ?? 0) > (b.set.reps ?? 0));
        if (c) out.push(record('most_reps', 'Most reps', String(c.set.reps), c));
        break;
      }
      const candidates = loggingType === 'weighted' ? withReps.filter((c) => c.set.weight !== null && c.set.weightUnit !== null) : withReps;
      const heaviest = best(candidates, (a, b) => heavierSet(a.set, b.set));
      if (heaviest) {
        const value = `${loadText(loggingType, loadOf(heaviest.set))} ${TIMES} ${heaviest.set.reps}`;
        out.push(record('heaviest', 'Heaviest', value, heaviest));
      }
      const top = best(
        loaded.filter((c) => e1rmKg(c.set) > 0),
        (a, b) => e1rmKg(a.set) - e1rmKg(b.set) >= 0.01,
      );
      if (top) {
        const load = loadOf(top.set);
        const e1rm = Math.round(estimatedOneRm(load.value, top.set.reps ?? 0) ?? 0);
        out.push(record('e1rm', 'Best estimated 1RM', loadText(loggingType, { value: e1rm, unit: load.unit }), top));
      }
      break;
    }
    case 'weighted_time': {
      const timed = withHold.filter((c) => c.set.weight !== null && c.set.weightUnit !== null);
      const heaviest = best(timed, (a, b) => heavierSet(a.set, b.set));
      if (heaviest) {
        const value = `${formatWeight(heaviest.set.weight ?? 0, heaviest.set.weightUnit ?? 'lb')} ${TIMES} ${formatDuration(heaviest.set.durationS ?? 0)}`;
        out.push(record('heaviest', 'Heaviest', value, heaviest));
      }
      longestHold();
      break;
    }
    case 'timed':
      longestHold();
      break;
    case 'assisted': {
      const assisted = withReps.filter((c) => c.set.weight !== null && c.set.weightUnit !== null);
      // Less assistance is better; the same assistance with more reps is better.
      const c = best(assisted, (a, b) => {
        const la = loadOf(a.set);
        const lb = loadOf(b.set);
        if (!sameLoggedWeight(la, lb)) return kgOf(la) < kgOf(lb);
        return (a.set.reps ?? 0) > (b.set.reps ?? 0);
      });
      if (c) {
        const load = loadOf(c.set);
        out.push(record('least_assistance', 'Least assistance', `${MINUS}${formatWeight(load.value, load.unit)} ${TIMES} ${c.set.reps}`, c));
      }
      break;
    }
    case 'distance_time': {
      const metres = (s: LiftSet) => convertDistance(s.distance ?? 0, s.distanceUnit ?? 'm', 'm');
      const far = best(
        all.filter((c) => c.set.distance !== null && c.set.distance > 0 && c.set.distanceUnit !== null),
        (a, b) => metres(a.set) > metres(b.set),
      );
      if (far) out.push(record('longest_distance', 'Longest distance', `${far.set.distance} ${far.set.distanceUnit}`, far));
      const long = best(withHold, (a, b) => (a.set.durationS ?? 0) > (b.set.durationS ?? 0));
      if (long) out.push(record('longest_time', 'Longest time', formatDuration(long.set.durationS ?? 0), long));
      break;
    }
  }
  return out;
}
