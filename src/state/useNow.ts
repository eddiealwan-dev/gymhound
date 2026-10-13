import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** Reads the clock now, then again every `everyMs` while this screen is focused, so a screen left in the background does no work. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), everyMs);
      return () => clearInterval(timer);
    }, [everyMs]),
  );
  return now;
}
