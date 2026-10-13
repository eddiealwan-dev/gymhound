import { useMemo, useRef } from 'react';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `next`, with every part that equals the same part of `prev` replaced by `prev`'s own object, and `prev` itself when
 * the two are equal throughout. Only arrays and plain objects are walked; anything else is compared with `Object.is`.
 *
 * Every write reads the whole workout again, as new objects. Sharing what did not change lets a memoized exercise block
 * or set row see the same object and skip drawing, so a tick redraws only the exercise it changed.
 */
export function shareEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return prev as T;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((item: unknown, i) => {
      const shared = shareEqual(prev[i], item);
      if (shared !== prev[i]) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(prev).length;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const shared = shareEqual(prev[key], next[key]);
      if (shared !== prev[key] || !Object.prototype.hasOwnProperty.call(prev, key)) same = false;
      out[key] = shared;
    }
    return (same ? prev : out) as T;
  }
  return next;
}

/** `value`, sharing every part that equals what this hook returned last time (`shareEqual`). */
export function useShareEqual<T>(value: T): T {
  const last = useRef<T>(value);
  return useMemo(() => {
    const shared = shareEqual(last.current, value);
    last.current = shared;
    return shared;
  }, [value]);
}

/**
 * The props check `React.memo` makes by default (each prop by `Object.is`), written out. Passing it keeps the memoized
 * component's own type on the element, so tests that find a component by its type still find it.
 */
export function sameProps<P extends object>(a: Readonly<P>, b: Readonly<P>): boolean {
  const keysA = Object.keys(a) as (keyof P)[];
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
}
