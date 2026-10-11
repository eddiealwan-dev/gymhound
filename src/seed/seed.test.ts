/** @jest-environment node */
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { getRestSeconds, setRestSeconds } from '../db/repositories/exercisePrefsRepo';
import { getExerciseNote, setExerciseNote } from '../db/repositories/exercisesRepo';
import { duplicateRoutine, getRoutineDetail, setActiveRoutine } from '../db/repositories/routinesRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView, getPreviousSets } from '../db/repositories/workoutViewsRepo';
import { exercises, routineDays, routineExercises, routines, workoutExercises, workouts } from '../db/schema';
import { createTestDb } from '../db/testing/createTestDb';
import { seededDb } from '../db/testing/fixtures';
import { V1_SEEDED_AT, seededV1Db } from '../db/testing/seedV1';
import type { Db } from '../db/types';
import { SEED_EXERCISES } from './exercises';
import { LIBRARY_EXERCISES } from './library.generated';
import { PREMADE_ORDER, SEED_ROUTINES } from './routines';
import { SEED_VERSION, runSeed } from './seed';

const days = (db: Db, routineId: string) =>
  db.select().from(routineDays).where(eq(routineDays.routineId, routineId)).orderBy(asc(routineDays.position)).all();

const routineExercise = (db: Db, id: string) =>
  db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;

const exercise = (db: Db, id: string) => db.select().from(exercises).where(eq(exercises.id, id)).get()!;

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
});

/** Forces the seed to run again, as an app update with a newer seed would. */
const reseed = (db: Db, now = 2) => {
  setSetting(db, 'seedVersion', 0);
  runSeed(db, now);
};

describe('seed data', () => {
  it('bundles 55 exercises with unique ids, a primary muscle and no muscle both primary and secondary', () => {
    expect(SEED_EXERCISES).toHaveLength(55);
    expect(new Set(SEED_EXERCISES.map((e) => e.id)).size).toBe(55);
    for (const e of SEED_EXERCISES) {
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      expect(e.primaryMuscles.filter((m) => e.secondaryMuscles.includes(m))).toEqual([]);
    }
  });

  it('lists the premade routines in display order', () => {
    expect(PREMADE_ORDER).toEqual([
      'premade-fullbody-3',
      'premade-upperlower-4',
      'premade-ppl-6',
      'premade-5x5-3',
      'premade-dumbbell-3',
      'premade-noequipment-3',
    ]);
    expect(SEED_ROUTINES.map((r) => r.id)).toEqual(PREMADE_ORDER);
  });
});

describe('runSeed', () => {
  it('inserts every library exercise as a non-custom row created at now', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(LIBRARY_EXERCISES.length);
    expect(rows.map((r) => r.id).sort()).toEqual(LIBRARY_EXERCISES.map((e) => e.id).sort());
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

  it('stores each exercise exactly as the library has it, with its steps and source id', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const stored = new Map(db.select().from(exercises).all().map((r) => [r.id, r]));
    for (const { id, ...content } of LIBRARY_EXERCISES) expect(stored.get(id)).toMatchObject(content);
    expect(exercise(db, 'barbell-bench-press')).toMatchObject({
      sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
      instructions: expect.arrayContaining([expect.stringMatching(/^Lie back on a flat bench/)]),
    });
    expect(exercise(db, 'fedb-ez-bar-curl')).toMatchObject({ name: 'EZ-bar curl', equipment: 'ez_bar', sourceId: 'EZ-Bar_Curl' });
    expect(exercise(db, 'wall-sit')).toMatchObject({ instructions: [], sourceId: null });
  });

  it('inserts the six premade routines, each starting at day 0', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const rows = db.select().from(routines).all();
    expect(rows.map((r) => r.id).sort()).toEqual([...PREMADE_ORDER].sort());
    expect(rows.every((r) => r.isPremade && r.nextDayIndex === 0 && r.createdAt === 1234)).toBe(true);
    expect(rows.find((r) => r.id === 'premade-5x5-3')!.name).toBe('5×5');
  });

  it('gives each premade routine its days', () => {
    const db = seededDb('us');
    expect(PREMADE_ORDER.map((id) => [id, days(db, id).length])).toEqual([
      ['premade-fullbody-3', 3],
      ['premade-upperlower-4', 4],
      ['premade-ppl-6', 6],
      ['premade-5x5-3', 2],
      ['premade-dumbbell-3', 3],
      ['premade-noequipment-3', 3],
    ]);
    expect(days(db, 'premade-ppl-6').map((d) => d.name)).toEqual([
      'Push A',
      'Pull A',
      'Legs A',
      'Push B',
      'Pull B',
      'Legs B',
    ]);
    expect(days(db, 'premade-ppl-6')[0].id).toBe('premade-ppl-6:push-a');
  });

  it('seeds a day\'s exercises in order, with ids built from the day and exercise', () => {
    const db = seededDb('us');
    const rows = db
      .select()
      .from(routineExercises)
      .where(eq(routineExercises.routineDayId, 'premade-fullbody-3:a'))
      .orderBy(asc(routineExercises.position))
      .all();
    expect(rows.map((r) => r.id)).toEqual([
      'premade-fullbody-3:a:barbell-back-squat',
      'premade-fullbody-3:a:barbell-bench-press',
      'premade-fullbody-3:a:barbell-row',
      'premade-fullbody-3:a:dumbbell-lateral-raise',
      'premade-fullbody-3:a:plank',
    ]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    expect(rows[0]).toMatchObject({ setCount: 3, repMin: 6, repMax: 10, supersetGroup: null });
  });

  it('references only seeded exercises from every routine exercise', () => {
    const db = seededDb('us');
    const known = new Set(db.select().from(exercises).all().map((e) => e.id));
    const rows = db.select().from(routineExercises).all();
    expect(rows).toHaveLength(SEED_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises)).length);
    expect(rows.filter((r) => !known.has(r.exerciseId))).toEqual([]);
    const dayIds = new Set(db.select().from(routineDays).all().map((d) => d.id));
    expect(rows.filter((r) => !dayIds.has(r.routineDayId))).toEqual([]);
  });

  it('seeds bench on PPL Push A as 4 sets of 5 to 8 at +5 lb', () => {
    const db = seededDb('us');
    expect(routineExercise(db, 'premade-ppl-6:push-a:barbell-bench-press')).toMatchObject({
      position: 0,
      setCount: 4,
      repMin: 5,
      repMax: 8,
      increment: 5,
      incrementUnit: 'lb',
      nextWeight: null,
      nextWeightUnit: null,
    });
  });

  it('seeds the 5x5 B deadlift as 1 set of 5 at +10 lb', () => {
    const db = seededDb('us');
    expect(routineExercise(db, 'premade-5x5-3:b:barbell-deadlift')).toMatchObject({
      setCount: 1,
      repMin: 5,
      repMax: 5,
      increment: 10,
      incrementUnit: 'lb',
    });
    expect(routineExercise(db, 'premade-5x5-3:a:barbell-back-squat')).toMatchObject({ setCount: 5, repMin: 5, repMax: 5, increment: 5 });
  });

  it('gives every no-equipment row an increment of 0 and every plank 30 to 60 seconds', () => {
    const db = seededDb('us');
    const noEquipment = db
      .select()
      .from(routineExercises)
      .all()
      .filter((r) => r.id.startsWith('premade-noequipment-3:'));
    expect(noEquipment).toHaveLength(15);
    expect(noEquipment.every((r) => r.increment === 0)).toBe(true);

    const planks = db.select().from(routineExercises).where(eq(routineExercises.exerciseId, 'plank')).all();
    expect(planks.map((r) => r.id).sort()).toEqual(['premade-fullbody-3:a:plank', 'premade-noequipment-3:a:plank']);
    expect(planks.every((r) => r.repMin === 30 && r.repMax === 60 && r.increment === 0)).toBe(true);
  });

  it('never adds weight to a timed exercise, and keeps hanging leg raise on reps only', () => {
    const db = seededDb('us');
    const timed = new Set(db.select().from(exercises).where(eq(exercises.loggingType, 'timed')).all().map((e) => e.id));
    const rows = db.select().from(routineExercises).all();
    const timedRows = rows.filter((r) => timed.has(r.exerciseId));
    expect(timedRows.length).toBeGreaterThan(0);
    expect(timedRows.every((r) => r.increment === 0)).toBe(true);
    expect(routineExercise(db, 'premade-upperlower-4:lower-b:hanging-leg-raise').increment).toBe(0);
  });

  it('uses kg increments on a metric device', () => {
    const db = seededDb('metric');
    expect(routineExercise(db, 'premade-ppl-6:push-a:barbell-bench-press')).toMatchObject({
      increment: 2.5,
      incrementUnit: 'kg',
    });
    expect(routineExercise(db, 'premade-5x5-3:b:barbell-deadlift')).toMatchObject({ increment: 5, incrementUnit: 'kg' });
    expect(routineExercise(db, 'premade-noequipment-3:a:push-up').increment).toBe(0);
  });

  it('records the seed version', () => {
    const db = seededDb('us');
    expect(SEED_VERSION).toBe(2);
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });

  it('is idempotent', () => {
    const db = seededDb('us');
    const before = rowCounts(db);
    expect(before).toEqual({ exercises: LIBRARY_EXERCISES.length, routines: 6, routineDays: 21, routineExercises: 104 });
    runSeed(db, 2);
    expect(rowCounts(db)).toEqual(before);
    reseed(db);
    expect(rowCounts(db)).toEqual(before);
  });

  it('does nothing once the seed version is current', () => {
    const db = seededDb('us');
    db.update(exercises).set({ name: 'Edited' }).where(eq(exercises.id, 'plank')).run();
    runSeed(db, 2);
    expect(exercise(db, 'plank').name).toBe('Edited');
  });

  it('preserves next_weight when the seed runs again', () => {
    const db = seededDb('us');
    const id = 'premade-ppl-6:push-a:barbell-bench-press';
    db.update(routineExercises).set({ nextWeight: 185, nextWeightUnit: 'lb' }).where(eq(routineExercises.id, id)).run();
    reseed(db);
    expect(routineExercise(db, id)).toMatchObject({ nextWeight: 185, nextWeightUnit: 'lb' });
  });

  it('refreshes bundled content on a re-seed but keeps user state', () => {
    const db = seededDb('us');
    const rid = 'premade-ppl-6:push-a:barbell-bench-press';
    db.update(exercises).set({ name: 'Edited', aliases: [], isCustom: true, archived: true }).where(eq(exercises.id, 'plank')).run();
    db.update(routines).set({ name: 'Edited', nextDayIndex: 4 }).where(eq(routines.id, 'premade-ppl-6')).run();
    db.update(routineDays).set({ name: 'Edited', position: 9 }).where(eq(routineDays.id, 'premade-ppl-6:push-a')).run();
    db.update(routineExercises).set({ setCount: 9, repMin: 1, repMax: 2, increment: 99, position: 7 }).where(eq(routineExercises.id, rid)).run();

    reseed(db, 5000);

    expect(exercise(db, 'plank')).toMatchObject({
      name: 'Plank',
      aliases: ['front plank'],
      isCustom: true,
      archived: true,
    });
    expect(db.select().from(routines).where(eq(routines.id, 'premade-ppl-6')).get()).toMatchObject({
      name: 'Push/pull/legs',
      nextDayIndex: 4,
    });
    expect(days(db, 'premade-ppl-6')[0]).toMatchObject({ id: 'premade-ppl-6:push-a', name: 'Push A', position: 0 });
    expect(routineExercise(db, rid)).toMatchObject({ setCount: 4, repMin: 5, repMax: 8, increment: 5, position: 0 });
  });

  it('keeps the original created_at when it upserts', () => {
    const { db } = createTestDb();
    runSeed(db, 1000);
    reseed(db, 5000);
    expect(exercise(db, 'plank').createdAt).toBe(1000);
    expect(db.select().from(routines).where(eq(routines.id, 'premade-ppl-6')).get()!.createdAt).toBe(1000);
  });

  it('leaves user rows alone', () => {
    const db = seededDb('us');
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
    expect(db.select().from(routines).where(eq(routines.id, 'mine')).get()).toMatchObject({ name: 'Mine', isPremade: false });
    expect(rowCounts(db)).toMatchObject({ exercises: LIBRARY_EXERCISES.length + 1, routines: 7 });
  });

  it('runs in one transaction: a failure part-way leaves nothing behind', () => {
    const { db } = createTestDb();
    // Exercises, routines and days are written before the first routine exercise, which this trigger rejects.
    db.run(sql`CREATE TRIGGER reject_routine_exercises BEFORE INSERT ON routine_exercises
      BEGIN SELECT RAISE(ABORT, 'seed failed'); END`);
    expect(() => runSeed(db, 1)).toThrow('seed failed');
    expect(rowCounts(db)).toEqual({ exercises: 0, routines: 0, routineDays: 0, routineExercises: 0 });
    expect(getSettings(db).seedVersion).toBe(0);
  });

  it('loads the library only when the stored seed version is behind', () => {
    const db = seededDb('us');
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

describe('seed version 2 over a version 1 database', () => {
  const NOW = Date.UTC(2026, 9, 11, 9);
  const HOUR = 3_600_000;
  const BENCH = 'barbell-bench-press';
  const BENCH_ROW = 'premade-ppl-6:push-a:barbell-bench-press';
  const rule = { setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb' } as const;

  it('starts from the 55 exercises and six premades version 1 wrote', () => {
    const db = seededV1Db();
    expect(getSettings(db).seedVersion).toBe(1);
    expect(rowCounts(db)).toEqual({ exercises: 55, routines: 6, routineDays: 21, routineExercises: 104 });
  });

  it('keeps the 55 ids with their names, aliases, muscles and creation time, and adds their steps and source', () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    for (const { id, ...content } of SEED_EXERCISES) {
      const library = LIBRARY_EXERCISES.find((e) => e.id === id)!;
      expect(exercise(db, id)).toEqual({
        id,
        ...content,
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
    expect(rows).toHaveLength(LIBRARY_EXERCISES.length);
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
    expect(routineExercise(db, BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });

    runSeed(db, NOW);

    expect(getExerciseNote(db, BENCH)).toBe('Elbows in');
    expect(getRestSeconds(db, BENCH)).toBe(150);
    expect(getPreviousSets(db, BENCH, 'none')).toHaveLength(4);
    expect(getPreviousSets(db, BENCH, 'none')[0]).toMatchObject({ weight: 185, weightUnit: 'lb', reps: 8 });
    expect(db.select().from(workouts).where(eq(workouts.id, id)).get()).toMatchObject({ status: 'finished', name: 'Push A' });
    // Finish keeps only the exercises with done sets: bench.
    expect(db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, id)).all()).toEqual([
      expect.objectContaining({ exerciseId: BENCH, routineExerciseId: BENCH_ROW, workingWeight: 185, note: 'Elbows in' }),
    ]);
    expect(routineExercise(db, BENCH_ROW)).toMatchObject({ nextWeight: 190, nextWeightUnit: 'lb' });
  });

  it('changes nothing when it runs again', () => {
    const db = seededV1Db();
    runSeed(db, NOW);
    const once = seedRows(db);
    reseed(db, NOW + HOUR);
    expect(seedRows(db)).toEqual(once);
  });

  it('removes the days and routine exercises of a continuing premade that the seed no longer has', () => {
    const db = seededV1Db();
    // As if an older seed had one more exercise on Push A and one more day.
    db.insert(routineExercises)
      .values({ id: 'premade-ppl-6:push-a:dumbbell-curl', routineDayId: 'premade-ppl-6:push-a', exerciseId: 'dumbbell-curl', position: 5, ...rule, nextWeight: 30, nextWeightUnit: 'lb' })
      .run();
    db.insert(routineDays).values({ id: 'premade-ppl-6:arms', routineId: 'premade-ppl-6', name: 'Arms', position: 6 }).run();
    db.insert(routineExercises)
      .values({ id: 'premade-ppl-6:arms:barbell-curl', routineDayId: 'premade-ppl-6:arms', exerciseId: 'barbell-curl', position: 0, ...rule })
      .run();

    runSeed(db, NOW);

    expect(db.select().from(routineExercises).where(eq(routineExercises.id, 'premade-ppl-6:push-a:dumbbell-curl')).get()).toBeUndefined();
    expect(db.select().from(routineDays).where(eq(routineDays.id, 'premade-ppl-6:arms')).get()).toBeUndefined();
    expect(db.select().from(routineExercises).where(eq(routineExercises.routineDayId, 'premade-ppl-6:arms')).all()).toEqual([]);
    expect(days(db, 'premade-ppl-6').map((d) => d.name)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
    // Every remaining row of a premade the seed has is one the seed writes; the exercise itself stays in the library.
    const seeded = new Set(SEED_ROUTINES.flatMap((r) => r.days.flatMap((d) => d.exercises.map((e) => `${r.id}:${d.slug}:${e.exercise}`))));
    const dayIds = db.select({ id: routineDays.id }).from(routineDays).where(inArray(routineDays.routineId, PREMADE_ORDER));
    const left = db.select().from(routineExercises).where(inArray(routineExercises.routineDayId, dayIds)).all();
    expect(left.map((r) => r.id).sort()).toEqual([...seeded].sort());
    expect(exercise(db, 'dumbbell-curl')).toBeDefined();
  });

  it('retires a premade the seed no longer has, keeping its days, exercises, progress and active state', () => {
    const db = seededV1Db();
    db.insert(routines).values({ id: 'premade-old-2', name: 'Old', isPremade: true, nextDayIndex: 1, createdAt: V1_SEEDED_AT }).run();
    db.insert(routineDays)
      .values([
        { id: 'premade-old-2:a', routineId: 'premade-old-2', name: 'A', position: 0 },
        { id: 'premade-old-2:b', routineId: 'premade-old-2', name: 'B', position: 1 },
      ])
      .run();
    db.insert(routineExercises)
      .values({ id: 'premade-old-2:a:barbell-back-squat', routineDayId: 'premade-old-2:a', exerciseId: 'barbell-back-squat', position: 0, ...rule, nextWeight: 225, nextWeightUnit: 'lb' })
      .run();
    setActiveRoutine(db, 'premade-old-2');

    runSeed(db, NOW);

    expect(routine(db, 'premade-old-2')).toMatchObject({ name: 'Old', isPremade: true, retired: true, nextDayIndex: 1 });
    expect(days(db, 'premade-old-2').map((d) => d.id)).toEqual(['premade-old-2:a', 'premade-old-2:b']);
    expect(routineExercise(db, 'premade-old-2:a:barbell-back-squat')).toMatchObject({ setCount: 3, nextWeight: 225, nextWeightUnit: 'lb' });
    expect(getSettings(db).activeRoutineId).toBe('premade-old-2');
    expect(PREMADE_ORDER.map((id) => routine(db, id).retired)).toEqual(PREMADE_ORDER.map(() => false));
  });

  it('brings back a retired premade that is in the seed again', () => {
    const db = seededV1Db();
    db.update(routines).set({ retired: true }).where(eq(routines.id, 'premade-ppl-6')).run();
    runSeed(db, NOW);
    expect(routine(db, 'premade-ppl-6').retired).toBe(false);
  });

  it('never retires or prunes a routine of your own, a copy of a premade included', () => {
    const db = seededV1Db();
    const id = duplicateRoutine(db, 'premade-ppl-6', V1_SEEDED_AT);
    const before = getRoutineDetail(db, id);
    runSeed(db, NOW);
    expect(getRoutineDetail(db, id)).toEqual(before);
    expect(routine(db, id)).toMatchObject({ isPremade: false, retired: false });
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
    expect(rowCounts(db).exercises).toBe(LIBRARY_EXERCISES.length + 1);
  });
});
