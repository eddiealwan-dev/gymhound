import { useEffect, useRef } from 'react';

/**
 * Typed text is saved when its input is left (blur). Leaving the screen, opening a menu or opening the picker
 * does not always blur first (on iOS a screen can unmount while an input still has focus), so text typed but not
 * yet blurred would be lost. Every input that holds such a draft registers a flush here; anything that navigates
 * away calls `flushAll()` first, which commits every pending draft the way a blur would.
 *
 * Task 16's Finish and Discard call `flushAll()` before they act, for the same reason.
 */

type Flush = () => void;

const registered = new Set<Flush>();

/** Registers a flush and returns the function that removes it. */
export function registerDraftFlush(flush: Flush): () => void {
  registered.add(flush);
  return () => {
    registered.delete(flush);
  };
}

/**
 * Commits every pending draft. One flush that throws never stops the others, and never stops the navigation that
 * called this: the failure is logged and the rest still run.
 */
export function flushAll(): void {
  for (const flush of [...registered]) {
    try {
      flush();
    } catch (e) {
      console.warn('GymHound: a pending entry could not be saved.', e);
    }
  }
}

/**
 * Registers `flush` for as long as the component is mounted. It always runs the latest `flush` from the latest
 * render, so it sees the current draft without re-registering on every keystroke.
 */
export function useDraftFlush(flush: Flush): void {
  const latest = useRef(flush);
  latest.current = flush;
  useEffect(() => registerDraftFlush(() => latest.current()), []);
}
