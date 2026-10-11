import { dayFromSaved, savedSetsLine, validateSavedName } from './savedWorkout';
import type { SavedWorkoutDetail } from './savedWorkout';
import type { LoggingType, SavedSet, SetType, WeightUnit } from './types';

const loaded = (weight: number, reps: number, setType: SetType = 'working', weightUnit: WeightUnit = 'lb'): SavedSet => ({
  setType,
  weight,
  weightUnit,
  reps,
  durationS: null,
  distance: null,
  distanceUnit: null,
});
const held = (durationS: number, setType: SetType = 'working'): SavedSet => ({
  setType,
  weight: null,
  weightUnit: null,
  reps: null,
  durationS,
  distance: null,
  distanceUnit: null,
});

type SavedExercise = SavedWorkoutDetail['exercises'][number];
const exercise = (
  exerciseId: string,
  loggingType: LoggingType,
  sets: SavedSet[],
  supersetGroup: number | null = null,
): SavedExercise => ({
  id: `sw-${exerciseId}`,
  exerciseId,
  name: exerciseId,
  loggingType,
  equipment: 'barbell',
  supersetGroup,
  sets,
});
const saved = (exercises: SavedExercise[]): SavedWorkoutDetail => ({ id: 'saved-1', name: 'Push A', exercises });
const LB5 = { value: 5, unit: 'lb' as const };

describe('validateSavedName', () => {
  it('asks for a name when blank', () => {
    expect(validateSavedName('')).toBe('Give the workout a name.');
    expect(validateSavedName('   ')).toBe('Give the workout a name.');
  });

  it('keeps the name to 60 characters, trimmed', () => {
    expect(validateSavedName('a'.repeat(60))).toBeNull();
    expect(validateSavedName(`  ${'a'.repeat(60)}  `)).toBeNull();
    expect(validateSavedName('a'.repeat(61))).toBe('Keep the name to 60 characters.');
  });

  it('accepts a name', () => {
    expect(validateSavedName('Push A')).toBeNull();
  });
});

describe('savedSetsLine', () => {
  it('lists weighted sets as Previous does', () => {
    expect(savedSetsLine([loaded(185, 5), loaded(185, 5), loaded(175, 8)], 'weighted', 'lb')).toBe(
      '185 × 5, 185 × 5, 175 × 8',
    );
  });

  it('prefixes warmups with "W "', () => {
    expect(savedSetsLine([loaded(95, 10, 'warmup'), loaded(185, 5)], 'weighted', 'lb')).toBe('W 95 × 10, 185 × 5');
  });

  it('shows the unit only when it differs from the display unit', () => {
    expect(savedSetsLine([loaded(84, 12, 'working', 'kg')], 'weighted', 'lb')).toBe('84 kg × 12');
  });

  it('formats holds, bodyweight and assisted sets', () => {
    expect(savedSetsLine([held(40), held(90)], 'timed', 'lb')).toBe('40s, 1:30');
    expect(savedSetsLine([loaded(0, 8), loaded(25, 8)], 'bodyweight_plus', 'lb')).toBe('BW × 8, +25 × 8');
    expect(savedSetsLine([loaded(40, 8)], 'assisted', 'lb')).toBe('−40 × 8');
  });

  it('is empty for no sets', () => {
    expect(savedSetsLine([], 'weighted', 'lb')).toBe('');
  });
});

describe('dayFromSaved', () => {
  it('turns 185 × 5, 185 × 6, 175 × 8 into 3 sets of 5–8 starting at 175 lb', () => {
    const day = dayFromSaved(saved([exercise('bench', 'weighted', [loaded(185, 5), loaded(185, 6), loaded(175, 8)])]), LB5);
    expect(day.name).toBe('Push A');
    expect(day.exercises).toEqual([
      {
        exerciseId: 'bench',
        name: 'bench',
        loggingType: 'weighted',
        setCount: 3,
        repMin: 5,
        repMax: 8,
        increment: 5,
        incrementUnit: 'lb',
        supersetWithNext: false,
        startWeight: { weight: 175, unit: 'lb' },
      },
    ]);
  });

  it('counts working and failure sets only, and takes their reps and load', () => {
    const day = dayFromSaved(
      saved([
        exercise('bench', 'weighted', [
          loaded(95, 12, 'warmup'),
          loaded(185, 5),
          loaded(185, 4, 'failure'),
          loaded(135, 15, 'drop'),
        ]),
      ]),
      LB5,
    );
    expect(day.exercises[0]).toMatchObject({ setCount: 2, repMin: 4, repMax: 5, startWeight: { weight: 185, unit: 'lb' } });
  });

  it('compares loads across units and keeps the easiest in its own unit', () => {
    const day = dayFromSaved(saved([exercise('bench', 'weighted', [loaded(100, 5, 'working', 'kg'), loaded(215, 5)])]), LB5);
    expect(day.exercises[0].startWeight).toEqual({ weight: 215, unit: 'lb' });
  });

  it('starts assisted work at the most assistance', () => {
    const day = dayFromSaved(saved([exercise('dip', 'assisted', [loaded(40, 8), loaded(60, 8), loaded(50, 8)])]), LB5);
    expect(day.exercises[0].startWeight).toEqual({ weight: 60, unit: 'lb' });
  });

  it('gives timed holds a range in seconds, no increment and no start weight', () => {
    const day = dayFromSaved(saved([exercise('plank', 'timed', [held(40), held(60), held(45)])]), LB5);
    expect(day.exercises[0]).toMatchObject({ setCount: 3, repMin: 40, repMax: 60, increment: 0, startWeight: null });
  });

  it('uses seconds for weighted holds, keeping the increment and the load', () => {
    const sets: SavedSet[] = [
      { ...held(30), weight: 50, weightUnit: 'lb' },
      { ...held(45), weight: 60, weightUnit: 'lb' },
    ];
    const day = dayFromSaved(saved([exercise('carry', 'weighted_time', sets)]), LB5);
    expect(day.exercises[0]).toMatchObject({ repMin: 30, repMax: 45, increment: 5, startWeight: { weight: 50, unit: 'lb' } });
  });

  it('gives distance and time 1–1, no increment and no start weight', () => {
    const run: SavedSet = { ...held(600), distance: 2, distanceUnit: 'km' };
    const day = dayFromSaved(saved([exercise('run', 'distance_time', [run])]), LB5);
    expect(day.exercises[0]).toMatchObject({ setCount: 1, repMin: 1, repMax: 1, increment: 0, startWeight: null });
  });

  it('keeps at least 1 set and at most 10', () => {
    const warmupsOnly = dayFromSaved(saved([exercise('bench', 'weighted', [loaded(95, 10, 'warmup')])]), LB5);
    expect(warmupsOnly.exercises[0]).toMatchObject({ setCount: 1, startWeight: null });
    expect(warmupsOnly.exercises[0].repMin).toBeGreaterThanOrEqual(1);
    expect(warmupsOnly.exercises[0].repMin).toBeLessThanOrEqual(warmupsOnly.exercises[0].repMax);
    const many = dayFromSaved(saved([exercise('bench', 'weighted', Array.from({ length: 12 }, () => loaded(135, 10)))]), LB5);
    expect(many.exercises[0].setCount).toBe(10);
  });

  it('starts bodyweight plus with no added weight at 0', () => {
    const day = dayFromSaved(saved([exercise('pullup', 'bodyweight_plus', [loaded(0, 8), loaded(25, 6)])]), LB5);
    expect(day.exercises[0].startWeight).toEqual({ weight: 0, unit: 'lb' });
  });

  it('links supersets from their groups', () => {
    const day = dayFromSaved(
      saved([
        exercise('a', 'weighted', [loaded(100, 10)], 1),
        exercise('b', 'weighted', [loaded(100, 10)], 1),
        exercise('c', 'weighted', [loaded(100, 10)], null),
        exercise('d', 'weighted', [loaded(100, 10)], 2),
        exercise('e', 'weighted', [loaded(100, 10)], 2),
      ]),
      LB5,
    );
    expect(day.exercises.map((e) => e.supersetWithNext)).toEqual([true, false, false, true, false]);
  });

  it('uses the given increment in its unit', () => {
    const day = dayFromSaved(saved([exercise('bench', 'weighted', [loaded(80, 5, 'working', 'kg')])]), { value: 2.5, unit: 'kg' });
    expect(day.exercises[0]).toMatchObject({ increment: 2.5, incrementUnit: 'kg', startWeight: { weight: 80, unit: 'kg' } });
  });
});
