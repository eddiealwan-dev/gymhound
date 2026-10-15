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

  it("keeps a program's carry to carries, and its scores to scores (R607)", () => {
    const carry = (id: string, over: Partial<SwapCandidate> = {}) =>
      ex(id, { primaryMuscles: ['traps'], secondaryMuscles: [], pattern: 'carry', equipment: 'other', loggingType: 'weighted_distance', ...over });
    const yoke = carry('yoke-carry');
    const carries = [
      yoke,
      carry('sandbag-carry'),
      carry('farmers-walk-time', { loggingType: 'weighted_time' }),
      carry('shrug', { loggingType: 'weighted' }),
      carry('run', { loggingType: 'distance_time' }),
    ];
    expect(alternativesFor(yoke, carries, new Set()).map((c) => c.id)).toEqual(['sandbag-carry']);

    const score = (id: string, loggingType: SwapCandidate['loggingType']) =>
      ex(id, { pattern: 'isolation', equipment: 'other', loggingType, primaryMuscles: ['quads'], secondaryMuscles: [] });
    const amrap = score('amrap-10', 'rounds');
    const metcons = [amrap, score('amrap-15', 'rounds'), score('for-time-21-15-9', 'for_time'), score('leg-extension', 'weighted'), score('wall-sit', 'timed')];
    expect(alternativesFor(amrap, metcons, new Set()).map((c) => c.id).sort()).toEqual(['amrap-15', 'for-time-21-15-9']);
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
