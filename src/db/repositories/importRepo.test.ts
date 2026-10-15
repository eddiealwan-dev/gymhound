import { eq } from 'drizzle-orm';
import { toCsv, WORKOUT_CSV_COLUMNS } from '../../domain/csv';
import { planImport, type ImportPlan } from '../../domain/importCsv';
import { IMPORT_SAMPLES } from '../../domain/importSamples';
import { exercises, sets, workoutExercises, workouts } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { listBodyEntries } from './bodyRepo';
import { workoutCsvRows } from './exportRepo';
import { listEntries } from './foodLogRepo';
import { listHistory } from './historyRepo';
import { applyImport, fingerprint, previewImport } from './importRepo';
import * as prRepo from './prRepo';

const OPTIONS = { weightUnit: 'lb' as const, distanceUnit: 'mi' as const, dayFirst: false };
const NOW = Date.UTC(2026, 9, 12, 15);

function plan(text: string): Exclude<ImportPlan, { kind: 'unknown' }> {
  const p = planImport(text, OPTIONS);
  if (p.kind === 'unknown') throw new Error(p.reason);
  return p;
}

let db: Db;
beforeEach(() => {
  db = seededDb();
});

describe('importing workouts (R565)', () => {
  it('previews what it would add: workouts, sets, dates and which exercises match', () => {
    expect(previewImport(db, plan(IMPORT_SAMPLES.workouts))).toEqual({
      kind: 'workouts',
      workouts: 2,
      sets: 6,
      alreadyIn: 0,
      firstDate: '2026-09-01',
      lastDate: '2026-09-03',
      exercises: [
        { name: 'Barbell bench press', to: { id: 'barbell-bench-press', name: 'Barbell bench press' } },
        { name: 'Overhead press', to: { id: 'barbell-overhead-press', name: 'Overhead press' } },
        { name: 'Plank', to: { id: 'plank', name: 'Plank' } },
        { name: 'Running', to: null },
      ],
    });
  });

  it('adds finished workouts on their own days, every set done, with personal records worked out', () => {
    const result = applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW);
    expect(result).toEqual({ added: 2, sets: 6, alreadyIn: 0, newExercises: ['Running'], noMuscle: ['Running'] });

    const history = listHistory(db, 'lb');
    expect(history.map((h) => [h.name, h.localDate])).toEqual(expect.arrayContaining([['Push A', '2026-09-01'], ['Easy run', '2026-09-03']]));
    const push = db.select().from(workouts).where(eq(workouts.name, 'Push A')).get()!;
    expect(push).toMatchObject({ status: 'finished', healthStatus: 'done', foodOfferShown: true, routineId: null });

    const bench = db
      .select({ weight: sets.weight, reps: sets.reps, setType: sets.setType, done: sets.done, prFlags: sets.prFlags, rpe: sets.rpe })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(eq(workoutExercises.exerciseId, 'barbell-bench-press'))
      .orderBy(sets.position)
      .all();
    expect(bench.map((s) => [s.setType, s.weight, s.reps, s.done, s.rpe])).toEqual([
      ['warmup', 95, 10, true, null],
      ['working', 185, 5, true, 8],
      ['working', 185, 5, true, 8.5],
    ]);
    // The first session of an exercise sets no records (spec 7.6); a later heavier one does.
    expect(bench.every((s) => s.prFlags === 0)).toBe(true);
    applyImport(db, plan(['date,exercise,weight,reps', '2026-09-08,Bench Press (Barbell),190,5'].join('\n')), NOW);
    const later = db
      .select({ weight: sets.weight, prFlags: sets.prFlags })
      .from(sets)
      .innerJoin(workoutExercises, eq(workoutExercises.id, sets.workoutExerciseId))
      .where(eq(workoutExercises.exerciseId, 'barbell-bench-press'))
      .all()
      .find((s) => s.weight === 190)!;
    expect(later.prFlags & 1).toBe(1);

    // The run had no match: it is kept as an exercise of your own, logged by distance and time.
    const run = db.select().from(exercises).where(eq(exercises.name, 'Running')).get()!;
    expect(run).toMatchObject({ isCustom: true, loggingType: 'distance_time', primaryMuscles: [] });
  });

  it('adds nothing the second time the same file is imported', () => {
    applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW);
    const count = () => db.select().from(workouts).all().length;
    const before = count();
    expect(previewImport(db, plan(IMPORT_SAMPLES.workouts))).toMatchObject({ workouts: 0, alreadyIn: 2 });
    // Running is now one of your own, so another file's runs match it.
    expect(previewImport(db, plan(['date,exercise,distance,duration_s', '2026-09-10,running,5,1700'].join('\n')))).toMatchObject({
      exercises: [{ name: 'running', to: expect.objectContaining({ name: 'Running' }) }],
    });
    expect(applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW)).toMatchObject({ added: 0, alreadyIn: 2, newExercises: [] });
    expect(count()).toBe(before);
  });

  it("reads GymHound's own export back in: on another phone it all comes across, on the same one nothing doubles", () => {
    applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW);
    const exported = toCsv(WORKOUT_CSV_COLUMNS, workoutCsvRows(db));

    const other = seededDb();
    expect(applyImport(other, plan(exported), NOW)).toMatchObject({ added: 2, sets: 6 });
    expect(listHistory(other, 'lb').map((h) => h.name).sort()).toEqual(['Easy run', 'Push A']);
    expect(applyImport(db, plan(exported), NOW)).toMatchObject({ added: 0, alreadyIn: 2 });
  });

  it('writes nothing at all if any part fails', () => {
    const fail = jest.spyOn(prRepo, 'recomputePrFlags').mockImplementation(() => {
      throw new Error('disk full');
    });
    const count = () => [db.select().from(workouts).all().length, db.select().from(sets).all().length, db.select().from(exercises).all().length];
    const before = count();
    expect(() => applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW)).toThrow('disk full');
    expect(count()).toEqual(before);
    fail.mockRestore();
  });

  it("keeps an AMRAP score's extra reps and a carry's feet (R609)", () => {
    const file = [
      'date,workout,exercise,weight,weight_unit,reps,distance,distance_unit,extra_reps',
      '2026-10-01,Strongman,Yoke carry,315,lb,,50,ft,',
      '2026-10-01,Strongman,AMRAP 10,,,6,,,4',
    ].join('\n');
    applyImport(db, plan(file), NOW);
    const rows = db.select().from(sets).all().filter((s) => s.id.startsWith('imp-'));
    expect(rows.map((s) => [s.weight, s.distance, s.distanceUnit, s.reps, s.extraReps])).toEqual([
      [315, 50, 'ft', null, null],
      [null, null, null, 6, 4],
    ]);
  });

  it('a score with other extra reps is another workout, not one already in', () => {
    applyImport(db, plan(['date,workout,exercise,reps,extra_reps', '2026-10-01,Metcon,AMRAP 10,6,4'].join('\n')), NOW);
    expect(applyImport(db, plan(['date,workout,exercise,reps,extra_reps', '2026-10-01,Metcon,AMRAP 10,6,5'].join('\n')), NOW)).toMatchObject({ added: 1 });
  });

  it('a file with an empty extra_reps column finds the workouts an older file without it added: nothing doubles', () => {
    applyImport(db, plan(IMPORT_SAMPLES.workouts), NOW);
    const withColumn = IMPORT_SAMPLES.workouts
      .split('\r\n')
      .map((line, i) => `${line},${i === 0 ? 'extra_reps' : ''}`)
      .join('\r\n');
    expect(applyImport(db, plan(withColumn), NOW)).toMatchObject({ added: 0, alreadyIn: 2 });
  });

  it("reads its own extra reps back in from GymHound's export", () => {
    applyImport(db, plan(['date,workout,exercise,reps,extra_reps', '2026-10-01,Metcon,AMRAP 10,6,4'].join('\n')), NOW);
    const exported = toCsv(WORKOUT_CSV_COLUMNS, workoutCsvRows(db));

    const other = seededDb();
    applyImport(other, plan(exported), NOW);
    expect(other.select().from(sets).all().map((s) => [s.reps, s.extraReps])).toEqual([[6, 4]]);
  });

  it('fingerprints are stable and differ for different text', () => {
    expect(fingerprint('a')).toBe(fingerprint('a'));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
    expect(fingerprint('a')).toMatch(/^[0-9a-z]{14}$/);
  });
});

describe('importing body and food (R565)', () => {
  it('adds body entries on their days, in their units, once', () => {
    expect(previewImport(db, plan(IMPORT_SAMPLES.body))).toEqual({ kind: 'body', entries: 10, alreadyIn: 0, firstDate: '2026-09-01', lastDate: '2026-09-08' });
    expect(applyImport(db, plan(IMPORT_SAMPLES.body), NOW)).toMatchObject({ added: 10, alreadyIn: 0 });
    expect(listBodyEntries(db, 'bodyweight').map((e) => [e.localDate, e.value, e.unit])).toEqual([
      ['2026-09-08', 181.6, 'lb'],
      ['2026-09-01', 182.4, 'lb'],
    ]);
    expect(listBodyEntries(db, 'body_fat')[0]).toMatchObject({ value: 18.5, unit: '%' });
    expect(applyImport(db, plan(IMPORT_SAMPLES.body), NOW)).toMatchObject({ added: 0, alreadyIn: 10 });
  });

  it('adds food entries with their own totals, like a quick add, once', () => {
    expect(applyImport(db, plan(IMPORT_SAMPLES.food), NOW)).toMatchObject({ added: 3, alreadyIn: 0 });
    expect(listEntries(db, '2026-09-01').map((e) => [e.name, e.servings, e.kcal, e.proteinG])).toEqual(
      expect.arrayContaining([
        ['Greek yogurt', 1, 150, 20],
        ['Chicken breast', 1.5, 248, 46],
        ['Rice', 1, 205, 4.3],
      ]),
    );
    expect(previewImport(db, plan(IMPORT_SAMPLES.food))).toMatchObject({ entries: 0, alreadyIn: 3 });
  });
});
