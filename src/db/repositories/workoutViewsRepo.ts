import { and, asc, desc, eq, gte, inArray, ne, type SQL } from 'drizzle-orm';
import type { PrevSet } from '../../domain/setEntry';
import type { DayMark, Equipment, ExerciseMark, LoggingType, WeightUnit } from '../../domain/types';
import { totalVolume, type VolumeSet } from '../../domain/volume';
import { exerciseNotes, exercisePrefs, exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';

export type SetView = PrevSet & {
  id: string;
  rpe: number | null;
  done: boolean;
  /** When the set was ticked (epoch ms), or null while it is not. */
  completedAt: number | null;
};

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
  /** The exercise's own rest in seconds: null uses the rest in Settings, 0 is Off. */
  restSeconds: number | null;
  /** The rule as it was when the workout started. Null if the exercise has none. */
  rule: { setCount: number; repMin: number; repMax: number; increment: number; incrementUnit: WeightUnit } | null;
  plannedWeight: number | null;
  plannedUnit: WeightUnit | null;
  overrideWeight: number | null;
  overrideUnit: WeightUnit | null;
  /** Something off today (R60): the reason the exercise is flagged, or null when nothing is off. */
  mark: ExerciseMark | null;
  sets: SetView[];
  previous: PrevSet[];
};

export type ActiveWorkoutView = {
  id: string;
  name: string;
  startedAt: number;
  dayMark: DayMark;
  restEndsAt: number | null;
  /** The set whose tick started the running rest (R38); the countdown shows under it. Null when no rest runs. */
  restSetId: string | null;
  exercises: WorkoutExerciseView[];
};

export type FinishSummary = {
  id: string;
  name: string;
  durationMs: number;
  /** Total volume in the display unit, a whole number. */
  volume: number;
  /** How many sets were done, warm-ups included. */
  setCount: number;
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

/** The active workout with its exercises, sets, sticky notes, rest prefs and previous sets. Null when none is active. */
export function getActiveWorkoutView(db: Db): ActiveWorkoutView | null {
  const workout = db.select().from(workouts).where(eq(workouts.status, 'active')).get();
  if (!workout) return null;

  const rows = db
    .select({ we: workoutExercises, exercise: exercises, note: exerciseNotes.text, restSeconds: exercisePrefs.restSeconds })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .leftJoin(exerciseNotes, eq(exerciseNotes.exerciseId, workoutExercises.exerciseId))
    .leftJoin(exercisePrefs, eq(exercisePrefs.exerciseId, workoutExercises.exerciseId))
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
      completedAt: s.completedAt,
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
    restSetId: workout.restSetId,
    exercises: rows.map(({ we, exercise, note, restSeconds }) => ({
      id: we.id,
      exerciseId: we.exerciseId,
      name: exercise.name,
      loggingType: exercise.loggingType,
      equipment: exercise.equipment,
      position: we.position,
      supersetGroup: we.supersetGroup,
      showRpe: we.showRpe,
      note,
      restSeconds,
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
      mark: we.mark,
      sets: setsByExercise.get(we.id) ?? [],
      previous: getPreviousSets(db, we.exerciseId, workout.id),
    })),
  };
}

const VOLUME_SET_COLUMNS = {
  loggingType: exercises.loggingType,
  setType: sets.setType,
  done: sets.done,
  weight: sets.weight,
  weightUnit: sets.weightUnit,
  reps: sets.reps,
};

/** Every set, done or not, of the workouts matching `where`, in workout, exercise and set order. */
function selectVolumeSets(db: Db, where: SQL): VolumeSet[] {
  return db
    .select(VOLUME_SET_COLUMNS)
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(where)
    .orderBy(asc(workouts.startedAt), asc(workoutExercises.position), asc(sets.position))
    .all();
}

/** The distinct `local_date` values of finished workouts, earliest first (spec 7.8). The active workout is not one. */
export function getTrainingDates(db: Db): string[] {
  return db
    .selectDistinct({ localDate: workouts.localDate })
    .from(workouts)
    .where(eq(workouts.status, 'finished'))
    .orderBy(asc(workouts.localDate))
    .all()
    .map((row) => row.localDate);
}

/**
 * Every set of the finished and the active workouts with `local_date >= fromLocalDate` (spec 7.9), done or
 * not and of any type. `totalVolume` does the filtering.
 */
export function getVolumeSetsSince(db: Db, fromLocalDate: string): VolumeSet[] {
  // A workout is either finished or active, so no status filter is needed.
  return selectVolumeSets(db, gte(workouts.localDate, fromLocalDate));
}

/** The duration, volume and done-set count of a finished workout. Throws if it does not exist or is not finished. */
export function getFinishSummary(db: Db, workoutId: string, displayUnit: WeightUnit): FinishSummary {
  const workout = db.select().from(workouts).where(eq(workouts.id, workoutId)).get();
  if (!workout || workout.status !== 'finished' || workout.finishedAt === null) {
    throw new Error(`No finished workout with id ${workoutId}.`);
  }

  const workoutSets = selectVolumeSets(db, eq(workouts.id, workoutId));
  return {
    id: workout.id,
    name: workout.name,
    durationMs: workout.finishedAt - workout.startedAt,
    volume: totalVolume(workoutSets, displayUnit),
    setCount: workoutSets.filter((s) => s.done).length,
  };
}
