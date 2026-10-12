import { useCallback, useRef } from 'react';

/** Taps closer together than this act once. */
export const ONCE_MS = 1000;

/**
 * Runs what it is handed at most once a second, however fast a second tap lands: a double tap on a button that opens a
 * screen would otherwise push it twice. Buttons that share one guard share the second, so a tap on one and then
 * another opens one screen.
 */
export function useOnce(): (go: () => void) => void {
  const last = useRef(-Infinity);
  return useCallback((go: () => void) => {
    const now = Date.now();
    if (now - last.current < ONCE_MS) return;
    last.current = now;
    go();
  }, []);
}
