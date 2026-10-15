import type { Gear } from './plates';
import { PROGRAMS } from '../seed/programs.generated';
import type { ProgramWeek } from '../seed/programTypes';
import {
  addSetLine,
  BEAT_TWICE,
  changeRungNote,
  finishLine,
  LADDER_DOWN_WHY,
  ladderMoveLine,
  lastSummary,
  metconText,
  programRuleSentence,
  programTodaysRead,
  resetWhy,
  ruleSentence,
  rungName,
  secondsUpLine,
  slotNoteText,
  slotName,
  sessionNoteText,
  todaysRead,
  WARM_UP_LINE,
  weekLine,
  type LastSummary,
  type NextTime,
  type ProgramRule,
  type Rule,
  type RungWords,
} from './ruleLine';
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

  it("the scores of programs (R607): last time's score, with or without a rule; never a weight to add", () => {
    expect(sentence(RULE_LB, 'rounds', 'lb', last({ sets: 1, reps: 6, extraReps: 4 }))).toBe('Last time: 6 + 4.');
    expect(sentence(null, 'rounds', 'lb', last({ sets: 1, reps: 6 }))).toBe('Last time: 6.');
    expect(sentence(RULE_LB, 'for_time', 'lb', last({ sets: 1, durationS: 462 }))).toBe('Last time: 7:42.');
    expect(sentence(RULE_LB, 'for_time', 'lb', NO_LAST)).toBe('First time logging this.');
  });

  it("a carry with no rule: last time's sets, distance and load", () => {
    expect(sentence(null, 'weighted_distance', 'lb', last({ sets: 3, weight: 315, weightUnit: 'lb', distance: 50, distanceUnit: 'ft' }))).toBe(
      'No rule here. Last time: 3 × 50 ft at 315 lb.',
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

  it('bodyweight_plus planned at 0 added load reads "bodyweight"; the raise stays a weight (R75)', () => {
    const dip = (over: Partial<ReadArgs>) =>
      read({
        rule: { ...RULE_LB, repMax: 10 },
        loggingType: 'bodyweight_plus',
        equipment: 'bodyweight',
        planned: { weight: 0, unit: 'lb' },
        ...over,
      });
    expect(dip({})).toBe('Hit 10s on a normal day and next time is 5 lb.');
    expect(dip({ mark: 'sick' })).toBe('Hit 10s on a normal day and next time is 5 lb. Sick today, so bodyweight holds.');
    expect(dip({ override: { weight: 10, unit: 'lb' } })).toBe('Today is set to 10 lb by you. The rule still says bodyweight.');
    expect(dip({ override: { weight: 10, unit: 'lb' }, mark: 'pain' })).toBe('Today is set to 10 lb by you. Pain today, so bodyweight holds.');
    expect(dip({ rule: RULE_KG, planned: { weight: 0, unit: 'kg' }, mark: 'cutting' })).toBe(
      'Hit 8s on a normal day and next time is 2.5 kg. Cutting today, so bodyweight holds.',
    );
    // Above 0 it is a weight again.
    expect(dip({ planned: { weight: 5, unit: 'lb' }, mark: 'sick' })).toBe('Hit 10s on a normal day and next time is 10 lb. Sick today, so 5 lb holds.');
  });

  it('a plan of 0 on any other type still says its weight', () => {
    expect(read({ loggingType: 'assisted', equipment: 'machine', planned: { weight: 0, unit: 'lb' }, mark: 'sick' })).toBe(
      'Hit 8s on a normal day and next time is 0 lb. Sick today, so 0 lb holds.',
    );
  });

  it('no read for timed, distance_time, the two scores, increment 0 or no rule', () => {
    expect(read({ loggingType: 'timed', rule: RULE_TIME })).toBeNull();
    expect(read({ loggingType: 'distance_time' })).toBeNull();
    expect(read({ loggingType: 'rounds' })).toBeNull();
    expect(read({ loggingType: 'for_time' })).toBeNull();
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

  it("keeps an AMRAP score's extra reps", () => {
    expect(lastSummary([prev(0, { reps: 6, extraReps: 4 })])).toMatchObject({ sets: 1, reps: 6, extraReps: 4 });
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
    workoutExerciseId: 'we1',
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
      workoutExerciseId: 'we1',
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

  it('bodyweight_plus at 0 added load holds at bodyweight, with the reason when flagged; a raise reads as usual (R75)', () => {
    const dip = (outcome: NextTime['outcome'], nextWeight: number, mark: ExerciseMark | null = null, nextUnit: WeightUnit = 'lb'): NextTime => ({
      workoutExerciseId: 'we1',
      name: 'Dip',
      loggingType: 'bodyweight_plus',
      outcome,
      nextWeight,
      nextUnit,
      mark,
    });
    expect(finishLine(dip('held', 0))).toBe('Dip — holds at bodyweight');
    expect(finishLine(dip('held', 0, null, 'kg'))).toBe('Dip — holds at bodyweight');
    expect(finishLine(dip('held_marked', 0, 'sick'))).toBe('Dip — holds at bodyweight · Sick');
    expect(finishLine(dip('no_sets', 0))).toBe('Dip — holds at bodyweight');
    expect(finishLine(dip('raised', 5))).toBe('Dip — next time 5 lb ↑');
    expect(finishLine(dip('held', 10))).toBe('Dip — holds at 10 lb');
  });

  it('a 0 load on any other type still says its weight', () => {
    expect(finishLine(bench('held', 0))).toBe('Bench press — holds at 0 lb');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The rule's words for every program slot (spec §18.29, R610–R622, R626).

describe('the rule line of a program slot (R610–R622), word for word', () => {
  /** A plain load slot of an Intermediate program: 2 misses to a reset, 10% down. */
  const program = (over: Partial<ProgramRule> = {}): ProgramRule => ({
    kind: 'load',
    carryUnit: null,
    sessionsToRaise: 1,
    halved: false,
    missesBefore: 0,
    missesToReset: 2,
    resetMultiplier: 0.9,
    week: 3,
    weekInfo: null,
    sets: 3,
    rung: null,
    rungs: null,
    addSet: null,
    weekly: null,
    metconText: null,
    manualText: null,
    ...over,
  });
  const line = (p: ProgramRule, rule: Rule | null, loggingType: LoggingType = 'weighted', last: LastSummary | null = null, unit: WeightUnit = 'lb') =>
    programRuleSentence({ program: p, rule, loggingType, unit, last });
  const read = (
    p: ProgramRule,
    rule: Rule | null,
    planned: number | null,
    extra: { loggingType?: LoggingType; mark?: ExerciseMark | null; last?: LastSummary | null; equipment?: Equipment } = {},
  ) =>
    programTodaysRead({
      program: p,
      rule,
      loggingType: extra.loggingType ?? 'weighted',
      planned: planned === null ? null : { weight: planned, unit: 'lb' },
      override: null,
      mark: extra.mark ?? null,
      equipment: extra.equipment ?? 'dumbbell',
      gear: LB_GEAR,
      last: extra.last ?? null,
    });

  it('load, after the first miss: the halved increment, and why', () => {
    expect(line(program({ halved: true }), { ...RULE_LB, increment: 2.5 })).toBe(
      'If every working set hits 8 on a normal day, add 2.5 lb (halved after the first miss). A marked day holds the weight.',
    );
  });

  describe('a raise the plates you own cannot load (ruling R-w2)', () => {
    const loadLine = (p: ProgramRule, rule: Rule, planned: number | null, equipment: Equipment = 'barbell', gear: Gear = LB_GEAR, loggingType: LoggingType = 'weighted') =>
      programRuleSentence({
        program: p,
        rule,
        loggingType,
        unit: 'lb',
        last: null,
        load: { planned: planned === null ? null : { weight: planned, unit: 'lb' }, equipment, gear },
      });
    const HALVED: Rule = { ...RULE_LB, increment: 2.5 };

    it('says what will load and why, and its number is the read\'s next weight', () => {
      expect(loadLine(program({ halved: true }), HALVED, 135)).toBe(
        'If every working set hits 8 on a normal day, add 2.5 lb (halved after the first miss). ' +
          'Your plates make 140 lb; add 1.25 lb plates in Settings to load 137.5 lb. A marked day holds the weight.',
      );
      expect(read(program({ halved: true }), HALVED, 135, { equipment: 'barbell' })).toBe('Hit 8s on a normal day and next time is 140 lb.');
    });

    it('adds nothing when the plates load the raise, off a barbell, or with no plan yet', () => {
      const withFractions: Gear = { bar: 45, plates: { ...LB_GEAR.plates, '1.25': 1 } };
      const plain = 'If every working set hits 8 on a normal day, add 2.5 lb (halved after the first miss). A marked day holds the weight.';
      expect(loadLine(program({ halved: true }), HALVED, 135, 'barbell', withFractions)).toBe(plain);
      expect(loadLine(program({ halved: true }), HALVED, 135, 'dumbbell')).toBe(plain);
      expect(loadLine(program({ halved: true }), HALVED, null)).toBe(plain);
      expect(loadLine(program(), RULE_LB, 135)).toBe('If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.');
    });
  });

  it('load before any miss reads as the rule always has', () => {
    expect(line(program(), RULE_LB)).toBe('If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.');
  });

  it("today's read warns before a reset", () => {
    expect(read(program({ missesBefore: 1 }), RULE_LB, 135)).toBe(
      'Hit 8s on a normal day and next time is 140 lb. One miss so far. One more and next time drops 10%.',
    );
    expect(read(program({ missesBefore: 1, missesToReset: 3 }), RULE_LB, 135)).toBe(
      'Hit 8s on a normal day and next time is 140 lb. One miss so far. Two more and next time drops 10%.',
    );
    expect(read(program({ missesBefore: 2, missesToReset: 3, resetMultiplier: 0.95 }), RULE_LB, 135)).toBe(
      'Hit 8s on a normal day and next time is 140 lb. Two misses so far. One more and next time drops 5%.',
    );
  });

  it('a marked day says nothing about misses: it is never one', () => {
    expect(read(program({ missesBefore: 1 }), RULE_LB, 135, { mark: 'rough_sleep' })).toBe(
      'Hit 8s on a normal day and next time is 140 lb. Rough sleep today, so 135 lb holds.',
    );
  });

  it('a carry says the distance and its unit, and that a marked day holds the weight', () => {
    const yoke = program({ carryUnit: 'ft' });
    const rule: Rule = { setCount: 4, repMin: 50, repMax: 50, increment: 10, incrementUnit: 'lb' };
    expect(line(yoke, rule, 'weighted_distance')).toBe('If every run covers 50 ft on a normal day, add 10 lb. A marked day holds the weight.');
    expect(read(yoke, rule, 320, { loggingType: 'weighted_distance', equipment: 'other' })).toBe(
      'Cover 50 ft on every run on a normal day and next time is 330 lb.',
    );
  });

  it('weight and time says seconds as "45 s" (#8 Farmer\'s carry)', () => {
    const rule: Rule = { setCount: 3, repMin: 30, repMax: 45, increment: 8, incrementUnit: 'lb' };
    expect(line(program(), rule, 'weighted_time')).toBe('If every working set reaches 45 s on a normal day, add 8 lb. A marked day holds the weight.');
    expect(read(program(), rule, 50, { loggingType: 'weighted_time' })).toBe('Reach 45 s on a normal day and next time is 58 lb.');
  });

  it('two normal days in a row raise the Atlas stone (R623)', () => {
    const stone = program({ sessionsToRaise: 2 });
    const rule: Rule = { setCount: 5, repMin: 1, repMax: 1, increment: 10, incrementUnit: 'lb' };
    expect(line(stone, rule)).toBe('If every working set hits 1 on two normal days in a row, add 10 lb. A marked day holds the weight.');
    expect(read(stone, rule, 200, { equipment: 'other' })).toBe('Do every single on two normal days in a row and the weight goes to 210 lb.');
    expect(read(stone, { ...rule, repMax: 3 }, 200, { equipment: 'other' })).toBe('Hit 3 on every set on two normal days in a row and the weight goes to 210 lb.');
  });

  it('a holding week: the week holds the weight, with no read', () => {
    const deload = program({ weekInfo: { week: 10, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' } });
    expect(line(deload, { ...RULE_LB, setCount: 2 })).toBe('Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
    expect(read(deload, RULE_LB, 135)).toBeNull();
  });

  it('a note week runs the normal rule', () => {
    const build = program({ weekInfo: { week: 1, kind: 'note', halfSets: false, holds: false, runShare: 1, note: 'Base: events at moderate loads.' } });
    expect(line(build, RULE_LB)).toBe('If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.');
  });

  /** #3's Pull-up ladder: the six rungs, the last a weighted pull-up. */
  const PULL_UP_RUNGS: RungWords[] = [
    { name: 'Scapular pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
    { name: 'Arch hang', timed: true, repMin: 10, repMax: 30, weighted: false },
    { name: 'Negative pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
    { name: 'Band-assisted pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
    { name: 'Pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
    { name: 'Weighted pull-up', timed: false, repMin: 5, repMax: 8, weighted: true },
  ];
  const ladder = (rung: number, rungs: RungWords[] = PULL_UP_RUNGS) => program({ kind: 'ladder', rung, rungs });
  const LADDER_RULE: Rule = { setCount: 3, repMin: 5, repMax: 8, increment: 0, incrementUnit: 'lb' };

  it('a ladder names its rung and the next one', () => {
    expect(line(ladder(4), LADDER_RULE, 'bodyweight_plus')).toBe(
      'Rung 5 of 6: Pull-up. Hit 8 on every set on a normal day and next time is Weighted pull-up at 3 × 5.',
    );
    expect(line(ladder(0), LADDER_RULE, 'bodyweight_plus')).toBe(
      'Rung 1 of 6: Scapular pull-up. Hit 8 on every set on a normal day and next time is Arch hang at 3 × 10 s.',
    );
    expect(line(ladder(1), { ...LADDER_RULE, repMin: 10, repMax: 30 }, 'timed')).toBe(
      'Rung 2 of 6: Arch hang. Hold 30 s on every set on a normal day and next time is Negative pull-up at 3 × 5.',
    );
  });

  it('a weighted top rung runs the load rule with its increment', () => {
    expect(line(ladder(5), { ...LADDER_RULE, increment: 5 }, 'bodyweight_plus')).toBe(
      'Rung 6 of 6: Weighted pull-up. If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.',
    );
    expect(read(ladder(5), { ...LADDER_RULE, increment: 5 }, null, { loggingType: 'bodyweight_plus' })).toBe(
      'Pick a starting weight. Next time builds from it.',
    );
    expect(read(ladder(4), LADDER_RULE, null, { loggingType: 'bodyweight_plus' })).toBeNull();
    expect(read({ ...ladder(5), missesBefore: 1 }, { ...LADDER_RULE, increment: 5 }, 10, { loggingType: 'bodyweight_plus' })).toBe(
      'Hit 8s on a normal day and next time is 15 lb. One miss so far. One more and next time drops 10%.',
    );
  });

  it('a top rung with no weighted step keeps adding reps', () => {
    const lever = [
      { name: 'Tuck front lever', timed: true, repMin: 10, repMax: 20, weighted: false },
      { name: 'Front lever', timed: true, repMin: 5, repMax: 15, weighted: false },
    ];
    const pushUps = [
      { name: 'Push-up', timed: false, repMin: 8, repMax: 15, weighted: false },
      { name: 'Archer push-up', timed: false, repMin: 8, repMax: 15, weighted: false },
    ];
    expect(line(ladder(1, pushUps), LADDER_RULE, 'bodyweight_plus')).toBe('Rung 2 of 2: Archer push-up. Top rung. Keep adding reps.');
    expect(line(ladder(1, lever), LADDER_RULE, 'timed')).toBe('Rung 2 of 2: Front lever. Top rung. Keep adding time.');
  });

  it('a hold adds 5 s a session, and the read suggests last time plus the step', () => {
    const plank = program({ kind: 'hold' });
    const rule: Rule = { setCount: 3, repMin: 30, repMax: 60, increment: 0, incrementUnit: 'lb' };
    const last = (s: number): LastSummary => ({ sets: 3, reps: null, weight: null, weightUnit: null, durationS: s, distance: null, distanceUnit: null });
    expect(line(plank, rule, 'timed')).toBe('Add 5 s a session up to 60 s.');
    expect(read(plank, rule, null, { loggingType: 'timed', last: last(40) })).toBe('Last time 40 s. Try 45 s today.');
    expect(read(plank, rule, null, { loggingType: 'timed', last: last(58) })).toBe('Last time 58 s. Try 60 s today.');
    expect(read(plank, rule, null, { loggingType: 'timed', last: last(60) })).toBe('Last time 60 s, the top. Stay at 60 s.');
    expect(read(plank, rule, null, { loggingType: 'timed' })).toBeNull();
  });

  it('reps only, or no increment, over a weight column: beat the reps, weight only if you want it', () => {
    const optional = "Beat last time's reps. Add weight only if you want to.";
    expect(line(program({ kind: 'reps_only' }), { ...RULE_LB, increment: 0 }, 'bodyweight_plus')).toBe(optional);
    expect(line(program({ kind: 'reps_only' }), { ...RULE_LB, increment: 0 }, 'weighted')).toBe(optional);
    expect(line(program(), { ...RULE_LB, increment: 0 }, 'bodyweight_plus')).toBe(optional);
    expect(line(program({ kind: 'reps_only' }), { ...RULE_LB, increment: 0 }, 'timed')).toBe("No weight to add. Beat last time's reps.");
  });

  it('runs follow the week (R620)', () => {
    const easy = program({ kind: 'weekly_seconds', weekly: { kind: 'seconds', startS: 1500, stepS: 120, capS: 2400 } });
    const at = (seconds: number, sets = 1): Rule => ({ setCount: sets, repMin: seconds, repMax: seconds, increment: 0, incrementUnit: 'lb' });
    expect(line(easy, at(1740), 'timed')).toBe('Week 3: 29:00. Adds 2:00 a week up to 40:00.');
    const lighter = { ...easy, week: 4, weekInfo: { week: 4, kind: 'lighter' as const, halfSets: true, holds: true, runShare: 0.6, note: '' } };
    expect(line(lighter, at(1116), 'timed')).toBe("Week 4: 18:36. That's 60% on this lighter week. Adds 2:00 a week up to 40:00.");
    const intervals = program({ kind: 'weekly_seconds', weekly: { kind: 'sets_then_seconds', startSets: 6, capSets: 8, seconds: 180, stepS: 15 } });
    expect(line(intervals, at(180, 8), 'timed')).toBe('Week 3: 8 × 3:00. Adds a set a week up to 8, then 15 s a set.');
    expect(line(program({ kind: 'weekly_seconds', weekly: { kind: 'fixed' } }), at(600), 'timed')).toBe('10:00, the same every week.');
  });

  it('a metcon names its format and elements (R622), then last time', () => {
    const metcon = program({ kind: 'metcon', metconText: 'AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run' });
    const rule: Rule = { setCount: 1, repMin: 4, repMax: 7, increment: 0, incrementUnit: 'lb' };
    expect(line(metcon, rule, 'rounds')).toBe(
      'AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run. Beat your score twice in a row, then go heavier or take the next scaling step.',
    );
    const last: LastSummary = { sets: 1, reps: 6, weight: null, weightUnit: null, durationS: null, distance: null, distanceUnit: null, extraReps: 4 };
    expect(read(metcon, rule, null, { loggingType: 'rounds', last })).toBe('Last time: 6 + 4.');
    expect(read(metcon, rule, null, { loggingType: 'rounds' })).toBeNull();
  });

  it("a manual rule is the documents' words, the weight the lifter's", () => {
    const manual = program({ kind: 'manual', manualText: 'Reps, then bigger range or +2.5 lb' });
    const rule: Rule = { setCount: 2, repMin: 6, repMax: 10, increment: 0, incrementUnit: 'lb' };
    expect(line(manual, rule, 'bodyweight_plus')).toBe('Reps, then bigger range or +2.5 lb.');
    expect(line({ ...manual, manualText: 'Top of the range on every set: lower the rings.' }, rule, 'bodyweight_plus')).toBe(
      'Top of the range on every set: lower the rings.',
    );
    expect(read(manual, rule, 20)).toBeNull();
  });

  it('added sets (R619): a set a session to the cap, then heavier or longer', () => {
    const abc = program({ kind: 'add_set', addSet: { capSets: 8, then: { kind: 'load', lb: 8, backToSets: 5 } } });
    expect(line(abc, { setCount: 5, repMin: 2, repMax: 2, increment: 4, incrementUnit: 'kg' }, 'weighted', null, 'kg')).toBe(
      'Every set done on a normal day adds a set next time, up to 8. Then 4 kg heavier and back to 5 sets.',
    );
    const bike = program({ kind: 'add_set', addSet: { capSets: 8, then: { kind: 'seconds', step: 5 } } });
    expect(line(bike, { setCount: 6, repMin: 30, repMax: 30, increment: 0, incrementUnit: 'lb' }, 'timed')).toBe(
      'Every set done on a normal day adds a set next time, up to 8. Then 5 s more a set each time.',
    );
    expect(read(abc, { setCount: 5, repMin: 2, repMax: 2, increment: 8, incrementUnit: 'lb' }, null)).toBe('Pick a starting weight. Next time builds from it.');
    expect(read(abc, { setCount: 5, repMin: 2, repMax: 2, increment: 8, incrementUnit: 'lb' }, 35)).toBeNull();
  });

  it('never says the app notices or decides an off day, and has no exclamation marks', () => {
    const all = [
      line(program({ halved: true }), RULE_LB),
      read(program({ missesBefore: 1 }), RULE_LB, 135) ?? '',
      line(program({ weekInfo: { week: 10, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' } }), RULE_LB),
    ].join(' ');
    expect(all).not.toMatch(/notice|detect|decide|!|’/i);
  });
});

describe('the week line (R616, R617, Appendix D)', () => {
  const week = (kind: ProgramWeek['kind'], note = '', extra: Partial<ProgramWeek> = {}): ProgramWeek => ({
    week: 10,
    kind,
    halfSets: kind === 'deload' || kind === 'lighter' || kind === 'taper' || kind === 'transition',
    holds: kind !== 'note',
    runShare: 1,
    note,
    ...extra,
  });

  it('an empty note is worded by kind', () => {
    expect(weekLine(week('deload'))).toBe('Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
    expect(weekLine(week('lighter', '', { runShare: 0.6 }))).toBe(
      'Lighter week: half the sets, same weight, runs at 60% of the time. Nothing goes up or counts as a miss.',
    );
  });

  /** A program's own special week, as the documents give it (Appendix D). */
  const planWeek = (number: number, week: number) => PROGRAMS.find((p) => p.number === number)!.weekPlan.find((w) => w.week === week)!;
  const NOTHING = 'Nothing goes up or counts as a miss.';

  it('#12 test week: its note, never "same weight"', () => {
    expect(weekLine(planWeek(12, 6))).toBe(`Test week: work up to a single on squat, bench and deadlift. Skip the accessories. ${NOTHING}`);
    expect(weekLine(planWeek(12, 5))).toBe(`Taper: half the sets, top sets at full weight. ${NOTHING}`);
  });

  it('#19 taper and mock meet: their notes, never "same weight"', () => {
    expect(weekLine(planWeek(19, 11))).toBe(`Taper: events at 60–70% of contest weight. ${NOTHING}`);
    expect(weekLine(planWeek(19, 9))).toBe(
      `Mock meet: a 4–5-event medley at near-contest weights on Thursday and Saturday, 15–20 min between events. ${NOTHING}`,
    );
    expect(weekLine(planWeek(19, 12))).toBe(`Meet week: light gym work early in the week, nothing heavy in the last 7–10 days. ${NOTHING}`);
  });

  it('#20 week 12: the lighter week with its note, never "same weight"', () => {
    expect(weekLine(planWeek(20, 12))).toBe(
      `Lighter week: half the sets, runs at 60% of the time. Finish with a 5 km time trial and a rep-max test on the main lifts. ${NOTHING}`,
    );
    expect(weekLine(planWeek(20, 4))).toBe(`Lighter week: half the sets, same weight, runs at 60% of the time. ${NOTHING}`);
  });

  it('a slot on such a week says the same as the week (R617)', () => {
    const base = { kind: 'load' as const, carryUnit: null, sessionsToRaise: 1 as const, halved: false, missesBefore: 0, missesToReset: 2, resetMultiplier: 0.9, week: 6, sets: 3, rung: null, rungs: null, addSet: null, weekly: null, metconText: null, manualText: null };
    const slot = programRuleSentence({ program: { ...base, weekInfo: planWeek(12, 6) }, rule: RULE_LB, loggingType: 'weighted', unit: 'lb', last: null });
    expect(slot).toBe(weekLine(planWeek(12, 6)));
    expect(slot).not.toContain('same weight');
  });

  it('a note week is its note; a normal week has none', () => {
    expect(weekLine(week('note', 'Base: events at moderate loads.'))).toBe('Base: events at moderate loads.');
    expect(weekLine(null)).toBeNull();
  });
});

describe("Change rung's note on the program's page (R618)", () => {
  const rung = (name: string, weighted = false): RungWords => ({ name, timed: false, repMin: 5, repMax: 8, weighted });

  it('a bodyweight ladder starts at the bottom of its range, with no weight to speak of', () => {
    expect(changeRungNote([rung('Push-up'), rung('Archer push-up')])).toBe('Changes it from the next workout. It starts at the bottom of its range.');
  });

  it('a ladder with a weighted top rung says that rung starts its weight fresh', () => {
    expect(changeRungNote([rung('Pull-up'), rung('Weighted pull-up', true)])).toBe(
      "Changes it from the next workout. It starts at the bottom of its range; a weighted rung's weight starts fresh.",
    );
  });
});

describe('the warm-up line and slot notes (R626, R606)', () => {
  it('is the spec text', () => {
    expect(WARM_UP_LINE).toBe(
      '5 min easy cardio or dynamic prep, then about 40% × 8, 60% × 5, 80% × 3 before work sets. One light feeder set before each later compound.',
    );
  });

  it('shows the appendix notes as "(Change rung lists them)" (ruling R-t2c)', () => {
    expect(slotNoteText('Pull-up ladder. Start rung: hardest you can do for 3×5 (see Appendix A)', 'Pull-up ladder', 'ladder')).toBe(
      'Pull-up ladder. Start rung: hardest you can do for 3×5 (Change rung lists them)',
    );
    expect(slotNoteText('Push-up ladder (hypertrophy range). Push-up → decline → deficit → archer (Appendix A)', 'x', 'ladder')).toBe(
      'Push-up ladder (hypertrophy range). Push-up → decline → deficit → archer (Change rung lists them)',
    );
  });

  it("a metcon's note drops the format the rule line already says", () => {
    expect(
      slotNoteText(
        "Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run. Short-to-medium time domain; alternates: 'Cindy' scaled",
        'Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run',
        'metcon',
      ),
    ).toBe("Short-to-medium time domain; alternates: 'Cindy' scaled");
    expect(slotNoteText('Metcon B · x', 'Metcon B · x', 'metcon')).toBeNull();
  });

  it('an empty note is none; the program name stays as the note (R606)', () => {
    expect(slotNoteText('', 'Plank', 'hold')).toBeNull();
    expect(slotNoteText('Log clean and press. Clean every rep', 'Log clean and press', 'load')).toBe('Log clean and press. Clean every rep');
  });

  it('metconText drops the "Metcon A ·" label', () => {
    expect(metconText('Metcon A · AMRAP 10 min: 10 goblet squats')).toBe('AMRAP 10 min: 10 goblet squats');
    expect(metconText('Metcon · 21-15-9 for time: thrusters')).toBe('21-15-9 for time: thrusters');
  });

  it('a weighted rung reads "Weighted …"', () => {
    expect(rungName('Pull-up', true)).toBe('Weighted pull-up');
    // A name that starts with a proper adjective keeps it, said once.
    expect(rungName('Bulgarian split squat', true)).toBe('Bulgarian split squat with weight');
    expect(rungName('Natural glute ham raise', true)).toBe('Weighted natural glute ham raise');
    expect(rungName('Pull-up', false)).toBe('Pull-up');
  });
});

describe('the finish words of a program slot (R613, R617, R618, R619, R622)', () => {
  const squat = (outcome: NextTime['outcome'], nextWeight: number, extra: Partial<NextTime> = {}): NextTime => ({
    workoutExerciseId: 'we1',
    name: 'Barbell back squat',
    loggingType: 'weighted',
    outcome,
    nextWeight,
    nextUnit: 'lb',
    mark: null,
    ...extra,
  });

  it("a reset points down, and says why in the rule's words", () => {
    expect(finishLine(squat('reset', 160))).toBe('Barbell back squat — next time 160 lb ↓');
    expect(resetWhy(2, 0.9, 160, 'lb')).toBe('Missed the bottom of the range 2 times in a row, so next time drops 10% to 160 lb.');
    expect(resetWhy(3, 0.95, 285, 'lb')).toBe('Missed the bottom of the range 3 times in a row, so next time drops 5% to 285 lb.');
  });

  it('a holding week names the week', () => {
    expect(finishLine(squat('held_week', 135, { weekKind: 'deload' }))).toBe('Barbell back squat — holds at 135 lb · Deload week');
    expect(finishLine(squat('held_week', 135))).toBe('Barbell back squat — holds at 135 lb');
  });

  it('ladder moves, added sets, longer intervals and metcon scores', () => {
    expect(ladderMoveLine('Pull-up', 'Weighted pull-up', 5, 6, 'up')).toBe('Pull-up — next time Weighted pull-up, rung 6 of 6 ↑');
    expect(ladderMoveLine('Negative pull-up', 'Arch hang', 1, 6, 'down')).toBe('Negative pull-up — next time back to Arch hang, rung 2 of 6');
    expect(LADDER_DOWN_WHY).toBe('Under 5 reps on two normal days in a row, so back one rung.');
    expect(addSetLine('Armor Building Complex', 6)).toBe('Armor Building Complex — next time 6 sets ↑');
    expect(secondsUpLine('Bike intervals', 35)).toBe('Bike intervals — next time 35 s a set ↑');
    expect(BEAT_TWICE).toBe('You beat your score twice in a row.');
  });
});

describe('a program note in the session (design gate #17, #20, #24; ruling R-g4)', () => {
  it('says loads in the session unit, rounded to 0.5 kg', () => {
    expect(sessionNoteText('Weeks 1–2: empty bar to 75 lb', 'kg')).toBe('Weeks 1–2: empty bar to 34 kg');
    expect(sessionNoteText('Weeks 1–2: empty bar to 75 lb', 'lb')).toBe('Weeks 1–2: empty bar to 75 lb');
  });

  it('says a minute or more as a clock, as the format line does', () => {
    expect(sessionNoteText('Hard (about 5 km pace) with 120 s easy jog between', 'lb')).toBe('Hard (about 5 km pace) with 2:00 easy jog between');
    expect(sessionNoteText('Finisher: 30 s hard / 90 s easy', 'lb')).toBe('Finisher: 30 s hard / 1:30 easy');
  });

  it('writes number ranges with an en dash, never a rep scheme', () => {
    expect(sessionNoteText('Barbell back squat (top set). RPE 8-9; 3-5 min rest after', 'lb')).toBe('Barbell back squat (top set). RPE 8–9; 3–5 min rest after');
    expect(sessionNoteText('Pause 1-2 s at the top', 'lb')).toBe('Pause 1–2 s at the top');
    expect(sessionNoteText('21-15-9 for time', 'lb')).toBe('21-15-9 for time');
  });
});

describe("a run slot's name (ruling R-g4, design gate #20)", () => {
  it('names the easy runs either side of the work by what they are, and drops a note that only said so', () => {
    expect(slotName('Easy run', 'Warm-up jog plus 4 strides')).toEqual({ name: 'Warm-up run', note: 'Warm-up jog plus 4 strides' });
    expect(slotName('Easy run', 'Warm-up')).toEqual({ name: 'Warm-up run', note: null });
    expect(slotName('Easy run', 'Cool-down')).toEqual({ name: 'Cool-down run', note: null });
  });

  it('leaves every other slot as it is', () => {
    expect(slotName('Easy run', 'After lifting, or 3+ hours later')).toEqual({ name: 'Easy run', note: 'After lifting, or 3+ hours later' });
    expect(slotName('Barbell back squat', 'Warm-up sets first')).toEqual({ name: 'Barbell back squat', note: 'Warm-up sets first' });
    expect(slotName('Easy run', null)).toEqual({ name: 'Easy run', note: null });
  });
});
