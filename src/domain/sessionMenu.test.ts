import { canMoveBlock, hasDoneSets, joinsNextInSuperset, replaceNeedsConfirm, supersetAction } from './sessionMenu';

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
