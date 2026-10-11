import { useEffect, useRef, useState } from 'react';
import { useDb } from '../../db/DbProvider';
import { announce } from '../../platform/announce';
import { entitlementsFor } from '../../platform/entitlements';
import type { PurchaseResult, RestoreResult } from '../../platform/entitlements';

/** Under Unlock and Restore purchases when there is no store to buy from (Expo Go, the debug unlock, no products). */
export const PURCHASES_UNAVAILABLE = "Purchases aren't available in this build.";

/** Said once Pro has come on from Unlock or Restore purchases. */
const PRO_ON = 'Pro is on.';

/** What each store result says (R136). A result with no line ('cancelled') says nothing. */
const LINES: Record<PurchaseResult | RestoreResult, string | null> = {
  purchased: null,
  restored: null,
  cancelled: null,
  none: 'No earlier purchase found.',
  unavailable: PURCHASES_UNAVAILABLE,
  failed: null, // worded per action below
};
const FAILED = { purchase: "Couldn't finish the purchase. Try again.", restore: "Couldn't reach the store. Try again." };

export type StoreAction = 'purchase' | 'restore';

/**
 * Runs Unlock (`purchase`) or Restore purchases (`restore`) on the app's entitlements object, one at a time (R136).
 * While one runs, `busy` is true, so the screen disables both buttons. Pro coming on says "Pro is on." and calls
 * `onDone`, even when the pitch has already gone because Pro turned on under it; a failure, no earlier purchase or no
 * store shows `message` and says it. A cancel says nothing. A call that throws counts as failed.
 */
export function useStoreAction(onDone?: () => void): { busy: boolean; message: string | null; run: (action: StoreAction) => void } {
  const db = useDb();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = (action: StoreAction) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    const entitlements = entitlementsFor(db);
    let call: Promise<PurchaseResult | RestoreResult>;
    try {
      call = action === 'purchase' ? entitlements.purchase() : entitlements.restore();
    } catch {
      call = Promise.resolve('failed');
    }
    call
      .catch((): PurchaseResult => 'failed')
      .then((result) => {
        running.current = false;
        const line = result === 'failed' ? FAILED[action] : LINES[result];
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

  return { busy, message, run };
}
