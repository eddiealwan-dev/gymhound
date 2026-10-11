import {
  computePrFlags,
  estimatedOneRm,
  pickHighlights,
  PR_BIT,
  prCard,
  prLine,
  type PrCandidate,
  type PrHighlight,
} from './prs';
import type { WeightUnit } from './types';

let seq = 0;
function set(
  workoutId: string,
  weight: number | null,
  reps: number | null,
  extra: Partial<PrCandidate> = {},
): PrCandidate {
  seq += 1;
  return {
    id: extra.id ?? `s${seq}`,
    workoutId,
    setType: 'working',
    done: true,
    weight,
    weightUnit: weight === null ? null : ('lb' as WeightUnit),
    reps,
    durationS: null,
    ...extra,
  };
}

function timed(workoutId: string, durationS: number, extra: Partial<PrCandidate> = {}): PrCandidate {
  return set(workoutId, null, null, { durationS, ...extra });
}

const H = PR_BIT.heaviest;
const R = PR_BIT.reps_at_weight;
const E = PR_BIT.e1rm;
const L = PR_BIT.longest_hold;

describe('PR_BIT', () => {
  it('matches the pr_flags bitmask', () => {
    expect(PR_BIT).toEqual({ heaviest: 1, reps_at_weight: 2, e1rm: 4, longest_hold: 8 });
  });
});

describe('estimatedOneRm', () => {
  it('is the load at 1 rep and load × (1 + reps/30) up to 12 reps', () => {
    expect(estimatedOneRm(100, 1)).toBe(100);
    expect(estimatedOneRm(100, 5)).toBeCloseTo(116.6666667, 6);
    expect(estimatedOneRm(100, 12)).toBeCloseTo(140, 6);
  });
  it('is null outside 1–12 reps', () => {
    expect(estimatedOneRm(100, 13)).toBeNull();
    expect(estimatedOneRm(100, 0)).toBeNull();
  });
});

describe('computePrFlags', () => {
  it('gives every set 0 in the first session', () => {
    const sets = [set('w1', 135, 5, { id: 'a' }), set('w1', 145, 5, { id: 'b' }), set('w1', 155, 8, { id: 'c' })];
    const flags = computePrFlags('weighted', sets);
    expect([...flags.entries()]).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ]);
  });

  it('flags a heavier set heaviest and e1RM', () => {
    const flags = computePrFlags('weighted', [set('w1', 135, 5, { id: 'a' }), set('w2', 140, 5, { id: 'b' })]);
    expect(flags.get('a')).toBe(0);
    expect(flags.get('b')).toBe(H | E);
  });

  it('flags more reps at the same load reps-at-weight and e1RM, not heaviest', () => {
    const flags = computePrFlags('weighted', [set('w1', 135, 5), set('w2', 135, 8, { id: 'b' })]);
    expect(flags.get('b')).toBe(R | E);
  });

  it('gives an equal set 0', () => {
    const flags = computePrFlags('weighted', [set('w1', 135, 5), set('w2', 135, 5, { id: 'b' })]);
    expect(flags.get('b')).toBe(0);
  });

  it('never flags e1RM above 12 reps', () => {
    const flags = computePrFlags('weighted', [set('w1', 135, 12), set('w2', 135, 13, { id: 'b' })]);
    expect(flags.get('b')).toBe(R);
  });

  it('never flags a warmup and never uses one as the baseline', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 100, 5),
      set('w1', 200, 5, { setType: 'warmup', id: 'warm1' }),
      set('w2', 150, 5, { id: 'b' }),
      set('w2', 300, 5, { setType: 'warmup', id: 'warm2' }),
    ]);
    expect(flags.get('warm1')).toBe(0);
    expect(flags.get('warm2')).toBe(0);
    expect(flags.get('b')).toBe(H | E);
  });

  it('never flags an unticked set and never uses one as the baseline', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 100, 5),
      set('w1', 200, 5, { done: false, id: 'u1' }),
      set('w2', 150, 5, { id: 'b' }),
      set('w2', 300, 5, { done: false, id: 'u2' }),
    ]);
    expect(flags.get('u1')).toBe(0);
    expect(flags.get('u2')).toBe(0);
    expect(flags.get('b')).toBe(H | E);
  });

  it('uses an earlier set of the same workout as the baseline', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 100, 5),
      set('w2', 110, 5, { id: 'b1' }),
      set('w2', 120, 5, { id: 'b2' }),
    ]);
    expect(flags.get('b1')).toBe(H | E);
    expect(flags.get('b2')).toBe(H | E);
  });

  it('compares loads in kg across units', () => {
    const base = set('w1', 225, 5);
    const kg100 = set('w2', 100, 5, { weightUnit: 'kg', id: 'kg100' });
    expect(computePrFlags('weighted', [base, kg100]).get('kg100')! & H).toBe(0);
    const kg1025 = set('w2', 102.5, 5, { weightUnit: 'kg', id: 'kg1025' });
    expect(computePrFlags('weighted', [base, kg1025]).get('kg1025')! & H).toBe(H);
  });

  it('treats 60 kg and 132.3 lb as the same load', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 132.3, 8),
      set('w2', 60, 9, { weightUnit: 'kg', id: 'b' }),
    ]);
    expect(flags.get('b')).toBe(R | E);
  });

  it('does not call 132.3 lb heavier than 60 kg, the same load shown in lb', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 60, 8, { weightUnit: 'kg' }),
      set('w2', 132.3, 9, { id: 'b' }),
    ]);
    expect(flags.get('b')).toBe(R | E);
  });

  it('flags reps at weight only against sets at the same load', () => {
    const flags = computePrFlags('weighted', [set('w1', 135, 10), set('w2', 145, 6), set('w3', 145, 8, { id: 'b' })]);
    expect(flags.get('b')).toBe(R | E);
  });

  it('flags a longer hold on a timed exercise', () => {
    const flags = computePrFlags('timed', [timed('w1', 40), timed('w2', 45, { id: 'b' }), timed('w3', 45, { id: 'c' })]);
    expect(flags.get('b')).toBe(L);
    expect(flags.get('c')).toBe(0);
  });

  it('flags heaviest and longest hold separately on weighted_time', () => {
    const flags = computePrFlags('weighted_time', [
      set('w1', 70, null, { durationS: 40 }),
      set('w2', 80, null, { durationS: 30, id: 'heavy' }),
      set('w3', 70, null, { durationS: 50, id: 'long' }),
      set('w4', 90, null, { durationS: 60, id: 'both' }),
    ]);
    expect(flags.get('heavy')).toBe(H);
    expect(flags.get('long')).toBe(L);
    expect(flags.get('both')).toBe(H | L);
  });

  it('counts an empty bodyweight_plus load as 0', () => {
    const flags = computePrFlags('bodyweight_plus', [
      set('w1', null, 10),
      set('w2', null, 15, { id: 'more' }),
      set('w3', 25, 8, { id: 'added' }),
    ]);
    expect(flags.get('more')).toBe(R);
    expect(flags.get('added')).toBe(H | E);
  });

  it('never flags assisted or distance_time', () => {
    const sets = [set('w1', 50, 5), set('w2', 10, 12, { id: 'b' })];
    expect(computePrFlags('assisted', sets).get('b')).toBe(0);
    const dist = [set('w1', null, null, { durationS: 600 }), set('w2', null, null, { durationS: 900, id: 'd' })];
    expect(computePrFlags('distance_time', dist).get('d')).toBe(0);
  });

  it('is still the first session after a history of only warmups', () => {
    const flags = computePrFlags('weighted', [
      set('w1', 95, 5, { setType: 'warmup' }),
      set('w2', 135, 5, { id: 'b' }),
      set('w2', 145, 5, { id: 'c' }),
    ]);
    expect(flags.get('b')).toBe(0);
    expect(flags.get('c')).toBe(0);
  });
});

function hl(over: Partial<PrHighlight>): PrHighlight {
  return {
    exerciseId: 'e',
    name: 'Bench press',
    loggingType: 'weighted',
    kind: 'heaviest',
    weight: 185,
    weightUnit: 'lb',
    reps: 5,
    durationS: null,
    localDate: '2026-10-11',
    ...over,
  };
}

describe('prLine', () => {
  it('writes every kind', () => {
    expect(prLine(hl({}))).toBe('Bench press — heaviest: 185 lb × 5');
    expect(
      prLine(hl({ name: "Farmer's walk", loggingType: 'weighted_time', weight: 70, reps: null, durationS: 40 })),
    ).toBe("Farmer's walk — heaviest: 70 lb × 40s");
    expect(prLine(hl({ name: 'Dip', loggingType: 'bodyweight_plus', weight: 25, reps: 8 }))).toBe(
      'Dip — heaviest: +25 lb × 8',
    );
    expect(prLine(hl({ kind: 'reps_at_weight', reps: 8 }))).toBe('Bench press — most reps at 185 lb: 8');
    expect(
      prLine(hl({ name: 'Dip', loggingType: 'bodyweight_plus', kind: 'reps_at_weight', weight: 0, reps: 15 })),
    ).toBe('Dip — most reps at bodyweight: 15');
    expect(
      prLine(hl({ name: 'Dip', loggingType: 'bodyweight_plus', kind: 'reps_at_weight', weight: null, weightUnit: null, reps: 15 })),
    ).toBe('Dip — most reps at bodyweight: 15');
    expect(prLine(hl({ kind: 'e1rm', reps: 4 }))).toBe('Bench press — best estimated 1RM: 210 lb');
    expect(
      prLine(hl({ name: 'Plank', loggingType: 'timed', kind: 'longest_hold', weight: null, weightUnit: null, reps: null, durationS: 90 })),
    ).toBe('Plank — longest hold: 1:30');
  });
});

describe('prCard', () => {
  it('gives the value and caption for every kind', () => {
    expect(prCard(hl({}))).toEqual({ value: '185 lb × 5', caption: 'Heaviest set' });
    expect(prCard(hl({ kind: 'reps_at_weight', reps: 8 }))).toEqual({ value: '8 reps', caption: 'Most reps at 185 lb' });
    expect(prCard(hl({ kind: 'e1rm', reps: 4 }))).toEqual({ value: '210 lb', caption: 'Best estimated 1RM' });
    expect(
      prCard(hl({ name: 'Plank', loggingType: 'timed', kind: 'longest_hold', weight: null, weightUnit: null, reps: null, durationS: 90 })),
    ).toEqual({ value: '1:30', caption: 'Longest hold' });
    expect(
      prCard(hl({ name: 'Dip', loggingType: 'bodyweight_plus', kind: 'reps_at_weight', weight: 0, reps: 15 })),
    ).toEqual({ value: '15 reps', caption: 'Most reps at bodyweight' });
  });
});

describe('pickHighlights', () => {
  it('picks the best set per kind, in kind order, in workout order', () => {
    const bench = {
      exerciseId: 'bench',
      name: 'Bench press',
      loggingType: 'weighted' as const,
      localDate: '2026-10-11',
      sets: [
        { ...set('w2', 180, 5, { id: 'b1' }), prFlags: H | E },
        { ...set('w2', 185, 5, { id: 'b2' }), prFlags: H | E },
        { ...set('w2', 185, 3, { id: 'b3' }), prFlags: H },
        { ...set('w2', 135, 12, { id: 'b4' }), prFlags: R },
        { ...set('w2', 135, 5, { id: 'b5' }), prFlags: 0 },
      ],
    };
    const plank = {
      exerciseId: 'plank',
      name: 'Plank',
      loggingType: 'timed' as const,
      localDate: '2026-10-11',
      sets: [
        { ...timed('w2', 60), prFlags: L },
        { ...timed('w2', 90), prFlags: L },
      ],
    };
    const result = pickHighlights([bench, plank]);
    expect(result.map((h) => [h.exerciseId, h.kind, h.weight, h.reps, h.durationS])).toEqual([
      ['bench', 'heaviest', 185, 5, null],
      ['bench', 'e1rm', 185, 5, null],
      ['bench', 'reps_at_weight', 135, 12, null],
      ['plank', 'longest_hold', null, null, 90],
    ]);
    expect(result[0]).toMatchObject({ name: 'Bench press', loggingType: 'weighted', weightUnit: 'lb', localDate: '2026-10-11' });
  });

  it('compares heaviest across units in kg', () => {
    const result = pickHighlights([
      {
        exerciseId: 'x',
        name: 'Squat',
        loggingType: 'weighted',
        localDate: '2026-10-11',
        sets: [
          { ...set('w2', 225, 5), prFlags: H },
          { ...set('w2', 102.5, 5, { weightUnit: 'kg' }), prFlags: H },
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ weight: 102.5, weightUnit: 'kg' });
  });

  it('skips an exercise with no PRs', () => {
    expect(
      pickHighlights([
        { exerciseId: 'x', name: 'Squat', loggingType: 'weighted', localDate: '2026-10-11', sets: [{ ...set('w1', 1, 1), prFlags: 0 }] },
      ]),
    ).toEqual([]);
  });
});
