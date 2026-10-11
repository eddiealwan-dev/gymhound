import type { LoggingType, WeightUnit } from './types';

/**
 * The routine editor's working copy (§8.6, R89): a pure reducer over a draft that `saveRoutine` writes in one go.
 * Rows that already exist carry their id, so saving updates them in place and their next weight survives; new rows
 * have a null id and get a uuid when saved. Every row also has a `key` for lists: its id, or "new:{n}" until saved.
 */
export type DraftExercise = {
  key: string;
  /** The routine exercise row's id; null until saved. */
  id: string | null;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  /** 1 to 10. */
  setCount: number;
  /** Seconds for timed exercises. Whole numbers, at least 1, min ≤ max. */
  repMin: number;
  repMax: number;
  /** 0 means reps only. Kept in the unit it was written in; the editor shows it in the display unit. */
  increment: number;
  incrementUnit: WeightUnit;
  /** Forms a superset with the exercise after it. Always false on a day's last exercise. */
  supersetWithNext: boolean;
};

export type DraftDay = {
  key: string;
  /** The routine day row's id; null until saved. */
  id: string | null;
  /** As typed; trimmed when saved. */
  name: string;
  exercises: DraftExercise[];
};

export type RoutineDraft = {
  /** The routine's id; null for a new routine. */
  id: string | null;
  /** As typed; trimmed when saved. */
  name: string;
  days: DraftDay[];
  /** The number in the next new row's key. */
  nextKey: number;
};

/** An exercise picked from the library. */
export type LibraryExercise = { id: string; name: string; loggingType: LoggingType };

export type ExercisePatch = Partial<Pick<DraftExercise, 'setCount' | 'repMin' | 'repMax' | 'increment' | 'incrementUnit'>>;

type Dir = 'up' | 'down';

export type DraftAction =
  | { type: 'rename'; name: string }
  /** A blank or missing name becomes the lowest "Day {n}" not in use. */
  | { type: 'addDay'; name?: string }
  | { type: 'renameDay'; dayKey: string; name: string }
  | { type: 'moveDay'; dayKey: string; dir: Dir }
  | { type: 'deleteDay'; dayKey: string }
  /** `increment` is the default for the display unit (`defaultIncrement`). */
  | { type: 'addExercise'; dayKey: string; exercise: LibraryExercise; increment: { value: number; unit: WeightUnit } }
  /** Moves the exercise's superset as a whole, past the whole block next to it. */
  | { type: 'moveExercise'; dayKey: string; exerciseKey: string; dir: Dir }
  | { type: 'removeExercise'; dayKey: string; exerciseKey: string }
  /** An increment without `incrementUnit` is in the exercise's current unit. */
  | { type: 'updateExercise'; dayKey: string; exerciseKey: string; patch: ExercisePatch }
  | { type: 'toggleSuperset'; dayKey: string; exerciseKey: string };

export const MIN_SETS = 1;
export const MAX_SETS = 10;

/** Where a new exercise starts, by logging type: sets and a rep range (seconds for timed ones). */
const STARTING_SCHEME: Record<LoggingType, { setCount: number; repMin: number; repMax: number }> = {
  weighted: { setCount: 3, repMin: 8, repMax: 12 },
  bodyweight_plus: { setCount: 3, repMin: 8, repMax: 12 },
  assisted: { setCount: 3, repMin: 8, repMax: 12 },
  timed: { setCount: 3, repMin: 30, repMax: 60 },
  weighted_time: { setCount: 3, repMin: 30, repMax: 60 },
  // The rep range is unused for distance and time.
  distance_time: { setCount: 1, repMin: 1, repMax: 1 },
};

/** Logging types with no load for the rule to raise: their increment starts at 0. */
const NO_LOAD: LoggingType[] = ['timed', 'distance_time'];

export function newDraft(): RoutineDraft {
  return { id: null, name: '', days: [], nextKey: 1 };
}

/** The increment a new exercise starts with: the Settings default for the display unit (5 lb or 2.5 kg out of the box). */
export function defaultIncrement(s: {
  unit: WeightUnit;
  defaultIncrementLb: number;
  defaultIncrementKg: number;
}): { value: number; unit: WeightUnit } {
  return { value: s.unit === 'lb' ? s.defaultIncrementLb : s.defaultIncrementKg, unit: s.unit };
}

/** A day's name as saved and shown: trimmed, or "Day {n}" when blank. */
export function dayLabel(day: Pick<DraftDay, 'name'>, index: number): string {
  return day.name.trim() || `Day ${index + 1}`;
}

/** What stops a draft from saving, in order, as the editor shows it. Empty when it can save. */
export function validateDraft(draft: RoutineDraft): string[] {
  const errors: string[] = [];
  if (draft.name.trim() === '') errors.push('Give the routine a name.');
  if (draft.days.length === 0) errors.push('Add at least one day.');
  draft.days.forEach((day, i) => {
    if (day.exercises.length === 0) errors.push(`${dayLabel(day, i)} has no exercises.`);
  });
  return errors;
}

/** What a draft saves: names as saved (trimmed, a blank day as its "Day {n}"), and no list keys. */
function content(draft: RoutineDraft) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    days: draft.days.map((day, i) => ({
      id: day.id,
      name: dayLabel(day, i),
      exercises: day.exercises.map(({ key: _key, ...exercise }) => exercise),
    })),
  };
}

/** Whether `draft` would save anything different from `saved`: leaving the editor then asks first. */
export function hasChanges(saved: RoutineDraft, draft: RoutineDraft): boolean {
  return JSON.stringify(content(saved)) !== JSON.stringify(content(draft));
}

/**
 * The stored superset group of each exercise of a day: each run of linked exercises is numbered from 1, and an
 * exercise in no superset has null.
 */
export function supersetGroups(exercises: Pick<DraftExercise, 'supersetWithNext'>[]): (number | null)[] {
  let group = 0;
  return exercises.map((e, i) => {
    if (i > 0 && exercises[i - 1].supersetWithNext) return group;
    if (e.supersetWithNext && i < exercises.length - 1) return ++group;
    return null;
  });
}

/** The links back from stored groups: an exercise links with the next when they share a group. */
export function linksFromGroups(groups: (number | null)[]): boolean[] {
  return groups.map((g, i) => g !== null && i < groups.length - 1 && groups[i + 1] === g);
}

/** The last exercise of a day never links onward. */
function unlinkLast(exercises: DraftExercise[]): DraftExercise[] {
  const last = exercises[exercises.length - 1];
  if (!last || !last.supersetWithNext) return exercises;
  return [...exercises.slice(0, -1), { ...last, supersetWithNext: false }];
}

/** Swaps `list[i]` with its neighbour in `dir`; null at either end. */
function swapped<T>(list: T[], i: number, dir: Dir): T[] | null {
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** A day's exercises cut into blocks: each superset is one block, every other exercise its own. */
function blocks(exercises: DraftExercise[]): DraftExercise[][] {
  const result: DraftExercise[][] = [];
  exercises.forEach((e, i) => {
    if (i > 0 && exercises[i - 1].supersetWithNext) result[result.length - 1].push(e);
    else result.push([e]);
  });
  return result;
}

type RuleFields = Pick<DraftExercise, 'setCount' | 'repMin' | 'repMax' | 'increment'>;

/** A whole number of at least `min`; `fallback` when `v` is not a finite number. */
const wholeAtLeast = (v: number, min: number, fallback: number) =>
  Number.isFinite(v) ? Math.max(min, Math.round(v)) : fallback;

/**
 * A rule as it may be saved: sets a whole number from 1 to 10, reps whole and at least 1 with min ≤ max, and the
 * increment 0 or more; anything not a number becomes the lowest allowed. When min > max, `keep` names the end that
 * stays and the other moves to meet it. The reducer and `saveRoutine` both apply it.
 */
export function clampRule<T extends RuleFields>(rule: T, keep: 'min' | 'max' = 'min'): T {
  const setCount = Math.min(MAX_SETS, wholeAtLeast(rule.setCount, MIN_SETS, MIN_SETS));
  let repMin = wholeAtLeast(rule.repMin, 1, 1);
  let repMax = wholeAtLeast(rule.repMax, 1, repMin);
  if (repMin > repMax) {
    if (keep === 'max') repMin = repMax;
    else repMax = repMin;
  }
  const increment = Number.isFinite(rule.increment) ? Math.max(0, rule.increment) : 0;
  return { ...rule, setCount, repMin, repMax, increment };
}

/** Applies a patch within `clampRule`'s limits. A value that is not a number is ignored; the rep end just set wins. */
function patched(e: DraftExercise, patch: ExercisePatch): DraftExercise {
  const given = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);
  const next = { ...e };
  if (given(patch.setCount)) next.setCount = patch.setCount;
  if (given(patch.repMin)) next.repMin = patch.repMin;
  if (given(patch.repMax)) next.repMax = patch.repMax;
  if (given(patch.increment)) next.increment = patch.increment;
  if (patch.incrementUnit !== undefined) next.incrementUnit = patch.incrementUnit;
  return clampRule(next, given(patch.repMax) && !given(patch.repMin) ? 'max' : 'min');
}

/** The lowest "Day {n}" that no day of the draft is called, as saved. */
function unusedDayName(days: DraftDay[]): string {
  const taken = new Set(days.map(dayLabel));
  let n = 1;
  while (taken.has(`Day ${n}`)) n++;
  return `Day ${n}`;
}

/** The new exercise list of a day for an exercise action, or null when nothing changes. */
function exercisesAfter(day: DraftDay, action: DraftAction, draft: RoutineDraft): DraftExercise[] | null {
  const list = day.exercises;
  if (action.type === 'addExercise') {
    const { exercise, increment } = action;
    return [
      ...list,
      {
        key: `new:${draft.nextKey}`,
        id: null,
        exerciseId: exercise.id,
        name: exercise.name,
        loggingType: exercise.loggingType,
        ...STARTING_SCHEME[exercise.loggingType],
        increment: NO_LOAD.includes(exercise.loggingType) ? 0 : increment.value,
        incrementUnit: increment.unit,
        supersetWithNext: false,
      },
    ];
  }
  if (!('exerciseKey' in action)) return null;
  const i = list.findIndex((e) => e.key === action.exerciseKey);
  if (i === -1) return null;

  switch (action.type) {
    case 'moveExercise': {
      const cut = blocks(list);
      const b = cut.findIndex((block) => block.some((e) => e.key === action.exerciseKey));
      return swapped(cut, b, action.dir)?.flat() ?? null;
    }
    case 'removeExercise': {
      const removed = list[i];
      const rest = list.filter((_, j) => j !== i);
      // The one before stays linked only if the removed one linked on: a superset keeps its other members together.
      if (i > 0 && rest[i - 1].supersetWithNext) {
        rest[i - 1] = { ...rest[i - 1], supersetWithNext: removed.supersetWithNext };
      }
      return unlinkLast(rest);
    }
    case 'updateExercise':
      return list.map((e, j) => (j === i ? patched(e, action.patch) : e));
    case 'toggleSuperset':
      if (i === list.length - 1) return null;
      return list.map((e, j) => (j === i ? { ...e, supersetWithNext: !e.supersetWithNext } : e));
    default:
      return null;
  }
}

/** The editor's reducer. Returns the same draft when an action changes nothing (an unknown key, a move at either end). */
export function draftReducer(draft: RoutineDraft, action: DraftAction): RoutineDraft {
  switch (action.type) {
    case 'rename':
      return { ...draft, name: action.name };
    case 'addDay': {
      const name = action.name?.trim() ? action.name : unusedDayName(draft.days);
      const day: DraftDay = { key: `new:${draft.nextKey}`, id: null, name, exercises: [] };
      return { ...draft, days: [...draft.days, day], nextKey: draft.nextKey + 1 };
    }
    case 'renameDay': {
      if (!draft.days.some((d) => d.key === action.dayKey)) return draft;
      return { ...draft, days: draft.days.map((d) => (d.key === action.dayKey ? { ...d, name: action.name } : d)) };
    }
    case 'moveDay': {
      const days = swapped(draft.days, draft.days.findIndex((d) => d.key === action.dayKey), action.dir);
      return days ? { ...draft, days } : draft;
    }
    case 'deleteDay': {
      const days = draft.days.filter((d) => d.key !== action.dayKey);
      return days.length === draft.days.length ? draft : { ...draft, days };
    }
    default: {
      const day = draft.days.find((d) => d.key === action.dayKey);
      if (!day) return draft;
      const exercises = exercisesAfter(day, action, draft);
      if (exercises === null) return draft;
      return {
        ...draft,
        days: draft.days.map((d) => (d === day ? { ...d, exercises } : d)),
        nextKey: action.type === 'addExercise' ? draft.nextKey + 1 : draft.nextKey,
      };
    }
  }
}
