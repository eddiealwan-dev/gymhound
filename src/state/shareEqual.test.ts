import { shareEqual } from './shareEqual';

describe('shareEqual (structural sharing, R400)', () => {
  it('returns the previous value when the next one is deeply equal', () => {
    const prev = { a: 1, list: [{ id: 'x', n: [1, 2] }, { id: 'y', n: [] }], none: null };
    const next = { a: 1, list: [{ id: 'x', n: [1, 2] }, { id: 'y', n: [] }], none: null };
    expect(shareEqual(prev, next)).toBe(prev);
  });

  it('keeps the parts that did not change, and takes the new ones', () => {
    const prev = { a: 1, list: [{ id: 'x', n: [1, 2] }, { id: 'y', n: [3] }] };
    const next = { a: 1, list: [{ id: 'x', n: [1, 2] }, { id: 'y', n: [4] }] };
    const out = shareEqual(prev, next);
    expect(out).not.toBe(prev);
    expect(out).toEqual(next);
    expect(out.list).not.toBe(prev.list);
    expect(out.list[0]).toBe(prev.list[0]);
    expect(out.list[1]).not.toBe(prev.list[1]);
  });

  it('sees an added or removed member, or a key that changed', () => {
    expect(shareEqual([1, 2], [1, 2, 3])).toEqual([1, 2, 3]);
    expect(shareEqual([1, 2, 3], [1, 2])).toEqual([1, 2]);
    const prev = { a: 1, b: undefined } as Record<string, unknown>;
    const next = { a: 1, c: undefined } as Record<string, unknown>;
    const out = shareEqual(prev, next);
    expect(out).not.toBe(prev);
    expect(Object.keys(out)).toEqual(['a', 'c']);
  });

  it('compares anything that is not a plain object or array by identity', () => {
    const date = new Date(0);
    expect(shareEqual(new Date(0), date)).toBe(date);
    expect(shareEqual(null, { a: 1 })).toEqual({ a: 1 });
    expect(shareEqual({ a: 1 }, null)).toBeNull();
    expect(shareEqual([1], { 0: 1 })).toEqual({ 0: 1 });
  });

  it('does not modify either argument', () => {
    const prev = Object.freeze({ list: Object.freeze([Object.freeze({ id: 'x' })]) });
    const next = Object.freeze({ list: Object.freeze([Object.freeze({ id: 'x' }), Object.freeze({ id: 'y' })]) });
    const out = shareEqual(prev, next);
    expect(out.list[0]).toBe(prev.list[0]);
    expect(out.list[1]).toBe(next.list[1]);
  });
});
