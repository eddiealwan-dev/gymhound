import { and, asc, desc, eq, gte, inArray, isNotNull, max, ne, type SQL } from 'drizzle-orm';
import type { PrHighlight } from '../../domain/prs';
import type { NextTime } from '../../domain/ruleLine';
import type { PrevSet } from '../../domain/setEntry';
import type { BestWeight } from '../../domain/setTable';
import type { DistanceUnit, Equipment, ExerciseMark, LoggingType, WeightUnit } from '../../domain/types';
import { convertWeight } from '../../domain/units';
import { totalVolume, type VolumeSet } from '../../domain/volume';
import { exerciseNotes, exercisePrefs, exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';
import { getWorkoutPrs } from './prRepo';
import { ruleOf } from './ruleSnapshot';

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
  /**
   * A program carry's distance unit (`weighted_distance`, R607: the slot's ft or yd, else m). Optional: without it the
   * set rows enter a carry in last time's unit, else m (`entryDistanceUnit`).
   */
  slotDistanceUnit?: DistanceUnit | null;
  /**
   * The heaviest done set, warmups left out, the exercise has in a finished workout, in the unit it was logged in; null
   * with none (R422). Optional so a view built by hand reads as no history.
   */
  bestWeight?: BestWeight | null;
};

export type ActiveWorkoutView = {
  id: string;
  name: string;
  startedAt: number;
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
  /** Next time's weight for each exercise with a rule and a next weight, in workout order (spec 8.5, R64). */
  next: NextTime[];
  /** The personal bests set in this workout (R105), in workout order: one per exercise and kind. Empty when none. */
  prs: PrHighlight[];
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
  extraReps: sets.extraReps,
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

/**
 * Each exercise's heaviest done set in finished workouts, warmups left out, in the unit it was logged in (R422). One
 * query for the whole workout: the heaviest per unit, then the heavier of the two compared in kg.
 */
function bestWeights(db: Db, exerciseIds: string[]): Map<string, BestWeight> {
  const rows = db
    .select({ exerciseId: workoutExercises.exerciseId, unit: sets.weightUnit, weight: max(sets.weight) })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(
      and(
        inArray(workoutExercises.exerciseId, exerciseIds),
        eq(workouts.status, 'finished'),
        eq(sets.done, true),
        ne(sets.setType, 'warmup'),
        isNotNull(sets.weight),
        isNotNull(sets.weightUnit),
      ),
    )
    .groupBy(workoutExercises.exerciseId, sets.weightUnit)
    .all();
  const best = new Map<string, BestWeight>();
  for (const { exerciseId, unit, weight } of rows) {
    if (unit === null || weight === null) continue;
    const held = best.get(exerciseId);
    if (!held || convertWeight(weight, unit, 'kg') > convertWeight(held.value, held.unit, 'kg')) best.set(exerciseId, { value: weight, unit });
  }
  return best;
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
  const best = bestWeights(
    db,
    rows.map((r) => r.we.exerciseId),
  );
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
      extraReps: s.extraReps,
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
      rule: ruleOf(we),
      plannedWeight: we.plannedWeight,
      plannedUnit: we.plannedUnit,
      overrideWeight: we.overrideWeight,
      overrideUnit: we.overrideUnit,
      mark: we.mark,
      sets: setsByExercise.get(we.id) ?? [],
      previous: getPreviousSets(db, we.exerciseId, workout.id),
      bestWeight: best.get(we.exerciseId) ?? null,
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

/**
 * What the rule left at finish for each exercise of the workout that has a rule and a next weight, in workout order.
 * No rule (an exercise added on the day, a timed one) and no next weight (no working set ticked and nothing planned)
 * leave the exercise out.
 */
function selectNextTimes(db: Db, workoutId: string): NextTime[] {
  const rows = db
    .select({
      workoutExerciseId: workoutExercises.id,
      name: exercises.name,
      loggingType: exercises.loggingType,
      outcome: workoutExercises.outcome,
      nextWeight: workoutExercises.nextWeight,
      nextUnit: workoutExercises.nextUnit,
      mark: workoutExercises.mark,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  return rows.flatMap(({ workoutExerciseId, name, loggingType, outcome, nextWeight, nextUnit, mark }) =>
    outcome === null || outcome === 'no_rule' || nextWeight === null || nextUnit === null
      ? []
      : [{ workoutExerciseId, name, loggingType, outcome, nextWeight, nextUnit, mark }],
  );
}

/**
 * The duration, volume, done-set count, next-time weights and personal bests of a finished workout. Throws if it does not exist or is
 * not finished.
 */
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
    next: selectNextTimes(db, workoutId),
    prs: getWorkoutPrs(db, workoutId),
  };
}
