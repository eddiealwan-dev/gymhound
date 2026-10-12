/** A plain object: made by an object literal (or with no prototype), as a database read returns its rows. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `next`, with every part that is deeply equal to the same part of `prev` replaced by `prev`'s own (structural sharing).
 * The result is `prev` itself when nothing changed, and otherwise a new object or array that keeps `prev`'s unchanged
 * members. A memoized component given a part that did not change is then given the very same object, and does not draw
 * again. Only plain objects and arrays are walked; anything else (a Date, a Map, a class instance) is compared by
 * identity. Neither argument is modified.
 */
export function shareEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) return next;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length;
    const out = next.map((item, i) => {
      const shared = shareEqual(prev[i], item);
      if (shared !== prev[i]) same = false;
      return shared;
    });
    return (same ? prev : out) as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    let same = prevKeys.length === nextKeys.length;
    const out: Record<string, unknown> = {};
    for (const key of nextKeys) {
      const shared = shareEqual(prev[key], next[key]);
      if (!Object.prototype.hasOwnProperty.call(prev, key) || shared !== prev[key]) same = false;
      out[key] = shared;
    }
    return (same ? prev : out) as T;
  }
  return next;
}
