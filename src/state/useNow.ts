import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Whether a look at the clock at `t` changes what is shown from the reading `drawn`. Always, without `faceOf`. When it
 * doesn't, the state is not set at all, so React has nothing to do (R405).
 */
function changesFace(drawn: number, t: number, faceOf: ((now: number) => unknown) | undefined): boolean {
  return faceOf === undefined || !Object.is(faceOf(drawn), faceOf(t));
}

/** The clock state, its reading as last drawn, and a look at the clock that sets the state only when the face changes. */
function useClockState(faceOf: ((now: number) => unknown) | undefined) {
  const [now, setNow] = useState(() => Date.now());
  const face = useRef(faceOf);
  face.current = faceOf;
  const drawn = useRef(now);
  drawn.current = now;
  const look = useCallback(() => {
    const t = Date.now();
    if (changesFace(drawn.current, t, face.current)) {
      drawn.current = t;
      setNow(t);
    }
  }, []);
  return { now, look };
}

/**
 * Reads the clock now, then again every `everyMs` while this screen is focused, so a screen left in the background does
 * no work.
 *
 * With `faceOf` (what the screen shows for a reading, such as "1:05"), a reading that shows the same as the one drawn is
 * dropped: look often (every 250 ms) to turn each second over on time, yet draw only when the face changes (R405).
 * `faceOf` may be a new function on each draw.
 */
export function useNow(everyMs: number, faceOf?: (now: number) => unknown): number {
  const { now, look } = useClockState(faceOf);
  useFocusEffect(
    useCallback(() => {
      look();
      const timer = setInterval(look, everyMs);
      return () => clearInterval(timer);
    }, [everyMs, look]),
  );
  return now;
}

/**
 * As `useNow` with a `faceOf`, for a part of a screen rather than a screen: it ticks while mounted and `active`, whether
 * or not its screen is focused (a rest keeps counting under the picker).
 */
export function useTicker(everyMs: number, faceOf: (now: number) => unknown, active = true): number {
  const { now, look } = useClockState(faceOf);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(look, everyMs);
    return () => clearInterval(timer);
  }, [everyMs, active, look]);
  return now;
}
