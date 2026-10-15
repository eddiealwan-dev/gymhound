import type { MetconRule, RuleKind } from '../seed/programTypes';
import {
  blockKindOf,
  easySecondsOf,
  emomMinutesOf,
  intervalFormat,
  metconParts,
  runFormat,
  TECHNIQUE_LINE,
  workPlanFor,
  type BlockInput,
} from './sessionBlock';

const working = (n: number) => Array.from({ length: n }, () => ({ setType: 'working' as const }));

/** A program slot as the block reads it: a weighted lift unless a test says otherwise. */
type SlotParts = Partial<Omit<NonNullable<BlockInput['program']>, 'rule'> & { kind: RuleKind }>;
const slot = (extra: Partial<BlockInput> = {}, { kind = 'load', ...program }: SlotParts = {}): BlockInput => ({
  exerciseId: 'barbell-back-squat',
  loggingType: 'weighted',
  rule: { setCount: 3, repMin: 5, repMax: 8 },
  sets: working(3),
  ...extra,
  program: { rule: { kind }, metcon: null, countsTowardVolume: true, note: null, catalogName: 'Barbell back squat', ...program },
});

const amrap: MetconRule = { format: 'AMRAP', workMinutes: 10, elements: ['Goblet squat (metcon)', 'Push-up', 'Run'], capMinutes: null };
const fran: MetconRule = { format: 'For Time', workMinutes: 6, elements: ['Thruster', 'Pull-up (scaled as needed)'], capMinutes: 8 };

describe('blockKindOf', () => {
  it('reads a metcon by its rule kind and its structured rule', () => {
    expect(blockKindOf(slot({ exerciseId: 'metcon-amrap-10-squat-pushup-run', loggingType: 'rounds' }, { kind: 'metcon', metcon: amrap }))).toBe('metcon');
  });

  it('reads a run, and intervals, by exercise id', () => {
    expect(blockKindOf(slot({ exerciseId: 'easy-run', loggingType: 'timed' }, { kind: 'weekly_seconds', countsTowardVolume: false }))).toBe('run');
    expect(blockKindOf(slot({ exerciseId: 'incline-treadmill-walk', loggingType: 'timed' }, { kind: 'weekly_seconds' }))).toBe('run');
    expect(blockKindOf(slot({ exerciseId: 'interval-run', loggingType: 'timed' }, { kind: 'weekly_seconds', countsTowardVolume: false }))).toBe('intervals');
    expect(blockKindOf(slot({ exerciseId: 'rower-intervals', loggingType: 'timed' }, { kind: 'add_set' }))).toBe('intervals');
  });

  it('reads an event by its logging type, and a technique slot by not counting', () => {
    expect(blockKindOf(slot({ exerciseId: 'yoke-carry', loggingType: 'weighted_distance' }))).toBe('event');
    expect(blockKindOf(slot({ exerciseId: 'fedb-snatch' }, { countsTowardVolume: false }))).toBe('technique');
  });

  it('keeps every other slot, and anything outside a program, as plain set rows', () => {
    expect(blockKindOf(slot())).toBe('sets');
    expect(blockKindOf({ ...slot({ exerciseId: 'easy-run', loggingType: 'timed' }), program: null })).toBe('sets');
    expect(blockKindOf({ ...slot({ loggingType: 'rounds' }), program: undefined })).toBe('sets');
  });
});

describe('metconParts (R-t7b2)', () => {
  it('takes the format and the moves from the structured rule, the amounts from the name where they match', () => {
    expect(metconParts(amrap, 'Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run')).toEqual({
      format: 'AMRAP 10 min',
      elements: [
        { amount: '10', name: 'Goblet squat', load: null },
        { amount: '10', name: 'Push-up', load: null },
        { amount: '200 m', name: 'Run', load: null },
      ],
      subtitle: null,
    });
  });

  it('reads "12-cal" as 12 cal, and keeps the scaling words of the move', () => {
    const rule: MetconRule = { format: 'AMRAP', workMinutes: 12, elements: ['Wall ball', 'Toes-to-bar (scaled as needed)', 'Row (erg)'], capMinutes: null };
    expect(metconParts(rule, 'Metcon · AMRAP 12 min: 10 wall balls, 10 toes-to-bar, 12-cal row').elements).toEqual([
      { amount: '10', name: 'Wall ball', load: null },
      { amount: '10', name: 'Toes-to-bar (scaled as needed)', load: null },
      { amount: '12 cal', name: 'Row (erg)', load: null },
    ]);
  });

  it('says the cap, takes a load from the name, and shows the full name when the list cannot say it all', () => {
    expect(metconParts(fran, 'Metcon · 21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)')).toEqual({
      format: 'For Time · 8 min cap',
      elements: [
        { amount: null, name: 'Thruster', load: '95/65 lb' },
        { amount: null, name: 'Pull-up (scaled as needed)', load: null },
      ],
      subtitle: '21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)',
    });
  });

  it('shows the full name for rounds for time, whose rounds the rule does not hold', () => {
    const rule: MetconRule = { format: 'For Time', workMinutes: 10, elements: ['Row (erg)', 'Thruster', 'Ring row'], capMinutes: 12 };
    const parts = metconParts(rule, 'Metcon B · 3 rounds for time: 200 m row, 10 thrusters, 10 ring rows (cap 12 min)');
    expect(parts.elements.map((e) => e.amount)).toEqual(['200 m', '10', '10']);
    expect(parts.subtitle).toBe('3 rounds for time: 200 m row, 10 thrusters, 10 ring rows (cap 12 min)');
  });

  it('shows a move bare when the name has nothing for it', () => {
    const parts = metconParts(amrap, 'AMRAP 10: goblet squat, push-up, run');
    expect(parts.elements[0]).toEqual({ amount: null, name: 'Goblet squat', load: null });
    expect(parts.subtitle).toBe('AMRAP 10: goblet squat, push-up, run');
  });

  it('says For Time alone with no cap', () => {
    expect(metconParts({ ...fran, capMinutes: null }, '').format).toBe('For Time');
  });
});

describe('the format lines and what the notes say', () => {
  it('names a run by its target, and a walk, a ride or a row by its own word', () => {
    expect(runFormat('easy-run', 1740)).toBe('Run 29:00');
    expect(runFormat('long-run', 3600)).toBe('Run 60:00');
    expect(runFormat('incline-treadmill-walk', 900)).toBe('Walk 15:00');
  });

  it('writes intervals as sets × hard / easy, leaving out an easy part it does not know', () => {
    expect(intervalFormat(6, 180, 120)).toBe('6 × 3:00 hard / 2:00 easy');
    expect(intervalFormat(8, 20, 100)).toBe('8 × 0:20 hard / 1:40 easy');
    expect(intervalFormat(8, 60, null)).toBe('8 × 1:00 hard');
  });

  it("reads the easy part from the slot's note", () => {
    expect(easySecondsOf('Hard (about 5 km pace) with 120 s easy jog between')).toBe(120);
    expect(easySecondsOf('Finisher: 30 s hard / 90 s easy')).toBe(90);
    expect(easySecondsOf('Comfortably hard, steady')).toBeNull();
    expect(easySecondsOf(null)).toBeNull();
  });

  it("reads an EMOM's minutes from the note", () => {
    expect(emomMinutesOf('EMOM 10: 2 reps every minute')).toBe(10);
    expect(emomMinutesOf('EMOM 10')).toBe(10);
    expect(emomMinutesOf('About 70–75% of Monday')).toBeNull();
  });

  it('marks technique sets in the words the owner chose', () => {
    expect(TECHNIQUE_LINE).toBe('Technique · not counted');
  });
});

describe('workPlanFor', () => {
  it('counts an AMRAP down from its minutes, and For Time up to its cap', () => {
    expect(workPlanFor(slot({ loggingType: 'rounds' }, { kind: 'metcon', metcon: amrap }))).toEqual({
      kind: 'amrap',
      noun: 'AMRAP',
      steps: [{ kind: 'work', seconds: 600, set: 1 }],
    });
    expect(workPlanFor(slot({ loggingType: 'for_time' }, { kind: 'metcon', metcon: fran }))).toEqual({
      kind: 'for_time',
      noun: 'For Time',
      steps: [{ kind: 'work', seconds: 480, set: 1 }],
    });
  });

  it("runs a run to the week's target", () => {
    expect(workPlanFor(slot({ exerciseId: 'easy-run', loggingType: 'timed', rule: { setCount: 1, repMin: 1740, repMax: 1740 }, sets: working(1) }, { kind: 'weekly_seconds' }))).toEqual({
      kind: 'run',
      noun: 'Run',
      steps: [{ kind: 'work', seconds: 1740, set: 1 }],
    });
  });

  it('steps intervals through each working set, hard then easy, with no easy after the last', () => {
    const plan = workPlanFor(
      slot(
        { exerciseId: 'interval-run', loggingType: 'timed', rule: { setCount: 2, repMin: 180, repMax: 180 }, sets: [{ setType: 'warmup' }, ...working(2)] },
        { kind: 'weekly_seconds', note: 'Hard (about 5 km pace) with 120 s easy jog between' },
      ),
    );
    expect(plan).toEqual({
      kind: 'intervals',
      noun: 'Intervals',
      steps: [
        { kind: 'work', seconds: 180, set: 1 },
        { kind: 'easy', seconds: 120, set: 1 },
        { kind: 'work', seconds: 180, set: 2 },
      ],
    });
  });

  it('waits after each set of intervals with no easy part', () => {
    const plan = workPlanFor(slot({ exerciseId: 'interval-run', loggingType: 'timed', rule: { setCount: 2, repMin: 60, repMax: 60 }, sets: working(2) }, { kind: 'weekly_seconds' }));
    expect(plan?.steps).toEqual([
      { kind: 'work', seconds: 60, set: 1, holdAfter: true },
      { kind: 'work', seconds: 60, set: 2 },
    ]);
  });

  it('gives an EMOM slot a clock of its minutes, and other technique sets none', () => {
    const plan = workPlanFor(slot({ exerciseId: 'fedb-snatch', sets: working(10) }, { countsTowardVolume: false, note: 'EMOM 10: 2 reps every minute' }));
    expect(plan?.kind).toBe('emom');
    expect(plan?.steps).toHaveLength(10);
    expect(plan?.steps[9]).toEqual({ kind: 'minute', seconds: 60, set: 10 });
    expect(workPlanFor(slot({}, { countsTowardVolume: false, note: 'Log clean and press (speed).' }))).toBeNull();
  });

  it('has no clock for events or plain sets', () => {
    expect(workPlanFor(slot({ loggingType: 'weighted_distance' }))).toBeNull();
    expect(workPlanFor(slot())).toBeNull();
  });
});
