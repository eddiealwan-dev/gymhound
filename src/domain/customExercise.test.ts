import { customPattern, normalizeCustomExercise, validateCustomExercise, type CustomExerciseInput } from './customExercise';

const INPUT: CustomExerciseInput = {
  name: 'Landmine press',
  primaryMuscles: ['front_delts'],
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  loggingType: 'weighted',
};

describe('validateCustomExercise (R108)', () => {
  it('passes a named exercise with a primary muscle', () => {
    expect(validateCustomExercise(INPUT, ['Barbell bench press'])).toEqual([]);
  });

  it('asks for a name when it is empty or only spaces', () => {
    expect(validateCustomExercise({ ...INPUT, name: '' }, [])).toEqual(['Give the exercise a name.']);
    expect(validateCustomExercise({ ...INPUT, name: '   ' }, [])).toEqual(['Give the exercise a name.']);
  });

  it('keeps the name to 60 characters, counted once trimmed', () => {
    expect(validateCustomExercise({ ...INPUT, name: 'a'.repeat(60) }, [])).toEqual([]);
    expect(validateCustomExercise({ ...INPUT, name: `  ${'a'.repeat(60)}  ` }, [])).toEqual([]);
    expect(validateCustomExercise({ ...INPUT, name: 'a'.repeat(61) }, [])).toEqual(['Keep the name to 60 characters.']);
  });

  it('refuses a name you already have, ignoring case and spaces around it, and names the one you have', () => {
    expect(validateCustomExercise({ ...INPUT, name: ' barbell BENCH press ' }, ['Plank', 'Barbell bench press'])).toEqual([
      'You already have an exercise called Barbell bench press.',
    ]);
  });

  it('asks for a primary muscle', () => {
    expect(validateCustomExercise({ ...INPUT, primaryMuscles: [] }, [])).toEqual(['Pick at least one primary muscle.']);
  });

  it('lists every problem, the name first', () => {
    expect(validateCustomExercise({ ...INPUT, name: '', primaryMuscles: [] }, [])).toEqual([
      'Give the exercise a name.',
      'Pick at least one primary muscle.',
    ]);
  });
});

describe('normalizeCustomExercise', () => {
  it('trims the name, and drops from secondary a muscle chosen as primary', () => {
    expect(
      normalizeCustomExercise({ ...INPUT, name: '  Landmine press ', primaryMuscles: ['chest', 'chest'], secondaryMuscles: ['chest', 'triceps', 'triceps'] }),
    ).toEqual({ ...INPUT, name: 'Landmine press', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] });
  });
});

describe('customPattern', () => {
  it('a weight-and-time exercise is a carry', () => {
    expect(customPattern({ loggingType: 'weighted_time', primaryMuscles: ['forearms'] })).toBe('carry');
    expect(customPattern({ loggingType: 'weighted_time', primaryMuscles: ['abs'] })).toBe('carry');
  });

  it('abs or obliques first is core', () => {
    expect(customPattern({ loggingType: 'timed', primaryMuscles: ['abs', 'glutes'] })).toBe('core');
    expect(customPattern({ loggingType: 'weighted', primaryMuscles: ['obliques'] })).toBe('core');
  });

  it('anything else is isolation', () => {
    expect(customPattern({ loggingType: 'weighted', primaryMuscles: ['glutes', 'abs'] })).toBe('isolation');
    expect(customPattern({ loggingType: 'distance_time', primaryMuscles: [] })).toBe('isolation');
  });
});
