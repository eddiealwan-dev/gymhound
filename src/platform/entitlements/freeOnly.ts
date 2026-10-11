import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import type { Entitlements } from './index';

export type FreeOnlyEntitlements = Entitlements & {
  /** Turns the debug unlock on or off, and tells subscribers when that changes whether Pro is on. */
  setDebugUnlock(on: boolean): void;
};

/**
 * Entitlements before Pro exists (R88): Pro is on only while Settings' `proDebugUnlock` is, read live on every call.
 * Nothing can be bought or restored.
 */
export function createFreeOnlyEntitlements(db: Db): FreeOnlyEntitlements {
  const listeners = new Set<() => void>();
  const isPro = () => getSettings(db).proDebugUnlock;

  return {
    isPro,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    purchase: async () => 'unavailable',
    restore: async () => false,
    setDebugUnlock(on) {
      if (isPro() === on) return;
      setSetting(db, 'proDebugUnlock', on);
      for (const listener of [...listeners]) listener();
    },
  };
}
