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

/** The three ways to buy Pro (R556): a yearly or monthly subscription, or a one-time lifetime unlock. */
export type PlanKind = 'yearly' | 'monthly' | 'lifetime';

/**
 * One plan as the store words it (R556). `price` is the number behind `priceString`, for working out the yearly
 * saving; `perMonthString` is the store's own monthly figure for a subscription ("$9.99"), or null; `period` is null
 * only for the lifetime unlock; `freeTrialDays` is the store's free trial on a subscription, or null when it has none.
 */
export type StorePlan = {
  kind: PlanKind;
  priceString: string;
  price: number;
  perMonthString: string | null;
  period: StorePeriod | null;
  freeTrialDays: number | null;
};

export interface Entitlements {
  /** Whether Pro is on now. Synchronous: never waits on the network (R135). */
  isPro(): boolean;
  /**
   * Calls `onChange` whenever `isPro()`, `isDebugPro()`, `isSubscribed()`, `plans()` or `canPurchase()` may have changed. Returns the
   * unsubscribe. Fits React's `useSyncExternalStore`.
   */
  subscribe(onChange: () => void): () => void;
  /** Whether a store is configured and its `default` offering has a plan to buy. */
  canPurchase(): boolean;
  /** Whether a store is configured, so Restore purchases can ask it, even when there is nothing to buy right now. */
  canRestore(): boolean;
  /** Asks the store for its `default` offering again (the paywall opening); keeps the last one if the store fails. */
  refreshOffer(): void;
  /** The plans the store sells, yearly, monthly and lifetime in that order; empty when there are none (yet). */
  plans(): StorePlan[];
  /** Whether Pro comes from a store subscription that renews, so Settings offers Manage subscription. */
  isSubscribed(): boolean;
  /** Buys Pro on the chosen plan (R136, R556). */
  purchase(kind: PlanKind): Promise<PurchaseResult>;
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
/** Customer info as GymHound reads it: the active entitlements, and whether Pro's has an end date (a subscription). */
export type CustomerInfoLite = { activeEntitlements: string[]; proExpires?: boolean };

export type PurchasesSdk = {
  configure(apiKey: string): void;
  getCustomerInfo(): Promise<CustomerInfoLite>;
  onCustomerInfo(listener: (info: CustomerInfoLite) => void): () => void;
  /** The `default` offering's yearly, monthly and lifetime packages, each with the identifier `purchase` takes. */
  getPlans(): Promise<(StorePlan & { id: string })[]>;
  /** Rejects with `{ userCancelled: true }` on a cancel and `{ paymentPending: true }` while a payment awaits approval. */
  purchase(packageId: string): Promise<CustomerInfoLite>;
  restore(): Promise<CustomerInfoLite>;
  /** The store's own page for managing subscriptions. */
  showManageSubscriptions(): Promise<void>;
};

export { debugUnlockAllowed, createDebugEntitlements } from './debug';
export { createFreeOnlyEntitlements } from './freeOnly';
export { createRevenueCatEntitlements, DEFAULT_OFFERING, PRO_ENTITLEMENT } from './revenuecat';
export { loadPurchasesSdk } from './revenuecatSdk';
export { createEntitlements, entitlementsFor, selectKind } from './select';
export { useEntitlementsState, useIsPro } from './useIsPro';
export { isExpoGo, revenueCatApiKey } from '../runtime';
