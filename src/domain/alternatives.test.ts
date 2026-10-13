import { alternativesFor, programExerciseId, type SwapCandidate } from './alternatives';

const ex = (id: string, over: Partial<SwapCandidate> = {}): SwapCandidate => ({
  id,
  name: id,
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glutes'],
  pattern: 'squat',
  equipment: 'machine',
  loggingType: 'weighted',
  isCustom: false,
  ...over,
});

describe('alternativesFor (R553)', () => {
  const legPress = ex('leg-press');
  const all = [
    legPress,
    ex('hack-squat'),
    ex('barbell-back-squat', { equipment: 'barbell' }),
    ex('bulgarian-split-squat', { pattern: 'lunge', equipment: 'dumbbell' }),
    ex('fedb-obscure-squat'),
    ex('leg-extension', { pattern: 'isolation', secondaryMuscles: [] }),
    ex('wall-sit', { loggingType: 'timed', pattern: 'isolation' }),
    ex('romanian-deadlift', { primaryMuscles: ['hamstrings'], pattern: 'hinge' }),
  ];

  it('lists exercises with the same main muscle, the same movement and staples first', () => {
    expect(alternativesFor(legPress, all, new Set()).map((c) => c.id)).toEqual([
      'hack-squat',
      'barbell-back-squat',
      'fedb-obscure-squat',
      'bulgarian-split-squat',
      'leg-extension',
    ]);
  });

  it('never offers itself, one already in the day, another main muscle, or another way of logging', () => {
    const ids = alternativesFor(legPress, all, new Set(['hack-squat'])).map((c) => c.id);
    expect(ids).not.toContain('leg-press');
    expect(ids).not.toContain('hack-squat');
    expect(ids).not.toContain('romanian-deadlift');
    expect(ids).not.toContain('wall-sit');
  });

  it('lists at most eight', () => {
    const many = Array.from({ length: 20 }, (_, i) => ex(`squat-${String(i).padStart(2, '0')}`));
    expect(alternativesFor(legPress, many, new Set())).toHaveLength(8);
  });
});

describe('programExerciseId', () => {
  it("reads a program's own exercise from its row's id, and nothing for your own routine", () => {
    expect(programExerciseId('premade-fullbody-3:a:barbell-back-squat', true)).toBe('barbell-back-squat');
    expect(programExerciseId('9c1f0e2a', false)).toBeNull();
  });
});
