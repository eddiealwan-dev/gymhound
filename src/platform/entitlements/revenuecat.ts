import { AppState } from 'react-native';
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { createListeners } from './debug';
import type { AppEntitlements, CustomerInfoLite, PlanKind, PurchasesSdk, StorePeriod, StorePlan } from './index';

/** The RevenueCat entitlement that is GymHound Pro. */
export const PRO_ENTITLEMENT = 'pro';
/** The RevenueCat offering whose yearly, monthly and lifetime packages the paywall sells. */
export const DEFAULT_OFFERING = 'default';

/** How long `purchase(kind)` waits for the offering before it says 'unavailable'. */
export const OFFER_WAIT_MS = 10_000;

const PERIOD_UNITS: Record<string, StorePeriod['unit']> = { D: 'day', W: 'week', M: 'month', Y: 'year' };

/**
 * A store subscription period (R157): a single ISO 8601 duration, `P{n}D`, `P{n}W`, `P{n}M` or `P{n}Y` with n ≥ 1, as a
 * count and a unit ("P3M" → every 3 months). Anything else, or none, is null (a one-time purchase).
 */
export function storePeriod(iso: string | null | undefined): StorePeriod | null {
  const match = /^P([1-9]\d*)([DWMY])$/.exec(iso ?? '');
  if (match === null) return null;
  return { count: Number(match[1]), unit: PERIOD_UNITS[match[2]] };
}

type Info = CustomerInfoLite;
type Package = StorePlan & { id: string };

/** The order the paywall shows plans in (R556). */
const PLAN_ORDER: PlanKind[] = ['yearly', 'monthly', 'lifetime'];

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
  let packages: Package[] = [];
  let subscribed = false;
  let packageLoad: Promise<void> = Promise.resolve();
  let disposed = false;
  const cleanups: (() => void)[] = [];

  const debugOn = () => debugAllowed && getSettings(db).proDebugUnlock;
  const isPro = () => getSettings(db).proCached || debugOn();
  const isDebugPro = () => !getSettings(db).proCached && debugOn();
  const canPurchase = () => configured && packages.length > 0;
  const plans = (): StorePlan[] => packages.map(({ id: _id, ...plan }) => plan);
  const isSubscribed = () => getSettings(db).proCached && subscribed;

  /** What subscribers can see; they hear a change only when it differs. */
  const visible = () => JSON.stringify([isPro(), isDebugPro(), isSubscribed(), canPurchase(), plans()]);
  const changing = (change: () => void) => {
    const before = visible();
    change();
    if (visible() !== before) listeners.notify();
  };

  /** Writes `pro_cached` from a customer-info result; returns whether Pro is active in it. */
  const apply = (info: Info): boolean => {
    if (disposed) return info.activeEntitlements.includes(PRO_ENTITLEMENT);
    const active = info.activeEntitlements.includes(PRO_ENTITLEMENT);
    changing(() => {
      subscribed = active && info.proExpires === true;
      if (getSettings(db).proCached !== active) setSetting(db, 'proCached', active);
    });
    return active;
  };

  const refresh = () => {
    attempt(() => sdk.getCustomerInfo()).then(apply, () => {});
  };

  /** Asks for the `default` offering's plans, one of each kind in the paywall's order; a failure keeps the last ones. */
  const loadPackage = () => {
    packageLoad = attempt(() => sdk.getPlans()).then(
      (found) => {
        const sorted = PLAN_ORDER.flatMap((kind) => found.find((p) => p.kind === kind) ?? []);
        if (!disposed) changing(() => (packages = sorted));
      },
      () => {},
    );
  };

  try {
    sdk.configure(apiKey);
    configured = true;
  } catch {
    configured = false;
  }

  if (configured) {
    refresh();
    loadPackage();
    try {
      cleanups.push(
        sdk.onCustomerInfo((info) => {
          apply(info);
        }),
      );
    } catch {
      // The store's updates are a nicety; the foreground refresh still runs.
    }
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !disposed) {
        refresh();
        loadPackage();
      }
    });
    cleanups.push(() => foreground.remove());
  }

  return {
    kind: 'revenuecat',
    isPro,
    isDebugPro,
    subscribe: listeners.subscribe,
    canPurchase,
    canRestore: () => configured,
    refreshOffer() {
      if (configured && !disposed) loadPackage();
    },
    async manageSubscription() {
      if (!configured) return false;
      try {
        await attempt(() => sdk.showManageSubscriptions());
        return true;
      } catch {
        return false;
      }
    },
    plans,
    isSubscribed,
    async purchase(kind) {
      if (!configured) return 'unavailable';
      // Wait for the offering, but not forever: a store that never answers leaves nothing to buy.
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([packageLoad, new Promise<void>((resolve) => (timer = setTimeout(resolve, OFFER_WAIT_MS)))]);
      clearTimeout(timer);
      const pkg = packages.find((p) => p.kind === kind);
      if (pkg === undefined) return 'unavailable';
      const id = pkg.id;
      try {
        const info = await attempt(() => sdk.purchase(id));
        return apply(info) ? 'purchased' : 'failed';
      } catch (error) {
        const flags = typeof error === 'object' && error !== null ? (error as { userCancelled?: unknown; paymentPending?: unknown }) : {};
        if (flags.userCancelled === true) return 'cancelled';
        return flags.paymentPending === true ? 'pending' : 'failed';
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
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch {
          // Already gone.
        }
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
