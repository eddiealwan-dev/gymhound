import type { AppEntitlements } from './index';

/**
 * Entitlements for a build with no store and no debug unlock (R133): Pro is always off, nothing can be bought or
 * restored, and the debug switch does nothing (Settings does not show it there).
 */
export function createFreeOnlyEntitlements(): AppEntitlements {
  return {
    kind: 'free',
    isPro: () => false,
    isDebugPro: () => false,
    subscribe: () => () => {},
    canPurchase: () => false,
    offer: () => null,
    purchase: async () => 'unavailable',
    restore: async () => 'unavailable',
    setDebugUnlock: () => {},
  };
}
