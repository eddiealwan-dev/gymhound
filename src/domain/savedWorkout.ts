import { clampRule, NO_LOAD } from './routineDraft';
import { formatPrevious } from './setEntry';
import type { Equipment, LoggingType, SavedSet, WeightUnit } from './types';
import { sameWeight, toKg } from './units';

/**
 * Saved workouts (R118–R121): a finished workout kept to start again, remembering the sets done last time. The rules
 * here are pure; `savedWorkoutsRepo` loads and saves.
 */

/** A saved workout with its exercises in order, archived exercises included (they still start, R119). */
export type SavedWorkoutDetail = {
  id: string;
  name: string;
  exercises: {
    /** The saved workout exercise row's id. */
    id: string;
    exerciseId: string;
    name: string;
    loggingType: LoggingType;
    equipment: Equipment;
    supersetGroup: number | null;
    sets: SavedSet[];
  }[];
};

/** A routine day made from a saved workout (R121), for the routine editor to append. */
export type DayFromSaved = {
  name: string;
  exercises: {
    exerciseId: string;
    name: string;
    loggingType: LoggingType;
    setCount: number;
    repMin: number;
    repMax: number;
    increment: number;
    incrementUnit: WeightUnit;
    supersetWithNext: boolean;
    startWeight: { weight: number; unit: WeightUnit } | null;
  }[];
};

export const MAX_SAVED_NAME = 60;

/** Why a saved workout's name can't be used, or null when it can. The name is trimmed first. */
export function validateSavedName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Give the workout a name.';
  // Characters as a person counts them: an emoji is one, not two UTF-16 units.
  if (Array.from(trimmed).length > MAX_SAVED_NAME) return `Keep the name to ${MAX_SAVED_NAME} characters.`;
  return null;
}

/** A saved exercise's sets on one line, as the Previous column writes them: "185 × 5, 185 × 5, 175 × 8"; warmups "W 95 × 10". */
export function savedSetsLine(sets: readonly SavedSet[], loggingType: LoggingType, displayUnit: WeightUnit): string {
  return sets
    .map((s, position) => {
      const text = formatPrevious({ position, ...s }, loggingType, displayUnit);
      return text === '' ? '' : s.setType === 'warmup' ? `W ${text}` : text;
    })
    .filter((text) => text !== '')
    .join(', ');
}

/**
 * The value a set's rep range is made of: reps, seconds for holds, a carry's distance (R607), nothing for distance and
 * time or a program's score.
 */
function rangeValue(s: SavedSet, loggingType: LoggingType): number | null {
  switch (loggingType) {
    case 'timed':
    case 'weighted_time':
      return s.durationS;
    case 'weighted_distance':
      return s.distance;
    case 'distance_time':
    case 'rounds':
    case 'for_time':
      return null;
    default:
      return s.reps;
  }
}

/**
 * The easiest load among the counted sets, as §7.3 step 2 picks it: the lowest, or the most assistance for `assisted`,
 * compared in kg (loads within 0.01 kg are the same; the first is kept), in the unit it was logged in. For bodyweight
 * plus a set with no weight is bodyweight alone, 0 (in `emptyUnit`); other sets with no weight are skipped. Null
 * when none has a load, and for timed and distance and time.
 */
function easiestLoad(
  counted: readonly SavedSet[],
  loggingType: LoggingType,
  emptyUnit: WeightUnit,
): { weight: number; unit: WeightUnit } | null {
  if (NO_LOAD.includes(loggingType)) return null;
  const easier = loggingType === 'assisted' ? (a: number, b: number) => a > b : (a: number, b: number) => a < b;
  let easiest: { value: number; unit: WeightUnit } | null = null;
  for (const s of counted) {
    const load =
      s.weight !== null
        ? { value: s.weight, unit: s.weightUnit ?? emptyUnit }
        : loggingType === 'bodyweight_plus'
          ? { value: 0, unit: emptyUnit }
          : null;
    if (load === null) continue;
    if (!easiest || (!sameWeight(load, easiest) && easier(toKg(load.value, load.unit), toKg(easiest.value, easiest.unit)))) {
      easiest = load;
    }
  }
  return easiest && { weight: easiest.value, unit: easiest.unit };
}

/**
 * A routine day from a saved workout (R121). Per exercise: the set count is its working and failure sets (1 to 10),
 * the rep range their lowest to highest reps (seconds for timed and weighted holds; 1–1 for distance and time) within
 * `clampRule`'s limits, the increment the given default (0 for timed and distance and time), and the start weight the
 * easiest working load. Exercises in the same superset group are linked.
 */
export function dayFromSaved(saved: SavedWorkoutDetail, increment: { value: number; unit: WeightUnit }): DayFromSaved {
  const list = saved.exercises;
  return {
    name: saved.name,
    exercises: list.map((e, i) => {
      const counted = e.sets.filter((s) => s.setType === 'working' || s.setType === 'failure');
      const values = counted.map((s) => rangeValue(s, e.loggingType)).filter((v): v is number => v !== null);
      const rule = clampRule({
        setCount: counted.length,
        repMin: values.length > 0 ? Math.min(...values) : 1,
        repMax: values.length > 0 ? Math.max(...values) : 1,
        increment: NO_LOAD.includes(e.loggingType) ? 0 : increment.value,
      });
      const next = list[i + 1];
      return {
        exerciseId: e.exerciseId,
        name: e.name,
        loggingType: e.loggingType,
        setCount: rule.setCount,
        repMin: rule.repMin,
        repMax: rule.repMax,
        increment: rule.increment,
        incrementUnit: increment.unit,
        supersetWithNext: e.supersetGroup !== null && next !== undefined && next.supersetGroup === e.supersetGroup,
        // A bodyweight set's 0 takes the unit of the exercise's loaded sets, else the increment's.
        startWeight: easiestLoad(counted, e.loggingType, e.sets.find((s) => s.weightUnit !== null)?.weightUnit ?? increment.unit),
      };
    }),
  };
}
