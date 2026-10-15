import { useEffect, useState } from 'react';
import { clockAt, type WorkTimer } from '../../domain/workClock';
import { msToNextSecond } from './useRestClock';

/**
 * The time now for a work clock (Task 7b), read again just as each whole second of its work turns over, as the rest
 * row's clock is (`useRestClock`). Nothing is counted: the clock is worked out from the stored start each time. It stops
 * reading while the clock is paused, stopped, waiting at a hold or ended, and reads at once when the stored clock changes
 * (Start, Pause, Resume, Start at a hold), so a resume after the phone was locked shows the right time straight away.
 */
export function useWorkNow(timer: WorkTimer | null): number {
  const [now, setNow] = useState(() => Date.now());
  const live = timer !== null && timer.pausedAt === null && timer.doneAtS === null;
  /** Whole seconds of the work fall on this grid: the start moved on by the time paused. */
  const grid = timer === null ? 0 : timer.startsAt + timer.pausedMs;
  const released = timer?.released ?? 0;
  useEffect(() => {
    setNow(Date.now());
    if (!live || timer === null) return;
    let handle: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const t = Date.now();
      setNow(t);
      const phase = clockAt(timer, t).phase;
      if (phase !== 'ended' && phase !== 'waiting') handle = setTimeout(step, msToNextSecond(grid, t));
    };
    handle = setTimeout(step, msToNextSecond(grid, Date.now()));
    return () => {
      if (handle !== undefined) clearTimeout(handle);
    };
    // The stored clock is read through what changes it: its grid, whether it runs, and its holds released.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, grid, released]);
  return now;
}
