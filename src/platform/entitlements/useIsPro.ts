import { useMemo, useSyncExternalStore } from 'react';
import { useDb } from '../../db/DbProvider';
import type { EntitlementsKind, StoreOffer } from './index';
import { entitlementsFor } from './select';

export type EntitlementsState = {
  isPro: boolean;
  isDebugPro: boolean;
  canPurchase: boolean;
  canRestore: boolean;
  offer: StoreOffer | null;
  kind: EntitlementsKind;
};

/** Whether Pro is on, from the app's one entitlements object; re-renders when it changes (debug switch, store, lapse). */
export function useIsPro(): boolean {
  const entitlements = entitlementsFor(useDb());
  return useSyncExternalStore(entitlements.subscribe, entitlements.isPro);
}

/** Everything the paywall and Settings show about Pro; re-renders when any of it changes. */
export function useEntitlementsState(): EntitlementsState {
  const entitlements = entitlementsFor(useDb());
  // The snapshot is a string, so React sees the same value until something visible changes.
  const snapshot = useSyncExternalStore(entitlements.subscribe, () =>
    JSON.stringify({
      isPro: entitlements.isPro(),
      isDebugPro: entitlements.isDebugPro(),
      canPurchase: entitlements.canPurchase(),
      canRestore: entitlements.canRestore(),
      offer: entitlements.offer(),
      kind: entitlements.kind,
    }),
  );
  return useMemo(() => JSON.parse(snapshot) as EntitlementsState, [snapshot]);
}
