import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { PrevSet } from '../../domain/setEntry';
import type { DayMark, Equipment, LoggingType, WeightUnit } from '../../domain/types';
import { exerciseNotes, exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';

export type SetView = PrevSet & { id: string; rpe: number | null; done: boolean };

export type WorkoutExerciseView = {
  id: string;
  exerciseId: string;
  name: string;
  loggingType: LoggingType;
  equipment: Equipment;
  position: number;
  supersetGroup: number | null;
  showRpe: boolean;
  /** The exercise's sticky note, if it has one. */
  note: string | null;
  /** The rule as it was when the workout started. Null if the exercise has none. */
  rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null;
  plannedWeight: number | null;
  plannedUnit: WeightUnit | null;
  overrideWeight: number | null;
  overrideUnit: WeightUnit | null;
  sets: SetView[];
  previous: PrevSet[];
};

export type ActiveWorkoutView = {
  id: string;
  name: string;
  startedAt: number;
  dayMark: DayMark;
  restEndsAt: number | null;
  exercises: WorkoutExerciseView[];
};

const PREV_SET_COLUMNS = {
  position: sets.position,
  setType: sets.setType,
  weight: sets.weight,
  weightUnit: sets.weightUnit,
  reps: sets.reps,
  durationS: sets.durationS,
  distance: sets.distance,
  distanceUnit: sets.distanceUnit,
};

/**
 * The done sets of the exercise in the most recent finished workout that has it (by `finished_at`),
 * ordered by position. If that workout has the exercise more than once, the first occurrence is used.
 */
export function getPreviousSets(db: Db, exerciseId: string, excludeWorkoutId: string): PrevSet[] {
  const latest = db
    .select({ workoutExerciseId: workoutExercises.id })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        eq(workoutExercises.exerciseId, exerciseId),
        eq(workouts.status, 'finished'),
        ne(workouts.id, excludeWorkoutId),
        eq(sets.done, true),
      ),
    )
    .orderBy(desc(workouts.finishedAt), asc(workoutExercises.position))
    .limit(1)
    .get();
  if (!latest) return [];

  return db
    .select(PREV_SET_COLUMNS)
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, latest.workoutExerciseId), eq(sets.done, true)))
    .orderBy(asc(sets.position))
    .all();
}

/** The active workout with its exercises, sets, sticky notes and previous sets. Null when none is active. */
export function getActiveWorkoutView(db: Db): ActiveWorkoutView | null {
  const workout = db.select().from(workouts).where(eq(workouts.status, 'active')).get();
  if (!workout) return null;

  const rows = db
    .select({ we: workoutExercises, exercise: exercises, note: exerciseNotes.text })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(exerciseNotes, eq(exerciseNotes.exerciseId, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workout.id))
    .orderBy(asc(workoutExercises.position))
    .all();

  const setRows = db
    .select()
    .from(sets)
    .where(
      inArray(
        sets.workoutExerciseId,
        rows.map((r) => r.we.id),
      ),
    )
    .orderBy(asc(sets.position))
    .all();
  const setsByExercise = new Map<string, SetView[]>();
  for (const s of setRows) {
    const view: SetView = {
      id: s.id,
      position: s.position,
      setType: s.setType,
      weight: s.weight,
      weightUnit: s.weightUnit,
      reps: s.reps,
      rpe: s.rpe,
      durationS: s.durationS,
      distance: s.distance,
      distanceUnit: s.distanceUnit,
      done: s.done,
    };
    const list = setsByExercise.get(s.workoutExerciseId);
    if (list) list.push(view);
    else setsByExercise.set(s.workoutExerciseId, [view]);
  }

  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    dayMark: workout.dayMark,
    restEndsAt: workout.restEndsAt,
    exercises: rows.map(({ we, exercise, note }) => ({
      id: we.id,
      exerciseId: we.exerciseId,
      name: exercise.name,
      loggingType: exercise.loggingType,
      equipment: exercise.equipment,
      position: we.position,
      supersetGroup: we.supersetGroup,
      showRpe: we.showRpe,
      note,
      rule:
        we.ruleSetCount !== null &&
        we.ruleRepMin !== null &&
        we.ruleRepMax !== null &&
        we.ruleIncrement !== null &&
        we.ruleIncrementUnit !== null
          ? {
              setCount: we.ruleSetCount,
              repMin: we.ruleRepMin,
              repMax: we.ruleRepMax,
              increment: we.ruleIncrement,
              incrementUnit: we.ruleIncrementUnit,
            }
          : null,
      plannedWeight: we.plannedWeight,
      plannedUnit: we.plannedUnit,
      overrideWeight: we.overrideWeight,
      overrideUnit: we.overrideUnit,
      sets: setsByExercise.get(we.id) ?? [],
      previous: getPreviousSets(db, we.exerciseId, workout.id),
    })),
  };
}
