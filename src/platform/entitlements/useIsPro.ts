import { useMemo, useSyncExternalStore } from 'react';
import { useDb } from '../../db/DbProvider';
import type { EntitlementsKind, StoreOffer } from './index';
import { entitlementsFor } from './select';
import type { TrialView } from './trial';

export type EntitlementsState = {
  isPro: boolean;
  isDebugPro: boolean;
  canPurchase: boolean;
  canRestore: boolean;
  offer: StoreOffer | null;
  kind: EntitlementsKind;
  /** Pro is on only because of the 7-day full access trial (§18.19). */
  trialOnly: boolean;
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
      trialOnly: entitlements.isTrialOnly(),
    }),
  );
  return useMemo(() => JSON.parse(snapshot) as EntitlementsState, [snapshot]);
}

/** The full access trial (§18.19), re-read whenever entitlements change: the trial starting, ending or moved for testing. */
export function useTrialStatus(): TrialView {
  const entitlements = entitlementsFor(useDb());
  const snapshot = useSyncExternalStore(entitlements.subscribe, () => JSON.stringify(entitlements.trialStatus()));
  return useMemo(() => JSON.parse(snapshot) as TrialView, [snapshot]);
}
