import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import type { AppEntitlements } from './index';

/**
 * Whether the debug unlock may turn Pro on (§9): only in a development build (`__DEV__`, which includes Expo Go) or a
 * build that sets `EXPO_PUBLIC_DEBUG_UNLOCK=1`. Store release builds set neither. Settings shows the switch only then.
 */
export function debugUnlockAllowed(): boolean {
  return (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEBUG_UNLOCK === '1';
}

/** A set of listeners and a way to call them all. */
export function createListeners(): { subscribe(onChange: () => void): () => void; notify(): void } {
  const listeners = new Set<() => void>();
  return {
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    notify() {
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * Entitlements with no store (R88, R133): Pro is on only while Settings' `proDebugUnlock` is and the debug unlock is
 * allowed, read live on every call. Nothing can be bought or restored. Used in Expo Go and builds with no store key.
 */
export function createDebugEntitlements(db: Db): AppEntitlements {
  const { subscribe, notify } = createListeners();
  const isPro = () => debugUnlockAllowed() && getSettings(db).proDebugUnlock;

  return {
    kind: 'debug',
    isPro,
    isDebugPro: isPro,
    subscribe,
    canPurchase: () => false,
    offer: () => null,
    purchase: async () => 'unavailable',
    restore: async () => 'unavailable',
    setDebugUnlock(on) {
      const before = isPro();
      if (getSettings(db).proDebugUnlock !== on) setSetting(db, 'proDebugUnlock', on);
      if (isPro() !== before) notify();
    },
  };
}
