/** @jest-environment node */
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { createCustomExercise, deleteCustomExercise } from '../db/repositories/customExercisesRepo';
import { getRestSeconds, setRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { getExerciseNote, listExercises, setExerciseNote } from '../db/repositories/exercisesRepo';
import { duplicateRoutine, getRoutineDetail, getUpNext, listRoutines, setActiveRoutine, swapRoutineExercise } from '../db/repositories/routinesRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView, getPreviousSets } from '../db/repositories/workoutViewsRepo';
import { exercises, foods, routineDays, routineExercises, routines, sets, workoutExercises, workouts } from '../db/schema';
import { createTestDb } from '../db/testing/createTestDb';
import { freshSeededDb, seededDb } from '../db/testing/fixtures';
import { V1_SEEDED_AT, V1_ROUTINES, seededV1Db } from '../db/testing/seedV1';
import { V8_ORDER, V8_ROUTINES, V8_SEEDED_AT, seededV8Db } from '../db/testing/seedV8';
import type { Db } from '../db/types';
import { searchExercises } from '../domain/search';
import { SEED_EXERCISES } from './exercises';
import { loadSeedFoods } from './foods';
import { LIBRARY_EXERCISES } from './library.generated';
import { NEW_ALIASES, NEW_EXERCISES } from './newExercises';
import { PROGRAM_ORDER, PROGRAMS } from './programs.generated';
import { PREMADE_ORDER, RETIRED_PREMADES, SEED_ROUTINES } from './routines';
import { SEED_VERSION, runSeed } from './seed';

const days = (db: Db, routineId: string) =>
  db.select().from(routineDays).where(eq(routineDays.routineId, routineId)).orderBy(asc(routineDays.position)).all();

const routineExercise = (db: Db, id: string) =>
  db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;

const exercise = (db: Db, id: string) => db.select().from(exercises).where(eq(exercises.id, id)).get()!;

/** The routine exercises of the routines `routineIds`, in id order. */
const exercisesOf = (db: Db, routineIds: readonly string[]) =>
  db
    .select()
    .from(routineExercises)
    .where(
      inArray(
        routineExercises.routineDayId,
        db.select({ id: routineDays.id }).from(routineDays).where(inArray(routineDays.routineId, [...routineIds])),
      ),
    )
    .orderBy(asc(routineExercises.id))
    .all();

const routine = (db: Db, id: string) => db.select().from(routines).where(eq(routines.id, id)).get()!;

/** Every row the seed writes, in id order, for comparing two runs. */
const seedRows = (db: Db) => ({
  exercises: db.select().from(exercises).orderBy(asc(exercises.id)).all(),
  routines: db.select().from(routines).orderBy(asc(routines.id)).all(),
  routineDays: db.select().from(routineDays).orderBy(asc(routineDays.id)).all(),
  routineExercises: db.select().from(routineExercises).orderBy(asc(routineExercises.id)).all(),
});

const rowCounts = (db: Db) => ({
  exercises: db.select().from(exercises).all().length,
  routines: db.select().from(routines).all().length,
  routineDays: db.select().from(routineDays).all().length,
  routineExercises: db.select().from(routineExercises).all().length,
  foods: db.select().from(foods).all().length,
});

/** Forces the seed to run again, as an app update with a newer seed would. */
const reseed = (db: Db, now = 2) => {
  setSetting(db, 'seedVersion', 0);
  runSeed(db, now);
};

/** Every exercise the seed writes: the library and the programs' new exercises (§18.29). */
const ALL_EXERCISES = LIBRARY_EXERCISES.length + NEW_EXERCISES.length;
const SLOTS = PROGRAMS.flatMap((p) => p.days.flatMap((d) => d.slots));
const DAYS = PROGRAMS.flatMap((p) => p.days).length;
const PPL = 'premade-ppl-6';
const BENCH_ROW = 'premade-ppl-6:push-a:barbell-bench-press';

/** The library's aliases with the ones §18.29 adds (R606). */
const aliasesOf = (id: string) => [...LIBRARY_EXERCISES.find((e) => e.id === id)!.aliases, ...(NEW_ALIASES[id] ?? [])];

describe('seed data', () => {
  it('bundles 56 exercises with unique ids, a primary muscle and no muscle both primary and secondary', () => {
    expect(SEED_EXERCISES).toHaveLength(56);
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(56);
    for (const e of SEED_EXERCISES) {
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      expect(e.primaryMuscles.filter((m) => e.secondaryMuscles.includes(m))).toEqual([]);
    }
  });

  it('lists the twenty programs in Routines order, the free five first (R597)', () => {
    expect(PREMADE_ORDER).toEqual(PROGRAM_ORDER);
    expect(PREMADE_ORDER.slice(0, 5)).toEqual([
      'program-barbell-foundations',
      'program-dumbbell-full-body',
      'program-minimalist-two-day',
      'program-crossfit-foundations',
      'program-mobility-for-lifters',
    ]);
    expect(SEED_ROUTINES.map((r) => r.id)).toEqual(PROGRAMS.map((p) => p.id));
    expect([...PREMADE_ORDER].sort()).toEqual(SEED_ROUTINES.map((r) => r.id).sort());
  });

  it('retires the nine, which keep their ids (R598)', () => {
    expect(RETIRED_PREMADES).toEqual(V8_ORDER);
    expect(SEED_ROUTINES.filter((r) => RETIRED_PREMADES.includes(r.id))).toEqual([]);
  });
});

describe('runSeed', () => {
  it('inserts every library exercise and the new ones as non-custom rows created at now', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(ALL_EXERCISES);
    expect(rows.map((r) => r.id).sort()).toEqual([...LIBRARY_EXERCISES, ...NEW_EXERCISES].map((e) => e.id).sort());
    expect(rows.every((r) => r.isCustom === false && r.archived === false && r.createdAt === 1234)).toBe(true);
    expect(exercise(db, 'barbell-romanian-deadlift')).toMatchObject({
      name: 'Romanian deadlift',
      aliases: ['RDL'],
      equipment: 'barbell',
      loggingType: 'weighted',
    });
    expect(exercise(db, 'plank')).toMatchObject({ equipment: 'bodyweight', loggingType: 'timed' });
    expect(exercise(db, 'pull-up')).toMatchObject({ loggingType: 'bodyweight_plus' });
  });

  it('stores each exercise exactly as the library has it, with its steps, source id and any added alias', () => {
    const db = freshSeededDb();
    const stored = new Map(db.select().from(exercises).all().map((r) => [r.id, r]));
    for (const { id, ...content } of LIBRARY_EXERCISES) expect(stored.get(id)).toMatchObject({ ...content, aliases: aliasesOf(id) });
    expect(exercise(db, 'barbell-bench-press')).toMatchObject({
      sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
      instructions: expect.arrayContaining([expect.stringMatching(/^Lie back on a flat bench/)]),
    });
    expect(exercise(db, 'fedb-ez-bar-curl')).toMatchObject({ name: 'EZ-bar curl', equipment: 'ez_bar', sourceId: 'EZ-Bar_Curl' });
    expect(exercise(db, 'wall-sit')).toMatchObject({
      instructions: expect.arrayContaining([expect.stringMatching(/^Stand with your back flat against a wall/)]),
      sourceId: null,
    });
  });

  it('inserts the twenty programs on a new install, each from its first day, none retired and no run started', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const rows = db.select().from(routines).all();
    expect(rows.map((r) => r.id).sort()).toEqual([...PREMADE_ORDER].sort());
    expect(rows.every((r) => r.isPremade && !r.retired && r.nextDayIndex === 0 && r.createdAt === 1234)).toBe(true);
    expect(rows.every((r) => r.runStartedAt === null && r.runDeloadAt === null)).toBe(true);
    expect(rows.find((r) => r.id === 'program-barbell-foundations')!.name).toBe('Barbell Foundations');
  });

  it('gives each program its days, named and ordered as the program has them', () => {
    const db = freshSeededDb();
    expect(PROGRAMS.map((p) => [p.id, days(db, p.id).map((d) => [d.id, d.name])])).toEqual(
      PROGRAMS.map((p) => [p.id, p.days.map((d) => [`${p.id}:${d.slug}`, d.name])]),
    );
    expect(days(db, 'program-barbell-foundations').map((d) => d.name)).toEqual(['A', 'B']);
  });

  it("seeds a day's exercises in order, each with its slot's id, sets and range", () => {
    const db = freshSeededDb();
    const rows = db
      .select()
      .from(routineExercises)
      .where(eq(routineExercises.routineDayId, 'program-barbell-foundations:a'))
      .orderBy(asc(routineExercises.position))
      .all();
    const day = PROGRAMS[0].days[0];
    expect(rows.map((r) => r.id)).toEqual(day.slots.map((s) => s.id));
    expect(rows[0].id).toBe('program-barbell-foundations:a:barbell-back-squat');
    expect(rows.map((r) => r.position)).toEqual(day.slots.map((_, i) => i));
    expect(rows.map((r) => [r.exerciseId, r.setCount, r.repMin, r.repMax])).toEqual(day.slots.map((s) => [s.exerciseId, s.sets, s.repMin, s.repMax]));
    expect(rows[0]).toMatchObject({ setCount: 3, repMin: 5, repMax: 8, supersetGroup: null, nextWeight: null, ladderRung: null, nextSetCount: null });
  });

  it('writes every program slot id as a routine exercise id on its day, and every day id (the engine matches them exactly)', () => {
    const db = freshSeededDb();
    const dayIds = new Set(db.select().from(routineDays).all().map((d) => d.id));
    const rows = new Map(db.select().from(routineExercises).all().map((r) => [r.id, r]));
    for (const p of PROGRAMS) {
      for (const d of p.days) {
        expect([`${p.id}:${d.slug}`, dayIds.has(`${p.id}:${d.slug}`)]).toEqual([`${p.id}:${d.slug}`, true]);
        for (const slot of d.slots) expect([slot.id, rows.get(slot.id)?.routineDayId]).toEqual([slot.id, `${p.id}:${d.slug}`]);
      }
    }
  });

  it('writes every slot of the twenty, each on a seeded exercise, a repeat on a day under its own id (R625)', () => {
    const db = freshSeededDb();
    const known = new Set(db.select().from(exercises).all().map((e) => e.id));
    const rows = db.select().from(routineExercises).all();
    expect(rows.map((r) => r.id).sort()).toEqual(SLOTS.map((s) => s.id).sort());
    expect(rows.filter((r) => !known.has(r.exerciseId))).toEqual([]);
    expect(routineExercise(db, 'program-strength-peaking-block:squat:barbell-back-squat@2').exerciseId).toBe('barbell-back-squat');
  });

  it("writes each slot's increment in the lifter's unit: lb as the program has it, kg half that (R611)", () => {
    const us = freshSeededDb('us');
    const metric = freshSeededDb('metric');
    const cases: [string, number, number][] = [
      ['program-barbell-foundations:a:barbell-back-squat', 5, 2.5],
      ['program-barbell-foundations:b:barbell-deadlift', 10, 5],
      ['program-kettlebell-strength-conditioning:a-grind:double-kettlebell-clean-and-press', 8, 4],
      ['program-strongman-prep:sat-events-b:sled-push-distance', 25, 12.5],
      ['program-calisthenics-foundations:a:wall-push-up', 0, 0],
    ];
    for (const [id, lb, kg] of cases) {
      expect([id, routineExercise(us, id)]).toEqual([id, expect.objectContaining({ increment: lb, incrementUnit: 'lb' })]);
      expect([id, routineExercise(metric, id)]).toEqual([id, expect.objectContaining({ increment: kg, incrementUnit: 'kg' })]);
    }
    for (const slot of SLOTS) expect([slot.id, routineExercise(metric, slot.id).increment]).toEqual([slot.id, slot.incrementLb / 2]);
  });

  it("starts a ladder slot on its first rung's exercise", () => {
    const db = freshSeededDb();
    const ladders = SLOTS.filter((s) => s.ladder !== null);
    expect(ladders.length).toBeGreaterThan(0);
    for (const slot of ladders) {
      expect([slot.id, routineExercise(db, slot.id)]).toEqual([slot.id, expect.objectContaining({ exerciseId: slot.ladder![0].exerciseId, ladderRung: null })]);
    }
  });

  it('version 4 brings the fixed imported steps to a phone seeded at version 3', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const old = ['Stand.', 'Take the bar with your hands facing forward, unlock it and lift it off the rack by extending your legs. 3'];
    db.update(exercises).set({ instructions: old }).where(eq(exercises.id, 'fedb-smith-machine-pistol-squat')).run();
    setSetting(db, 'seedVersion', 3);

    runSeed(db, 5678);

    expect(exercise(db, 'fedb-smith-machine-pistol-squat').instructions[1]).toBe(
      'Take the bar with your hands facing forward, unlock it and lift it off the rack by extending your legs.',
    );
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });

  it('records the seed version', () => {
    const db = freshSeededDb();
    expect(SEED_VERSION).toBe(9);
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });

  it('is idempotent', () => {
    const db = freshSeededDb();
    const before = rowCounts(db);
    expect(before).toEqual({
      exercises: ALL_EXERCISES,
      routines: 20,
      routineDays: DAYS,
      routineExercises: SLOTS.length,
      foods: loadSeedFoods().length,
    });
    runSeed(db, 2);
    expect(rowCounts(db)).toEqual(before);
    reseed(db);
    expect(rowCounts(db)).toEqual(before);
  });

  it('does nothing once the seed version is current', () => {
    const db = freshSeededDb();
    db.update(exercises).set({ name: 'Edited' }).where(eq(exercises.id, 'plank')).run();
    runSeed(db, 2);
    expect(exercise(db, 'plank').name).toBe('Edited');
  });

  it('preserves next_weight when the seed runs again', () => {
    const db = freshSeededDb();
    const id = 'program-barbell-foundations:a:barbell-bench-press';
    db.update(routineExercises).set({ nextWeight: 185, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, id)).run();
    reseed(db);
    expect(routineExercise(db, id)).toMatchObject({ nextWeight: 185, nextWeightUnit: 'lb' });
  });

  it('refreshes bundled content on a re-seed but keeps user state', () => {
    const db = freshSeededDb();
    const program = 'program-barbell-foundations';
    const rid = 'program-barbell-foundations:a:barbell-back-squat';
    db.update(exercises).set({ name: 'Edited', aliases: [], isCustom: true, archived: true }).where(eq(exercises.id, 'plank')).run();
    db.update(routines).set({ name: 'Edited', nextDayIndex: 1 }).where(eq(routines.id, program)).run();
    db.update(routineDays).set({ name: 'Edited', position: 9 }).where(eq(routineDays.id, `${program}:a`)).run();
    db.update(routineExercises).set({ setCount: 9, repMin: 1, repMax: 2, increment: 99, position: 7 }).where(eq(routineExercises.id, rid)).run();

    reseed(db, 5000);

    expect(exercise(db, 'plank')).toMatchObject({ name: 'Plank', aliases: ['front plank'], isCustom: true, archived: true });
    expect(routine(db, program)).toMatchObject({ name: 'Barbell Foundations', nextDayIndex: 1 });
    expect(days(db, program)[0]).toMatchObject({ id: `${program}:a`, name: 'A', position: 0 });
    expect(routineExercise(db, rid)).toMatchObject({ setCount: 3, repMin: 5, repMax: 8, increment: 5, position: 0 });
  });

  it('keeps the original created_at when it upserts', () => {
    const { db } = createTestDb();
    runSeed(db, 1000);
    reseed(db, 5000);
    expect(exercise(db, 'plank').createdAt).toBe(1000);
    expect(exercise(db, 'support-hold').createdAt).toBe(1000);
    expect(routine(db, 'program-barbell-foundations').createdAt).toBe(1000);
  });

  it('leaves user rows alone', () => {
    const db = freshSeededDb();
    db.insert(exercises)
      .values({
        id: 'custom-1',
        name: 'My lift',
        aliases: [],
        primaryMuscles: ['chest'],
        secondaryMuscles: [],
        equipment: 'barbell',
        pattern: 'horizontal_push',
        loggingType: 'weighted',
        isCustom: true,
        createdAt: 7,
      })
      .run();
    db.insert(routines).values({ id: 'mine', name: 'Mine', isPremade: false, nextDayIndex: 0, createdAt: 8 }).run();
    reseed(db);
    expect(exercise(db, 'custom-1')).toMatchObject({ name: 'My lift', isCustom: true });
    expect(routine(db, 'mine')).toMatchObject({ name: 'Mine', isPremade: false, retired: false });
    expect(rowCounts(db)).toMatchObject({ exercises: ALL_EXERCISES + 1, routines: 21 });
  });

  it('leaves your own exercises untouched, an archived one included (R108, R109)', () => {
    const db = freshSeededDb();
    const input = { primaryMuscles: ['front_delts' as const], secondaryMuscles: [], equipment: 'barbell' as const, loggingType: 'weighted_time' as const };
    const kept = createCustomExercise(db, { ...input, name: 'Landmine carry' }, 7);
    const archived = createCustomExercise(db, { ...input, name: 'Zercher carry' }, 8);
    db.insert(routines).values({ id: 'mine', name: 'Mine', isPremade: false, nextDayIndex: 0, createdAt: 8 }).run();
    db.insert(routineDays).values({ id: 'mine:a', routineId: 'mine', name: 'A', position: 0 }).run();
    db.insert(routineExercises)
      .values({ id: 'mine:a:1', routineDayId: 'mine:a', exerciseId: archived, position: 0, setCount: 3, repMin: 20, repMax: 40, increment: 5, incrementUnit: 'lb' })
      .run();
    expect(deleteCustomExercise(db, archived)).toBe('archived');
    const before = [exercise(db, kept), exercise(db, archived)];

    reseed(db, 5000);

    expect([exercise(db, kept), exercise(db, archived)]).toEqual(before);
    expect(exercise(db, archived)).toMatchObject({ isCustom: true, archived: true, pattern: 'carry' });
  });

  it('runs in one transaction: a failure part-way leaves nothing behind', () => {
    const { db } = createTestDb();
    // Exercises, routines and days are written before the first routine exercise, which this trigger rejects.
    db.run(sql`CREATE TRIGGER reject_routine_exercises BEFORE INSERT ON routine_exercises
      BEGIN SELECT RAISE(ABORT, 'seed failed'); END`);
    expect(() => runSeed(db, 1)).toThrow('seed failed');
    expect(rowCounts(db)).toEqual({ exercises: 0, routines: 0, routineDays: 0, routineExercises: 0, foods: 0 });
    expect(getSettings(db).seedVersion).toBe(0);
  });

  it('loads the library only when the stored seed version is behind', () => {
    const db = freshSeededDb();
    const loads = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('./library.generated', () => {
        loads();
        return jest.requireActual('./library.generated');
      });
      const isolated = require('./seed') as typeof import('./seed');
      isolated.runSeed(db, 2);
      expect(loads).not.toHaveBeenCalled();
      setSetting(db, 'seedVersion', 1);
      isolated.runSeed(db, 3);
      expect(loads).toHaveBeenCalledTimes(1);
    });
    jest.dontMock('./library.generated');
  });
});

describe('seed version 9 over a version 8 database (§18.29)', () => {
  const NOW = Date.UTC(2026, 9, 15, 9);
  const HOUR = 3_600_000;

  /** A seed-8 phone mid-way through Push/pull/legs: active, a finished Push A at 185 lb, Pull A up next. */
  function midPpl(): { db: Db; workoutId: string } {
    const db = seededV8Db();
    setActiveRoutine(db, PPL);
    const workoutId = startWorkoutFromDay(db, 'premade-ppl-6:push-a', V8_SEEDED_AT);
    for (const set of getActiveWorkoutView(db)!.exercises[0].sets) {
      tickSet(db, set.id, { weight: 185, reps: 8, durationS: null, distance: null }, 'lb', V8_SEEDED_AT + 60_000, 'mi');
    }
    finishWorkout(db, workoutId, V8_SEEDED_AT + HOUR);
    return { db, workoutId };
  }

  it('starts from the nine programs version 8 wrote, none retired', () => {
    const db = seededV8Db();
    expect(getSettings(db).seedVersion).toBe(8);
    expect(db.select().from(routines).all().map((r) => [r.id, r.retired]).sort()).toEqual(V8_ORDER.map((id) => [id, false]).sort());
  });

  it('seed 9 from a seed-8 database with an active Push/pull/legs and history: it is retired, still active, its rows and next weights untouched, listed under Earlier programs', () => {
    const { db, workoutId } = midPpl();
    expect(routineExercise(db, BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });
    const before = {
      routine: routine(db, PPL),
      days: days(db, PPL),
      rows: exercisesOf(db, [PPL]),
      workouts: db.select().from(workouts).all(),
      workoutExercises: db.select().from(workoutExercises).all(),
      sets: db.select().from(sets).all(),
      upNext: getUpNext(db),
    };

    runSeed(db, NOW);

    expect(routine(db, PPL)).toEqual({ ...before.routine, retired: true });
    expect(days(db, PPL)).toEqual(before.days);
    expect(exercisesOf(db, [PPL])).toEqual(before.rows);
    expect(routineExercise(db, BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });
    expect(db.select().from(workouts).all()).toEqual(before.workouts);
    expect(db.select().from(workoutExercises).all()).toEqual(before.workoutExercises);
    expect(db.select().from(sets).all()).toEqual(before.sets);
    expect(getSettings(db).activeRoutineId).toBe(PPL);
    // It keeps running exactly as before: the same day up next, with the same next weights.
    expect(getUpNext(db)).toEqual(before.upNext);
    expect(getUpNext(db)!.dayName).toBe('Pull A');
    expect(getPreviousSets(db, 'barbell-bench-press', 'none')[0]).toMatchObject({ weight: 185, reps: 8 });
    expect(db.select().from(workouts).where(eq(workouts.id, workoutId)).get()).toMatchObject({ status: 'finished', routineId: PPL });

    // Routines: the twenty, then Push/pull/legs under Earlier programs; the eight nobody uses are not listed.
    const listed = listRoutines(db);
    expect(listed.map((r) => [r.id, r.group])).toEqual([...PROGRAM_ORDER.map((id) => [id, 'program']), [PPL, 'earlier']]);
    expect(listed.find((r) => r.id === PPL)).toMatchObject({ name: 'Push/pull/legs', isPremade: true, isActive: true, dayCount: 6 });
  });

  it('a retired program with no use is hidden', () => {
    const db = seededV8Db();
    runSeed(db, NOW);
    expect(V8_ORDER.map((id) => routine(db, id).retired)).toEqual(V8_ORDER.map(() => true));
    expect(listRoutines(db).map((r) => r.id)).toEqual(PROGRAM_ORDER);
    // Its rows are all still there, for whoever opens it from a shared code or history.
    expect(exercisesOf(db, V8_ORDER)).toHaveLength(V8_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises)).length);
  });

  it('a retired program a finished workout ran from is listed under Earlier programs, though no longer active', () => {
    const { db } = midPpl();
    setActiveRoutine(db, 'program-barbell-foundations');
    runSeed(db, NOW);
    expect(listRoutines(db).filter((r) => r.group === 'earlier').map((r) => [r.id, r.isActive])).toEqual([[PPL, false]]);
  });

  it('re-running seed 9 changes nothing', () => {
    const { db } = midPpl();
    runSeed(db, NOW);
    const once = seedRows(db);
    const history = db.select().from(workoutExercises).all();
    reseed(db, NOW + HOUR);
    expect(seedRows(db)).toEqual(once);
    expect(db.select().from(workoutExercises).all()).toEqual(history);
    runSeed(db, NOW + 2 * HOUR);
    expect(seedRows(db)).toEqual(once);
  });

  it('107 new exercises and the aliases; search finds "Diamond push-up", "Nordic curl"', () => {
    const db = seededV8Db();
    expect(db.select().from(exercises).all()).toHaveLength(LIBRARY_EXERCISES.length);

    runSeed(db, NOW);

    expect(NEW_EXERCISES).toHaveLength(107);
    for (const { id, ...content } of NEW_EXERCISES) {
      expect(exercise(db, id)).toEqual({ id, ...content, isCustom: false, archived: false, createdAt: NOW });
    }
    for (const [id, added] of Object.entries(NEW_ALIASES)) {
      expect([id, exercise(db, id).aliases]).toEqual([id, aliasesOf(id)]);
      expect(exercise(db, id).aliases).toEqual(expect.arrayContaining([...added]));
      // An existing exercise keeps its creation time.
      expect(exercise(db, id).createdAt).toBe(V8_SEEDED_AT);
    }
    const found = (q: string) => searchExercises(listExercises(db), q).map((e) => e.id);
    expect(found('Diamond push-up')).toContain('close-grip-push-up');
    expect(found('Nordic curl')).toContain('fedb-natural-glute-ham-raise');
    expect(found('Log clean and press')).toContain('fedb-log-lift');
    expect(found('Support hold')).toContain('support-hold');
  });

  it('a program slot keeps its Modify swap and its ladder rung through a re-seed', () => {
    const db = seededV8Db();
    runSeed(db, NOW);
    const swapped = 'program-barbell-foundations:a:barbell-bench-press';
    const ladder = PROGRAMS.find((p) => p.id === 'program-calisthenics-foundations')!.days[0].slots.find((s) => s.ladder !== null)!;
    const added = 'program-barbell-foundations:a:barbell-row';
    swapRoutineExercise(db, swapped, 'dumbbell-bench-press');
    db.update(routineExercises).set({ exerciseId: ladder.ladder![2].exerciseId, ladderRung: 2 }).where(eq(routineExercises.id, ladder.id)).run();
    db.update(routineExercises).set({ nextSetCount: 5, nextWeight: 95, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, added)).run();
    db.update(routines).set({ runStartedAt: NOW, runDeloadAt: NOW + HOUR, nextDayIndex: 1 }).where(eq(routines.id, 'program-barbell-foundations')).run();
    setActiveRoutine(db, 'program-barbell-foundations');
    const before = seedRows(db);

    reseed(db, NOW + 2 * HOUR);

    expect(routineExercise(db, swapped).exerciseId).toBe('dumbbell-bench-press');
    expect(routineExercise(db, ladder.id)).toMatchObject({ exerciseId: ladder.ladder![2].exerciseId, ladderRung: 2 });
    expect(routineExercise(db, added)).toMatchObject({ nextSetCount: 5, nextWeight: 95, nextWeightUnit: 'lb' });
    expect(routine(db, 'program-barbell-foundations')).toMatchObject({ runStartedAt: NOW, runDeloadAt: NOW + HOUR, nextDayIndex: 1 });
    expect(seedRows(db)).toEqual(before);
  });

  it('a program the seed has loses a day and a slot the seed no longer has, and the rest keep their progress', () => {
    const db = freshSeededDb();
    const program = 'program-barbell-foundations';
    db.insert(routineDays).values({ id: `${program}:c`, routineId: program, name: 'C', position: 2 }).run();
    db.insert(routineExercises)
      .values([
        { id: `${program}:c:barbell-curl`, routineDayId: `${program}:c`, exerciseId: 'barbell-curl', position: 0, setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb' },
        { id: `${program}:a:barbell-curl`, routineDayId: `${program}:a`, exerciseId: 'barbell-curl', position: 9, setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb' },
      ])
      .run();
    db.update(routineExercises).set({ nextWeight: 135, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, `${program}:a:barbell-back-squat`)).run();

    reseed(db);

    expect(days(db, program).map((d) => d.name)).toEqual(['A', 'B']);
    expect(exercisesOf(db, [program]).map((r) => r.id)).toEqual(PROGRAMS[0].days.flatMap((d) => d.slots.map((s) => s.id)).sort());
    expect(routineExercise(db, `${program}:a:barbell-back-squat`)).toMatchObject({ nextWeight: 135, nextWeightUnit: 'lb' });
  });

  it('brings back a retired program that is in the seed again', () => {
    const db = freshSeededDb();
    db.update(routines).set({ retired: true }).where(eq(routines.id, 'program-bro-split')).run();
    reseed(db);
    expect(routine(db, 'program-bro-split').retired).toBe(false);
  });

  it('never retires or prunes a routine of your own, a copy of a retired program included', () => {
    const db = seededV8Db();
    const id = duplicateRoutine(db, PPL, V8_SEEDED_AT);
    const before = getRoutineDetail(db, id);
    runSeed(db, NOW);
    expect(getRoutineDetail(db, id)).toEqual(before);
    expect(routine(db, id)).toMatchObject({ isPremade: false, retired: false });
  });

  it('a fresh install has none of the nine', () => {
    const db = freshSeededDb();
    expect(db.select().from(routines).where(inArray(routines.id, [...V8_ORDER])).all()).toEqual([]);
  });
});

describe('seed version 9 over a version 1 database', () => {
  const NOW = Date.UTC(2026, 9, 15, 9);
  const HOUR = 3_600_000;
  const BENCH = 'barbell-bench-press';
  const V1_BENCH_ROW = 'premade-ppl-6:push-a:barbell-bench-press';

  it('starts from the 55 exercises and six premades version 1 wrote', () => {
    const db = seededV1Db();
    expect(getSettings(db).seedVersion).toBe(1);
    expect(rowCounts(db)).toEqual({ exercises: 55, routines: 6, routineDays: 21, routineExercises: 104, foods: 0 });
  });

  it('keeps the 55 ids with their names, aliases, muscles and creation time, and adds their steps and source', () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    // Sissy squat was not in version 1 (R172): a later seed adds it, with that seed's creation time.
    for (const { id, ...content } of SEED_EXERCISES.filter((e) => e.id !== 'sissy-squat')) {
      const library = LIBRARY_EXERCISES.find((e) => e.id === id)!;
      expect(exercise(db, id)).toEqual({
        id,
        ...content,
        aliases: aliasesOf(id),
        instructions: library.instructions,
        sourceId: library.sourceId,
        isCustom: false,
        archived: false,
        createdAt: V1_SEEDED_AT,
      });
    }
    expect(exercise(db, BENCH).instructions.length).toBeGreaterThan(2);
  });

  it('adds the rest of the library at now, with no name twice and no legacy source added again', () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(ALL_EXERCISES);
    const names = rows.map((r) => r.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const sources = rows.flatMap((r) => (r.sourceId === null ? [] : [r.sourceId]));
    expect(new Set(sources).size).toBe(sources.length);
    expect(rows.filter((r) => r.sourceId === 'Barbell_Bench_Press_-_Medium_Grip').map((r) => r.id)).toEqual([BENCH]);
    expect(rows.find((r) => r.id === 'fedb-barbell-bench-press-medium-grip')).toBeUndefined();
    expect(exercise(db, 'fedb-ez-bar-curl').createdAt).toBe(NOW);
  });

  it('keeps notes, rest times, finished workouts and next weights readable', () => {
    const db = seededV1Db();
    setExerciseNote(db, BENCH, 'Elbows in', V1_SEEDED_AT);
    setRestSeconds(db, BENCH, 150, V1_SEEDED_AT);
    const id = startWorkoutFromDay(db, 'premade-ppl-6:push-a', V1_SEEDED_AT);
    for (const set of getActiveWorkoutView(db)!.exercises[0].sets) {
      tickSet(db, set.id, { weight: 185, reps: 8, durationS: null, distance: null }, 'lb', V1_SEEDED_AT + 60_000, 'mi');
    }
    finishWorkout(db, id, V1_SEEDED_AT + HOUR);
    expect(routineExercise(db, V1_BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });

    runSeed(db, NOW);

    expect(getExerciseNote(db, BENCH)).toBe('Elbows in');
    expect(getRestSeconds(db, BENCH)).toBe(150);
    expect(getPreviousSets(db, BENCH, 'none')).toHaveLength(4);
    expect(getPreviousSets(db, BENCH, 'none')[0]).toMatchObject({ weight: 185, weightUnit: 'lb', reps: 8 });
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({ status: 'finished', name: 'Push A' });
    // Finish keeps only the exercises with done sets: bench.
    expect(db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all()).toEqual([
      expect.objectContaining({ exerciseId: BENCH, routineExerciseId: V1_BENCH_ROW, workingWeight: 185, note: 'Elbows in' }),
    ]);
    expect(routineExercise(db, V1_BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });
  });

  it('changes nothing when it runs again', () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    const once = seedRows(db);
    reseed(db, NOW + HOUR);
    expect(seedRows(db)).toEqual(once);
  });

  it('retires all six version 1 programs whole, keeping their days, exercises, progress and active state', () => {
    const db = seededV1Db();
    db.update(routines).set({ nextDayIndex: 4 }).where(eq(routines.id, PPL)).run();
    db.update(routineExercises).set({ nextWeight: 225, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, 'premade-5x5-3:a:barbell-back-squat')).run();
    setActiveRoutine(db, 'premade-5x5-3');
    const ids = V1_ROUTINES.map((r) => r.id);
    const before = { routines: ids.map((id) => routine(db, id)), rows: exercisesOf(db, ids), days: ids.map((id) => days(db, id)) };

    runSeed(db, NOW);

    expect(ids.map((id) => routine(db, id))).toEqual(before.routines.map((r) => ({ ...r, retired: true })));
    expect(exercisesOf(db, ids)).toEqual(before.rows);
    expect(ids.map((id) => days(db, id))).toEqual(before.days);
    expect(routine(db, PPL).nextDayIndex).toBe(4);
    expect(routineExercise(db, 'premade-5x5-3:a:barbell-back-squat').nextWeight).toBe(225);
    expect(getSettings(db).activeRoutineId).toBe('premade-5x5-3');
    expect(PREMADE_ORDER.map((id) => routine(db, id).retired)).toEqual(PREMADE_ORDER.map(() => false));
  });

  it('never deletes an exercise, even a bundled one the library no longer has', () => {
    const db = seededV1Db();
    db.insert(exercises)
      .values({
        id: 'old-bundled-lift',
        name: 'Old bundled lift',
        aliases: [],
        primaryMuscles: ['chest'],
        secondaryMuscles: [],
        equipment: 'barbell',
        pattern: 'horizontal_push',
        loggingType: 'weighted',
        isCustom: false,
        createdAt: V1_SEEDED_AT,
      })
      .run();
    runSeed(db, NOW);
    expect(exercise(db, 'old-bundled-lift')).toMatchObject({ name: 'Old bundled lift' });
    expect(rowCounts(db).exercises).toBe(ALL_EXERCISES + 1);
  });
});

describe('the test fixtures', () => {
  it('seededDb is a phone updated from version 8: the twenty and the nine retired', () => {
    const db = seededDb();
    expect(routine(db, PPL)).toMatchObject({ retired: true, isPremade: true });
    expect(PREMADE_ORDER.map((id) => routine(db, id).retired)).toEqual(PREMADE_ORDER.map(() => false));
    expect(listRoutines(db).map((r) => r.id)).toEqual(PROGRAM_ORDER);
  });
});

describe('seed version 5: the bundled foods (R139)', () => {
  const food = (db: Db, id: string) => db.select().from(foods).where(eq(foods.id, id)).get()!;
  const EGG = 'fdc-171287';

  it('inserts every bundled food as it is listed, from USDA, not archived and with no barcode', () => {
    const db = freshSeededDb('us');
    const rows = db.select().from(foods).orderBy(asc(foods.id)).all();
    const listed = [...loadSeedFoods()].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(rows).toEqual(listed.map((f) => ({ ...f, source: 'bundled', barcode: null, archived: false })));
  });

  it('refreshes a bundled food on a re-seed but keeps it archived', () => {
    const db = freshSeededDb('us');
    db.update(foods).set({ name: 'Edited', servingLabel: 'Edited', servingGrams: 1, kcal: 1, proteinG: 1, carbsG: 1, fatG: 1, archived: true }).where(eq(foods.id, EGG)).run();

    reseed(db);

    const listed = loadSeedFoods().find((f) => f.id === EGG)!;
    expect(food(db, EGG)).toEqual({ ...listed, source: 'bundled', barcode: null, archived: true });
  });

  it('never touches your own foods, even one under a bundled id', () => {
    const db = freshSeededDb('us');
    const mine = { id: 'custom-1', name: 'My shake', servingLabel: '1 bottle', servingGrams: null, kcal: 300, proteinG: 40, carbsG: 20, fatG: 5, source: 'custom' as const, barcode: '123', archived: true };
    db.insert(foods).values(mine).run();
    db.update(foods).set({ name: 'My egg', source: 'custom', kcal: 99 }).where(eq(foods.id, EGG)).run();
    const myEgg = food(db, EGG);

    reseed(db);

    expect(food(db, 'custom-1')).toEqual(mine);
    expect(food(db, EGG)).toEqual(myEgg);
    expect(rowCounts(db).foods).toBe(loadSeedFoods().length + 1);
  });

  it('adds the foods to a phone seeded at version 4, and changes nothing else', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    db.delete(foods).run();
    setSetting(db, 'seedVersion', 4);
    const before = seedRows(db);

    runSeed(db, 5678);

    expect(rowCounts(db).foods).toBe(loadSeedFoods().length);
    expect(food(db, EGG)).toMatchObject({ name: 'Egg, large', source: 'bundled' });
    expect(seedRows(db)).toEqual(before);
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });

  it('loads the foods only when the stored seed version is behind', () => {
    const db = freshSeededDb('us');
    const loads = jest.fn();
    jest.isolateModules(() => {
      jest.doMock('./foods.json', () => {
        loads();
        return jest.requireActual('./foods.json');
      });
      const isolated = require('./seed') as typeof import('./seed');
      isolated.runSeed(db, 2);
      expect(loads).not.toHaveBeenCalled();
      setSetting(db, 'seedVersion', 4);
      isolated.runSeed(db, 3);
      expect(loads).toHaveBeenCalledTimes(1);
    });
    jest.dontMock('./foods.json');
  });
});

describe('seed version 8: the food library (R545)', () => {
  const food = (db: Db, id: string) => db.select().from(foods).where(eq(foods.id, id)).get();

  it('adds about 8,000 USDA foods beside the hand-picked ones: staples, restaurants and brands', () => {
    const db = freshSeededDb('us');
    const names = db.select({ name: foods.name }).from(foods).all().map((f) => f.name);
    expect(names.length).toBeGreaterThan(8000);
    expect(names).toEqual(expect.arrayContaining(["McDonald's, Big Mac", 'Taco Bell, Bean Burrito', "Chick-Fil-A, chicken sandwich", 'Egg, large']));
    expect(food(db, 'sr28-21237')?.name).toBe("McDonald's, Big Mac");
  });

  it('gives each library food a stable id, a name, a serving and sensible macros', () => {
    const library = loadSeedFoods().filter((f) => f.id.startsWith('sr28-'));
    expect(library.length).toBeGreaterThan(7900);
    expect(new Set(loadSeedFoods().map((f) => f.id)).size).toBe(loadSeedFoods().length);
    for (const f of library) {
      expect(f.id).toMatch(/^sr28-\d{5}$/);
      expect(f.name.trim()).toBe(f.name);
      expect(f.name.length).toBeGreaterThan(2);
      expect(f.servingLabel).not.toMatch(/NLEA|^\.|\s{2}|,\s*,/);
      expect(f.servingGrams).toBeGreaterThan(0);
      expect(Number.isInteger(f.kcal)).toBe(true);
      expect([f.id, Math.min(f.kcal, f.proteinG, f.carbsG, f.fatG) >= 0]).toEqual([f.id, true]);
    }
  });

  it('leaves out what the hand-picked list already has, so egg shows once', () => {
    const names = loadSeedFoods().map((f) => f.name);
    expect(names).not.toContain('Egg, whole, raw, fresh');
    expect(names).toContain('Egg, large');
  });

  it('adds the library to a phone seeded at version 7, keeping your own foods and what you logged', () => {
    const db = freshSeededDb('us');
    db.delete(foods).where(sql`${foods.id} like 'sr28-%'`).run();
    db.insert(foods).values({ id: 'custom-1', name: 'My shake', servingLabel: '1 bottle', servingGrams: null, kcal: 300, proteinG: 40, carbsG: 20, fatG: 5, source: 'custom', barcode: null, archived: false }).run();
    setSetting(db, 'seedVersion', 7);

    runSeed(db, 9999);

    expect(rowCounts(db).foods).toBe(loadSeedFoods().length + 1);
    expect(food(db, 'custom-1')?.name).toBe('My shake');
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });
});
