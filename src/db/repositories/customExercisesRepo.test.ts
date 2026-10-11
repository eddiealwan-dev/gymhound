/** @jest-environment node */
import { eq } from 'drizzle-orm';
import type { CustomExerciseInput } from '../../domain/customExercise';
import type { LoggingType } from '../../domain/types';
import { exercisePhotos, exercises, routineDays, routineExercises, routines, savedWorkoutExercises, savedWorkouts, sets } from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { getRestSeconds, setRestSeconds } from './exercisePrefsRepo';
import { createCustomExercise, deleteCustomExercise, isExerciseUsed, updateCustomExercise } from './customExercisesRepo';
import { getExercise, getExerciseNote, listExercises, setExerciseNote } from './exercisesRepo';
import { addExerciseToWorkout } from './workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from './workoutsRepo';

const NOW = new Date(2026, 9, 11, 9, 0).getTime();

const LANDMINE: CustomExerciseInput = {
  name: 'Landmine press',
  primaryMuscles: ['front_delts'],
  secondaryMuscles: ['triceps', 'front_delts'],
  equipment: 'barbell',
  loggingType: 'weighted',
};

const row = (db: Db, id: string) => db.select().from(exercises).where(eq(exercises.id, id)).get();

describe('createCustomExercise', () => {
  it('saves a custom row with a uuid, no aliases, steps or source, and a derived pattern', () => {
    const db = seededDb();
    const id = createCustomExercise(db, { ...LANDMINE, name: '  Landmine press ' }, NOW);

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row(db, id)).toEqual({
      id,
      name: 'Landmine press',
      aliases: [],
      primaryMuscles: ['front_delts'],
      secondaryMuscles: ['triceps'],
      equipment: 'barbell',
      pattern: 'isolation',
      loggingType: 'weighted',
      isCustom: true,
      archived: false,
      createdAt: NOW,
      instructions: [],
      sourceId: null,
    });
  });

  it('appears in listExercises as a custom exercise, in name order', () => {
    const db = seededDb();
    const id = createCustomExercise(db, { ...LANDMINE, name: 'Zercher carry', loggingType: 'weighted_time' }, NOW);
    const listed = listExercises(db);
    const mine = listed.find((e) => e.id === id);
    expect(mine).toMatchObject({ name: 'Zercher carry', isCustom: true, pattern: 'carry', loggingType: 'weighted_time' });
    const names = listed.map((e) => e.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it.each<LoggingType>(['weighted', 'bodyweight_plus', 'assisted', 'timed', 'weighted_time', 'distance_time'])(
    'round-trips the %s logging type',
    (loggingType) => {
      const db = seededDb();
      const id = createCustomExercise(db, { ...LANDMINE, name: `Mine ${loggingType}`, loggingType }, NOW);
      expect(getExercise(db, id)).toMatchObject({ loggingType, isCustom: true });
    },
  );

  it('refuses an invalid exercise, writing nothing', () => {
    const db = seededDb();
    const before = listExercises(db).length;
    expect(() => createCustomExercise(db, { ...LANDMINE, name: 'barbell bench press' }, NOW)).toThrow(
      'You already have an exercise called Barbell bench press.',
    );
    expect(() => createCustomExercise(db, { ...LANDMINE, primaryMuscles: [] }, NOW)).toThrow('Pick at least one primary muscle.');
    expect(listExercises(db)).toHaveLength(before);
  });

  it('checks for a duplicate among exercises you can see: an archived name is free again', () => {
    const db = seededDb();
    db.update(exercises).set({ archived: true }).where(eq(exercises.id, 'barbell-bench-press')).run();
    const id = createCustomExercise(db, { ...LANDMINE, name: 'Barbell Bench Press' }, NOW);
    expect(getExercise(db, id)?.name).toBe('Barbell Bench Press');
  });
});

describe('updateCustomExercise', () => {
  it('changes everything on an unused exercise, the logging type and pattern too', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    updateCustomExercise(db, id, { name: 'Ab wheel hold', primaryMuscles: ['abs'], secondaryMuscles: [], equipment: 'other', loggingType: 'timed' });
    expect(row(db, id)).toMatchObject({
      name: 'Ab wheel hold',
      primaryMuscles: ['abs'],
      secondaryMuscles: [],
      equipment: 'other',
      loggingType: 'timed',
      pattern: 'core',
      createdAt: NOW,
    });
  });

  it('keeps its own name without calling it a duplicate', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    expect(() => updateCustomExercise(db, id, { ...LANDMINE, name: 'LANDMINE PRESS' })).not.toThrow();
    expect(() => updateCustomExercise(db, id, { ...LANDMINE, name: 'Plank' })).toThrow('You already have an exercise called Plank.');
  });

  it('refuses a library exercise', () => {
    const db = seededDb();
    expect(() => updateCustomExercise(db, 'barbell-bench-press', { ...LANDMINE, name: 'Barbell bench press' })).toThrow();
    expect(getExercise(db, 'barbell-bench-press')?.equipment).toBe('barbell');
  });

  it('a used exercise refuses a logging-type change but takes a new name and equipment (R108)', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    const workoutId = startEmptyWorkout(db, NOW);
    addExerciseToWorkout(db, workoutId, id);

    expect(() => updateCustomExercise(db, id, { ...LANDMINE, loggingType: 'timed' })).toThrow();
    expect(getExercise(db, id)?.loggingType).toBe('weighted');

    updateCustomExercise(db, id, { ...LANDMINE, name: 'Landmine press, one arm', equipment: 'other' });
    expect(getExercise(db, id)).toMatchObject({ name: 'Landmine press, one arm', equipment: 'other', loggingType: 'weighted' });
  });
});

/** A routine of your own with one day holding the exercise. */
function putInRoutine(db: Db, exerciseId: string) {
  db.insert(routines).values({ id: 'mine', name: 'Mine', isPremade: false, nextDayIndex: 0, createdAt: NOW }).run();
  db.insert(routineDays).values({ id: 'mine:a', routineId: 'mine', name: 'A', position: 0 }).run();
  db.insert(routineExercises)
    .values({ id: 'mine:a:1', routineDayId: 'mine:a', exerciseId, position: 0, setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb' })
    .run();
}

/** A saved workout holding the exercise. */
function putInSavedWorkout(db: Db, exerciseId: string) {
  db.insert(savedWorkouts).values({ id: 'sw', name: 'Push', createdAt: NOW, updatedAt: NOW }).run();
  db.insert(savedWorkoutExercises).values({ id: 'sw:1', savedWorkoutId: 'sw', exerciseId, position: 0 }).run();
}

describe('isExerciseUsed', () => {
  it('is false for a new exercise and true once anything refers to it', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    expect(isExerciseUsed(db, id)).toBe(false);
    putInSavedWorkout(db, id);
    expect(isExerciseUsed(db, id)).toBe(true);
  });

  it('counts the library exercises the premades use', () => {
    expect(isExerciseUsed(seededDb(), 'barbell-bench-press')).toBe(true);
  });
});

describe('deleteCustomExercise (R109)', () => {
  it('deletes an unused exercise with its note, rest pref and own photos row', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    setExerciseNote(db, id, 'Elbows in', NOW);
    setRestSeconds(db, id, 90, NOW);
    db.insert(exercisePhotos).values({ exerciseId: id, startFile: `${id}-start-1.jpg`, endFile: null, updatedAt: NOW }).run();

    expect(deleteCustomExercise(db, id)).toBe('deleted');

    expect(row(db, id)).toBeUndefined();
    expect(getExerciseNote(db, id)).toBeNull();
    expect(getRestSeconds(db, id)).toBeNull();
    expect(db.select().from(exercisePhotos).where(eq(exercisePhotos.exerciseId, id)).get()).toBeUndefined();
  });

  it('hands the deleted exercise\'s own photo file names to removePhotoFiles, after the rows are gone', () => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    db.insert(exercisePhotos).values({ exerciseId: id, startFile: 'a.jpg', endFile: 'b.jpg', updatedAt: NOW }).run();
    const removed: string[][] = [];
    deleteCustomExercise(db, id, (names) => {
      expect(row(db, id)).toBeUndefined();
      removed.push([...names]);
    });
    expect(removed).toEqual([['a.jpg', 'b.jpg']]);
  });

  it.each([
    ['the active workout', (db: Db, id: string) => addExerciseToWorkout(db, startEmptyWorkout(db, NOW), id)],
    [
      'history',
      (db: Db, id: string) => {
        const workoutId = startEmptyWorkout(db, NOW);
        const workoutExerciseId = addExerciseToWorkout(db, workoutId, id);
        const set = db.select().from(sets).where(eq(sets.workoutExerciseId, workoutExerciseId)).get()!;
        tickSet(db, set.id, { weight: 95, reps: 8, durationS: null, distance: null }, 'lb', NOW + 30_000, 'm');
        finishWorkout(db, workoutId, NOW + 60_000);
      },
    ],
    ['a routine', putInRoutine],
    ['a saved workout', putInSavedWorkout],
  ])('archives an exercise used by %s: still named, gone from the picker, its note kept', (_where, use) => {
    const db = seededDb();
    const id = createCustomExercise(db, LANDMINE, NOW);
    setExerciseNote(db, id, 'Elbows in', NOW);
    db.insert(exercisePhotos).values({ exerciseId: id, startFile: 'a.jpg', endFile: null, updatedAt: NOW }).run();
    use(db, id);
    const removePhotoFiles = jest.fn();

    expect(deleteCustomExercise(db, id, removePhotoFiles)).toBe('archived');

    expect(getExercise(db, id)?.name).toBe('Landmine press');
    expect(row(db, id)?.archived).toBe(true);
    expect(listExercises(db).some((e) => e.id === id)).toBe(false);
    expect(getExerciseNote(db, id)).toBe('Elbows in');
    expect(removePhotoFiles).not.toHaveBeenCalled();
  });

  it('refuses a library exercise', () => {
    const db = seededDb();
    expect(() => deleteCustomExercise(db, 'wall-sit')).toThrow();
    expect(row(db, 'wall-sit')?.archived).toBe(false);
  });
});
