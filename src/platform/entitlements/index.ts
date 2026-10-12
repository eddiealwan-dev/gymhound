/**
 * What the user is entitled to: GymHound Pro, or not. Three implementations answer behind one interface, chosen once at
 * startup by §9's order (R133, `select.ts`): RevenueCat outside Expo Go when a store key is set; else the debug unlock
 * where it is allowed; else free-only. Screens use `entitlementsFor(db)` (one object per app, R126) or the hooks.
 */

/** `pending`: the store is waiting for approval (Ask to Buy, a delayed payment); Pro comes on when it is approved. */
export type PurchaseResult = 'purchased' | 'cancelled' | 'pending' | 'unavailable' | 'failed';
export type RestoreResult = 'restored' | 'none' | 'unavailable' | 'failed';

/** A subscription's billing period (R157): `{ count: 3, unit: 'month' }` renews every 3 months. */
export type StorePeriod = { count: number; unit: 'day' | 'week' | 'month' | 'year' };

/** The store's product, as the store words it. `period` is null only for a one-time purchase. */
export type StoreOffer = { priceString: string; period: StorePeriod | null };

export interface Entitlements {
  /** Whether Pro is on now. Synchronous: never waits on the network (R135). */
  isPro(): boolean;
  /**
   * Calls `onChange` whenever `isPro()`, `isDebugPro()`, `offer()` or `canPurchase()` may have changed. Returns the
   * unsubscribe. Fits React's `useSyncExternalStore`.
   */
  subscribe(onChange: () => void): () => void;
  /** Whether a store is configured and its `default` offering has a package to buy. */
  canPurchase(): boolean;
  /** Whether a store is configured, so Restore purchases can ask it, even when there is nothing to buy right now. */
  canRestore(): boolean;
  /** Asks the store for its `default` offering again (the paywall opening); keeps the last one if the store fails. */
  refreshOffer(): void;
  /** The package Unlock would buy, or null when there is none (yet). */
  offer(): StoreOffer | null;
  /** Buys Pro (R136). */
  purchase(): Promise<PurchaseResult>;
  /** Restores an earlier purchase (R136). */
  restore(): Promise<RestoreResult>;
  /** Opens the store's page for managing subscriptions. False when there is no store or it couldn't open; never throws. */
  manageSubscription(): Promise<boolean>;
}

export type EntitlementsKind = 'free' | 'debug' | 'revenuecat';

export type AppEntitlements = Entitlements & {
  kind: EntitlementsKind;
  /** On only where the debug unlock is allowed; a no-op elsewhere. Kept for Settings → Developer (R126). */
  setDebugUnlock(on: boolean): void;
  /** Whether Pro is on only because of the debug unlock (Settings says "for testing"). */
  isDebugPro(): boolean;
  /** Stops listening to the app and the store. The app keeps one object for its lifetime; tests and `entitlementsFor` call it. */
  dispose(): void;
};

/**
 * The narrow adapter over the RevenueCat SDK: only what GymHound calls. `revenuecatSdk.native.ts` maps the real
 * package; tests pass a fake.
 */
export type PurchasesSdk = {
  configure(apiKey: string): void;
  getCustomerInfo(): Promise<{ activeEntitlements: string[] }>;
  onCustomerInfo(listener: (info: { activeEntitlements: string[] }) => void): () => void;
  /** The `default` offering's first package, or null when there is none. */
  getDefaultPackage(): Promise<{ id: string; priceString: string; period: StoreOffer['period'] } | null>;
  /** Rejects with `{ userCancelled: true }` on a cancel and `{ paymentPending: true }` while a payment awaits approval. */
  purchase(packageId: string): Promise<{ activeEntitlements: string[] }>;
  restore(): Promise<{ activeEntitlements: string[] }>;
  /** The store's own page for managing subscriptions. */
  showManageSubscriptions(): Promise<void>;
};

export { debugUnlockAllowed, createDebugEntitlements } from './debug';
export { createFreeOnlyEntitlements } from './freeOnly';
export { createRevenueCatEntitlements, DEFAULT_OFFERING, PRO_ENTITLEMENT } from './revenuecat';
export { loadPurchasesSdk } from './revenuecatSdk';
export { createEntitlements, entitlementsFor, selectKind } from './select';
export { useEntitlementsState, useIsPro, useTrialStatus } from './useIsPro';
export { withTrial, type TrialEntitlements, type TrialView } from './trial';
export { isExpoGo, revenueCatApiKey } from '../runtime';
