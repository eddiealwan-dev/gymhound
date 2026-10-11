/** @jest-environment node */
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as schema from './schema';
import { exercises, sets, workoutExercises, workouts } from './schema';
import { createTestDb, migrateTestDb } from './testing/createTestDb';
import { openFileDb } from './testing/openFileDb';
import type { Db } from './types';

/**
 * Applies only the migrations up to `lastIdx` (by journal index), as an older GymHound left the database. The journal
 * and SQL files are copied to a temp folder that is removed afterwards.
 */
function migrateUpTo(db: Db, lastIdx: number): void {
  const source = path.resolve(__dirname, 'migrations');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-migrations-'));
  try {
    fs.mkdirSync(path.join(folder, 'meta'));
    const journal = JSON.parse(fs.readFileSync(path.join(source, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= lastIdx);
    for (const { tag } of journal.entries) fs.copyFileSync(path.join(source, `${tag}.sql`), path.join(folder, `${tag}.sql`));
    fs.writeFileSync(path.join(folder, 'meta', '_journal.json'), JSON.stringify(journal));
    migrate(db as BetterSQLite3Database<typeof schema>, { migrationsFolder: folder });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

it('applies migrations and creates every §6 table', () => {
  const { db } = createTestDb();
  const names = db.all<{ name: string }>(sql`select name from sqlite_master where type='table'`).map((r) => r.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'exercises',
      'exercise_notes',
      'routines',
      'routine_days',
      'routine_exercises',
      'workouts',
      'workout_exercises',
      'sets',
      'bodyweight',
      'foods',
      'food_log',
      'settings',
    ]),
  );
});

it('migration 0001 adds workout_exercises.note', () => {
  const { db } = createTestDb();
  const cols = db.all<{ name: string }>(sql`pragma table_info(workout_exercises)`).map((c) => c.name);
  expect(cols).toContain('note');
});

it('migration 0002 adds the exercise_prefs table', () => {
  const { db } = createTestDb();
  const cols = db
    .all<{ name: string; type: string; notnull: number; pk: number }>(sql`pragma table_info(exercise_prefs)`)
    .map((c) => ({ name: c.name, type: c.type, notnull: c.notnull, pk: c.pk }));
  expect(cols).toEqual([
    { name: 'exercise_id', type: 'TEXT', notnull: 1, pk: 1 },
    { name: 'rest_seconds', type: 'INTEGER', notnull: 0, pk: 0 },
    { name: 'updated_at', type: 'INTEGER', notnull: 1, pk: 0 },
  ]);
  const fks = db.all<{ table: string; from: string; to: string }>(sql`pragma foreign_key_list(exercise_prefs)`);
  expect(fks).toEqual([expect.objectContaining({ table: 'exercises', from: 'exercise_id', to: 'id' })]);
});

it('migration 0003 adds workouts.rest_set_id, nullable text (R38)', () => {
  const { db } = createTestDb();
  const col = db
    .all<{ name: string; type: string; notnull: number }>(sql`pragma table_info(workouts)`)
    .find((c) => c.name === 'rest_set_id');
  expect(col).toEqual(expect.objectContaining({ type: 'TEXT', notnull: 0 }));
});

it('migration 0004 adds workout_exercises.mark, nullable text (R60)', () => {
  const { db } = createTestDb();
  const col = db
    .all<{ name: string; type: string; notnull: number; dflt_value: string | null }>(sql`pragma table_info(workout_exercises)`)
    .find((c) => c.name === 'mark');
  expect(col).toEqual(expect.objectContaining({ type: 'TEXT', notnull: 0, dflt_value: null }));
});

it('migrates a database at 0003 forward, and its workout exercises get no mark', () => {
  const { db, close } = openFileDb(':memory:');
  migrateUpTo(db, 3);
  expect(db.all<{ name: string }>(sql`pragma table_info(workout_exercises)`).map((c) => c.name)).not.toContain('mark');
  db.run(sql`
    INSERT INTO exercises (id, name, aliases, primary_muscles, secondary_muscles, equipment, pattern, logging_type, is_custom, archived, created_at)
    VALUES ('barbell-bench-press', 'Bench press', '[]', '["chest"]', '[]', 'barbell', 'horizontal_push', 'weighted', 0, 0, 1)`);
  db.run(sql`
    INSERT INTO workouts (id, name, status, day_mark, started_at, finished_at, local_date, food_offer_shown)
    VALUES ('w1', 'Push A', 'finished', 'normal', 1, 2, '2026-10-09', 0)`);
  db.run(sql`
    INSERT INTO workout_exercises (id, workout_id, exercise_id, position, show_rpe)
    VALUES ('we1', 'w1', 'barbell-bench-press', 0, 0)`);

  migrateTestDb(db);

  expect(db.select().from(workoutExercises).where(eq(workoutExercises.id, 'we1')).get()).toMatchObject({ id: 'we1', mark: null });
  close();
});

it('migration 0005 adds exercise steps and source id, and routines.retired (§18.8)', () => {
  const { db } = createTestDb();
  type Column = { name: string; type: string; notnull: number; dflt_value: string | null };
  const column = (table: string, name: string) =>
    db.all<Column>(sql.raw(`pragma table_info(${table})`)).find((c) => c.name === name);
  expect(column('exercises', 'instructions')).toEqual(expect.objectContaining({ type: 'TEXT', notnull: 1, dflt_value: "'[]'" }));
  expect(column('exercises', 'source_id')).toEqual(expect.objectContaining({ type: 'TEXT', notnull: 0, dflt_value: null }));
  expect(column('routines', 'retired')).toEqual(expect.objectContaining({ type: 'INTEGER', notnull: 1 }));
  db.run(sql`INSERT INTO routines (id, name, is_premade, next_day_index, created_at) VALUES ('r', 'R', 0, 0, 1)`);
  expect(db.get<{ retired: number }>(sql`SELECT retired FROM routines WHERE id = 'r'`)).toEqual({ retired: 0 });
});

it('migrates a database at 0004 forward: its exercises have no steps or source, its routines are not retired', () => {
  const { db, close } = openFileDb(':memory:');
  migrateUpTo(db, 4);
  expect(db.all<{ name: string }>(sql`pragma table_info(exercises)`).map((c) => c.name)).not.toContain('instructions');
  db.run(sql`
    INSERT INTO exercises (id, name, aliases, primary_muscles, secondary_muscles, equipment, pattern, logging_type, is_custom, archived, created_at)
    VALUES ('barbell-bench-press', 'Barbell bench press', '[]', '["chest"]', '[]', 'barbell', 'horizontal_push', 'weighted', 0, 0, 1)`);
  db.run(sql`
    INSERT INTO routines (id, name, is_premade, next_day_index, created_at) VALUES ('premade-5x5-3', '5×5', 1, 1, 1)`);

  migrateTestDb(db);

  expect(db.select().from(exercises).where(eq(exercises.id, 'barbell-bench-press')).get()).toMatchObject({
    name: 'Barbell bench press',
    instructions: [],
    sourceId: null,
  });
  expect(db.select().from(schema.routines).where(eq(schema.routines.id, 'premade-5x5-3')).get()).toMatchObject({
    nextDayIndex: 1,
    retired: false,
  });
  close();
});

it('allows only one active workout', () => {
  // Review Focus 3
  const { db } = createTestDb();
  const w = { name: 'W', status: 'active', dayMark: 'normal', startedAt: 1, localDate: '2026-10-09' } as const;
  db.insert(workouts).values({ id: 'w1', ...w }).run();
  expect(() => db.insert(workouts).values({ id: 'w2', ...w }).run()).toThrow();
  db.insert(workouts).values({ id: 'w3', ...w, status: 'finished', finishedAt: 2 }).run();
});

it('cascades workout deletes to exercises and sets', () => {
  const { db } = createTestDb();
  db.insert(exercises)
    .values({
      id: 'barbell-back-squat',
      name: 'Barbell Back Squat',
      aliases: [],
      primaryMuscles: ['quads'],
      secondaryMuscles: ['glutes'],
      equipment: 'barbell',
      pattern: 'squat',
      loggingType: 'weighted',
      isCustom: false,
      createdAt: 1,
    })
    .run();
  db.insert(workouts)
    .values({ id: 'w1', name: 'W', status: 'active', dayMark: 'normal', startedAt: 1, localDate: '2026-10-09' })
    .run();
  db.insert(workoutExercises)
    .values({ id: 'we1', workoutId: 'w1', exerciseId: 'barbell-back-squat', position: 0, showRpe: false })
    .run();
  db.insert(sets).values({ id: 's1', workoutExerciseId: 'we1', position: 0, setType: 'working' }).run();
  expect(db.select().from(workoutExercises).all()).toHaveLength(1);
  expect(db.select().from(sets).all()).toHaveLength(1);

  db.delete(workouts).where(eq(workouts.id, 'w1')).run();

  expect(db.select().from(workoutExercises).all()).toEqual([]);
  expect(db.select().from(sets).all()).toEqual([]);
  expect(db.select().from(exercises).all()).toHaveLength(1);
});
