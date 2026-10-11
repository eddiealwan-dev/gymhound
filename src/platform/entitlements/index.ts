import type { Db } from '../../db/types';
import { createFreeOnlyEntitlements } from './freeOnly';
import type { FreeOnlyEntitlements } from './freeOnly';

export { debugUnlockAllowed } from './freeOnly';
export type { FreeOnlyEntitlements } from './freeOnly';

/**
 * What the user is entitled to. Only GymHound Pro exists; until it can be bought (phase 5) the free-only
 * implementation answers, and the debug unlock in Settings turns Pro on for testing where it is allowed (R88, §9).
 */
export interface Entitlements {
  /** Whether Pro is on now. */
  isPro(): boolean;
  /** Calls `onChange` whenever `isPro()` may have changed. Returns the unsubscribe. Fits React's `useSyncExternalStore`. */
  subscribe(onChange: () => void): () => void;
  /** Buys Pro. Until Pro exists there is nothing to buy. */
  purchase(): Promise<'unavailable'>;
  /** Restores an earlier purchase: true when one was found. */
  restore(): Promise<boolean>;
}

/**
 * A new entitlements object: free-only until Pro exists. Screens use `entitlementsFor`, so they share one and its
 * listeners hear the Settings switch.
 */
export function createEntitlements(db: Db): FreeOnlyEntitlements {
  return createFreeOnlyEntitlements(db);
}

/** The app's one entitlements object and the database it reads, made on first use. */
let shared: { db: Db; entitlements: FreeOnlyEntitlements } | null = null;

/**
 * The app's entitlements, one per app (R126): every screen gets the same object, so when Settings' "Unlock Pro for
 * testing" calls `setDebugUnlock`, what subscribed on another screen hears it. The app opens one database; another one
 * (a test's) gets a fresh object.
 */
export function entitlementsFor(db: Db): FreeOnlyEntitlements {
  if (shared === null || shared.db !== db) shared = { db, entitlements: createEntitlements(db) };
  return shared.entitlements;
}
