import type { Db } from '../../db/types';
import { createFreeOnlyEntitlements } from './freeOnly';

/**
 * What the user is entitled to. Only GymHound Pro exists; until it can be bought (phase 5) the free-only
 * implementation answers, and the debug unlock in Settings turns Pro on for testing (R88).
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

/** The app's entitlements: free-only until Pro exists. */
export function createEntitlements(db: Db): Entitlements {
  return createFreeOnlyEntitlements(db);
}
