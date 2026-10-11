import type { DistanceUnit, ExerciseMark, LoggingType, SetType, WeightUnit } from './types';

/**
 * The history editor's draft (spec 7.12, 8.8, R166): a finished workout's sets as they will be saved. Pure functions
 * only; `saveWorkoutEdit` writes a draft in one transaction. Names, notes, dates and times are not edited, and
 * exercises are not added, replaced or reordered.
 */

/** One set as the editor holds it. `id` null is a set added in the editor. Units are the units the values are in. */
export type DraftSet = {
  id: string | null;
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  done: boolean;
};

export type DraftExercise = {
  workoutExerciseId: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  showRpe: boolean;
  mark: ExerciseMark | null;
  sets: DraftSet[];
};

export type WorkoutDraft = { workoutId: string; name: string; exercises: DraftExercise[] };

function mapExercise(d: WorkoutDraft, workoutExerciseId: string, change: (e: DraftExercise) => DraftExercise): WorkoutDraft {
  if (!d.exercises.some((e) => e.workoutExerciseId === workoutExerciseId)) return d;
  return { ...d, exercises: d.exercises.map((e) => (e.workoutExerciseId === workoutExerciseId ? change(e) : e)) };
}

/** Changes the fields of one set. An exercise or index that is not there changes nothing. */
export function patchDraftSet(d: WorkoutDraft, workoutExerciseId: string, index: number, patch: Partial<DraftSet>): WorkoutDraft {
  const ex = d.exercises.find((e) => e.workoutExerciseId === workoutExerciseId);
  if (!ex || index < 0 || index >= ex.sets.length) return d;
  return mapExercise(d, workoutExerciseId, (e) => ({
    ...e,
    sets: e.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  }));
}

/** Adds a working set at the end of the exercise: empty, not done, in the display units. */
export function addDraftSet(d: WorkoutDraft, workoutExerciseId: string, unit: WeightUnit, distanceUnit: DistanceUnit): WorkoutDraft {
  const added: DraftSet = {
    id: null,
    setType: 'working',
    weight: null,
    weightUnit: unit,
    reps: null,
    rpe: null,
    durationS: null,
    distance: null,
    distanceUnit,
    done: false,
  };
  return mapExercise(d, workoutExerciseId, (e) => ({ ...e, sets: [...e.sets, added] }));
}

/** Removes the set at `index`. */
export function removeDraftSet(d: WorkoutDraft, workoutExerciseId: string, index: number): WorkoutDraft {
  return mapExercise(d, workoutExerciseId, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== index) }));
}

/** Sets or clears (null, "Nothing off") the exercise's Something off. */
export function setDraftMark(d: WorkoutDraft, workoutExerciseId: string, mark: ExerciseMark | null): WorkoutDraft {
  return mapExercise(d, workoutExerciseId, (e) => ({ ...e, mark }));
}

function sameSet(a: DraftSet, b: DraftSet): boolean {
  return (
    a.id === b.id &&
    a.setType === b.setType &&
    a.weight === b.weight &&
    a.weightUnit === b.weightUnit &&
    a.reps === b.reps &&
    a.rpe === b.rpe &&
    a.durationS === b.durationS &&
    a.distance === b.distance &&
    a.distanceUnit === b.distanceUnit &&
    a.done === b.done
  );
}

/** Whether the draft differs from the saved one in anything Save would write. Compares values, not identity. */
export function isDraftDirty(saved: WorkoutDraft, current: WorkoutDraft): boolean {
  if (saved.exercises.length !== current.exercises.length) return true;
  return saved.exercises.some((a, i) => {
    const b = current.exercises[i];
    if (a.workoutExerciseId !== b.workoutExerciseId || a.mark !== b.mark || a.sets.length !== b.sets.length) return true;
    return a.sets.some((s, j) => !sameSet(s, b.sets[j]));
  });
}

export type DraftProblem = { workoutExerciseId: string; index: number; need: 'weight' | 'reps' | 'time' | 'distance' };

type Need = DraftProblem['need'];

/** The values a done set must hold, in column order (as `isComplete`): bodyweight plus needs only reps. */
const NEEDS: Record<LoggingType, Need[]> = {
  weighted: ['weight', 'reps'],
  assisted: ['weight', 'reps'],
  bodyweight_plus: ['reps'],
  weighted_time: ['weight', 'time'],
  timed: ['time'],
  distance_time: ['distance', 'time'],
};

function valueOf(s: DraftSet, need: Need): number | null {
  switch (need) {
    case 'weight':
      return s.weight;
    case 'reps':
      return s.reps;
    case 'time':
      return s.durationS;
    case 'distance':
      return s.distance;
  }
}

/** Each done set missing a value its logging type needs, with the first such value in column order. */
export function draftProblems(d: WorkoutDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  for (const e of d.exercises) {
    e.sets.forEach((s, index) => {
      if (!s.done) return;
      const need = NEEDS[e.loggingType].find((n) => valueOf(s, n) === null);
      if (need) problems.push({ workoutExerciseId: e.workoutExerciseId, index, need });
    });
  }
  return problems;
}

/** Whether saving would leave the workout with no set at all: no set anywhere is done (unticked sets are dropped). */
export function draftLeavesNothing(d: WorkoutDraft): boolean {
  return !d.exercises.some((e) => e.sets.some((s) => s.done));
}
