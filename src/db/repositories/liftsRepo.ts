import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { LiftSession, LiftSet } from '../../domain/liftStats';
import type { Equipment, LoggingType } from '../../domain/types';
import { exercises, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';

/** A lift on Stats (R172): an exercise with history. */
export type LiftSummary = { exerciseId: string; name: string; loggingType: LoggingType; lastDate: string; sessionCount: number };

/**
 * Exercises with a done, non-warmup set in a finished workout (the active workout is never read): the date of the
 * newest such workout and how many there are. Newest last date first, then by name.
 */
export function listLifts(db: Db): LiftSummary[] {
  const lastDate = sql<string>`max(${workouts.localDate})`;
  return db
    .select({
      exerciseId: exercises.id,
      name: exercises.name,
      loggingType: exercises.loggingType,
      lastDate,
      sessionCount: sql<number>`count(distinct ${workouts.id})`,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(and(eq(workouts.status, 'finished'), eq(sets.done, true), ne(sets.setType, 'warmup')))
    .groupBy(exercises.id)
    .orderBy(sql`${lastDate} desc`, asc(exercises.name))
    .all();
}

/** The exercise a lift's screen shows, or null for an unknown id. */
export function getLift(
  db: Db,
  exerciseId: string,
): { id: string; name: string; loggingType: LoggingType; equipment: Equipment } | null {
  return (
    db
      .select({ id: exercises.id, name: exercises.name, loggingType: exercises.loggingType, equipment: exercises.equipment })
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .get() ?? null
  );
}

/**
 * One session per finished workout with the exercise (R173), oldest first (by start; the active workout is never
 * read). When the exercise is in a workout twice, the first block in position order with a working weight (else the
 * first block) gives the mark, rule, outcome and working weight; `sets` are the done sets of every block, block by
 * block in position order (warmups included). A workout with no done non-warmup set of the exercise is left out, so
 * the count matches `listLifts`.
 */
export function liftSessions(db: Db, exerciseId: string): LiftSession[] {
  const blocks = db
    .select({
      id: workoutExercises.id,
      workoutId: workouts.id,
      localDate: workouts.localDate,
      startedAt: workouts.startedAt,
      mark: workoutExercises.mark,
      routineExerciseId: workoutExercises.routineExerciseId,
      ruleSetCount: workoutExercises.ruleSetCount,
      ruleIncrement: workoutExercises.ruleIncrement,
      outcome: workoutExercises.outcome,
      workingWeight: workoutExercises.workingWeight,
      workingUnit: workoutExercises.workingUnit,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(workouts.status, 'finished')))
    .orderBy(asc(workouts.startedAt), asc(workouts.id), asc(workoutExercises.position))
    .all();
  if (blocks.length === 0) return [];

  const setRows = db
    .select({
      workoutExerciseId: sets.workoutExerciseId,
      setType: sets.setType,
      done: sets.done,
      weight: sets.weight,
      weightUnit: sets.weightUnit,
      reps: sets.reps,
      durationS: sets.durationS,
      distance: sets.distance,
      distanceUnit: sets.distanceUnit,
      extraReps: sets.extraReps,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
    .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
    .where(and(eq(workoutExercises.exerciseId, exerciseId), eq(workouts.status, 'finished'), eq(sets.done, true)))
    .orderBy(asc(sets.position))
    .all();
  const setsByBlock = new Map<string, LiftSet[]>();
  for (const { workoutExerciseId, ...set } of setRows) {
    const list = setsByBlock.get(workoutExerciseId);
    if (list) list.push(set);
    else setsByBlock.set(workoutExerciseId, [set]);
  }

  const byWorkout = new Map<string, typeof blocks>();
  for (const b of blocks) {
    const list = byWorkout.get(b.workoutId);
    if (list) list.push(b);
    else byWorkout.set(b.workoutId, [b]);
  }

  const sessions: LiftSession[] = [];
  for (const group of byWorkout.values()) {
    const sessionSets = group.flatMap((b) => setsByBlock.get(b.id) ?? []);
    // As listLifts: a workout counts only with a done non-warmup set of the exercise.
    if (!sessionSets.some((s) => s.setType !== 'warmup')) continue;
    const main = group.find((b) => b.workingWeight !== null) ?? group[0];
    // As the rule at finish: no routine exercise means no rule (7.3 step 3).
    const hasRule = main.routineExerciseId !== null && main.ruleSetCount !== null;
    sessions.push({
      workoutId: main.workoutId,
      localDate: main.localDate,
      startedAt: main.startedAt,
      mark: main.mark,
      hasRule,
      ruleIncrement: hasRule ? main.ruleIncrement : null,
      outcome: main.outcome,
      workingWeight: main.workingWeight,
      workingUnit: main.workingUnit,
      sets: sessionSets,
    });
  }
  return sessions;
}
