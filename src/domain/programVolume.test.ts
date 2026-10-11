import {
  MAJOR_GROUPS,
  weeklyFrequency,
  weeklyFrequencyByGroup,
  weeklySetsByGroup,
  weeklySetsByMuscle,
} from './programVolume';
import type { Muscle } from './types';

const MUSCLES: Record<string, { primary: Muscle[]; secondary: Muscle[] }> = {
  bench: { primary: ['chest'], secondary: ['front_delts', 'triceps'] },
  ohp: { primary: ['front_delts'], secondary: ['side_delts', 'triceps'] },
  raise: { primary: ['side_delts'], secondary: [] },
  facePull: { primary: ['rear_delts'], secondary: ['upper_back'] },
  row: { primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_delts'] },
  squat: { primary: ['quads', 'glutes'], secondary: ['adductors'] },
  curl: { primary: ['biceps'], secondary: [] },
};
const muscles = (id: string) => MUSCLES[id];
const day = (...exercises: [string, number][]) => ({ exercises: exercises.map(([exerciseId, sets]) => ({ exerciseId, sets })) });

describe('weeklySetsByMuscle', () => {
  it('counts each set 1 for a primary muscle and ½ for a secondary, across every day of the week', () => {
    const sets = weeklySetsByMuscle([day(['bench', 4], ['row', 3]), day(['bench', 3], ['curl', 2])], muscles);
    expect(sets.chest).toBe(7);
    expect(sets.front_delts).toBe(3.5);
    expect(sets.triceps).toBe(3.5);
    expect(sets.lats).toBe(3);
    expect(sets.upper_back).toBe(3);
    expect(sets.biceps).toBe(1.5 + 2);
    expect(sets.rear_delts).toBe(1.5);
  });

  it('has every muscle, at 0 when the week never trains it', () => {
    const sets = weeklySetsByMuscle([day(['curl', 3])], muscles);
    expect(Object.keys(sets)).toHaveLength(18);
    expect(sets.calves).toBe(0);
    expect(sets.hamstrings).toBe(0);
    expect(weeklySetsByMuscle([], muscles).chest).toBe(0);
  });
});

describe('weeklyFrequency', () => {
  it('counts the days that train a muscle as primary, once a day however many exercises do', () => {
    const frequency = weeklyFrequency([day(['bench', 4], ['bench', 2]), day(['ohp', 3]), day(['bench', 3], ['curl', 2])], muscles);
    expect(frequency.chest).toBe(2);
    expect(frequency.front_delts).toBe(1);
    expect(frequency.biceps).toBe(1);
  });

  it('does not count a day that trains the muscle only as secondary', () => {
    const frequency = weeklyFrequency([day(['bench', 4]), day(['row', 3])], muscles);
    expect(frequency.triceps).toBe(0);
    expect(frequency.biceps).toBe(0);
    expect(frequency.calves).toBe(0);
  });
});

describe('major muscle groups', () => {
  it('checks the eight major groups, shoulders as all three delts and back as lats with upper back', () => {
    expect(MAJOR_GROUPS).toEqual({
      chest: ['chest'],
      back: ['lats', 'upper_back'],
      shoulders: ['front_delts', 'side_delts', 'rear_delts'],
      biceps: ['biceps'],
      triceps: ['triceps'],
      quads: ['quads'],
      hamstrings: ['hamstrings'],
      glutes: ['glutes'],
    });
  });

  it('counts a set once per group: 1 when it trains the group as primary, else ½ when as secondary', () => {
    const sets = weeklySetsByGroup([day(['ohp', 3], ['raise', 3], ['facePull', 2]), day(['row', 4], ['bench', 4])], muscles);
    // Overhead press is front delts primary and side delts secondary: 1 shoulder set each, not 1½.
    // Rows: lats and upper back both primary count 1, and their rear delts ½; bench adds ½ for its front delts.
    expect(sets.shoulders).toBe(3 + 3 + 2 + 4 * 0.5 + 4 * 0.5);
    expect(sets.back).toBe(4 + 2 * 0.5);
    expect(sets.chest).toBe(4);
    expect(sets.triceps).toBe(3 * 0.5 + 4 * 0.5);
    expect(sets.quads).toBe(0);
  });

  it('counts the days that train any of a group as primary', () => {
    const frequency = weeklyFrequencyByGroup([day(['ohp', 3]), day(['raise', 3]), day(['row', 3]), day(['facePull', 2], ['squat', 3])], muscles);
    expect(frequency.shoulders).toBe(3);
    expect(frequency.back).toBe(1);
    expect(frequency.quads).toBe(1);
    expect(frequency.glutes).toBe(1);
    expect(frequency.biceps).toBe(0);
  });
});
