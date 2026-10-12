import { canMoveBlock, hasDoneSets, joinsNextInSuperset, plateTarget, replaceNeedsConfirm, startsSuperset, supersetAction } from './sessionMenu';
import type { Gear } from './plates';
import type { PrevSet } from './setEntry';
import type { Equipment, SetType, WeightUnit } from './types';

const ex = (id: string, supersetGroup: number | null = null) => ({ id, supersetGroup });

describe('supersetAction: the ⋯ menu item (Task 15 Step 2)', () => {
  it('is hidden on the last exercise', () => {
    expect(supersetAction([ex('a'), ex('b')], 'b')).toBe('hidden');
    expect(supersetAction([ex('a')], 'a')).toBe('hidden');
  });

  it('offers "Superset with next" to an exercise that is not linked to the next one', () => {
    expect(supersetAction([ex('a'), ex('b'), ex('c')], 'a')).toBe('add');
    expect(supersetAction([ex('a', 1), ex('b', 1), ex('c')], 'b')).toBe('add');
    expect(supersetAction([ex('a', 1), ex('b', 2)], 'a')).toBe('add');
  });

  it('offers "Remove from superset" to an exercise already linked to the next one', () => {
    expect(supersetAction([ex('a', 1), ex('b', 1), ex('c')], 'a')).toBe('remove');
    expect(supersetAction([ex('a'), ex('b', 3), ex('c', 3)], 'b')).toBe('remove');
  });

  it('is hidden for an unknown id', () => {
    expect(supersetAction([ex('a'), ex('b')], 'zzz')).toBe('hidden');
  });
});

describe('joinsNextInSuperset: where the left bar runs on into the next exercise', () => {
  const list = [ex('a', 1), ex('b', 1), ex('c'), ex('d', 2)];

  it('is true only while the next exercise is in the same superset', () => {
    expect(list.map((e) => joinsNextInSuperset(list, e.id))).toEqual([true, false, false, false]);
  });
});

describe('startsSuperset: the block that carries the "Superset" label (R100)', () => {
  it('is true for the first exercise of each run sharing a superset', () => {
    const list = [ex('a', 1), ex('b', 1), ex('c'), ex('d', 2), ex('e', 2), ex('f', 3), ex('g', 3)];
    expect(list.map((e) => startsSuperset(list, e.id))).toEqual([true, false, false, true, false, true, false]);
  });

  it('is false for an exercise that is not in the list', () => {
    expect(startsSuperset([ex('a', 1)], 'zz')).toBe(false);
  });
});

describe('canMoveBlock: the Reorder arrows', () => {
  const list = [ex('a'), ex('b', 1), ex('c', 1), ex('d')];

  it('cannot move the first block up or the last block down', () => {
    expect(canMoveBlock(list, 'a', 'up')).toBe(false);
    expect(canMoveBlock(list, 'd', 'down')).toBe(false);
  });

  it('can move a single exercise towards the middle', () => {
    expect(canMoveBlock(list, 'a', 'down')).toBe(true);
    expect(canMoveBlock(list, 'd', 'up')).toBe(true);
  });

  it('treats a superset as one block: either member moves it, and both are blocked at the same end', () => {
    expect(canMoveBlock(list, 'b', 'up')).toBe(true);
    expect(canMoveBlock(list, 'c', 'up')).toBe(true);
    expect(canMoveBlock(list, 'b', 'down')).toBe(true);
    expect(canMoveBlock(list, 'c', 'down')).toBe(true);

    const atTop = [ex('b', 1), ex('c', 1), ex('d')];
    expect(canMoveBlock(atTop, 'b', 'up')).toBe(false);
    expect(canMoveBlock(atTop, 'c', 'up')).toBe(false);
    const atBottom = [ex('a'), ex('b', 1), ex('c', 1)];
    expect(canMoveBlock(atBottom, 'b', 'down')).toBe(false);
    expect(canMoveBlock(atBottom, 'c', 'down')).toBe(false);
  });

  it('cannot move an unknown id, or the only exercise', () => {
    expect(canMoveBlock(list, 'zzz', 'up')).toBe(false);
    expect(canMoveBlock([ex('a')], 'a', 'up')).toBe(false);
    expect(canMoveBlock([ex('a')], 'a', 'down')).toBe(false);
  });
});

describe('hasDoneSets: whether Remove asks first', () => {
  it('is true when any set is ticked', () => {
    expect(hasDoneSets({ sets: [{ done: false }, { done: true }] })).toBe(true);
  });

  it('is false with no sets or none ticked', () => {
    expect(hasDoneSets({ sets: [] })).toBe(false);
    expect(hasDoneSets({ sets: [{ done: false }, { done: false }] })).toBe(false);
  });
});

describe('replaceNeedsConfirm: whether Replace asks before opening the picker (R32)', () => {
  it('asks when any set is ticked, because replacing clears them', () => {
    expect(replaceNeedsConfirm({ sets: [{ done: false }, { done: true }] })).toBe(true);
    expect(replaceNeedsConfirm({ sets: [{ done: true }] })).toBe(true);
  });

  it('goes straight to the picker when no set is ticked, or there are no sets', () => {
    expect(replaceNeedsConfirm({ sets: [{ done: false }, { done: false }] })).toBe(false);
    expect(replaceNeedsConfirm({ sets: [] })).toBe(false);
  });

  it('asks exactly when Remove asks', () => {
    for (const sets of [[], [{ done: false }], [{ done: true }], [{ done: false }, { done: true }]]) {
      expect(replaceNeedsConfirm({ sets })).toBe(hasDoneSets({ sets }));
    }
  });
});

describe('plateTarget: the weight the plate calculator starts from (Task 20, R35)', () => {
  type Set = { position: number; setType: SetType; done: boolean; weight: number | null; weightUnit: WeightUnit | null };
  const set = (position: number, done: boolean, weight: number | null, weightUnit: WeightUnit | null = 'lb', setType: SetType = 'working'): Set => ({
    position,
    setType,
    done,
    weight,
    weightUnit,
  });
  const plan = (p: Partial<{ overrideWeight: number; overrideUnit: WeightUnit; plannedWeight: number; plannedUnit: WeightUnit }> = {}) => ({
    overrideWeight: p.overrideWeight ?? null,
    overrideUnit: p.overrideUnit ?? null,
    plannedWeight: p.plannedWeight ?? null,
    plannedUnit: p.plannedUnit ?? null,
  });
  const exercise = (sets: Set[], p = plan(), previous: PrevSet[] = [], equipment: Equipment = 'barbell') => ({ ...p, equipment, sets, previous });
  /** The bar and plates in Settings for each unit, as the set rows round a converted plan to them. */
  const GEAR: Record<WeightUnit, Gear> = {
    lb: { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } },
    kg: { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } },
  };
  const target = (e: ReturnType<typeof exercise>, unit: WeightUnit) => plateTarget(e, unit, GEAR[unit]);
  /** A set from last time, as `getPreviousSets` returns it. */
  const prev = (position: number, weight: number, weightUnit: WeightUnit = 'lb', setType: SetType = 'working'): PrevSet => ({
    position,
    setType,
    weight,
    weightUnit,
    reps: 5,
    durationS: null,
    distance: null,
    distanceUnit: null,
  });

  it("takes the first undone working set's own value, ahead of the override and the plan", () => {
    const ex = exercise([set(0, true, 185), set(1, false, 205), set(2, false, 225)], plan({ overrideWeight: 195, overrideUnit: 'lb', plannedWeight: 175, plannedUnit: 'lb' }));
    expect(target(ex, 'lb')).toBe(205);
  });

  it('skips warmups and done sets when looking for the first undone working set', () => {
    const ex = exercise([set(0, false, 95, 'lb', 'warmup'), set(1, true, 185), set(2, false, 190)]);
    expect(target(ex, 'lb')).toBe(190);
  });

  it('falls back to the override when the first undone working set has no value', () => {
    const ex = exercise([set(0, false, null, null), set(1, false, 250)], plan({ overrideWeight: 195, overrideUnit: 'lb', plannedWeight: 175, plannedUnit: 'lb' }));
    expect(target(ex, 'lb')).toBe(195);
  });

  it('falls back to the planned weight when there is no override', () => {
    const ex = exercise([set(0, false, null, null)], plan({ plannedWeight: 175, plannedUnit: 'lb' }));
    expect(target(ex, 'lb')).toBe(175);
  });

  it('falls back to the newest done working set: the last one in position order', () => {
    const ex = exercise([set(0, true, 185), set(1, true, 205), set(2, true, 135, 'lb', 'drop'), set(3, false, null, null)]);
    expect(target(ex, 'lb')).toBe(205);
  });

  it("falls back to last time's weight for the first undone working set, the placeholder its row shows (F8)", () => {
    const fresh = exercise([set(0, false, null, null), set(1, false, null, null)], plan(), [prev(0, 185), prev(1, 190)]);
    expect(target(fresh, 'lb')).toBe(185);
  });

  it("matches last time's set by type and number, so a warmup's weight is never the working set's", () => {
    const ex = exercise([set(0, false, null, null, 'warmup'), set(1, false, null, null)], plan(), [prev(0, 95, 'lb', 'warmup'), prev(1, 185)]);
    expect(target(ex, 'lb')).toBe(185);
  });

  it("converts last time's weight into the display unit as the placeholder does, to the nearest 0.5", () => {
    expect(target(exercise([set(0, false, null, null)], plan(), [prev(0, 185)]), 'kg')).toBe(84);
  });

  it("puts the newest done working set ahead of last time's weight", () => {
    const ex = exercise([set(0, true, 195), set(1, false, null, null)], plan(), [prev(0, 185), prev(1, 190)]);
    expect(target(ex, 'lb')).toBe(195);
  });

  it('is null with no value anywhere', () => {
    expect(target(exercise([]), 'lb')).toBeNull();
    expect(target(exercise([set(0, false, null, null), set(1, true, 60, 'lb', 'warmup')]), 'lb')).toBeNull();
    // Last time had a warmup only: nothing to match the working set with.
    expect(target(exercise([set(0, false, null, null)], plan(), [prev(0, 95, 'lb', 'warmup')]), 'lb')).toBeNull();
  });

  it("converts a set's own kg value to lb, rounded to 2 decimals", () => {
    expect(target(exercise([set(0, false, 100, 'kg')]), 'lb')).toBe(220.46);
    expect(target(exercise([set(0, true, 102.5, 'kg')]), 'lb')).toBe(225.97);
  });

  it('opens at a plan or override in the other unit as the row shows it: the nearest weight the plates load (R423)', () => {
    // A 135 lb plan after a switch to kg is 61.23 kg; the row shows 60, so the calculator opens at 60.
    expect(target(exercise([set(0, false, null, null)], plan({ plannedWeight: 135, plannedUnit: 'lb' })), 'kg')).toBe(60);
    // 60 kg is 132.28 lb and 80 kg is 176.37 lb: the lb plates load 130 and 175.
    expect(target(exercise([], plan({ overrideWeight: 60, overrideUnit: 'kg' })), 'lb')).toBe(130);
    expect(target(exercise([], plan({ plannedWeight: 80, plannedUnit: 'kg' })), 'lb')).toBe(175);
    // Not a barbell: the nearest 0.5, as the row rounds it.
    expect(target(exercise([], plan({ overrideWeight: 60, overrideUnit: 'kg' }), [], 'dumbbell'), 'lb')).toBe(132.5);
  });

  it('converts lb values to kg', () => {
    expect(target(exercise([set(0, false, 225, 'lb')]), 'kg')).toBe(102.06);
  });

  it('reads a value with no stored unit as the display unit', () => {
    expect(target(exercise([set(0, false, 100, null)]), 'kg')).toBe(100);
  });
});
