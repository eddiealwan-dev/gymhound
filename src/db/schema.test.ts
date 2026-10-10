/** @jest-environment node */
import { eq, sql } from 'drizzle-orm';
import { exercises, sets, workoutExercises, workouts } from './schema';
import { createTestDb } from './testing/createTestDb';

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
