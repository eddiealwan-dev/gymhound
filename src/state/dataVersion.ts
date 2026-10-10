import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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
