import { equipmentLabel, formatRepScheme, MARK_LABELS } from './labels';

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
