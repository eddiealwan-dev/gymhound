import { asc, eq, inArray } from 'drizzle-orm';
import type { ExerciseMark, WeightUnit } from '../../domain/types';
import { NEW_EXERCISES } from '../../seed/newExercises';
import { programById } from '../../seed/programs.generated';
import type { Program } from '../../seed/programTypes';
import { setExerciseMark } from '../repositories/workoutEditRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from '../repositories/workoutsRepo';
import { exercises, routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import type { Db } from '../types';

/** The time the fixture inserts at: 2026-10-01 00:00 UTC. */
const INSERTED_AT = Date.UTC(2026, 9, 1);

/**
 * Inserts one of the twenty programs from `PROGRAMS` into a test database as seed 9 writes it (R637): the routine
 * `program-…` with its days (`{program}:{slug}`) and slots (the slot's id), each slot's increment from `incrementLb` in
 * `unit` (kg is half, R611), a ladder slot on its first rung's exercise, and no progress columns. The new exercises it
 * uses that the database lacks are added from `NEW_EXERCISES`. Rows that exist already are left alone, so it also runs
 * on a database seed 9 has filled. Returns the program.
 */
export function insertProgram(db: Db, programId: string, unit: WeightUnit = 'lb'): Program {
  const program = programById(programId);
  if (!program) throw new Error(`No program ${programId}.`);

  const wanted = new Set(
    program.days.flatMap((d) => d.slots.flatMap((s) => [s.exerciseId, ...(s.ladder ?? []).map((r) => r.exerciseId)])),
  );
  const present = new Set(
    db
      .select({ id: exercises.id })
      .from(exercises)
      .where(inArray(exercises.id, [...wanted]))
      .all()
      .map((r) => r.id),
  );
  const missing = NEW_EXERCISES.filter((e) => wanted.has(e.id) && !present.has(e.id));
  if (missing.length > 0) {
    db.insert(exercises)
      .values(missing.map((e) => ({ ...e, isCustom: false, createdAt: INSERTED_AT })))
      .run();
  }

  db.insert(routines)
    .values({ id: program.id, name: program.name, isPremade: true, nextDayIndex: 0, createdAt: INSERTED_AT })
    .onConflictDoNothing()
    .run();
  program.days.forEach((day, dayPosition) => {
    const dayId = `${program.id}:${day.slug}`;
    db.insert(routineDays).values({ id: dayId, routineId: program.id, name: day.name, position: dayPosition }).onConflictDoNothing().run();
    day.slots.forEach((slot, position) => {
      db.insert(routineExercises)
        .values({
          id: slot.id,
          routineDayId: dayId,
          exerciseId: slot.ladder ? slot.ladder[0].exerciseId : slot.exerciseId,
          position,
          setCount: slot.sets,
          repMin: slot.repMin,
          repMax: slot.repMax,
          increment: unit === 'lb' ? slot.incrementLb : slot.incrementLb / 2,
          incrementUnit: unit,
        })
        .onConflictDoNothing()
        .run();
    });
  });
  return program;
}

const HOUR = 3_600_000;

/**
 * Inserts `count` finished workouts of the routine, an hour apart from `from`, with no exercises: enough to move a
 * program's week (R616), which counts finished workouts and not what was in them.
 */
export function fakeSessions(db: Db, routineId: string, count: number, from: number): void {
  for (let i = 0; i < count; i++) {
    const startedAt = from + i * HOUR;
    db.insert(workouts)
      .values({
        id: `fake-${routineId}-${startedAt}`,
        name: 'Fake',
        routineId,
        status: 'finished',
        startedAt,
        finishedAt: startedAt + HOUR / 2,
        localDate: new Date(startedAt).toISOString().slice(0, 10),
      })
      .run();
  }
}

/**
 * What a session logs for one slot: the sets ticked (each one's reps or seconds; a set left out stays unticked), at
 * `weight` (null for none) in `unit`, and a Something off mark.
 */
export type SlotLog = { weight?: number | null; unit?: WeightUnit; reps?: number[]; seconds?: number[]; mark?: ExerciseMark };

/**
 * Starts a workout from `dayId` at `at`, ticks each slot listed in `logs` (by routine exercise id), and finishes it half
 * an hour later. Slots not listed are left unticked, so finishing drops them. Returns the workout id.
 */
export function runSession(db: Db, dayId: string, at: number, logs: Readonly<Record<string, SlotLog>>, finish = true): string {
  const workoutId = startWorkoutFromDay(db, dayId, at);
  const blocks = db
    .select({ id: workoutExercises.id, routineExerciseId: workoutExercises.routineExerciseId })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  for (const b of blocks) {
    const log = b.routineExerciseId === null ? undefined : logs[b.routineExerciseId];
    if (!log) continue;
    const setIds = db
      .select({ id: sets.id })
      .from(sets)
      .where(eq(sets.workoutExerciseId, b.id))
      .orderBy(asc(sets.position))
      .all()
      .map((r) => r.id);
    const values = log.seconds ?? log.reps ?? [];
    values.forEach((v, i) => {
      if (i >= setIds.length) return;
      tickSet(
        db,
        setIds[i],
        { weight: log.weight ?? null, reps: log.seconds ? null : v, durationS: log.seconds ? v : null, distance: null },
        log.unit ?? 'lb',
        at + i * 60_000,
        'mi',
      );
    });
    if (log.mark) setExerciseMark(db, b.id, log.mark);
  }
  if (finish) finishWorkout(db, workoutId, at + HOUR / 2);
  return workoutId;
}
