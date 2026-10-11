import { router } from 'expo-router';
import { useCallback, useRef } from 'react';

/** Taps closer together than this open the paywall once. */
const ONCE_MS = 1000;

/**
 * Opens the full-screen paywall (R138), once per tap however fast a second tap lands: a double tap on See Pro would
 * otherwise push two paywalls, and Not now would leave the second one showing.
 */
export function useOpenPaywall(): () => void {
  const last = useRef(-Infinity);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current < ONCE_MS) return;
    last.current = now;
    router.push('/paywall');
  }, []);
}
