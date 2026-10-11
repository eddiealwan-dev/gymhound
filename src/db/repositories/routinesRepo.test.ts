/** @jest-environment node */
import { and, asc, eq } from 'drizzle-orm';
import type { ExerciseMark } from '../../domain/types';
import { PREMADE_ORDER } from '../../seed/seed';
import { routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getSettings } from './settingsRepo';
import { getUpNext, listRoutines, setActiveRoutine } from './routinesRepo';
import { setExerciseMark } from './workoutEditRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './workoutsRepo';

const PPL = 'premade-ppl-6';
const PUSH_A = 'premade-ppl-6:push-a';
const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The workout_exercises row of the bench press in a workout. */
function benchIn(db: Db, workoutId: string) {
  return db
    .select()
    .from(workoutExercises)
    .where(and(eq(workoutExercises.workoutId, workoutId), eq(workoutExercises.exerciseId, 'barbell-bench-press')))
    .get()!;
}

/**
 * Runs Push A: ticks every bench set at `weight` lb x `reps`, flags the bench with `mark` when given, and finishes,
 * leaving every other exercise unticked. Then winds the rotation back so Push A is up next again.
 */
function finishBench(db: Db, at: number, weight: number, reps: number, mark: ExerciseMark | null = null): void {
  const id = startWorkoutFromDay(db, PUSH_A, at);
  const bench = benchIn(db, id);
  const benchSets = db.select({ id: sets.id }).from(sets).where(eq(sets.workoutExerciseId, bench.id)).orderBy(asc(sets.position)).all();
  benchSets.forEach((s, i) => tickSet(db, s.id, { weight, reps, durationS: null, distance: null }, 'lb', at + (i + 1) * 60_000, 'mi'));
  if (mark !== null) setExerciseMark(db, bench.id, mark);
  finishWorkout(db, id, at + HOUR);
  db.update(routines).set({ nextDayIndex: 0 }).where(eq(routines.id, PPL)).run();
}

function insertFinishedWorkout(
  db: Db,
  w: { id: string; dayId: string; finishedAt: number; localDate: string; dayMark?: 'normal' | 'rough_sleep' },
): void {
  db.insert(workouts)
    .values({
      id: w.id,
      name: 'Workout',
      routineId: PPL,
      routineDayId: w.dayId,
      status: 'finished',
      dayMark: w.dayMark ?? 'normal',
      startedAt: w.finishedAt - 3_600_000,
      finishedAt: w.finishedAt,
      localDate: w.localDate,
    })
    .run();
}

function insertUserRoutine(db: Db, id: string, createdAt: number): void {
  db.insert(routines).values({ id, name: id, isPremade: false, nextDayIndex: 0, createdAt }).run();
}

describe('listRoutines', () => {
  it('returns the premades in PREMADE_ORDER with their day counts', () => {
    const db = seededDb();
    const list = listRoutines(db);
    expect(list.map((r) => r.id)).toEqual(PREMADE_ORDER);
    expect(list.every((r) => r.isPremade)).toBe(true);
    expect(list.every((r) => !r.isActive)).toBe(true);
    expect(list.find((r) => r.id === PPL)).toEqual({
      id: PPL,
      name: 'Push/pull/legs',
      isPremade: true,
      dayCount: 6,
      isActive: false,
    });
  });

  it('puts user routines after the premades, by created_at', () => {
    const db = seededDb();
    insertUserRoutine(db, 'user-late', 3_000);
    insertUserRoutine(db, 'user-early', 1_000);
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, 'user-early', 'user-late']);
  });

  it('counts the days of a user routine, including none', () => {
    const db = seededDb();
    insertUserRoutine(db, 'user-r', 1_000);
    expect(listRoutines(db).find((r) => r.id === 'user-r')).toMatchObject({ isPremade: false, dayCount: 0 });
    db.insert(routineDays).values({ id: 'user-r:d1', routineId: 'user-r', name: 'Day 1', position: 0 }).run();
    expect(listRoutines(db).find((r) => r.id === 'user-r')!.dayCount).toBe(1);
  });
});

describe('setActiveRoutine', () => {
  it('marks exactly one routine active, and null clears it', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    expect(getSettings(db).activeRoutineId).toBe(PPL);
    expect(listRoutines(db).filter((r) => r.isActive).map((r) => r.id)).toEqual([PPL]);

    setActiveRoutine(db, 'premade-fullbody-3');
    expect(listRoutines(db).filter((r) => r.isActive).map((r) => r.id)).toEqual(['premade-fullbody-3']);

    setActiveRoutine(db, null);
    expect(getSettings(db).activeRoutineId).toBeNull();
    expect(listRoutines(db).some((r) => r.isActive)).toBe(false);
  });
});

describe('getUpNext', () => {
  it('is null when no routine is active', () => {
    expect(getUpNext(seededDb())).toBeNull();
  });

  it('is null when the active routine no longer exists', () => {
    const db = seededDb();
    setActiveRoutine(db, 'deleted-routine');
    expect(getUpNext(db)).toBeNull();
  });

  it('is null when the active routine has no days', () => {
    const db = seededDb();
    insertUserRoutine(db, 'user-empty', 1_000);
    setActiveRoutine(db, 'user-empty');
    expect(getUpNext(db)).toBeNull();
  });

  it('shows the first day of a fresh routine, never done before', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    const u = getUpNext(db)!;
    expect([u.routineName, u.dayName, u.lastTime]).toEqual(['Push/pull/legs', 'Push A', null]);
    expect([u.routineId, u.dayId]).toEqual([PPL, PUSH_A]);
    expect(u.exercises[0]).toMatchObject({
      exerciseId: 'barbell-bench-press',
      name: 'Barbell bench press',
      loggingType: 'weighted',
      equipment: 'barbell',
      setCount: 4,
      repMin: 5,
      repMax: 8,
      increment: 5,
      incrementUnit: 'lb',
      nextWeight: null,
      nextWeightUnit: null,
      lastOutcome: null,
      lastMark: null,
    });
  });

  it('lists the day exercises in position order', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    expect(getUpNext(db)!.exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'barbell-overhead-press',
      'incline-dumbbell-press',
      'dumbbell-lateral-raise',
      'cable-triceps-pushdown',
    ]);
  });

  it('carries the cached next weight and its unit', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    db.update(routineExercises)
      .set({ nextWeight: 62.5, nextWeightUnit: 'kg' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();
    expect(getUpNext(db)!.exercises[0]).toMatchObject({
      routineExerciseId: `${PUSH_A}:barbell-bench-press`,
      nextWeight: 62.5,
      nextWeightUnit: 'kg',
    });
  });

  it('picks the day at next_day_index, wrapping around the number of days', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    db.update(routines).set({ nextDayIndex: 3 }).where(eq(routines.id, PPL)).run();
    expect(getUpNext(db)!.dayName).toBe('Push B');
    // 7 on a 6-day routine is day index 1.
    db.update(routines).set({ nextDayIndex: 7 }).where(eq(routines.id, PPL)).run();
    const u = getUpNext(db)!;
    expect([u.dayName, u.dayId]).toEqual(['Pull A', 'premade-ppl-6:pull-a']);
  });

  it('reports the date of the last finished workout of the day, and no longer reads its day mark (R69)', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    insertFinishedWorkout(db, {
      id: 'w-1',
      dayId: PUSH_A,
      finishedAt: Date.UTC(2026, 9, 7, 18),
      localDate: '2026-10-07',
      dayMark: 'rough_sleep',
    });
    expect(getUpNext(db)!.lastTime).toEqual({ localDate: '2026-10-07' });
  });

  it('uses the latest finished_at, and ignores other days and unfinished workouts', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    insertFinishedWorkout(db, { id: 'w-old', dayId: PUSH_A, finishedAt: Date.UTC(2026, 9, 1, 18), localDate: '2026-10-01' });
    insertFinishedWorkout(db, {
      id: 'w-new',
      dayId: PUSH_A,
      finishedAt: Date.UTC(2026, 9, 5, 18),
      localDate: '2026-10-05',
      dayMark: 'rough_sleep',
    });
    // A later workout of a different day does not count.
    insertFinishedWorkout(db, { id: 'w-other', dayId: 'premade-ppl-6:pull-a', finishedAt: Date.UTC(2026, 9, 8, 18), localDate: '2026-10-08' });
    // Neither does a workout still in progress.
    db.insert(workouts)
      .values({
        id: 'w-active',
        name: 'Push A',
        routineId: PPL,
        routineDayId: PUSH_A,
        status: 'active',
        startedAt: Date.UTC(2026, 9, 9, 8),
        localDate: '2026-10-09',
      })
      .run();
    expect(getUpNext(db)!.lastTime).toEqual({ localDate: '2026-10-05' });
  });

  it("after a raised finish, the next Up next row has last time's outcome 'raised'", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    finishBench(db, NOW, 135, 8);

    const [bench, ohp] = getUpNext(db)!.exercises;
    expect(bench).toMatchObject({ lastOutcome: 'raised', lastMark: null, nextWeight: 140, nextWeightUnit: 'lb' });
    // The overhead press had nothing ticked, so finish dropped it: no history yet.
    expect(ohp).toMatchObject({ exerciseId: 'barbell-overhead-press', lastOutcome: null, lastMark: null });
  });

  it("a flagged hold carries its reason, and the latest finish is last time's", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    finishBench(db, NOW, 135, 8);
    finishBench(db, NOW + DAY, 140, 8, 'rough_sleep');

    expect(getUpNext(db)!.exercises[0]).toMatchObject({ lastOutcome: 'held_marked', lastMark: 'rough_sleep', nextWeight: 140 });
  });

  it('a workout of the day still in progress is not last time', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    finishBench(db, NOW, 135, 8);
    const active = startWorkoutFromDay(db, PUSH_A, NOW + DAY);
    setExerciseMark(db, benchIn(db, active).id, 'pain');

    expect(getUpNext(db)!.exercises[0]).toMatchObject({ lastOutcome: 'raised', lastMark: null });
  });
});
