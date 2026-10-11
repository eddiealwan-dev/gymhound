import type { Gear } from './plates';
import { finishLine, lastSummary, ruleSentence, todaysRead, type LastSummary, type NextTime, type Rule } from './ruleLine';
import type { PrevSet } from './setEntry';
import type { Equipment, ExerciseMark, LoggingType, WeightUnit } from './types';

/** The default bars and plate sets (pairs owned) from settings. */
const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };
const KG_GEAR: Gear = { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } };

/** 3 sets of 5–8, add 5 lb. */
const RULE_LB: Rule = { setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' };
/** 3 sets of 5–8, add 2.5 kg. */
const RULE_KG: Rule = { setCount: 3, repMin: 5, repMax: 8, increment: 2.5, incrementUnit: 'kg' };
/** 3 sets of 30–60 seconds, add 5 lb. */
const RULE_TIME: Rule = { setCount: 3, repMin: 30, repMax: 60, increment: 5, incrementUnit: 'lb' };

const NO_LAST = null;

describe('ruleSentence (spec 7.4, the rule)', () => {
  const sentence = (rule: Rule | null, loggingType: LoggingType, unit: WeightUnit, last: LastSummary | null = NO_LAST) =>
    ruleSentence({ rule, loggingType, unit, last });

  it('weighted or bodyweight_plus: add the increment, with its unit', () => {
    expect(sentence(RULE_LB, 'weighted', 'lb')).toBe(
      'If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.',
    );
    expect(sentence(RULE_KG, 'weighted', 'kg')).toBe(
      'If every working set hits 8 on a normal day, add 2.5 kg. A marked day holds the weight.',
    );
    expect(sentence(RULE_LB, 'bodyweight_plus', 'lb')).toBe(
      'If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.',
    );
    expect(sentence(RULE_KG, 'bodyweight_plus', 'kg')).toBe(
      'If every working set hits 8 on a normal day, add 2.5 kg. A marked day holds the weight.',
    );
  });

  it('assisted: take the increment of assistance off', () => {
    expect(sentence(RULE_LB, 'assisted', 'lb')).toBe(
      'If every working set hits 8 on a normal day, take 5 lb of assistance off. A marked day holds it.',
    );
    expect(sentence(RULE_KG, 'assisted', 'kg')).toBe(
      'If every working set hits 8 on a normal day, take 2.5 kg of assistance off. A marked day holds it.',
    );
  });

  it('weighted_time: reaches the top of the time range, in seconds', () => {
    expect(sentence(RULE_TIME, 'weighted_time', 'lb')).toBe(
      'If every working set reaches 60s on a normal day, add 5 lb. A marked day holds the weight.',
    );
    expect(sentence({ ...RULE_TIME, increment: 2.5, incrementUnit: 'kg' }, 'weighted_time', 'kg')).toBe(
      'If every working set reaches 60s on a normal day, add 2.5 kg. A marked day holds the weight.',
    );
  });

  it('shows the increment in the display unit by the gym convention (5 lb ↔ 2.5 kg)', () => {
    expect(sentence(RULE_LB, 'weighted', 'kg')).toBe(
      'If every working set hits 8 on a normal day, add 2.5 kg. A marked day holds the weight.',
    );
    expect(sentence(RULE_KG, 'assisted', 'lb')).toBe(
      'If every working set hits 8 on a normal day, take 5 lb of assistance off. A marked day holds it.',
    );
  });

  it('increment 0: beat last time', () => {
    const flat = { ...RULE_LB, increment: 0 };
    for (const type of ['weighted', 'bodyweight_plus', 'assisted', 'weighted_time'] as const) {
      expect(sentence(flat, type, 'lb')).toBe("No weight to add. Beat last time's reps.");
    }
  });

  const last = (over: Partial<LastSummary>): LastSummary => ({
    sets: 3,
    reps: null,
    weight: null,
    weightUnit: null,
    durationS: null,
    distance: null,
    distanceUnit: null,
    ...over,
  });

  it("timed: last time's sets and seconds, with or without a rule", () => {
    const plank = last({ sets: 3, durationS: 60 });
    expect(sentence(null, 'timed', 'lb', plank)).toBe("Last time: 3 × 60 s. Timed holds don't go up automatically.");
    expect(sentence(RULE_TIME, 'timed', 'kg', plank)).toBe("Last time: 3 × 60 s. Timed holds don't go up automatically.");
  });

  it("distance_time: last time's distance in its time", () => {
    const run = last({ sets: 1, distance: 5, distanceUnit: 'km', durationS: 1530 });
    expect(sentence(null, 'distance_time', 'kg', run)).toBe('Last time: 5 km in 25:30.');
    expect(sentence(RULE_LB, 'distance_time', 'lb', last({ sets: 1, distance: 3.1, distanceUnit: 'mi', durationS: 1530 }))).toBe(
      'Last time: 3.1 mi in 25:30.',
    );
  });

  it('no rule, logged before: last time, with the weight in the unit it was logged in', () => {
    expect(sentence(null, 'weighted', 'lb', last({ sets: 3, reps: 10, weight: 25, weightUnit: 'lb' }))).toBe(
      'No rule here. Last time: 3 × 10 at 25 lb.',
    );
    expect(sentence(null, 'weighted', 'lb', last({ sets: 4, reps: 8, weight: 12.5, weightUnit: 'kg' }))).toBe(
      'No rule here. Last time: 4 × 8 at 12.5 kg.',
    );
    expect(sentence(null, 'assisted', 'kg', last({ sets: 3, reps: 8, weight: 20, weightUnit: 'kg' }))).toBe(
      'No rule here. Last time: 3 × 8 at 20 kg.',
    );
  });

  it('no rule, logged before with no load: leaves out the weight', () => {
    expect(sentence(null, 'bodyweight_plus', 'lb', last({ sets: 3, reps: 12 }))).toBe('No rule here. Last time: 3 × 12.');
    // A bodyweight set ticked with nothing added is stored as 0.
    expect(sentence(null, 'bodyweight_plus', 'lb', last({ sets: 3, reps: 12, weight: 0, weightUnit: 'lb' }))).toBe(
      'No rule here. Last time: 3 × 12.',
    );
  });

  it("never invents a number: sets without the value this type logs read as the first time", () => {
    // Possible only when an exercise's logging type changed after it was logged.
    expect(sentence(null, 'weighted', 'lb', last({ sets: 3, durationS: 60 }))).toBe('First time logging this.');
    expect(sentence(null, 'weighted_time', 'lb', last({ sets: 3, reps: 8, weight: 25, weightUnit: 'lb' }))).toBe(
      'First time logging this.',
    );
    expect(sentence(null, 'timed', 'lb', last({ sets: 3, reps: 8 }))).toBe('First time logging this.');
    expect(sentence(null, 'distance_time', 'lb', last({ sets: 3, reps: 8 }))).toBe('First time logging this.');
  });

  it('no rule, weighted_time logged before: seconds stand in for the reps', () => {
    expect(sentence(null, 'weighted_time', 'lb', last({ sets: 2, durationS: 45, weight: 50, weightUnit: 'lb' }))).toBe(
      'No rule here. Last time: 2 × 45 s at 50 lb.',
    );
  });

  it('never logged: first time', () => {
    for (const type of ['weighted', 'bodyweight_plus', 'assisted', 'weighted_time', 'timed', 'distance_time'] as const) {
      expect(sentence(null, type, 'lb')).toBe('First time logging this.');
    }
  });
});

describe("todaysRead (spec 7.4, today's read; R61 for a flagged exercise)", () => {
  type ReadArgs = Parameters<typeof todaysRead>[0];
  const read = (over: Partial<ReadArgs>) =>
    todaysRead({
      rule: RULE_LB,
      loggingType: 'weighted',
      planned: { weight: 185, unit: 'lb' },
      override: null,
      mark: null,
      equipment: 'barbell',
      gear: LB_GEAR,
      ...over,
    });
  const kgRead = (over: Partial<ReadArgs>) =>
    read({ rule: RULE_KG, planned: { weight: 80, unit: 'kg' }, gear: KG_GEAR, ...over });

  it('no plan yet: pick a starting weight', () => {
    expect(read({ planned: null })).toBe('Pick a starting weight. Next time builds from it.');
    expect(kgRead({ planned: null, mark: 'pain' })).toBe('Pick a starting weight. Next time builds from it.');
    expect(read({ planned: null, override: { weight: 135, unit: 'lb' } })).toBe('Pick a starting weight. Next time builds from it.');
  });

  it('Normal: hit the top of the range and next time is the raise, rounded to what the plates load', () => {
    expect(read({})).toBe('Hit 8s on a normal day and next time is 190 lb.');
    expect(kgRead({})).toBe('Hit 8s on a normal day and next time is 82.5 kg.');
  });

  it('a barbell raise rounds as at finish (7.3 step 6): no 2.5 lb plates, so 185 goes to 195', () => {
    const noSmallPlates: Gear = { bar: 45, plates: { '45': 4, '25': 1, '10': 2, '5': 1 } };
    expect(read({ gear: noSmallPlates })).toBe('Hit 8s on a normal day and next time is 195 lb.');
  });

  it('a barbell that can load nothing heavier holds the plan', () => {
    expect(read({ gear: { bar: 45, plates: {} } })).toBe('Hit 8s on a normal day and next time is 185 lb.');
  });

  it('anything but a barbell adds the increment as it is', () => {
    expect(read({ equipment: 'dumbbell', planned: { weight: 52.5, unit: 'lb' } })).toBe(
      'Hit 8s on a normal day and next time is 57.5 lb.',
    );
    expect(kgRead({ loggingType: 'bodyweight_plus', equipment: 'bodyweight', planned: { weight: 10, unit: 'kg' } })).toBe(
      'Hit 8s on a normal day and next time is 12.5 kg.',
    );
  });

  it('assisted takes assistance off, never below 0', () => {
    expect(read({ loggingType: 'assisted', equipment: 'machine', planned: { weight: 40, unit: 'lb' } })).toBe(
      'Hit 8s on a normal day and next time is 35 lb.',
    );
    expect(read({ loggingType: 'assisted', equipment: 'machine', planned: { weight: 3, unit: 'lb' } })).toBe(
      'Hit 8s on a normal day and next time is 0 lb.',
    );
  });

  it('weighted_time reads "Reach {rep_max}s"', () => {
    expect(read({ rule: RULE_TIME, loggingType: 'weighted_time', equipment: 'dumbbell', planned: { weight: 25, unit: 'lb' } })).toBe(
      'Reach 60s on a normal day and next time is 30 lb.',
    );
  });

  it("converts the increment to the plan's unit by the gym convention", () => {
    expect(read({ rule: RULE_KG })).toBe('Hit 8s on a normal day and next time is 190 lb.');
    expect(kgRead({ rule: RULE_LB })).toBe('Hit 8s on a normal day and next time is 82.5 kg.');
  });

  it('marked (R61): the reason today holds the plan', () => {
    expect(read({ mark: 'rough_sleep' })).toBe(
      'Hit 8s on a normal day and next time is 190 lb. Rough sleep today, so 185 lb holds.',
    );
    expect(kgRead({ mark: 'short_on_food' })).toBe(
      'Hit 8s on a normal day and next time is 82.5 kg. Short on food today, so 80 kg holds.',
    );
    const reasons: Record<ExerciseMark, string> = {
      rough_sleep: 'Rough sleep',
      sick: 'Sick',
      short_on_food: 'Short on food',
      pain: 'Pain',
      cutting: 'Cutting',
    };
    for (const [mark, label] of Object.entries(reasons) as [ExerciseMark, string][]) {
      expect(read({ mark })).toBe(`Hit 8s on a normal day and next time is 190 lb. ${label} today, so 185 lb holds.`);
    }
  });

  it('override, Normal: today is set by you, the rule still says the plan', () => {
    expect(read({ override: { weight: 175, unit: 'lb' } })).toBe('Today is set to 175 lb by you. The rule still says 185 lb.');
    expect(kgRead({ override: { weight: 77.5, unit: 'kg' } })).toBe('Today is set to 77.5 kg by you. The rule still says 80 kg.');
  });

  it('override, marked (R61): the reason holds the plan, not the override', () => {
    expect(read({ override: { weight: 175, unit: 'lb' }, mark: 'pain' })).toBe(
      'Today is set to 175 lb by you. Pain today, so 185 lb holds.',
    );
    expect(kgRead({ override: { weight: 77.5, unit: 'kg' }, mark: 'cutting' })).toBe(
      'Today is set to 77.5 kg by you. Cutting today, so 80 kg holds.',
    );
  });

  it('no read for timed, distance_time, increment 0 or no rule', () => {
    expect(read({ loggingType: 'timed', rule: RULE_TIME })).toBeNull();
    expect(read({ loggingType: 'distance_time' })).toBeNull();
    expect(read({ rule: { ...RULE_LB, increment: 0 } })).toBeNull();
    expect(read({ rule: { ...RULE_LB, increment: 0 }, mark: 'sick', override: { weight: 175, unit: 'lb' } })).toBeNull();
    expect(read({ rule: null })).toBeNull();
    expect(read({ rule: null, planned: null })).toBeNull();
  });

  it('reads for every type the rule raises', () => {
    const types: [LoggingType, Equipment][] = [
      ['weighted', 'barbell'],
      ['bodyweight_plus', 'bodyweight'],
      ['assisted', 'machine'],
      ['weighted_time', 'dumbbell'],
    ];
    for (const [loggingType, equipment] of types) {
      expect(read({ loggingType, equipment })).not.toBeNull();
    }
  });
});

describe("lastSummary: last time's sets for the rule line", () => {
  const prev = (position: number, over: Partial<PrevSet>): PrevSet => ({
    position,
    setType: 'working',
    weight: null,
    weightUnit: null,
    reps: null,
    durationS: null,
    distance: null,
    distanceUnit: null,
    ...over,
  });

  it('is null when there was no last time', () => {
    expect(lastSummary([])).toBeNull();
  });

  it("counts the working and failure sets and reads the first one's values, leaving warmups and drops out", () => {
    const sets = [
      prev(0, { setType: 'warmup', weight: 45, weightUnit: 'lb', reps: 10 }),
      prev(1, { weight: 135, weightUnit: 'lb', reps: 8 }),
      prev(2, { weight: 135, weightUnit: 'lb', reps: 7 }),
      prev(3, { setType: 'failure', weight: 135, weightUnit: 'lb', reps: 5 }),
      prev(4, { setType: 'drop', weight: 95, weightUnit: 'lb', reps: 10 }),
    ];
    expect(lastSummary(sets)).toEqual({
      sets: 3,
      reps: 8,
      weight: 135,
      weightUnit: 'lb',
      durationS: null,
      distance: null,
      distanceUnit: null,
    });
  });

  it('goes by position, not the order given', () => {
    const sets = [prev(2, { weight: 60, weightUnit: 'kg', reps: 6 }), prev(1, { weight: 60, weightUnit: 'kg', reps: 8 })];
    expect(lastSummary(sets)).toMatchObject({ sets: 2, reps: 8, weight: 60, weightUnit: 'kg' });
  });

  it('keeps the time and distance', () => {
    expect(lastSummary([prev(0, { distance: 5, distanceUnit: 'km', durationS: 1530 })])).toMatchObject({
      sets: 1,
      distance: 5,
      distanceUnit: 'km',
      durationS: 1530,
    });
  });

  it('with only warmups or drops last time, uses them', () => {
    const sets = [prev(0, { setType: 'warmup', weight: 45, weightUnit: 'lb', reps: 10 }), prev(1, { setType: 'drop', weight: 35, weightUnit: 'lb', reps: 12 })];
    expect(lastSummary(sets)).toMatchObject({ sets: 2, reps: 10, weight: 45 });
  });
});

describe('finishLine (spec 8.5, R64)', () => {
  const bench = (outcome: NextTime['outcome'], nextWeight: number, mark: ExerciseMark | null = null, nextUnit: WeightUnit = 'lb'): NextTime => ({
    name: 'Bench press',
    loggingType: 'weighted',
    outcome,
    nextWeight,
    nextUnit,
    mark,
  });

  it('raised: next time, with the up arrow', () => {
    expect(finishLine(bench('raised', 185))).toBe('Bench press — next time 185 lb ↑');
  });

  it('held: holds at the weight', () => {
    expect(finishLine(bench('held', 180))).toBe('Bench press — holds at 180 lb');
  });

  it('held_marked: holds at the weight and names the reason', () => {
    expect(finishLine(bench('held_marked', 180, 'rough_sleep'))).toBe('Bench press — holds at 180 lb · Rough sleep');
    expect(finishLine(bench('held_marked', 180, 'short_on_food'))).toBe('Bench press — holds at 180 lb · Short on food');
  });

  it('no_sets: holds at the plan', () => {
    expect(finishLine(bench('no_sets', 185))).toBe('Bench press — holds at 185 lb');
  });

  it('keeps the unit the weight was logged in, without trailing zeros', () => {
    expect(finishLine(bench('raised', 82.5, null, 'kg'))).toBe('Bench press — next time 82.5 kg ↑');
    expect(finishLine(bench('held', 80, null, 'kg'))).toBe('Bench press — holds at 80 kg');
  });

  it('assisted: a raise takes assistance off, so it points down (R72); a hold reads as any other', () => {
    const pullUp = (outcome: NextTime['outcome'], nextWeight: number, mark: ExerciseMark | null = null): NextTime => ({
      name: 'Assisted pull-up',
      loggingType: 'assisted',
      outcome,
      nextWeight,
      nextUnit: 'lb',
      mark,
    });
    expect(finishLine(pullUp('raised', 30))).toBe('Assisted pull-up — next time 30 lb ↓');
    expect(finishLine(pullUp('held', 40))).toBe('Assisted pull-up — holds at 40 lb');
    expect(finishLine(pullUp('held_marked', 40, 'pain'))).toBe('Assisted pull-up — holds at 40 lb · Pain');
  });

  it('every other loaded type that is raised points up', () => {
    for (const loggingType of ['bodyweight_plus', 'weighted_time'] as const) {
      expect(finishLine({ ...bench('raised', 185), loggingType })).toBe('Bench press — next time 185 lb ↑');
    }
  });
});
