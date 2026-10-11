import { useState } from 'react';

/** A rest that has just run out: the set it was under, and when it ended. */
export type RestUp = { setId: string; endsAt: number };

type Seen = { restEndsAt: number | null; restSetId: string | null; doneCount: number; hold: RestUp | null };

/**
 * The rest whose "Rest's up" the session still shows under its set (spec 18.6), or null.
 *
 * The rest watcher clears `rest_ends_at` when a rest runs out, so the row would vanish at zero. This remembers the last
 * running rest and, when its end clears at or after the end time, holds it. One cleared earlier (Skip, a −15s that skips,
 * a discard) holds nothing. A tick or untick (`doneCount` changes) or a new running rest drops the hold. `RestInline`
 * hides itself `REST_UP_MS` after the end.
 *
 * The hold is worked out during the render in which the inputs change, so the row never disappears for a frame.
 */
export function useRestUp(restEndsAt: number | null, restSetId: string | null, doneCount: number): RestUp | null {
  const [seen, setSeen] = useState<Seen>({ restEndsAt, restSetId, doneCount, hold: null });
  if (seen.restEndsAt === restEndsAt && seen.restSetId === restSetId && seen.doneCount === doneCount) return seen.hold;

  let hold = seen.hold;
  if (restEndsAt !== null || doneCount !== seen.doneCount) hold = null;
  else if (seen.restEndsAt !== null) {
    // The running rest has just cleared: it ran out, or was skipped.
    hold = seen.restSetId !== null && Date.now() >= seen.restEndsAt ? { setId: seen.restSetId, endsAt: seen.restEndsAt } : null;
  }
  setSeen({ restEndsAt, restSetId, doneCount, hold });
  return hold;
}
