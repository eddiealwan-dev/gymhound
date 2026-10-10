/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { exerciseNotes, exercises } from '../schema';
import { seededDb } from '../testing/fixtures';
import { getExerciseNote, listExercises, setExerciseNote } from './exercisesRepo';
import { startWorkoutFromDay } from './workoutsRepo';
import { getActiveWorkoutView } from './workoutViewsRepo';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const PUSH_A = 'premade-ppl-6:push-a';
const BENCH = 'barbell-bench-press';

describe('listExercises', () => {
  it('returns the 55 bundled exercises, alphabetical, starting with Barbell back squat', () => {
    const rows = listExercises(seededDb());
    expect(rows).toHaveLength(55);
    expect(rows[0].name).toBe('Barbell back squat');
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
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
    });
  });

  it('leaves out archived exercises', () => {
    const db = seededDb();
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, 'plank')).run();
    const rows = listExercises(db);
    expect(rows).toHaveLength(54);
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
    expect(rows).toHaveLength(56);
    expect(rows[0]).toMatchObject({ id: 'custom-1', isCustom: true });
    expect(rows[1].name).toBe('Barbell back squat');
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
