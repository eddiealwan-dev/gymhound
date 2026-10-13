import {
  EQUIPMENT_ORDER,
  equipmentLabel,
  formatRepScheme,
  LOGGING_TYPE_LABELS,
  MARK_LABELS,
  MUSCLE_ORDER,
  muscleChoiceLabel,
  muscleLabel,
  musclesLine,
  primaryMusclesLabel,
} from './labels';
import type { Muscle } from './types';

describe('MARK_LABELS', () => {
  it('names every Something off reason (spec 18.7)', () => {
    expect(MARK_LABELS).toEqual({
      rough_sleep: 'Rough sleep',
      sick: 'Sick',
      short_on_food: 'Short on food',
      pain: 'Pain',
      cutting: 'Cutting',
    });
  });
});

describe('formatRepScheme', () => {
  it('shows sets by the rep range', () => {
    expect(formatRepScheme(3, 8, 12, 'weighted')).toBe('3×8–12');
    expect(formatRepScheme(4, 5, 8, 'bodyweight_plus')).toBe('4×5–8');
  });

  it('shows one number when the range is a single value', () => {
    expect(formatRepScheme(5, 5, 5, 'weighted')).toBe('5×5');
  });

  it('adds s for the types counted in seconds', () => {
    expect(formatRepScheme(3, 30, 60, 'timed')).toBe('3×30–60s');
    expect(formatRepScheme(2, 45, 45, 'timed')).toBe('2×45s');
    expect(formatRepScheme(3, 20, 40, 'weighted_time')).toBe('3×20–40s');
  });

  it('adds no s to the other types', () => {
    expect(formatRepScheme(3, 8, 12, 'assisted')).toBe('3×8–12');
    expect(formatRepScheme(1, 10, 10, 'distance_time')).toBe('1×10');
  });
});

describe('equipmentLabel', () => {
  it('names each kind of equipment for the picker', () => {
    expect(equipmentLabel('barbell')).toBe('Barbell');
    expect(equipmentLabel('dumbbell')).toBe('Dumbbell');
    expect(equipmentLabel('cable')).toBe('Cable');
    expect(equipmentLabel('machine')).toBe('Machine');
    expect(equipmentLabel('kettlebell')).toBe('Kettlebell');
    expect(equipmentLabel('bodyweight')).toBe('Bodyweight');
  });

  it('names the equipment the library brings (§18.8)', () => {
    expect(equipmentLabel('ez_bar')).toBe('EZ bar');
    expect(equipmentLabel('band')).toBe('Band');
    expect(equipmentLabel('medicine_ball')).toBe('Medicine ball');
    expect(equipmentLabel('exercise_ball')).toBe('Exercise ball');
    expect(equipmentLabel('foam_roller')).toBe('Foam roller');
    expect(equipmentLabel('other')).toBe('Other');
  });
});

describe('muscleLabel', () => {
  it('names each muscle as a lifter says it; the three delts all read Shoulders (§18.8)', () => {
    const muscles: Muscle[] = [
      'chest',
      'front_delts',
      'side_delts',
      'rear_delts',
      'lats',
      'upper_back',
      'traps',
      'biceps',
      'triceps',
      'forearms',
      'abs',
      'obliques',
      'lower_back',
      'glutes',
      'quads',
      'hamstrings',
      'adductors',
      'calves',
    ];
    expect(muscles.map(muscleLabel)).toEqual([
      'Chest',
      'Shoulders',
      'Shoulders',
      'Shoulders',
      'Lats',
      'Upper back',
      'Traps',
      'Biceps',
      'Triceps',
      'Forearms',
      'Abs',
      'Obliques',
      'Lower back',
      'Glutes',
      'Quads',
      'Hamstrings',
      'Adductors',
      'Calves',
    ]);
  });
});

describe('primaryMusclesLabel', () => {
  it('names the primary muscle, as a picker row shows it after the equipment', () => {
    expect(primaryMusclesLabel(['chest'])).toBe('Chest');
  });

  it('names each of several primary muscles once, in order', () => {
    expect(primaryMusclesLabel(['lats', 'upper_back'])).toBe('Lats, Upper back');
    expect(primaryMusclesLabel(['front_delts', 'side_delts'])).toBe('Shoulders');
  });
});

describe('musclesLine', () => {
  it('reads the primary muscles, then the secondary ones after a middle dot (R86)', () => {
    expect(musclesLine(['chest'], ['front_delts', 'triceps'])).toBe('Chest · Shoulders, Triceps');
  });

  it('names a muscle once: a secondary one that reads like a primary one is left out', () => {
    expect(musclesLine(['front_delts'], ['side_delts', 'triceps'])).toBe('Shoulders · Triceps');
    expect(musclesLine(['lats', 'upper_back'], ['rear_delts', 'biceps', 'side_delts'])).toBe('Lats, Upper back · Shoulders, Biceps');
  });

  it('is the primary muscles alone when there are no others', () => {
    expect(musclesLine(['abs'], [])).toBe('Abs');
    expect(musclesLine(['front_delts'], ['side_delts'])).toBe('Shoulders');
  });
});

describe('LOGGING_TYPE_LABELS', () => {
  it('names each logging type for the custom exercise editor (R108)', () => {
    expect(LOGGING_TYPE_LABELS).toEqual({
      weighted: 'Weight and reps',
      bodyweight_plus: 'Bodyweight plus weight',
      assisted: 'Assisted',
      timed: 'Time',
      weighted_time: 'Weight and time',
      distance_time: 'Distance and time',
    });
  });
});

describe('muscleChoiceLabel', () => {
  it('names the three delts apart, for choosing a muscle; the rest read as muscleLabel', () => {
    expect(muscleChoiceLabel('front_delts')).toBe('Front delts');
    expect(muscleChoiceLabel('side_delts')).toBe('Side delts');
    expect(muscleChoiceLabel('rear_delts')).toBe('Rear delts');
    for (const m of MUSCLE_ORDER.filter((m) => !m.endsWith('_delts'))) expect(muscleChoiceLabel(m)).toBe(muscleLabel(m));
  });
});

describe('MUSCLE_ORDER and EQUIPMENT_ORDER', () => {
  it('list every muscle head to toe and every kind of equipment once', () => {
    expect(MUSCLE_ORDER).toHaveLength(18);
    expect(new Set(MUSCLE_ORDER).size).toBe(18);
    expect(MUSCLE_ORDER.slice(0, 4)).toEqual(['chest', 'front_delts', 'side_delts', 'rear_delts']);
    expect(EQUIPMENT_ORDER).toHaveLength(12);
    expect(EQUIPMENT_ORDER[0]).toBe('barbell');
    expect(EQUIPMENT_ORDER[11]).toBe('other');
  });
});
