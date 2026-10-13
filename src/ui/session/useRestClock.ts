import { useEffect, useState } from 'react';

/** How long until the rest's shown second next changes: the countdown rounds up, so it changes on each whole second before `endsAt`. */
export function msToNextSecond(endsAt: number, now: number): number {
  const into = (((endsAt - now) % 1000) + 1000) % 1000;
  return into === 0 ? 1000 : into;
}

/**
 * The clock a rest countdown draws from: the time now, read again just as each whole second of the rest turns over,
 * until `stopAt`. The shown second then changes once a second and on the beat, where a 250 ms poll changed it up to a
 * quarter of a second late (an uneven beat) and drew the countdown four times a second. A new end (−15s, +15s) reads
 * the clock at once. Only the component that calls it draws again; the session list never does.
 */
export function useRestClock(endsAt: number, stopAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const t = Date.now();
      setNow(t);
      if (t < stopAt) timer = setTimeout(step, msToNextSecond(endsAt, t));
    };
    step();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [endsAt, stopAt]);
  return now;
}
