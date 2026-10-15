/** @jest-environment node */
import { and, asc, eq, inArray } from 'drizzle-orm';
import { draftReducer, hasChanges, newDraft } from '../../domain/routineDraft';
import type { DraftAction, LibraryExercise, RoutineDraft } from '../../domain/routineDraft';
import { canAddRoutine } from '../../domain/routineLimit';
import { gearFor } from '../../domain/plates';
import type { DayFromSaved } from '../../domain/savedWorkout';
import { upNextDayHasWeight, upNextLoad } from '../../domain/upNext';
import type { ExerciseMark, WeightUnit } from '../../domain/types';
import { PROGRAMS } from '../../seed/programs.generated';
import { PREMADE_ORDER, runSeed } from '../../seed/seed';
import { routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import { seededV1Db } from '../testing/seedV1';
import type { Db } from '../types';
import { getSettings, setSetting } from './settingsRepo';
import {
  deleteRoutine,
  duplicateRoutine,
  getRoutineDetail,
  getUpNext,
  listRoutines,
  PremadeRoutineError,
  routineToDraft,
  saveRoutine,
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
  it('returns the twenty programs in PREMADE_ORDER with their day counts, in the program group', () => {
    const db = seededDb();
    const list = listRoutines(db);
    expect(list.map((r) => r.id)).toEqual(PREMADE_ORDER);
    expect(list.map((r) => r.dayCount)).toEqual(PREMADE_ORDER.map((id) => PROGRAMS.find((p) => p.id === id)!.days.length));
    expect(list.every((r) => r.isPremade && r.group === 'program')).toBe(true);
    expect(list.every((r) => !r.isActive)).toBe(true);
    expect(list[0]).toEqual({
      id: 'program-barbell-foundations',
      name: 'Barbell Foundations',
      isPremade: true,
      dayCount: 2,
      isActive: false,
      group: 'program',
    });
  });

  it('puts user routines after the programs, by created_at, in Yours', () => {
    const db = seededDb();
    insertUserRoutine(db, 'user-late', 3_000);
    insertUserRoutine(db, 'user-early', 1_000);
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, 'user-early', 'user-late']);
    expect(listRoutines(db).slice(-2).map((r) => r.group)).toEqual(['yours', 'yours']);
  });

  it('counts the days of a user routine, including none', () => {
    const db = seededDb();
    insertUserRoutine(db, 'user-r', 1_000);
    expect(listRoutines(db).find((r) => r.id === 'user-r')).toMatchObject({ isPremade: false, dayCount: 0 });
    db.insert(routineDays).values({ id: 'user-r:d1', routineId: 'user-r', name: 'Day 1', position: 0 }).run();
    expect(listRoutines(db).find((r) => r.id === 'user-r')!.dayCount).toBe(1);
  });
});

describe('listRoutines: Earlier programs (§18.8, §18.29 R598)', () => {
  const FIVE = 'premade-5x5-3';
  const NO_EQUIPMENT = 'premade-noequipment-3';

  /** A database seed version 1 wrote, upgraded by the current seed: all six of its programs are retired. */
  const upgradedDb = () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    return db;
  };

  /** A workout run from `routineId`'s first day, finished or still going. */
  const workoutFrom = (db: Db, routineId: string, status: 'active' | 'finished') => {
    db.insert(workouts)
      .values({
        id: `w-${routineId}-${status}`,
        name: 'A',
        routineId,
        routineDayId: `${routineId}:a`,
        status,
        startedAt: NOW,
        finishedAt: status === 'finished' ? NOW + HOUR : null,
        localDate: '2026-10-09',
      })
      .run();
  };

  it('lists the twenty and hides the retired programs nobody uses', () => {
    const list = listRoutines(upgradedDb());
    expect(list.map((r) => r.id)).toEqual(PREMADE_ORDER);
    expect(list.map((r) => r.name).slice(0, 5)).toEqual([
      'Barbell Foundations',
      'Dumbbell Full Body',
      'Minimalist Two-Day',
      'CrossFit Foundations',
      'Mobility for Lifters',
    ]);
  });

  it('keeps showing a retired program while it is the active routine, after the twenty, under Earlier programs', () => {
    const db = upgradedDb();
    setActiveRoutine(db, NO_EQUIPMENT);
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, NO_EQUIPMENT]);
    expect(listRoutines(db)[PREMADE_ORDER.length]).toEqual({
      id: NO_EQUIPMENT,
      name: 'No equipment',
      isPremade: true,
      dayCount: 3,
      isActive: true,
      group: 'earlier',
    });
  });

  it('keeps showing a retired program a finished workout was run from, but not one only an unfinished workout uses', () => {
    const db = upgradedDb();
    workoutFrom(db, NO_EQUIPMENT, 'finished');
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, NO_EQUIPMENT]);
    const other = upgradedDb();
    workoutFrom(other, NO_EQUIPMENT, 'active');
    expect(listRoutines(other).map((r) => r.id)).toEqual(PREMADE_ORDER);
  });

  it('lists the earlier programs in their old order, any other after them by id, then the routines of your own', () => {
    const db = upgradedDb();
    insertUserRoutine(db, 'user-r', 1_000);
    workoutFrom(db, NO_EQUIPMENT, 'finished');
    workoutFrom(db, PPL, 'finished');
    setActiveRoutine(db, FIVE);
    const list = listRoutines(db);
    expect(list.map((r) => r.id)).toEqual([...PREMADE_ORDER, FIVE, PPL, NO_EQUIPMENT, 'user-r']);
    expect(list.slice(PREMADE_ORDER.length).map((r) => r.group)).toEqual(['earlier', 'earlier', 'earlier', 'yours']);
    expect(list.filter((r) => r.isActive).map((r) => r.id)).toEqual([FIVE]);
  });

  it('never hides a routine of your own', () => {
    const db = upgradedDb();
    insertUserRoutine(db, 'user-r', 1_000);
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, 'user-r']);
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
      retired: false,
      // Your own routine has no program run (R616, 0010).
      runStartedAt: null,
      runDeloadAt: null,
      createdAt: NOW,
    });
    // Push/pull/legs is retired (R598): Earlier programs lists it only while someone uses it, which a copy doesn't.
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, id]);
    expect(listRoutines(db).find((r) => r.id === id)!.group).toBe('yours');
  });

  it('Duplicate of a program copies its current exercises with base rules into Yours', () => {
    const db = seededDb();
    const CF = 'program-calisthenics-foundations';
    const program = PROGRAMS.find((p) => p.id === CF)!;
    const ladder = program.days[0].slots.find((s) => s.ladder !== null && s.ladder[2].repMin !== s.repMin)!;
    const added = program.days[0].slots.find((s) => s.ladder === null)!;
    // The lifter's progress: a rung climbed (its exercise follows, R618), sets added (R619), a Modify swap and a weight.
    db.update(routineExercises).set({ exerciseId: ladder.ladder![2].exerciseId, ladderRung: 2 }).where(eq(routineExercises.id, ladder.id)).run();
    db.update(routineExercises).set({ nextSetCount: added.sets + 2, nextWeight: 50, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, added.id)).run();
    db.update(routines).set({ runStartedAt: NOW, nextDayIndex: 1 }).where(eq(routines.id, CF)).run();
    const swapped = program.days[1].slots[program.days[1].slots.length - 1];
    db.update(routineExercises).set({ exerciseId: 'fedb-chin-up' }).where(eq(routineExercises.id, swapped.id)).run();

    const id = duplicateRoutine(db, CF, NOW);

    expect(db.select().from(routines).where(eq(routines.id, id)).get()).toEqual({
      id,
      name: 'Calisthenics Foundations copy',
      isPremade: false,
      nextDayIndex: 0,
      retired: false,
      runStartedAt: null,
      runDeloadAt: null,
      createdAt: NOW,
    });
    expect(listRoutines(db).find((r) => r.id === id)).toMatchObject({ group: 'yours', isPremade: false });
    const copy = rowsOf(db, id);
    expect(copy.map((d) => d.day.name)).toEqual(program.days.map((d) => d.name));
    const slots = program.days.flatMap((d) => d.slots);
    const rows = copy.flatMap((d) => d.exercises);
    expect(rows).toHaveLength(slots.length);
    // A ladder at its current rung, with that rung's range; nothing of the lifter's progress travels.
    const rung = ladder.ladder![2];
    const copiedLadder = rows[program.days[0].slots.indexOf(ladder)];
    expect(copiedLadder).toMatchObject({ exerciseId: rung.exerciseId, setCount: ladder.sets, repMin: rung.repMin, repMax: rung.repMax, increment: 0 });
    const copiedAdded = rows[program.days[0].slots.indexOf(added)];
    expect(copiedAdded).toMatchObject({ exerciseId: added.exerciseId, setCount: added.sets, repMin: added.repMin, repMax: added.repMax });
    expect(rows[rows.length - 1].exerciseId).toBe('fedb-chin-up');
    expect(rows.every((r) => r.ladderRung === null && r.nextSetCount === null && r.nextWeight === null && r.nextWeightUnit === null)).toBe(true);
    // The base increment in the lifter's unit, never a halved one.
    const foundations = duplicateRoutine(db, 'program-barbell-foundations', NOW);
    expect(rowsOf(db, foundations)[1].exercises.find((e) => e.exerciseId === 'barbell-deadlift')).toMatchObject({ increment: 10, incrementUnit: 'lb' });
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

  it('copies your own routine too, and the copy is one of your own (Pro, R521)', () => {
    const db = seededDb();
    const first = duplicateRoutine(db, 'premade-fullbody-3', NOW);
    expect(userRoutineCount(db)).toBe(1);
    expect(canAddRoutine(userRoutineCount(db), false)).toBe(false);

    const second = duplicateRoutine(db, first, NOW + HOUR);
    expect(getRoutineDetail(db, second)!.name).toBe('Beginner full body copy copy');
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

  it('a workout in progress from it still finishes: its history is kept and there is no rotation to move', () => {
    const db = seededDb();
    const id = duplicateRoutine(db, PPL, NOW);
    setActiveRoutine(db, id);
    const firstDay = rowsOf(db, id)[0].day.id;
    const workoutId = startWorkoutFromDay(db, firstDay, NOW);
    const bench = benchIn(db, workoutId);
    const benchSets = db.select({ id: sets.id }).from(sets).where(eq(sets.workoutExerciseId, bench.id)).all();
    const rotations = () => db.select({ id: routines.id, next: routines.nextDayIndex }).from(routines).all();
    const before = rotations().filter((r) => r.id !== id);

    deleteRoutine(db, id);
    benchSets.forEach((s, i) =>
      tickSet(db, s.id, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', NOW + (i + 1) * 60_000, 'mi'),
    );
    expect(() => finishWorkout(db, workoutId, NOW + HOUR)).not.toThrow();

    expect(db.select().from(workouts).where(eq(workouts.id, workoutId)).get()).toMatchObject({
      status: 'finished',
      routineId: id,
      routineDayId: firstDay,
    });
    expect(benchIn(db, workoutId)).toMatchObject({ outcome: 'raised', nextWeight: 140, nextUnit: 'lb' });
    expect(db.select().from(sets).where(eq(sets.workoutExerciseId, bench.id)).all()).toHaveLength(benchSets.length);
    // Nothing was written back: the routine stays gone, and no other routine's rotation moved.
    expect(getRoutineDetail(db, id)).toBeNull();
    expect(db.select().from(routineExercises).where(eq(routineExercises.routineDayId, firstDay)).all()).toEqual([]);
    expect(rotations()).toEqual(before);
    expect(getSettings(db).activeRoutineId).toBeNull();
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

const BENCH: LibraryExercise = { id: 'barbell-bench-press', name: 'Barbell bench press', loggingType: 'weighted' };
const ROW: LibraryExercise = { id: 'barbell-row', name: 'Barbell row', loggingType: 'weighted' };
const CURL: LibraryExercise = { id: 'dumbbell-curl', name: 'Dumbbell curl', loggingType: 'weighted' };
const SQUAT: LibraryExercise = { id: 'barbell-back-squat', name: 'Barbell back squat', loggingType: 'weighted' };
const PLANK: LibraryExercise = { id: 'plank', name: 'Plank', loggingType: 'timed' };

type Step = DraftAction | ((d: RoutineDraft) => DraftAction);

/** Applies each step in turn; a step may read the draft so far to find its keys. */
function edit(draft: RoutineDraft, ...steps: Step[]): RoutineDraft {
  return steps.reduce((d, step) => draftReducer(d, typeof step === 'function' ? step(d) : step), draft);
}

const LB5: { value: number; unit: WeightUnit } = { value: 5, unit: 'lb' };
const add = (day: number, exercise: LibraryExercise, increment = LB5): Step => (d) => ({
  type: 'addExercise',
  dayKey: d.days[day].key,
  exercise,
  increment,
});
const onExercise = (day: number, index: number, action: object): Step => (d) =>
  ({ dayKey: d.days[day].key, exerciseKey: d.days[day].exercises[index].key, ...action }) as DraftAction;
const onDay = (day: number, action: object): Step => (d) => ({ dayKey: d.days[day].key, ...action }) as DraftAction;

/** A new routine "My split": Upper (bench and row as a superset, curl) and Lower (squat, plank). */
function mySplit(): RoutineDraft {
  return edit(
    newDraft(),
    { type: 'rename', name: ' My split ' },
    { type: 'addDay', name: 'Upper' },
    { type: 'addDay', name: 'Lower' },
    add(0, BENCH),
    add(0, ROW),
    add(0, CURL, { value: 2.5, unit: 'kg' }),
    add(1, SQUAT),
    add(1, PLANK),
    onExercise(0, 0, { type: 'toggleSuperset' }),
  );
}

/** The exercises of a routine as [exercise id, position, superset group] per day, by day name. */
function shapeOf(db: Db, routineId: string) {
  return rowsOf(db, routineId).map(({ day, exercises }) => [
    day.name,
    day.position,
    exercises.map((e) => [e.exerciseId, e.position, e.supersetGroup]),
  ]);
}

/** Every workout exercise and set of a workout, as stored. */
function workoutRows(db: Db, workoutId: string) {
  const rows = db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId))
    .orderBy(asc(workoutExercises.position))
    .all();
  return {
    workout: db.select().from(workouts).where(eq(workouts.id, workoutId)).get(),
    exercises: rows,
    sets: db
      .select()
      .from(sets)
      .where(inArray(sets.workoutExerciseId, rows.map((e) => e.id)))
      .orderBy(asc(sets.id))
      .all(),
  };
}

describe('saveRoutine (R89)', () => {
  it('a day left unnamed is stored as "Day 1", and a workout from it is named "{routine} Day 1" (R56)', () => {
    const db = seededDb();
    const id = saveRoutine(db, edit(newDraft(), { type: 'rename', name: 'My split' }, { type: 'addDay' }, add(0, BENCH)), NOW);
    const [day] = rowsOf(db, id);
    expect(day.day.name).toBe('Day 1');

    const workoutId = startWorkoutFromDay(db, day.day.id, NOW);

    expect(db.select().from(workouts).where(eq(workouts.id, workoutId)).get()!.name).toBe('My split Day 1');
  });

  it('saves a new draft as your own routine, created now, with its days and exercises in order', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);

    expect(db.select().from(routines).where(eq(routines.id, id)).get()).toEqual({
      id,
      name: 'My split',
      isPremade: false,
      nextDayIndex: 0,
      retired: false,
      // Your own routine has no program run (R616, 0010).
      runStartedAt: null,
      runDeloadAt: null,
      createdAt: NOW,
    });
    expect(shapeOf(db, id)).toEqual([
      ['Upper', 0, [['barbell-bench-press', 0, 1], ['barbell-row', 1, 1], ['dumbbell-curl', 2, null]]],
      ['Lower', 1, [['barbell-back-squat', 0, null], ['plank', 1, null]]],
    ]);
    const rows = rowsOf(db, id).flatMap((d) => d.exercises);
    expect(rows.map((e) => [e.setCount, e.repMin, e.repMax, e.increment, e.incrementUnit, e.nextWeight])).toEqual([
      [3, 8, 12, 5, 'lb', null],
      [3, 8, 12, 5, 'lb', null],
      [3, 8, 12, 2.5, 'kg', null],
      [3, 8, 12, 5, 'lb', null],
      [3, 30, 60, 0, 'lb', null],
    ]);
    // Every row has a fresh uuid.
    for (const rowId of [...rowsOf(db, id).map((d) => d.day.id), ...rows.map((e) => e.id)]) {
      expect(rowId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('a new routine is one of your own, which only Pro makes (§18.21, R521)', () => {
    const db = seededDb();
    expect(canAddRoutine(userRoutineCount(db), false)).toBe(false);
    const id = saveRoutine(db, mySplit(), NOW);
    expect(listRoutines(db).find((r) => r.id === id)).toMatchObject({ name: 'My split', isPremade: false, dayCount: 2 });
    expect(userRoutineCount(db)).toBe(1);
    expect(canAddRoutine(userRoutineCount(db), false)).toBe(false);
    expect(canAddRoutine(userRoutineCount(db), true)).toBe(true);
  });

  it('a day may hold the same exercise twice', () => {
    const db = seededDb();
    const id = saveRoutine(db, edit(mySplit(), add(1, SQUAT)), NOW);
    const lower = rowsOf(db, id)[1].exercises;
    expect(lower.map((e) => e.exerciseId)).toEqual(['barbell-back-squat', 'plank', 'barbell-back-squat']);
    expect(new Set(lower.map((e) => e.id)).size).toBe(3);
  });

  it('routineToDraft loads a routine for the editor, and saving it unchanged changes nothing', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const before = rowsOf(db, id);

    const draft = routineToDraft(db, id)!;
    expect(draft.id).toBe(id);
    expect(draft.name).toBe('My split');
    expect(draft.days.map((d) => [d.id, d.name])).toEqual(before.map((d) => [d.day.id, d.day.name]));
    expect(draft.days[0].exercises.map((e) => [e.id, e.name, e.loggingType, e.supersetWithNext])).toEqual([
      [before[0].exercises[0].id, 'Barbell bench press', 'weighted', true],
      [before[0].exercises[1].id, 'Barbell row', 'weighted', false],
      [before[0].exercises[2].id, 'Dumbbell curl', 'weighted', false],
    ]);
    expect(hasChanges(draft, routineToDraft(db, id)!)).toBe(false);

    expect(saveRoutine(db, draft, NOW + HOUR)).toBe(id);
    expect(rowsOf(db, id)).toEqual(before);
    expect(db.select().from(routines).where(eq(routines.id, id)).get()!.createdAt).toBe(NOW);
  });

  it('routineToDraft is null for a routine that does not exist', () => {
    expect(routineToDraft(seededDb(), 'no-such-routine')).toBeNull();
  });

  it('an exercise that stays keeps its id and next weight while its rule changes', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const benchId = rowsOf(db, id)[0].exercises[0].id;
    db.update(routineExercises).set({ nextWeight: 60, nextWeightUnit: 'kg' }).where(eq(routineExercises.id, benchId)).run();

    const draft = edit(
      routineToDraft(db, id)!,
      onExercise(0, 0, {
        type: 'updateExercise',
        patch: { setCount: 5, repMin: 3, repMax: 5, increment: 10, incrementUnit: 'lb' },
      }),
      { type: 'rename', name: 'Renamed' },
    );
    saveRoutine(db, draft, NOW + HOUR);

    expect(db.select().from(routineExercises).where(eq(routineExercises.id, benchId)).get()).toMatchObject({
      setCount: 5,
      repMin: 3,
      repMax: 5,
      increment: 10,
      incrementUnit: 'lb',
      nextWeight: 60,
      nextWeightUnit: 'kg',
    });
    expect(getRoutineDetail(db, id)!.name).toBe('Renamed');
  });

  it('a slot whose exercise changed starts its progress afresh (R74)', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const benchId = rowsOf(db, id)[0].exercises[0].id;
    db.update(routineExercises).set({ nextWeight: 60, nextWeightUnit: 'kg' }).where(eq(routineExercises.id, benchId)).run();

    const draft = routineToDraft(db, id)!;
    draft.days[0].exercises[0] = { ...draft.days[0].exercises[0], exerciseId: 'incline-dumbbell-press' };
    saveRoutine(db, draft, NOW + HOUR);
    expect(db.select().from(routineExercises).where(eq(routineExercises.id, benchId)).get()).toMatchObject({
      exerciseId: 'incline-dumbbell-press',
      nextWeight: null,
      nextWeightUnit: null,
    });
  });

  it('deletes removed exercises and days, gives added ones new ids, and renumbers positions', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const [upper, lower] = rowsOf(db, id);

    const draft = edit(
      routineToDraft(db, id)!,
      onExercise(0, 1, { type: 'removeExercise' }),
      onDay(1, { type: 'deleteDay' }),
      { type: 'addDay', name: 'Arms' },
      add(1, CURL),
      onExercise(0, 1, { type: 'moveExercise', dir: 'up' }),
    );
    saveRoutine(db, draft, NOW + HOUR);

    expect(shapeOf(db, id)).toEqual([
      ['Upper', 0, [['dumbbell-curl', 0, null], ['barbell-bench-press', 1, null]]],
      ['Arms', 1, [['dumbbell-curl', 0, null]]],
    ]);
    const after = rowsOf(db, id);
    expect(after[0].day.id).toBe(upper.day.id);
    expect(after[0].exercises.map((e) => e.id)).toEqual([upper.exercises[2].id, upper.exercises[0].id]);
    const removedIds = [upper.exercises[1].id, ...lower.exercises.map((e) => e.id)];
    expect(db.select().from(routineExercises).where(inArray(routineExercises.id, removedIds)).all()).toEqual([]);
    expect(db.select().from(routineDays).where(eq(routineDays.id, lower.day.id)).get()).toBeUndefined();
    expect(after[1].day.id).not.toBe(lower.day.id);
  });

  it('editing the active routine updates Up next', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    setActiveRoutine(db, id);
    expect(getUpNext(db)!.exercises.map((e) => e.exerciseId)).toEqual(['barbell-bench-press', 'barbell-row', 'dumbbell-curl']);

    saveRoutine(
      db,
      edit(
        routineToDraft(db, id)!,
        onExercise(0, 0, { type: 'updateExercise', patch: { setCount: 5 } }),
        add(0, SQUAT),
        onDay(0, { type: 'renameDay', name: 'Upper body' }),
      ),
      NOW + HOUR,
    );
    const upNext = getUpNext(db)!;
    expect(upNext.dayName).toBe('Upper body');
    expect(upNext.exercises.map((e) => [e.exerciseId, e.setCount])).toEqual([
      ['barbell-bench-press', 5],
      ['barbell-row', 3],
      ['dumbbell-curl', 3],
      ['barbell-back-squat', 3],
    ]);
  });

  it('reordering days keeps the same day up next', () => {
    const db = seededDb();
    const id = saveRoutine(db, edit(mySplit(), { type: 'addDay', name: 'Arms' }, add(2, CURL)), NOW);
    setActiveRoutine(db, id);
    db.update(routines).set({ nextDayIndex: 1 }).where(eq(routines.id, id)).run();
    expect(getUpNext(db)!.dayName).toBe('Lower');

    const reordered = edit(
      routineToDraft(db, id)!,
      onDay(2, { type: 'moveDay', dir: 'up' }),
      onDay(1, { type: 'moveDay', dir: 'up' }),
    );
    saveRoutine(db, reordered, NOW + HOUR);
    expect(rowsOf(db, id).map((d) => d.day.name)).toEqual(['Arms', 'Upper', 'Lower']);
    expect(getUpNext(db)!.dayName).toBe('Lower');
  });

  it('when the day up next is deleted, the day after it is up next', () => {
    const db = seededDb();
    const id = saveRoutine(db, edit(mySplit(), { type: 'addDay', name: 'Arms' }, add(2, CURL)), NOW);
    setActiveRoutine(db, id);
    db.update(routines).set({ nextDayIndex: 1 }).where(eq(routines.id, id)).run();

    saveRoutine(db, edit(routineToDraft(db, id)!, onDay(1, { type: 'deleteDay' })), NOW + HOUR);
    expect(getUpNext(db)!.dayName).toBe('Arms');

    // The last day deleted while up next wraps to the first.
    saveRoutine(db, edit(routineToDraft(db, id)!, onDay(1, { type: 'deleteDay' })), NOW + 2 * HOUR);
    expect(getUpNext(db)!.dayName).toBe('Upper');
  });

  it('never touches a workout in progress from that routine', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    setActiveRoutine(db, id);
    const upperId = rowsOf(db, id)[0].day.id;
    const workoutId = startWorkoutFromDay(db, upperId, NOW);
    const before = workoutRows(db, workoutId);

    saveRoutine(
      db,
      edit(
        routineToDraft(db, id)!,
        onExercise(0, 0, { type: 'removeExercise' }),
        onExercise(0, 0, { type: 'updateExercise', patch: { setCount: 6, repMin: 1, repMax: 3 } }),
        onDay(0, { type: 'renameDay', name: 'Upper body' }),
        onDay(1, { type: 'deleteDay' }),
      ),
      NOW + HOUR,
    );
    expect(workoutRows(db, workoutId)).toEqual(before);

    // It still finishes: the removed slot just takes no next weight.
    const benchSets = before.sets.filter((s) => s.workoutExerciseId === before.exercises[0].id);
    tickSet(db, benchSets[0].id, { weight: 135, reps: 8, durationS: null, distance: null }, 'lb', NOW + 60_000, 'mi');
    expect(() => finishWorkout(db, workoutId, NOW + HOUR)).not.toThrow();
  });

  it('refuses a premade, changing nothing', () => {
    const db = seededDb();
    const before = rowsOf(db, PPL);
    const draft = edit(
      routineToDraft(db, PPL)!,
      { type: 'rename', name: 'Mine now' },
      onExercise(0, 0, { type: 'removeExercise' }),
    );
    expect(() => saveRoutine(db, draft, NOW)).toThrow(PremadeRoutineError);
    expect(getRoutineDetail(db, PPL)!.name).toBe('Push/pull/legs');
    expect(rowsOf(db, PPL)).toEqual(before);
  });

  it('refuses a draft that does not validate, or a routine that no longer exists, writing nothing', () => {
    const db = seededDb();
    expect(() => saveRoutine(db, newDraft(), NOW)).toThrow('Give the routine a name.');
    expect(() => saveRoutine(db, { ...mySplit(), id: 'no-such-routine' }, NOW)).toThrow();
    expect(userRoutineCount(db)).toBe(0);
  });

  it('is one transaction: a failure part way undoes the writes made before it', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const before = rowsOf(db, id);
    // Lower moves up and Upper is renamed and moved down: both are written before the bad exercise on the
    // second day fails its foreign key.
    const draft = edit(
      routineToDraft(db, id)!,
      { type: 'rename', name: 'Half saved' },
      onDay(0, { type: 'renameDay', name: 'Upper body' }),
      onDay(1, { type: 'moveDay', dir: 'up' }),
      add(1, { id: 'no-such-exercise', name: 'Nothing', loggingType: 'weighted' }),
    );
    expect(draft.days.map((d) => d.name)).toEqual(['Lower', 'Upper body']);
    expect(() => saveRoutine(db, draft, NOW + HOUR)).toThrow();
    expect(getRoutineDetail(db, id)!.name).toBe('My split');
    expect(rowsOf(db, id).map((d) => [d.day.name, d.day.position])).toEqual([
      ['Upper', 0],
      ['Lower', 1],
    ]);
    expect(rowsOf(db, id)).toEqual(before);
  });

  it("saves a hand-built draft within the editor's limits", () => {
    const db = seededDb();
    const draft = mySplit();
    const upper = draft.days[0];
    const [bench, row, curl] = upper.exercises;
    const wild: RoutineDraft = {
      ...draft,
      days: [
        {
          ...upper,
          exercises: [
            { ...bench, setCount: 0, repMin: 12, repMax: 8, increment: -5 },
            { ...row, setCount: 25, repMin: 0, repMax: 0, increment: 2.5 },
            { ...curl, setCount: 4.6, repMin: 6.4, repMax: 9.6, increment: Number.NaN },
          ],
        },
        draft.days[1],
      ],
    };
    const id = saveRoutine(db, wild, NOW);
    expect(rowsOf(db, id)[0].exercises.map((e) => [e.setCount, e.repMin, e.repMax, e.increment])).toEqual([
      [1, 12, 12, 0],
      [10, 1, 1, 2.5],
      [5, 6, 10, 0],
    ]);
  });

  it("a row id from another routine is saved as a new row, leaving the other routine's row alone", () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const draft = routineToDraft(db, id)!;
    const premadeBench = `${PUSH_A}:barbell-bench-press`;
    const stolen: RoutineDraft = {
      ...draft,
      days: draft.days.map((d, i) =>
        i === 0 ? { ...d, exercises: d.exercises.map((e, j) => (j === 0 ? { ...e, id: premadeBench } : e)) } : d,
      ),
    };
    saveRoutine(db, stolen, NOW + HOUR);
    expect(db.select().from(routineExercises).where(eq(routineExercises.id, premadeBench)).get()!.routineDayId).toBe(PUSH_A);
    expect(rowsOf(db, id)[0].exercises[0].id).not.toBe(premadeBench);
    expect(shapeOf(db, id)[0]).toEqual([
      'Upper',
      0,
      [['barbell-bench-press', 0, 1], ['barbell-row', 1, 1], ['dumbbell-curl', 2, null]],
    ]);
  });
});

describe('saveRoutine: a day made from a saved workout (R121)', () => {
  /** Push A as `dayFromSaved` makes it, last logged in kg: bench from 80 kg, dumbbell press from 30 kg, a plank. */
  const pushA: DayFromSaved = {
    name: 'Push A',
    exercises: [
      { exerciseId: 'barbell-bench-press', name: 'Barbell bench press', loggingType: 'weighted', setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb', supersetWithNext: false, startWeight: { weight: 80, unit: 'kg' } },
      { exerciseId: 'dumbbell-curl', name: 'Dumbbell curl', loggingType: 'weighted', setCount: 2, repMin: 10, repMax: 12, increment: 5, incrementUnit: 'lb', supersetWithNext: false, startWeight: { weight: 30, unit: 'kg' } },
      { exerciseId: 'plank', name: 'Plank', loggingType: 'timed', setCount: 3, repMin: 45, repMax: 60, increment: 0, incrementUnit: 'lb', supersetWithNext: false, startWeight: null },
    ],
  };

  it('writes each start weight as the new row’s next weight, in the unit it was logged in, and Up next shows it converted', () => {
    const db = seededDb();
    const id = saveRoutine(db, edit(newDraft(), { type: 'rename', name: 'Mine' }, { type: 'addDayFromSaved', day: pushA }), NOW);

    expect(rowsOf(db, id)[0].exercises.map((e) => [e.exerciseId, e.setCount, e.repMin, e.repMax, e.increment, e.incrementUnit, e.nextWeight, e.nextWeightUnit])).toEqual([
      ['barbell-bench-press', 3, 5, 8, 5, 'lb', 80, 'kg'],
      ['dumbbell-curl', 2, 10, 12, 5, 'lb', 30, 'kg'],
      ['plank', 3, 45, 60, 0, 'lb', null, null],
    ]);

    setActiveRoutine(db, id);
    const upNext = getUpNext(db)!;
    expect(upNext.dayName).toBe('Push A');
    const gear = gearFor('lb', getSettings(db));
    const hasWeight = upNextDayHasWeight(upNext.exercises);
    // 80 kg is 176.4 lb: the nearest loadable bench in lb. 30 kg is 66.1 lb: to the nearest 0.5.
    expect(upNext.exercises.map((e) => upNextLoad(e, hasWeight, 'lb', gear))).toEqual(['175 lb', '66 lb', null]);
    expect(upNext.exercises.map((e) => upNextLoad(e, hasWeight, 'kg', gearFor('kg', getSettings(db))))).toEqual(['80 kg', '30 kg', null]);
  });

  it('leaves the next weights of rows already saved as they are, and adds the new day’s', () => {
    const db = seededDb();
    const id = saveRoutine(db, mySplit(), NOW);
    const benchRow = rowsOf(db, id)[0].exercises[0].id;
    db.update(routineExercises).set({ nextWeight: 185, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, benchRow)).run();

    const draft = routineToDraft(db, id)!;
    // Even a start weight on a row already saved is ignored: its own next weight stands.
    const tampered: RoutineDraft = {
      ...draft,
      days: draft.days.map((d, i) => (i === 0 ? { ...d, exercises: d.exercises.map((e, j) => (j === 0 ? { ...e, startWeight: { weight: 50, unit: 'kg' } } : e)) } : d)),
    };
    saveRoutine(db, edit(tampered, { type: 'addDayFromSaved', day: pushA }), NOW + HOUR);

    const after = rowsOf(db, id);
    expect(after.map((d) => d.day.name)).toEqual(['Upper', 'Lower', 'Push A']);
    expect(after[0].exercises.map((e) => [e.id, e.nextWeight, e.nextWeightUnit])).toEqual([
      [benchRow, 185, 'lb'],
      [after[0].exercises[1].id, null, null],
      [after[0].exercises[2].id, null, null],
    ]);
    expect(after[2].exercises.map((e) => [e.nextWeight, e.nextWeightUnit])).toEqual([
      [80, 'kg'],
      [30, 'kg'],
      [null, null],
    ]);
  });
});
