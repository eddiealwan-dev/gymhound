import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useDb } from '../db/DbProvider';
import type { Db } from '../db/types';

type DataVersion = { version: number; bump(): void };

/** A counter that every write bumps, so screens that read through `useDbQuery` read again. */
export const useDataVersion = create<DataVersion>((set) => ({
  version: 0,
  bump: () => set((state) => ({ version: state.version + 1 })),
}));

/** Call after a write to SQLite has committed. */
export function bumpData(): void {
  useDataVersion.getState().bump();
}

/**
 * Reads synchronously from the database and reads again when the data version changes or the screen
 * regains focus. Pass a module-level function (or a stable callback) so the read only repeats for those reasons.
 */
export function useDbQuery<T>(query: (db: Db) => T): T {
  const db = useDb();
  const version = useDataVersion((state) => state.version);
  const [focusCount, setFocusCount] = useState(0);
  const mounted = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // The first focus is the mount, which already reads. Later focuses are returns to this screen.
      if (!mounted.current) {
        mounted.current = true;
        return;
      }
      setFocusCount((count) => count + 1);
    }, []),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- version and focusCount are the triggers
  return useMemo(() => query(db), [db, query, version, focusCount]);
}

/**
 * As useDbQuery, but a bump while the screen is not focused only marks it stale; it reads again on focus if stale (R185).
 * A focus with no bump since the last read reads nothing. For History, Stats and their sections, which scan all history:
 * every tick in a workout bumps the data version, and they should not read again while out of sight.
 *
 * `query` must be stable: a module-level function, or a `useCallback` whose dependencies are the values it reads with
 * (such as `today`). A new function each render reads on every render.
 */
export function useFocusedDbQuery<T>(query: (db: Db) => T): T {
  const db = useDb();
  // The data version the current read reflects. It follows the store only while the screen is focused.
  const [seen, setSeen] = useState(() => useDataVersion.getState().version);
  const seenRef = useRef(seen);
  seenRef.current = seen;
  // A screen is focused when it mounts; its focus effect says so again, and its cleanup says when it loses focus.
  const focused = useRef(true);

  const catchUp = useCallback(() => {
    const version = useDataVersion.getState().version;
    if (version !== seenRef.current) setSeen(version);
  }, []);

  useEffect(() => {
    const unsubscribe = useDataVersion.subscribe(() => {
      if (focused.current) catchUp();
    });
    // A bump between the first render and this subscription is not missed.
    if (focused.current) catchUp();
    return unsubscribe;
  }, [catchUp]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      catchUp();
      return () => {
        focused.current = false;
      };
    }, [catchUp]),
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- seen is the trigger
  return useMemo(() => query(db), [db, query, seen]);
}
