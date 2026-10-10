/** @jest-environment node */
import { asc, eq, sql } from 'drizzle-orm';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { exercises, routineDays, routineExercises, routines } from '../db/schema';
import { createTestDb } from '../db/testing/createTestDb';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { SEED_EXERCISES } from './exercises';
import { PREMADE_ORDER, SEED_ROUTINES } from './routines';
import { SEED_VERSION, runSeed } from './seed';

const days = (db: Db, routineId: string) =>
  db.select().from(routineDays).where(eq(routineDays.routineId, routineId)).orderBy(asc(routineDays.position)).all();

const routineExercise = (db: Db, id: string) =>
  db.select().from(routineExercises).where(eq(routineExercises.id, id)).get()!;

const exercise = (db: Db, id: string) => db.select().from(exercises).where(eq(exercises.id, id)).get()!;

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
  it('inserts the bundled exercises as non-custom rows created at now', () => {
    const { db } = createTestDb();
    runSeed(db, 1234);
    const rows = db.select().from(exercises).all();
    expect(rows).toHaveLength(55);
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
    expect(SEED_VERSION).toBe(1);
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
  });

  it('is idempotent', () => {
    const db = seededDb('us');
    const before = rowCounts(db);
    expect(before).toEqual({ exercises: 55, routines: 6, routineDays: 21, routineExercises: 104 });
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
    expect(rowCounts(db)).toMatchObject({ exercises: 56, routines: 7 });
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
});
