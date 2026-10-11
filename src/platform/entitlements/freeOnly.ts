import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import type { Entitlements } from './index';

export type FreeOnlyEntitlements = Entitlements & {
  /** Turns the debug unlock on or off, and tells subscribers when that changes whether Pro is on. */
  setDebugUnlock(on: boolean): void;
};

/**
 * Whether the debug unlock may turn Pro on (§9): only in a development build (`__DEV__`, which includes Expo Go) or a
 * build that sets `EXPO_PUBLIC_DEBUG_UNLOCK=1`. Store release builds set neither. Settings shows the switch only then.
 */
export function debugUnlockAllowed(): boolean {
  return (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEBUG_UNLOCK === '1';
}

/**
 * Entitlements before Pro exists (R88): Pro is on only while Settings' `proDebugUnlock` is and the debug unlock is
 * allowed, read live on every call. Nothing can be bought or restored.
 */
export function createFreeOnlyEntitlements(db: Db): FreeOnlyEntitlements {
  const listeners = new Set<() => void>();
  const isPro = () => debugUnlockAllowed() && getSettings(db).proDebugUnlock;

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
      const before = isPro();
      if (getSettings(db).proDebugUnlock !== on) setSetting(db, 'proDebugUnlock', on);
      if (isPro() === before) return;
      for (const listener of [...listeners]) listener();
    },
  };
}
