import type { Gear } from './plates';
import { computeOutcome, isAllHit, raiseLoadable, type OutcomeInput } from './progression';
import type { WeightUnit } from './types';

/** The default bars and plate sets (pairs owned) from settings. */
const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };
const KG_GEAR: Gear = { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } };
/** A bar with no plates: nothing heavier than the bar can be loaded. */
const BARE_LB: Gear = { bar: 45, plates: {} };

type TestSet = OutcomeInput['sets'][number];

/** A done working set. */
function set(weight: number | null, weightUnit: WeightUnit | null, reps: number | null, more: Partial<TestSet> = {}): TestSet {
  return { setType: 'working', done: true, weight, weightUnit, reps, durationS: null, ...more };
}
const lb = (weight: number, reps: number, more?: Partial<TestSet>) => set(weight, 'lb', reps, more);
const kg = (weight: number, reps: number, more?: Partial<TestSet>) => set(weight, 'kg', reps, more);

/** 3 sets of 6–8, add 5 lb. */
const RULE: NonNullable<OutcomeInput['rule']> = { setCount: 3, repMin: 6, repMax: 8, increment: 5, incrementUnit: 'lb' };

function input(over: Partial<OutcomeInput>): OutcomeInput {
  return {
    rule: RULE,
    plannedWeight: 135,
    plannedUnit: 'lb',
    loggingType: 'weighted',
    equipment: 'dumbbell',
    marked: false,
    sets: [],
    gear: { lb: LB_GEAR, kg: KG_GEAR },
    ...over,
  };
}

const ALL_HIT_135 = [lb(135, 8), lb(135, 9), lb(135, 8)];

describe('computeOutcome', () => {
  describe('no rule and no sets (steps 2–3)', () => {
    it('without a rule gives no_rule and no next weight, but still computes the working weight', () => {
      expect(computeOutcome(input({ rule: null, sets: [lb(135, 8), lb(130, 8)] }))).toEqual({
        workingWeight: 130, workingUnit: 'lb', outcome: 'no_rule', nextWeight: null, nextUnit: null, missed: false,
      });
    });

    it('gives timed and distance_time no_rule with a null working weight, even with a rule', () => {
      const timed = input({ loggingType: 'timed', sets: [set(null, null, null, { durationS: 60 })] });
      const distance = input({ loggingType: 'distance_time', sets: [set(null, null, null, { durationS: 600 })] });
      const expected = { workingWeight: null, workingUnit: null, outcome: 'no_rule', nextWeight: null, nextUnit: null, missed: false };
      expect(computeOutcome(timed)).toEqual(expected);
      expect(computeOutcome(distance)).toEqual(expected);
    });

    it('with a rule and no counted sets gives no_sets and keeps the planned weight', () => {
      const sets = [lb(95, 5, { setType: 'warmup' }), lb(135, 8, { done: false })];
      expect(computeOutcome(input({ sets }))).toEqual({
        workingWeight: null, workingUnit: null, outcome: 'no_sets', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
      expect(computeOutcome(input({ sets: [], plannedWeight: 60, plannedUnit: 'kg' }))).toEqual({
        workingWeight: null, workingUnit: null, outcome: 'no_sets', nextWeight: 60, nextUnit: 'kg', missed: false,
      });
    });
  });

  describe('a normal day (steps 4, 6, 7)', () => {
    it('raises 3×8 at 135 lb, every set at or above rep_max 8, by 5 lb to 140 lb', () => {
      expect(computeOutcome(input({ sets: ALL_HIT_135 }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', missed: false,
      });
    });

    it('holds at 135 lb when one set is short of rep_max', () => {
      expect(computeOutcome(input({ sets: [lb(135, 8), lb(135, 7), lb(135, 8)] }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'held', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
    });

    it('holds when fewer sets were counted than set_count', () => {
      expect(computeOutcome(input({ sets: [lb(135, 8), lb(135, 8)] }))).toMatchObject({ outcome: 'held', nextWeight: 135 });
    });

    it('holds when the increment is 0, even with every set hit', () => {
      const rule = { ...RULE, increment: 0 };
      expect(computeOutcome(input({ rule, sets: ALL_HIT_135 }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'held', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
    });

    it('works from what was lifted, not the plan', () => {
      expect(computeOutcome(input({ sets: [lb(145, 8), lb(145, 8), lb(145, 8)] }))).toMatchObject({
        workingWeight: 145, outcome: 'raised', nextWeight: 150,
      });
    });

    it('takes the lowest counted weight as the working weight', () => {
      expect(computeOutcome(input({ sets: [lb(140, 8), lb(135, 8), lb(140, 8)] }))).toMatchObject({
        workingWeight: 135, outcome: 'raised', nextWeight: 140,
      });
    });
  });

  describe('a marked day (step 5)', () => {
    it('holds the planned 135 lb when every set is hit', () => {
      expect(computeOutcome(input({ marked: true, sets: ALL_HIT_135 }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'held_marked', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
    });

    it('holds the planned weight, not what was lifted (an override)', () => {
      expect(computeOutcome(input({ marked: true, sets: [lb(145, 8), lb(145, 8), lb(145, 8)] }))).toEqual({
        workingWeight: 145, workingUnit: 'lb', outcome: 'held_marked', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
    });

    it('holds the working weight when there is no plan yet', () => {
      const sets = [lb(100, 8), lb(100, 8), lb(100, 8)];
      expect(computeOutcome(input({ marked: true, plannedWeight: null, plannedUnit: null, sets }))).toEqual({
        workingWeight: 100, workingUnit: 'lb', outcome: 'held_marked', nextWeight: 100, nextUnit: 'lb', missed: false,
      });
    });

    it('is held_marked when sets were missed too', () => {
      expect(computeOutcome(input({ marked: true, sets: [lb(135, 5)] }))).toMatchObject({
        outcome: 'held_marked', nextWeight: 135, nextUnit: 'lb', missed: false,
      });
    });

    it('keeps the planned unit', () => {
      expect(computeOutcome(input({ marked: true, plannedWeight: 60, plannedUnit: 'kg', sets: ALL_HIT_135 }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'held_marked', nextWeight: 60, nextUnit: 'kg', missed: false,
      });
    });
  });

  describe('barbell rounding (step 6, §7.7)', () => {
    it('raises 135 lb by 5 to 140 with the default lb gear', () => {
      expect(computeOutcome(input({ equipment: 'barbell', sets: ALL_HIT_135 }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', missed: false,
      });
    });

    it('rounds a small raise to the nearest loadable weight heavier than the working weight', () => {
      const rule = { ...RULE, increment: 1 };
      expect(computeOutcome(input({ equipment: 'barbell', rule, sets: ALL_HIT_135 }))).toMatchObject({
        outcome: 'raised', nextWeight: 140, nextUnit: 'lb', missed: false,
      });
    });

    it('raises in kg with the kg plates', () => {
      const rule = { ...RULE, increment: 2.5, incrementUnit: 'kg' as const };
      const sets = [kg(100, 8), kg(100, 8), kg(100, 8)];
      expect(computeOutcome(input({ equipment: 'barbell', rule, sets }))).toEqual({
        workingWeight: 100, workingUnit: 'kg', outcome: 'raised', nextWeight: 102.5, nextUnit: 'kg', missed: false,
      });
      const small = { ...RULE, increment: 1, incrementUnit: 'lb' as const }; // 0.5 kg, rounded up to 62.5
      const at60 = [kg(60, 8), kg(60, 8), kg(60, 8)];
      expect(computeOutcome(input({ equipment: 'barbell', rule: small, sets: at60 }))).toMatchObject({
        outcome: 'raised', nextWeight: 62.5, nextUnit: 'kg', missed: false,
      });
    });

    it('keeps rising by the step above the heaviest loadable total (580 lb)', () => {
      const at = (w: number) => input({ equipment: 'barbell', sets: [lb(w, 8), lb(w, 8), lb(w, 8)] });
      expect(computeOutcome(at(580))).toMatchObject({ outcome: 'raised', nextWeight: 585, nextUnit: 'lb' });
      expect(computeOutcome(at(600))).toMatchObject({ outcome: 'raised', nextWeight: 605, nextUnit: 'lb' });
    });

    it('holds at the working weight when nothing heavier can be loaded', () => {
      const sets = [lb(45, 8), lb(45, 8), lb(45, 8)];
      expect(computeOutcome(input({ equipment: 'barbell', gear: { lb: BARE_LB, kg: KG_GEAR }, sets }))).toEqual({
        workingWeight: 45, workingUnit: 'lb', outcome: 'held', nextWeight: 45, nextUnit: 'lb', missed: false,
      });
    });
  });

  describe('logging types', () => {
    it('takes assistance off for assisted: 40 lb less 10 is 30, and 5 lb less 10 stops at 0', () => {
      const rule = { ...RULE, increment: 10 };
      const assisted = (w: number) =>
        input({ loggingType: 'assisted', equipment: 'machine', rule, sets: [lb(w, 8), lb(w, 8), lb(w, 8)] });
      expect(computeOutcome(assisted(40))).toEqual({
        workingWeight: 40, workingUnit: 'lb', outcome: 'raised', nextWeight: 30, nextUnit: 'lb', missed: false,
      });
      expect(computeOutcome(assisted(5))).toEqual({
        workingWeight: 5, workingUnit: 'lb', outcome: 'raised', nextWeight: 0, nextUnit: 'lb', missed: false,
      });
    });

    it('holds an assisted exercise already at 0 assistance with every set hit: nothing lower (R76)', () => {
      const rule = { ...RULE, increment: 10 };
      const atZero = (unit: WeightUnit) =>
        input({ loggingType: 'assisted', equipment: 'machine', rule, plannedWeight: 0, plannedUnit: unit, sets: [set(0, unit, 8), set(0, unit, 9), set(null, null, 8)] });
      expect(computeOutcome(atZero('lb'))).toEqual({
        workingWeight: 0, workingUnit: 'lb', outcome: 'held', nextWeight: 0, nextUnit: 'lb', missed: false,
      });
      expect(computeOutcome(atZero('kg'))).toEqual({
        workingWeight: 0, workingUnit: 'kg', outcome: 'held', nextWeight: 0, nextUnit: 'kg', missed: false,
      });
    });

    it('rounds less assistance to 2 decimals: 264.6 lb less 10 is 254.6, not 254.60000000000002', () => {
      const rule = { ...RULE, increment: 10 };
      const sets = [lb(264.6, 8), lb(264.6, 8), lb(264.6, 8)];
      expect(computeOutcome(input({ loggingType: 'assisted', equipment: 'machine', rule, sets }))).toMatchObject({
        outcome: 'raised', nextWeight: 254.6, nextUnit: 'lb', missed: false,
      });
    });

    it('takes the highest assistance as the working weight for assisted', () => {
      const rule = { ...RULE, increment: 10 };
      const sets = [lb(30, 8), lb(40, 8), lb(30, 8)];
      expect(computeOutcome(input({ loggingType: 'assisted', equipment: 'machine', rule, sets }))).toMatchObject({
        workingWeight: 40, outcome: 'raised', nextWeight: 30,
      });
    });

    it('checks duration_s against rep_max seconds for weighted_time', () => {
      const rule = { setCount: 3, repMin: 30, repMax: 45, increment: 5, incrementUnit: 'lb' as const };
      const timed = (durations: number[]) =>
        input({
          loggingType: 'weighted_time', rule, plannedWeight: 20,
          sets: durations.map((d) => set(20, 'lb', null, { durationS: d })),
        });
      expect(computeOutcome(timed([45, 50, 45]))).toEqual({
        workingWeight: 20, workingUnit: 'lb', outcome: 'raised', nextWeight: 25, nextUnit: 'lb', missed: false,
      });
      expect(computeOutcome(timed([45, 44, 45]))).toMatchObject({ outcome: 'held', nextWeight: 20 });
    });

    it('counts an empty load as 0 for bodyweight_plus and raises it to the increment', () => {
      const sets = [set(null, null, 8), set(null, null, 10), set(null, null, 8)];
      const firstRun = input({ loggingType: 'bodyweight_plus', equipment: 'bodyweight', plannedWeight: null, plannedUnit: null, sets });
      expect(computeOutcome(firstRun)).toEqual({
        workingWeight: 0, workingUnit: 'lb', outcome: 'raised', nextWeight: 5, nextUnit: 'lb', missed: false,
      });
    });

    it("puts an empty load in the plan's unit, else the first counted set's unit", () => {
      const withPlan = input({
        loggingType: 'bodyweight_plus', equipment: 'bodyweight', plannedWeight: 0, plannedUnit: 'kg',
        sets: [set(null, null, 8), lb(10, 8), set(null, null, 8)],
      });
      expect(computeOutcome(withPlan)).toEqual({
        workingWeight: 0, workingUnit: 'kg', outcome: 'raised', nextWeight: 2.5, nextUnit: 'kg', missed: false,
      });
      const noPlan = input({
        loggingType: 'bodyweight_plus', equipment: 'bodyweight', plannedWeight: null, plannedUnit: null,
        sets: [kg(5, 8), set(null, null, 8), set(null, null, 8)],
      });
      expect(computeOutcome(noPlan)).toMatchObject({ workingWeight: 0, workingUnit: 'kg', nextWeight: 2.5, nextUnit: 'kg' });
    });
  });

  describe('units (R62)', () => {
    it('takes the lower of 60 kg and 135 lb in kg, with its own unit, and converts a 5 lb increment to 2.5 kg', () => {
      const rule = { ...RULE, setCount: 2 };
      const expected = { workingWeight: 60, workingUnit: 'kg', outcome: 'raised', nextWeight: 62.5, nextUnit: 'kg', missed: false };
      expect(computeOutcome(input({ rule, sets: [kg(60, 8), lb(135, 8)] }))).toEqual(expected);
      expect(computeOutcome(input({ rule, sets: [lb(135, 8), kg(60, 8)] }))).toEqual(expected);
    });

    it('treats loads within 0.01 kg as the same and keeps the first', () => {
      const rule = { ...RULE, setCount: 2 };
      // 132.27 lb is 59.997 kg.
      expect(computeOutcome(input({ rule, sets: [kg(60, 8), lb(132.27, 8)] }))).toMatchObject({ workingWeight: 60, workingUnit: 'kg' });
    });

    it('keeps the lb set when it is the lighter one', () => {
      const rule = { ...RULE, setCount: 2 };
      expect(computeOutcome(input({ rule, sets: [kg(62, 8), lb(135, 8)] }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', missed: false,
      });
    });

    it('raises a set logged in kg on an lb plan in kg', () => {
      expect(computeOutcome(input({ sets: [kg(60, 8), kg(60, 8), kg(60, 8)] }))).toEqual({
        workingWeight: 60, workingUnit: 'kg', outcome: 'raised', nextWeight: 62.5, nextUnit: 'kg', missed: false,
      });
    });

    it('converts a kg increment to lb by the gym convention (2.5 kg is 5 lb)', () => {
      const rule = { ...RULE, increment: 2.5, incrementUnit: 'kg' as const };
      expect(computeOutcome(input({ rule, sets: ALL_HIT_135 }))).toMatchObject({ nextWeight: 140, nextUnit: 'lb' });
    });
  });

  describe('counted sets (step 1)', () => {
    it('counts done failure sets and ignores warmups, drops and undone sets', () => {
      const sets = [
        lb(95, 5, { setType: 'warmup' }),
        lb(135, 8),
        lb(135, 8),
        lb(135, 8, { setType: 'failure' }),
        lb(100, 12, { setType: 'drop' }),
        lb(100, 3, { done: false }),
      ];
      expect(computeOutcome(input({ sets }))).toEqual({
        workingWeight: 135, workingUnit: 'lb', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', missed: false,
      });
    });

    it('holds when a failure set falls short', () => {
      const sets = [lb(135, 8), lb(135, 8), lb(135, 6, { setType: 'failure' })];
      expect(computeOutcome(input({ sets }))).toMatchObject({ outcome: 'held', nextWeight: 135 });
    });

    it('does not reach set_count with warmups and drops', () => {
      const sets = [lb(135, 8, { setType: 'warmup' }), lb(135, 8), lb(135, 8), lb(135, 8, { setType: 'drop' })];
      expect(computeOutcome(input({ sets }))).toMatchObject({ outcome: 'held', nextWeight: 135 });
    });
  });
});

describe('raiseLoadable', () => {
  it('keeps a raise that is already loadable', () => {
    expect(raiseLoadable(140, 135, LB_GEAR)).toBe(140);
    expect(raiseLoadable(102.5, 100, KG_GEAR)).toBe(102.5);
  });

  it('takes the nearest loadable weight heavier than the working weight', () => {
    expect(raiseLoadable(136, 135, LB_GEAR)).toBe(140);
    expect(raiseLoadable(60.5, 60, KG_GEAR)).toBe(62.5);
    expect(raiseLoadable(147, 135, LB_GEAR)).toBe(145);
  });

  it('takes the lower weight on a tie', () => {
    expect(raiseLoadable(142.5, 135, LB_GEAR)).toBe(140);
  });

  it('steps by twice the smallest owned plate above the heaviest loadable total', () => {
    expect(raiseLoadable(585, 580, LB_GEAR)).toBe(585);
    expect(raiseLoadable(605, 600, LB_GEAR)).toBe(605);
    expect(raiseLoadable(582.5, 580, LB_GEAR)).toBe(585);
    expect(raiseLoadable(581, 580, LB_GEAR)).toBe(585); // the step nearest 581 is 580, which is not heavier
    expect(raiseLoadable(332.5, 327.5, KG_GEAR)).toBe(332.5);
  });

  it('is null when nothing heavier than the working weight can be loaded', () => {
    expect(raiseLoadable(50, 45, BARE_LB)).toBeNull();
  });

  it('can be the bar alone when the working weight is under the bar', () => {
    expect(raiseLoadable(50, 40, BARE_LB)).toBe(45);
  });
});

describe('computeOutcome for a program slot (§18.29)', () => {
  const MISS_135 = [lb(135, 8), lb(135, 8), lb(135, 5)];
  /** A Beginner program's barbell slot: a reset at 3 misses in a row, to 90%. */
  const beginner = (over: Partial<OutcomeInput>) =>
    input({ equipment: 'barbell', missesToReset: 3, resetMultiplier: 0.9, missesBefore: 0, ...over });

  it('beginner resets on the 3rd miss to 90% rounded down to a loadable barbell weight (135 → 120 with 2.5 lb pairs)', () => {
    expect(computeOutcome(beginner({ sets: MISS_135, missesBefore: 0 }))).toEqual({
      workingWeight: 135, workingUnit: 'lb', outcome: 'held', nextWeight: 135, nextUnit: 'lb', missed: true,
    });
    expect(computeOutcome(beginner({ sets: MISS_135, missesBefore: 1 }))).toMatchObject({ outcome: 'held', nextWeight: 135, missed: true });
    expect(computeOutcome(beginner({ sets: MISS_135, missesBefore: 2 }))).toEqual({
      workingWeight: 135, workingUnit: 'lb', outcome: 'reset', nextWeight: 120, nextUnit: 'lb', missed: true,
    });
  });

  it('intermediate resets on the 2nd', () => {
    const intermediate = (missesBefore: number) => beginner({ missesToReset: 2, missesBefore, sets: [lb(135, 8), lb(135, 8)] });
    expect(computeOutcome(intermediate(0))).toMatchObject({ outcome: 'held', nextWeight: 135, missed: true });
    expect(computeOutcome(intermediate(1))).toMatchObject({ outcome: 'reset', nextWeight: 120, missed: true });
  });

  it('#12 top set uses 95%', () => {
    const topSet = { setCount: 1, repMin: 2, repMax: 3, increment: 5, incrementUnit: 'lb' as const };
    const result = computeOutcome(
      beginner({ rule: topSet, plannedWeight: 300, sets: [lb(300, 1)], missesToReset: 2, missesBefore: 1, resetMultiplier: 0.95 }),
    );
    expect(result).toMatchObject({ outcome: 'reset', nextWeight: 285, missed: true });
  });

  it('rounds a reset off a barbell down to a multiple of the full increment, not the halved one', () => {
    const halved = { ...RULE, increment: 2.5 };
    const sets = [lb(55, 8), lb(55, 5), lb(55, 8)];
    const at = (resetStep?: number) =>
      computeOutcome(input({ rule: halved, plannedWeight: 55, sets, missesToReset: 2, missesBefore: 1, resetStep }));
    expect(at(5)).toMatchObject({ outcome: 'reset', nextWeight: 45, nextUnit: 'lb' });
    expect(at()).toMatchObject({ outcome: 'reset', nextWeight: 47.5, nextUnit: 'lb' });
  });

  it('converts the reset step to the working unit by the gym convention', () => {
    const sets = [kg(55, 8), kg(55, 5), kg(55, 8)];
    const result = computeOutcome(input({ plannedWeight: 55, plannedUnit: 'kg', sets, missesToReset: 2, missesBefore: 1, resetStep: 5 }));
    // 55 × 0.9 = 49.5, down to a multiple of 2.5 kg.
    expect(result).toMatchObject({ outcome: 'reset', nextWeight: 47.5, nextUnit: 'kg' });
  });

  it('held_week keeps the plan and is not a miss', () => {
    expect(computeOutcome(beginner({ week: { holds: true }, sets: MISS_135, missesBefore: 2, plannedWeight: 140 }))).toEqual({
      workingWeight: 135, workingUnit: 'lb', outcome: 'held_week', nextWeight: 140, nextUnit: 'lb', missed: false,
    });
    expect(computeOutcome(beginner({ week: { holds: true }, sets: ALL_HIT_135, plannedWeight: null, plannedUnit: null }))).toMatchObject({
      outcome: 'held_week', nextWeight: 135, nextUnit: 'lb', missed: false,
    });
    expect(computeOutcome(beginner({ week: { holds: true }, sets: [] }))).toMatchObject({ outcome: 'held_week', nextWeight: 135, missed: false });
    // A week that runs the normal rules (a note-only week) changes nothing.
    expect(computeOutcome(beginner({ week: { holds: false }, sets: ALL_HIT_135 }))).toMatchObject({ outcome: 'raised', nextWeight: 140 });
  });

  it('marked is held_marked and not a miss', () => {
    expect(computeOutcome(beginner({ marked: true, sets: MISS_135, missesBefore: 2 }))).toEqual({
      workingWeight: 135, workingUnit: 'lb', outcome: 'held_marked', nextWeight: 135, nextUnit: 'lb', missed: false,
    });
  });

  it('a skipped exercise is no_sets, keeps its plan and is not a miss', () => {
    expect(computeOutcome(beginner({ sets: [], missesBefore: 2 }))).toMatchObject({ outcome: 'no_sets', nextWeight: 135, missed: false });
  });

  it('sessionsToRaise 2 holds after one all-hit session and raises after two', () => {
    const stone = (previousAllHit: boolean) =>
      computeOutcome(input({ sets: ALL_HIT_135, sessionsToRaise: 2, previousAllHit, missesToReset: 2, missesBefore: 0 }));
    expect(stone(false)).toEqual({
      workingWeight: 135, workingUnit: 'lb', outcome: 'held', nextWeight: 135, nextUnit: 'lb', missed: false,
    });
    expect(stone(true)).toMatchObject({ outcome: 'raised', nextWeight: 140, missed: false });
    expect(computeOutcome(input({ sets: ALL_HIT_135, sessionsToRaise: 1 }))).toMatchObject({ outcome: 'raised', nextWeight: 140 });
  });

  it('weighted_distance raises when every set covers the distance', () => {
    const yoke = { setCount: 3, repMin: 40, repMax: 50, increment: 10, incrementUnit: 'lb' as const };
    const run = (distance: number, unit: 'ft' | 'yd' = 'ft') => lb(400, 0, { reps: null, distance, distanceUnit: unit });
    const at = (sets: OutcomeInput['sets']) =>
      computeOutcome(
        input({
          rule: yoke, plannedWeight: 400, loggingType: 'weighted_distance', equipment: 'other', distanceUnit: 'ft',
          sets, missesToReset: 2, missesBefore: 0,
        }),
      );
    expect(at([run(50), run(55), run(50)])).toEqual({
      workingWeight: 400, workingUnit: 'lb', outcome: 'raised', nextWeight: 410, nextUnit: 'lb', missed: false,
    });
    // 17 yd is 51 ft.
    expect(at([run(50), run(17, 'yd'), run(50)])).toMatchObject({ outcome: 'raised', nextWeight: 410 });
    expect(at([run(50), run(45), run(50)])).toMatchObject({ outcome: 'held', nextWeight: 400, missed: false });
    expect(at([run(50), run(30), run(50)])).toMatchObject({ outcome: 'held', nextWeight: 400, missed: true });
  });

  it('a metcon score (rounds, for_time) is no_rule with no working weight (R622)', () => {
    for (const loggingType of ['rounds', 'for_time'] as const) {
      expect(computeOutcome(input({ loggingType, sets: [set(null, null, 6)], missesToReset: 2, missesBefore: 1 }))).toEqual({
        workingWeight: null, workingUnit: null, outcome: 'no_rule', nextWeight: null, nextUnit: null, missed: false,
      });
    }
  });

  it('uses repMinForMiss as the bottom of the range when given', () => {
    expect(computeOutcome(input({ sets: MISS_135, missesToReset: 2, missesBefore: 0, repMinForMiss: 5 }))).toMatchObject({
      outcome: 'held', missed: false,
    });
  });

  it('an assisted slot holds on a miss: more assistance is not a 10% drop', () => {
    const sets = [lb(40, 8), lb(40, 8), lb(40, 3)];
    expect(computeOutcome(input({ loggingType: 'assisted', plannedWeight: 40, sets, missesToReset: 2, missesBefore: 1 }))).toMatchObject({
      outcome: 'held', nextWeight: 40, missed: true,
    });
  });

  it('your own routine never reports a miss or resets (R628)', () => {
    expect(computeOutcome(input({ equipment: 'barbell', sets: MISS_135 }))).toMatchObject({ outcome: 'held', missed: false });
    expect(computeOutcome(input({ equipment: 'barbell', sets: MISS_135, missesBefore: 5 }))).toMatchObject({ outcome: 'held', missed: false });
  });
});

describe('isAllHit', () => {
  it('is every counted set at the top of the range, as the raise reads it', () => {
    expect(isAllHit(input({ sets: ALL_HIT_135 }))).toBe(true);
    expect(isAllHit(input({ sets: [lb(135, 8), lb(135, 7), lb(135, 8)] }))).toBe(false);
    expect(isAllHit(input({ sets: [lb(135, 8), lb(135, 8)] }))).toBe(false);
    expect(isAllHit(input({ rule: null, sets: ALL_HIT_135 }))).toBe(false);
  });
});
