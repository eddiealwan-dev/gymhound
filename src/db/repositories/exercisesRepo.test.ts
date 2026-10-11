/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { exerciseNotes, exercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { EXERCISE_PHOTOS } from '../../seed/exercisePhotos.generated';
import { LIBRARY_EXERCISES } from '../../seed/library.generated';
import { getExercise, getExerciseNote, listExercises, setExerciseNote } from './exercisesRepo';
import { startWorkoutFromDay } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';

describe('listExercises', () => {
  it('returns every library exercise, alphabetical without regard to case, starting with 3/4 sit-up', () => {
    const rows = listExercises(seededDb());
    expect(rows).toHaveLength(LIBRARY_EXERCISES.length);
    expect(rows[0].name).toBe('3/4 sit-up');
    const names = rows.map((r) => r.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it('returns the fields a picker needs and nothing else', () => {
    const bench = listExercises(seededDb()).find((r) => r.id === BENCH);
    expect(bench).toEqual({
      id: BENCH,
      name: 'Barbell bench press',
      aliases: ['bench', 'bench press', 'flat bench'],
      primaryMuscles: ['chest'],
      secondaryMuscles: ['front_delts', 'triceps'],
      equipment: 'barbell',
      pattern: 'horizontal_push',
      loggingType: 'weighted',
      isCustom: false,
      hasPhotos: true,
    });
  });

  it('says whether each exercise has its start and end photos, for the picker thumbnail and the form demo (§18.8)', () => {
    const rows = listExercises(seededDb());
    const withPhotos = rows.filter((r) => r.hasPhotos).map((r) => r.id);
    expect(withPhotos.sort()).toEqual(Object.keys(EXERCISE_PHOTOS).sort());
    expect(rows.find((r) => r.id === 'wall-sit')?.hasPhotos).toBe(false);
    expect(rows.find((r) => r.id === 'fedb-kettlebell-halo')?.hasPhotos).toBe(false);
  });

  it('leaves out archived exercises', () => {
    const db = seededDb();
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, 'plank')).run();
    const rows = listExercises(db);
    expect(rows).toHaveLength(LIBRARY_EXERCISES.length - 1);
    expect(rows.some((r) => r.id === 'plank')).toBe(false);
  });

  it('sorts a custom exercise in among the others regardless of letter case', () => {
    const db = seededDb();
    db.insert(exercises)
      .values({
        id: 'custom-1',
        name: 'aardvark curl',
        aliases: [],
        primaryMuscles: ['biceps'],
        secondaryMuscles: [],
        equipment: 'dumbbell',
        pattern: 'isolation',
        loggingType: 'weighted',
        isCustom: true,
        createdAt: NOW,
      })
      .run();
    const rows = listExercises(db);
    expect(rows).toHaveLength(LIBRARY_EXERCISES.length + 1);
    const at = rows.findIndex((r) => r.id === 'custom-1');
    expect(rows[at]).toMatchObject({ name: 'aardvark curl', isCustom: true, hasPhotos: false });
    expect([rows[at - 1].name, rows[at + 1].name]).toEqual(['90/90 hamstring', 'Ab crunch machine']);
  });
});

describe('getExercise', () => {
  it('returns an existing exercise with its steps and its free-exercise-db source', () => {
    const bench = getExercise(seededDb(), BENCH)!;
    expect(bench).toMatchObject({
      id: BENCH,
      name: 'Barbell bench press',
      aliases: ['bench', 'bench press', 'flat bench'],
      primaryMuscles: ['chest'],
      secondaryMuscles: ['front_delts', 'triceps'],
      equipment: 'barbell',
      pattern: 'horizontal_push',
      loggingType: 'weighted',
      isCustom: false,
      sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
    });
    expect(bench.instructions).toEqual(LIBRARY_EXERCISES.find((e) => e.id === BENCH)!.instructions);
    expect(bench.instructions.length).toBeGreaterThan(2);
    expect(bench.instructions[0]).toMatch(/^Lie back on a flat bench/);
  });

  it('returns a library exercise with the equipment it brings', () => {
    expect(getExercise(seededDb(), 'fedb-ez-bar-curl')).toMatchObject({
      name: 'EZ-bar curl',
      equipment: 'ez_bar',
      sourceId: 'EZ-Bar_Curl',
    });
  });

  it('gives an exercise without a source no steps and a null source', () => {
    expect(getExercise(seededDb(), 'wall-sit')).toMatchObject({ name: 'Wall sit', instructions: [], sourceId: null });
  });

  it('still returns an archived exercise, which history may show', () => {
    const db = seededDb();
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, 'plank')).run();
    expect(getExercise(db, 'plank')).toMatchObject({ id: 'plank', name: 'Plank' });
  });

  it('is null for an id that does not exist', () => {
    expect(getExercise(seededDb(), 'no-such-exercise')).toBeNull();
  });
});

describe('exercise notes', () => {
  it('has no note until one is set', () => {
    expect(getExerciseNote(seededDb(), BENCH)).toBeNull();
  });

  it('stores a note and shows it on the exercise in the active workout', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, 'Elbows in', NOW);
    expect(getExerciseNote(db, BENCH)).toBe('Elbows in');
    expect(db.select().from(exerciseNotes).where(eq(exerciseNotes.exerciseId, BENCH)).get()).toEqual({
      exerciseId: BENCH,
      text: 'Elbows in',
      updatedAt: NOW,
    });

    startWorkoutFromDay(db, PUSH_A, NOW);
    const exercisesInView = getActiveWorkoutView(db)!.exercises;
    expect(exercisesInView[0].note).toBe('Elbows in');
    expect(exercisesInView[1].note).toBeNull();
  });

  it('replaces the note and its timestamp', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, 'Elbows in', NOW);
    setExerciseNote(db, BENCH, 'Elbows in, feet planted', NOW + 1000);
    expect(getExerciseNote(db, BENCH)).toBe('Elbows in, feet planted');
    const rows = db.select().from(exerciseNotes).all();
    expect(rows).toEqual([{ exerciseId: BENCH, text: 'Elbows in, feet planted', updatedAt: NOW + 1000 }]);
  });

  it('deletes the note when the text is blank', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, 'Elbows in', NOW);
    setExerciseNote(db, BENCH, '  ', NOW + 1000);
    expect(getExerciseNote(db, BENCH)).toBeNull();
    expect(db.select().from(exerciseNotes).all()).toEqual([]);

    startWorkoutFromDay(db, PUSH_A, NOW);
    expect(getActiveWorkoutView(db)!.exercises[0].note).toBeNull();
  });

  it('treats an empty string or newlines as blank and tolerates deleting a note that is not there', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, '', NOW);
    setExerciseNote(db, BENCH, ' \n\t ', NOW);
    expect(getExerciseNote(db, BENCH)).toBeNull();
    setExerciseNote(db, BENCH, 'Pause at the chest', NOW);
    setExerciseNote(db, BENCH, '\n', NOW);
    expect(getExerciseNote(db, BENCH)).toBeNull();
  });

  it('keeps notes per exercise', () => {
    const db = seededDb();
    setExerciseNote(db, BENCH, 'Elbows in', NOW);
    setExerciseNote(db, 'barbell-overhead-press', 'Squeeze glutes', NOW);
    setExerciseNote(db, BENCH, '', NOW);
    expect(getExerciseNote(db, 'barbell-overhead-press')).toBe('Squeeze glutes');
  });
});
