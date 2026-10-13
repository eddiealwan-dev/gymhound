import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../db/DbProvider';
import { announce } from '../../platform/announce';
import { entitlementsFor, useEntitlementsState } from '../../platform/entitlements';
import type { PlanKind, PurchaseResult, RestoreResult } from '../../platform/entitlements';

/** Under Unlock and Restore purchases when the build has no store (Expo Go, the debug unlock, free-only). */
export const PURCHASES_UNAVAILABLE = "Purchases aren't available in this build.";

/** When the store is configured but has nothing to sell yet (no answer, no product). */
export const STORE_NOT_ANSWERING = "The store isn't answering. Try again later.";

/** Shown and said while Unlock or Restore purchases runs. */
const WORKING = 'Working…';

/** Said once Pro has come on from Unlock or Restore purchases. */
const PRO_ON = 'Pro is on.';

const PURCHASE_LINES: Record<Exclude<PurchaseResult, 'purchased' | 'cancelled' | 'unavailable'>, string> = {
  pending: "Waiting for approval. Pro comes on once it's approved.",
  failed: "Couldn't finish the purchase. Try again.",
};
const RESTORE_LINES: Record<Exclude<RestoreResult, 'restored' | 'unavailable'>, string> = {
  none: 'No earlier purchase found.',
  failed: "Couldn't reach the store. Try again.",
};

export type StoreAction = 'purchase' | 'restore';

/** What a store result says (R136, review fixes): null for Pro coming on or a cancel. */
function lineFor(action: StoreAction, result: PurchaseResult | RestoreResult, storeConfigured: boolean): string | null {
  if (result === 'purchased' || result === 'restored' || result === 'cancelled') return null;
  if (result === 'unavailable') return storeConfigured ? STORE_NOT_ANSWERING : PURCHASES_UNAVAILABLE;
  if (action === 'purchase') return PURCHASE_LINES[result as keyof typeof PURCHASE_LINES];
  return RESTORE_LINES[result as keyof typeof RESTORE_LINES];
}

/**
 * Runs a purchase of the chosen plan (`purchase`, R556) or Restore purchases (`restore`) on the app's entitlements
 * object, one at a time (R136).
 * While one runs, `busy` is true (the screen disables both buttons) and `status` is "Working…", said once. Pro coming
 * on says "Pro is on." and calls `onDone`, even when the pitch has already gone because Pro turned on under it; any
 * other result but a cancel leaves its line in `status` and says it. A call that throws counts as failed.
 */
export function useStoreAction(onDone?: () => void): { busy: boolean; status: string | null; run: (action: StoreAction, plan?: PlanKind) => void } {
  const db = useDb();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const done = useRef(onDone);
  done.current = onDone;
  const storeConfigured = useRef(false);
  storeConfigured.current = useEntitlementsState().canRestore;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = (action: StoreAction, plan: PlanKind = 'yearly') => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    announce(WORKING);
    const entitlements = entitlementsFor(db);
    let call: Promise<PurchaseResult | RestoreResult>;
    try {
      call = action === 'purchase' ? entitlements.purchase(plan) : entitlements.restore();
    } catch {
      call = Promise.resolve('failed');
    }
    call
      .catch((): PurchaseResult => 'failed')
      .then((result) => {
        running.current = false;
        const line = lineFor(action, result, storeConfigured.current);
        if (mounted.current) {
          setBusy(false);
          setMessage(line);
        }
        if (result === 'purchased' || result === 'restored') {
          announce(PRO_ON);
          done.current?.();
        } else if (line !== null) {
          announce(line);
        }
      });
  };

  return { busy, status: busy ? WORKING : message, run };
}
