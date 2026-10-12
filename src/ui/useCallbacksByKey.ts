import { useCallback, useRef } from 'react';

/**
 * Callbacks made once per key and kept for the life of the component, so a memoized child given them (an exercise
 * block, a set row) sees the same functions on every draw. `make` must use only the key and values that never change,
 * such as state setters and module functions: it runs once per key, and what it closes over is never refreshed.
 */
export function useCallbacksByKey<V>(make: (key: string) => V): (key: string) => V {
  const cache = useRef(new Map<string, V>());
  const makeRef = useRef(make);
  makeRef.current = make;
  return useCallback((key: string) => {
    let value = cache.current.get(key);
    if (value === undefined) {
      value = makeRef.current(key);
      cache.current.set(key, value);
    }
    return value;
  }, []);
}
