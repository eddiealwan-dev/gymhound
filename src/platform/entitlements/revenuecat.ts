import { AppState } from 'react-native';
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { createListeners } from './debug';
import type { AppEntitlements, PurchasesSdk, StoreOffer } from './index';

/** The RevenueCat entitlement that is GymHound Pro. */
export const PRO_ENTITLEMENT = 'pro';
/** The RevenueCat offering whose first package Unlock buys. */
export const DEFAULT_OFFERING = 'default';

/** A store subscription period (ISO 8601: P1W, P1M, P1Y) as the paywall words it; anything else, or none, is null. */
export function storePeriod(iso: string | null | undefined): StoreOffer['period'] {
  if (iso === 'P1W') return 'week';
  if (iso === 'P1M') return 'month';
  if (iso === 'P1Y') return 'year';
  return null;
}

type Info = { activeEntitlements: string[] };
type Package = NonNullable<Awaited<ReturnType<PurchasesSdk['getDefaultPackage']>>>;

/** Runs `call`, turning a synchronous throw into a rejection, so one `catch` handles both. */
function attempt<T>(call: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(call());
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * Pro from the store (R133, R135). `isPro()` is synchronous: `pro_cached`, or the debug unlock where `debugAllowed`.
 * On create it configures the SDK and then, without waiting, reads customer info and the `default` offering; customer
 * info is read again whenever the app comes back to the foreground, and the store's own updates are heard. Every
 * customer-info result writes `pro_cached` from the `pro` entitlement. Every SDK failure is swallowed: Pro keeps
 * `pro_cached` (§12), and no screen waits on the network (§5).
 */
export function createRevenueCatEntitlements(db: Db, sdk: PurchasesSdk, apiKey: string, debugAllowed: boolean): AppEntitlements {
  const listeners = createListeners();
  let configured = false;
  let pkg: Package | null = null;
  let packageLoad: Promise<void> = Promise.resolve();

  const debugOn = () => debugAllowed && getSettings(db).proDebugUnlock;
  const isPro = () => getSettings(db).proCached || debugOn();
  const isDebugPro = () => !getSettings(db).proCached && debugOn();
  const canPurchase = () => configured && pkg !== null;
  const offer = (): StoreOffer | null => (pkg === null ? null : { priceString: pkg.priceString, period: pkg.period });

  /** What subscribers can see; they hear a change only when it differs. */
  const visible = () => JSON.stringify([isPro(), isDebugPro(), canPurchase(), offer()]);
  const changing = (change: () => void) => {
    const before = visible();
    change();
    if (visible() !== before) listeners.notify();
  };

  /** Writes `pro_cached` from a customer-info result; returns whether Pro is active in it. */
  const apply = (info: Info): boolean => {
    const active = info.activeEntitlements.includes(PRO_ENTITLEMENT);
    changing(() => {
      if (getSettings(db).proCached !== active) setSetting(db, 'proCached', active);
    });
    return active;
  };

  const refresh = () => {
    attempt(() => sdk.getCustomerInfo()).then(apply, () => {});
  };

  try {
    sdk.configure(apiKey);
    configured = true;
  } catch {
    configured = false;
  }

  if (configured) {
    refresh();
    packageLoad = attempt(() => sdk.getDefaultPackage()).then(
      (found) => changing(() => (pkg = found ?? null)),
      () => {},
    );
    try {
      sdk.onCustomerInfo((info) => {
        apply(info);
      });
    } catch {
      // The store's updates are a nicety; the foreground refresh still runs.
    }
    AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
  }

  return {
    kind: 'revenuecat',
    isPro,
    isDebugPro,
    subscribe: listeners.subscribe,
    canPurchase,
    offer,
    async purchase() {
      if (!configured) return 'unavailable';
      await packageLoad;
      if (pkg === null) return 'unavailable';
      const id = pkg.id;
      try {
        const info = await attempt(() => sdk.purchase(id));
        return apply(info) ? 'purchased' : 'failed';
      } catch (error) {
        const cancelled = typeof error === 'object' && error !== null && (error as { userCancelled?: unknown }).userCancelled === true;
        return cancelled ? 'cancelled' : 'failed';
      }
    },
    async restore() {
      if (!configured) return 'unavailable';
      try {
        const info = await attempt(() => sdk.restore());
        return apply(info) ? 'restored' : 'none';
      } catch {
        return 'failed';
      }
    },
    setDebugUnlock(on) {
      if (!debugAllowed) return;
      changing(() => {
        if (getSettings(db).proDebugUnlock !== on) setSetting(db, 'proDebugUnlock', on);
      });
    },
  };
}
