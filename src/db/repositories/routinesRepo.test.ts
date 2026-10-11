/** @jest-environment node */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { canAddRoutine } from '../../domain/routineLimit';
import type { ExerciseMark } from '../../domain/types';
import { PREMADE_ORDER } from '../../seed/seed';
import { routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';
import {
  deleteRoutine,
  duplicateRoutine,
  getRoutineDetail,
  getUpNext,
  listRoutines,
  PremadeRoutineError,
  setActiveRoutine,
  userRoutineCount,
} from './routinesRepo';
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
    expect(ohp).toMatchObject({
      exerciseId: 'barbell-overhead-press',
      lastOutcome: null,
      lastMark: null,
      lastWorkingWeight: null,
      lastWorkingUnit: null,
      lastNextWeight: null,
      lastNextUnit: null,
    });
  });

  it("carries last time's working and next weights, so the row can show the actual rise (R73)", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    // Without 2.5 lb plates the raise from 135 rounds up to 145.
    setSetting(db, 'platesLb', { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1 });
    finishBench(db, NOW, 135, 8);

    expect(getUpNext(db)!.exercises[0]).toMatchObject({
      lastOutcome: 'raised',
      lastWorkingWeight: 135,
      lastWorkingUnit: 'lb',
      lastNextWeight: 145,
      lastNextUnit: 'lb',
    });
  });

  it("a flagged hold carries its reason, and the latest finish is last time's", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    finishBench(db, NOW, 135, 8);
    finishBench(db, NOW + DAY, 140, 8, 'rough_sleep');

    expect(getUpNext(db)!.exercises[0]).toMatchObject({ lastOutcome: 'held_marked', lastMark: 'rough_sleep', nextWeight: 140 });
  });

  it("a slot that now holds another exercise has no last time: the old exercise's finish is not its history (R74)", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    finishBench(db, NOW, 135, 8);
    db.update(routineExercises)
      .set({ exerciseId: 'incline-dumbbell-press' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();

    expect(getUpNext(db)!.exercises[0]).toMatchObject({
      exerciseId: 'incline-dumbbell-press',
      lastOutcome: null,
      lastMark: null,
      lastWorkingWeight: null,
      lastWorkingUnit: null,
      lastNextWeight: null,
      lastNextUnit: null,
    });
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

/** The days of a routine in position order, each with its exercise rows in position order. */
function rowsOf(db: Db, routineId: string) {
  return db
    .select()
    .from(routineDays)
    .where(eq(routineDays.routineId, routineId))
    .orderBy(asc(routineDays.position))
    .all()
    .map((day) => ({
      day,
      exercises: db
        .select()
        .from(routineExercises)
        .where(eq(routineExercises.routineDayId, day.id))
        .orderBy(asc(routineExercises.position))
        .all(),
    }));
}

type ExerciseRow = typeof routineExercises.$inferSelect;

/** A routine exercise row without its ids and progress: the rule as the editor sets it. */
function ruleOfRow({ id: _id, routineDayId: _day, nextWeight: _w, nextWeightUnit: _u, ...rule }: ExerciseRow) {
  return rule;
}

describe('getRoutineDetail', () => {
  it('is null for a routine that does not exist', () => {
    expect(getRoutineDetail(seededDb(), 'no-such-routine')).toBeNull();
  });

  it("shows a premade's days in order, each with its exercises and their rules", () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    db.update(routineExercises)
      .set({ nextWeight: 135, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();

    const detail = getRoutineDetail(db, PPL)!;
    expect([detail.id, detail.name, detail.isPremade, detail.isActive]).toEqual([PPL, 'Push/pull/legs', true, true]);
    expect(detail.days.map((d) => d.name)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    expect(detail.days[0].id).toBe(PUSH_A);
    expect(detail.days[0].exercises.map((e) => e.exerciseId)).toEqual([
      'barbell-bench-press',
      'barbell-overhead-press',
      'incline-dumbbell-press',
      'dumbbell-lateral-raise',
      'cable-triceps-pushdown',
    ]);
    expect(detail.days[0].exercises[0]).toEqual({
      id: `${PUSH_A}:barbell-bench-press`,
      exerciseId: 'barbell-bench-press',
      name: 'Barbell bench press',
      loggingType: 'weighted',
      equipment: 'barbell',
      setCount: 4,
      repMin: 5,
      repMax: 8,
      increment: 5,
      incrementUnit: 'lb',
      supersetGroup: null,
      nextWeight: 135,
      nextWeightUnit: 'lb',
    });
  });

  it('is not active when another routine is', () => {
    const db = seededDb();
    setActiveRoutine(db, 'premade-fullbody-3');
    expect(getRoutineDetail(db, PPL)!.isActive).toBe(false);
  });
});

describe('userRoutineCount', () => {
  it('counts only your own routines', () => {
    const db = seededDb();
    expect(userRoutineCount(db)).toBe(0);
    insertUserRoutine(db, 'user-a', 1_000);
    insertUserRoutine(db, 'user-b', 2_000);
    expect(userRoutineCount(db)).toBe(2);
  });
});

describe('duplicateRoutine', () => {
  it('copies a premade as your own routine named "{name} copy", created now, from its first day', () => {
    const db = seededDb();
    db.update(routines).set({ nextDayIndex: 4 }).where(eq(routines.id, PPL)).run();

    const id = duplicateRoutine(db, PPL, NOW);
    expect(id).not.toBe(PPL);
    expect(db.select().from(routines).where(eq(routines.id, id)).get()).toEqual({
      id,
      name: 'Push/pull/legs copy',
      isPremade: false,
      nextDayIndex: 0,
      createdAt: NOW,
    });
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, id]);
  });

  it('copies every day and exercise with new ids, the same rules and superset groups, and no next weights', () => {
    const db = seededDb();
    db.update(routineExercises)
      .set({ nextWeight: 140, nextWeightUnit: 'lb' })
      .where(eq(routineExercises.id, `${PUSH_A}:barbell-bench-press`))
      .run();
    db.update(routineExercises)
      .set({ supersetGroup: 1, increment: 2.5, incrementUnit: 'kg' })
      .where(inArray(routineExercises.id, [`${PUSH_A}:dumbbell-lateral-raise`, `${PUSH_A}:cable-triceps-pushdown`]))
      .run();

    const id = duplicateRoutine(db, PPL, NOW);
    const source = rowsOf(db, PPL);
    const copy = rowsOf(db, id);

    expect(copy.map((d) => [d.day.name, d.day.position])).toEqual(source.map((d) => [d.day.name, d.day.position]));
    const sourceIds = new Set(source.flatMap((d) => [d.day.id, ...d.exercises.map((e) => e.id)]));
    for (const { day, exercises } of copy) {
      expect(sourceIds.has(day.id)).toBe(false);
      for (const e of exercises) {
        expect(sourceIds.has(e.id)).toBe(false);
        expect(e.routineDayId).toBe(day.id);
        expect([e.nextWeight, e.nextWeightUnit]).toEqual([null, null]);
      }
    }
    expect(copy.map((d) => d.exercises.map(ruleOfRow))).toEqual(source.map((d) => d.exercises.map(ruleOfRow)));
    expect(copy[0].exercises.map((e) => [e.supersetGroup, e.increment, e.incrementUnit])).toEqual([
      [null, 5, 'lb'],
      [null, 5, 'lb'],
      [null, 5, 'lb'],
      [1, 2.5, 'kg'],
      [1, 2.5, 'kg'],
    ]);
  });

  it('leaves the source untouched', () => {
    const db = seededDb();
    const before = rowsOf(db, PPL);
    duplicateRoutine(db, PPL, NOW);
    expect(rowsOf(db, PPL)).toEqual(before);
  });

  it('copies your own routine too, and the copy counts toward the free limit', () => {
    const db = seededDb();
    const first = duplicateRoutine(db, 'premade-fullbody-3', NOW);
    expect(userRoutineCount(db)).toBe(1);
    expect(canAddRoutine(userRoutineCount(db), false)).toBe(false);

    const second = duplicateRoutine(db, first, NOW + HOUR);
    expect(getRoutineDetail(db, second)!.name).toBe('Full body copy copy');
    expect(userRoutineCount(db)).toBe(2);
  });

  it('throws for a routine that does not exist, adding nothing', () => {
    const db = seededDb();
    expect(() => duplicateRoutine(db, 'no-such-routine', NOW)).toThrow();
    expect(userRoutineCount(db)).toBe(0);
  });
});

describe('deleteRoutine (R90)', () => {
  it('refuses a premade, which stays as it was', () => {
    const db = seededDb();
    const before = rowsOf(db, PPL);
    expect(() => deleteRoutine(db, PPL)).toThrow(PremadeRoutineError);
    expect(getRoutineDetail(db, PPL)).not.toBeNull();
    expect(rowsOf(db, PPL)).toEqual(before);
  });

  it('deletes your routine with its days and exercises, and frees the slot', () => {
    const db = seededDb();
    const id = duplicateRoutine(db, PPL, NOW);
    const dayIds = rowsOf(db, id).map((d) => d.day.id);

    deleteRoutine(db, id);
    expect(getRoutineDetail(db, id)).toBeNull();
    expect(db.select().from(routineDays).where(eq(routineDays.routineId, id)).all()).toEqual([]);
    expect(db.select().from(routineExercises).where(inArray(routineExercises.routineDayId, dayIds)).all()).toEqual([]);
    expect(userRoutineCount(db)).toBe(0);
    expect(canAddRoutine(userRoutineCount(db), false)).toBe(true);
    // The premade it was copied from is untouched.
    expect(rowsOf(db, PPL)).toHaveLength(6);
  });

  it('keeps the finished workouts run from it, and no routine is active when it was the active one', () => {
    const db = seededDb();
    const id = duplicateRoutine(db, PPL, NOW);
    setActiveRoutine(db, id);
    const firstDay = rowsOf(db, id)[0].day.id;
    const workoutId = startWorkoutFromDay(db, firstDay, NOW);
    const bench = benchIn(db, workoutId);
    const benchSets = db.select({ id: sets.id }).from(sets).where(eq(sets.workoutExerciseId, bench.id)).all();
    benchSets.forEach((s, i) =>
      tickSet(db, s.id, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', NOW + (i + 1) * 60_000, 'mi'),
    );
    finishWorkout(db, workoutId, NOW + HOUR);

    deleteRoutine(db, id);
    expect(db.select().from(workouts).where(eq(workouts.id, workoutId)).get()).toMatchObject({
      status: 'finished',
      routineId: id,
      routineDayId: firstDay,
    });
    expect(db.select().from(sets).where(eq(sets.workoutExerciseId, bench.id)).all()).toHaveLength(benchSets.length);
    expect(getSettings(db).activeRoutineId).toBeNull();
    expect(getUpNext(db)).toBeNull();
  });

  it('leaves another active routine active', () => {
    const db = seededDb();
    const id = duplicateRoutine(db, PPL, NOW);
    setActiveRoutine(db, PPL);
    deleteRoutine(db, id);
    expect(getSettings(db).activeRoutineId).toBe(PPL);
  });

  it('does nothing for a routine that does not exist', () => {
    const db = seededDb();
    setActiveRoutine(db, PPL);
    expect(() => deleteRoutine(db, 'no-such-routine')).not.toThrow();
    expect(getSettings(db).activeRoutineId).toBe(PPL);
  });
});
