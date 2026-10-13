import { sameProps, shareEqual } from './shareEqual';

describe('shareEqual (performance pass)', () => {
  it('returns the old value when the new one is equal throughout', () => {
    const prev = { a: 1, list: [{ id: 'x', n: null }, { id: 'y', n: 2 }], nested: { s: 'hi' } };
    const next = JSON.parse(JSON.stringify(prev));
    expect(shareEqual(prev, next)).toBe(prev);
  });

  it('keeps the parts that did not change and takes the new ones', () => {
    const prev = { list: [{ id: 'x', n: 1 }, { id: 'y', n: 2 }], gear: { bar: 45 } };
    const next = { list: [{ id: 'x', n: 1 }, { id: 'y', n: 3 }], gear: { bar: 45 } };
    const out = shareEqual(prev, next);
    expect(out).not.toBe(prev);
    expect(out).toEqual(next);
    expect(out.gear).toBe(prev.gear);
    expect(out.list).not.toBe(prev.list);
    expect(out.list[0]).toBe(prev.list[0]);
    expect(out.list[1]).not.toBe(prev.list[1]);
    expect(out.list[1]).toEqual({ id: 'y', n: 3 });
  });

  it('sees added, removed and renamed keys and items', () => {
    expect(shareEqual({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    const prev = { a: 1, b: 2 };
    expect(shareEqual(prev, { a: 1 })).not.toBe(prev);
    expect(shareEqual({ a: undefined }, { b: undefined })).toEqual({ b: undefined });
    const list = [1, 2, 3];
    expect(shareEqual(list, [1, 2])).toEqual([1, 2]);
    expect(shareEqual([1, 2], list)).toEqual(list);
  });

  it('compares anything else by identity, and never mixes an array with an object', () => {
    const date = new Date(0);
    expect(shareEqual(new Date(0), date)).toBe(date);
    expect(shareEqual(null, { a: 1 })).toEqual({ a: 1 });
    expect(shareEqual({ 0: 'a' }, ['a'])).toEqual(['a']);
    expect(Array.isArray(shareEqual({ 0: 'a' }, ['a']))).toBe(true);
    expect(shareEqual(NaN, NaN)).toBeNaN();
  });
});

describe('sameProps', () => {
  it('is true only when every prop is the same value', () => {
    const f = () => {};
    expect(sameProps({ a: 1, f }, { a: 1, f })).toBe(true);
    expect(sameProps({ a: 1, f }, { a: 1, f: () => {} })).toBe(false);
    expect(sameProps<{ a?: number; b?: number }>({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameProps<{ a: number; b?: number }>({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
