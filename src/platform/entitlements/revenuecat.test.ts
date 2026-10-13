/** @jest-environment node */
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import { createTestDb } from '../../db/testing/createTestDb';
import type { Db } from '../../db/types';
import type { PurchasesSdk } from './index';
import { createRevenueCatEntitlements, DEFAULT_OFFERING, PRO_ENTITLEMENT, storePeriod } from './revenuecat';

type Info = { activeEntitlements: string[]; proExpires?: boolean };
const PRO: Info = { activeEntitlements: ['pro'] };
const NONE: Info = { activeEntitlements: [] };
const MONTHLY = { id: '$rc_monthly', kind: 'monthly' as const, priceString: '$4.99', price: 4.99, perMonthString: null, period: { count: 1, unit: 'month' as const }, freeTrialDays: 7 };
const YEARLY = { id: '$rc_annual', kind: 'yearly' as const, priceString: '$39.99', price: 39.99, perMonthString: '$3.33', period: { count: 1, unit: 'year' as const }, freeTrialDays: 7 };
const LIFETIME = { id: '$rc_lifetime', kind: 'lifetime' as const, priceString: '$99.99', price: 99.99, perMonthString: null, period: null, freeTrialDays: null };
type Plans = Awaited<ReturnType<PurchasesSdk['getPlans']>>;

/** A fake store: every call is a jest.fn, `push` plays a customer-info update from the store. */
function fakeSdk(overrides: Partial<PurchasesSdk> = {}) {
  let listener: ((info: Info) => void) | null = null;
  const sdk = {
    configure: jest.fn<void, [string]>(),
    getCustomerInfo: jest.fn<Promise<Info>, []>(async () => NONE),
    onCustomerInfo: jest.fn((l: (info: Info) => void) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    getPlans: jest.fn<Promise<Plans>, []>(async () => [MONTHLY]),
    purchase: jest.fn<Promise<Info>, [string]>(async () => PRO),
    restore: jest.fn<Promise<Info>, []>(async () => PRO),
    showManageSubscriptions: jest.fn<Promise<void>, []>(async () => {}),
    ...overrides,
  };
  return { sdk, push: (info: Info) => listener?.(info) };
}

/** Lets the calls started without awaiting (customer info, the offering) settle. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

let appStateHandler: ((state: AppStateStatus) => void) | null = null;
beforeEach(() => {
  appStateHandler = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});
afterEach(() => jest.restoreAllMocks());

let db: Db;
beforeEach(() => {
  db = createTestDb().db;
});

describe('RevenueCat entitlements (R135)', () => {
  it('names the entitlement and the offering it reads', () => {
    expect(PRO_ENTITLEMENT).toBe('pro');
    expect(DEFAULT_OFFERING).toBe('default');
  });

  it('configures with the key, then asks for customer info and the offering without waiting', async () => {
    const { sdk } = fakeSdk();
    const entitlements = createRevenueCatEntitlements(db, sdk, 'appl_key', false);
    expect(entitlements.kind).toBe('revenuecat');
    expect(sdk.configure).toHaveBeenCalledWith('appl_key');
    expect(sdk.getCustomerInfo).toHaveBeenCalledTimes(1);
    expect(sdk.getPlans).toHaveBeenCalledTimes(1);
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.canPurchase()).toBe(false);
    await settle();
    expect(entitlements.canPurchase()).toBe(true);
  });

  it('is Pro from pro_cached at once, before the store answers', () => {
    setSetting(db, 'proCached', true);
    const { sdk } = fakeSdk({ getCustomerInfo: jest.fn(() => new Promise<Info>(() => {})) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    expect(entitlements.isPro()).toBe(true);
    expect(entitlements.isDebugPro()).toBe(false);
  });

  it('keeps pro_cached when getCustomerInfo rejects (offline), and does not throw', async () => {
    setSetting(db, 'proCached', true);
    const { sdk } = fakeSdk({ getCustomerInfo: jest.fn(async () => Promise.reject(new Error('offline'))) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(entitlements.isPro()).toBe(true);
    expect(getSettings(db).proCached).toBe(true);
  });

  it('keeps pro_cached when getCustomerInfo throws synchronously', async () => {
    setSetting(db, 'proCached', true);
    const { sdk } = fakeSdk({
      getCustomerInfo: jest.fn(() => {
        throw new Error('boom');
      }),
    });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(entitlements.isPro()).toBe(true);
  });

  it('customer info with pro writes pro_cached and notifies once', async () => {
    const { sdk } = fakeSdk({ getCustomerInfo: jest.fn(async () => PRO), getPlans: jest.fn(async (): Promise<Plans> => []) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isPro()));
    await settle();
    expect(getSettings(db).proCached).toBe(true);
    expect(entitlements.isPro()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('a store update with no pro turns Pro off (a lapse) and notifies', async () => {
    setSetting(db, 'proCached', true);
    const { sdk, push } = fakeSdk({ getCustomerInfo: jest.fn(async () => PRO) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isPro()));
    push(NONE);
    expect(entitlements.isPro()).toBe(false);
    expect(getSettings(db).proCached).toBe(false);
    expect(seen).toEqual([false]);
    push(NONE);
    expect(seen).toEqual([false]);
  });

  it('configure throwing falls back to pro_cached, with no store and no crash', async () => {
    setSetting(db, 'proCached', true);
    const { sdk } = fakeSdk({
      configure: jest.fn(() => {
        throw new Error('no native module');
      }),
    });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(entitlements.isPro()).toBe(true);
    expect(entitlements.canPurchase()).toBe(false);
    expect(sdk.getCustomerInfo).not.toHaveBeenCalled();
    await expect(entitlements.purchase('monthly')).resolves.toBe('unavailable');
    await expect(entitlements.restore()).resolves.toBe('unavailable');
    expect(entitlements.canRestore()).toBe(false);
    entitlements.refreshOffer();
    expect(sdk.getPlans).not.toHaveBeenCalled();
    await expect(entitlements.manageSubscription()).resolves.toBe(false);
    expect(sdk.showManageSubscriptions).not.toHaveBeenCalled();
  });

  it('can restore once the store is configured, even with nothing to buy', async () => {
    const { sdk } = fakeSdk({ getPlans: jest.fn(async (): Promise<Plans> => []) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(entitlements.canPurchase()).toBe(false);
    expect(entitlements.canRestore()).toBe(true);
  });

  it('loads the offering again when the app comes back to the foreground, so a store that was slow can sell', async () => {
    const { sdk } = fakeSdk({ getPlans: jest.fn(async (): Promise<Plans> => Promise.reject(new Error('offline'))) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(entitlements.canPurchase()).toBe(false);
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.canPurchase()));

    (sdk.getPlans as jest.Mock).mockResolvedValueOnce([MONTHLY]);
    appStateHandler?.('active');
    expect(sdk.getPlans).toHaveBeenCalledTimes(2);
    await settle();
    expect(entitlements.canPurchase()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('refreshOffer() loads the offering again and keeps the last one when the store fails', async () => {
    const { sdk } = fakeSdk();
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    (sdk.getPlans as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    entitlements.refreshOffer();
    expect(sdk.getPlans).toHaveBeenCalledTimes(2);
    await settle();
    expect(entitlements.canPurchase()).toBe(true);
    (sdk.getPlans as jest.Mock).mockResolvedValueOnce([{ ...MONTHLY, priceString: '$5.99' }]);
    entitlements.refreshOffer();
    await settle();
    expect(entitlements.plans()[0]?.priceString).toBe('$5.99');
  });

  it('manageSubscription() opens the store page; a failure resolves false and never throws', async () => {
    const { sdk } = fakeSdk();
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await expect(entitlements.manageSubscription()).resolves.toBe(true);
    expect(sdk.showManageSubscriptions).toHaveBeenCalledTimes(1);
    (sdk.showManageSubscriptions as jest.Mock).mockRejectedValueOnce(new Error('unsupported'));
    await expect(entitlements.manageSubscription()).resolves.toBe(false);
    (sdk.showManageSubscriptions as jest.Mock).mockImplementationOnce(() => {
      throw new Error('sync');
    });
    await expect(entitlements.manageSubscription()).resolves.toBe(false);
  });

  it('refreshes customer info when the app comes back to the foreground', async () => {
    const { sdk } = fakeSdk();
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    await settle();
    expect(sdk.getCustomerInfo).toHaveBeenCalledTimes(1);
    appStateHandler?.('background');
    expect(sdk.getCustomerInfo).toHaveBeenCalledTimes(1);
    (sdk.getCustomerInfo as jest.Mock).mockResolvedValueOnce(PRO);
    appStateHandler?.('active');
    expect(sdk.getCustomerInfo).toHaveBeenCalledTimes(2);
    await settle();
    expect(entitlements.isPro()).toBe(true);
  });

  it('isSubscribed() is on only while Pro comes from an entitlement with an end date (a subscription), not lifetime', async () => {
    const { sdk, push } = fakeSdk({ getCustomerInfo: jest.fn(async () => ({ activeEntitlements: ['pro'], proExpires: true })) });
    const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
    expect(entitlements.isSubscribed()).toBe(false);
    await settle();
    expect(entitlements.isSubscribed()).toBe(true);
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isSubscribed()));
    push({ activeEntitlements: ['pro'], proExpires: false });
    expect(entitlements.isSubscribed()).toBe(false);
    expect(entitlements.isPro()).toBe(true);
    expect(seen).toEqual([false]);
    push({ activeEntitlements: [], proExpires: true });
    expect(entitlements.isSubscribed()).toBe(false);
  });

  describe('plans() (R556)', () => {
    it("reads the default offering's plans, yearly, monthly and lifetime in that order, and notifies when they arrive", async () => {
      const { sdk } = fakeSdk({ getPlans: jest.fn(async () => [LIFETIME, MONTHLY, YEARLY]) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      const seen: number[] = [];
      entitlements.subscribe(() => seen.push(1));
      expect(entitlements.plans()).toEqual([]);
      await settle();
      expect(entitlements.plans().map((p) => p.kind)).toEqual(['yearly', 'monthly', 'lifetime']);
      const { id: _id, ...yearly } = YEARLY;
      expect(entitlements.plans()[0]).toEqual(yearly);
      expect(seen).toEqual([1]);
    });

    it('keeps one plan of each kind', async () => {
      const { sdk } = fakeSdk({ getPlans: jest.fn(async () => [MONTHLY, { ...MONTHLY, id: 'other', priceString: '$9.99' }]) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      expect(entitlements.plans()).toHaveLength(1);
      expect(entitlements.plans()[0].priceString).toBe('$4.99');
    });

    it('no plans, or the offering failing, leaves none and nothing to buy', async () => {
      const none = createRevenueCatEntitlements(db, fakeSdk({ getPlans: jest.fn(async (): Promise<Plans> => []) }).sdk, 'key', false);
      const broken = createRevenueCatEntitlements(
        db,
        fakeSdk({ getPlans: jest.fn(async (): Promise<Plans> => Promise.reject(new Error('offline'))) }).sdk,
        'key',
        false,
      );
      await settle();
      for (const entitlements of [none, broken]) {
        expect(entitlements.plans()).toEqual([]);
        expect(entitlements.canPurchase()).toBe(false);
      }
    });

    it('maps any single ISO 8601 store period to a count and a unit (R157); anything else is null', () => {
      expect(storePeriod('P1W')).toEqual({ count: 1, unit: 'week' });
      expect(storePeriod('P1M')).toEqual({ count: 1, unit: 'month' });
      expect(storePeriod('P3M')).toEqual({ count: 3, unit: 'month' });
      expect(storePeriod('P6M')).toEqual({ count: 6, unit: 'month' });
      expect(storePeriod('P1Y')).toEqual({ count: 1, unit: 'year' });
      expect(storePeriod('P7D')).toEqual({ count: 7, unit: 'day' });
      for (const garbage of ['', 'P', 'P0M', 'PM', 'P1X', '1M', 'P1Y6M', 'p1m', 'P1.5M', 'P-1M', ' P1M']) {
        expect(storePeriod(garbage)).toBeNull();
      }
      expect(storePeriod(null)).toBeNull();
      expect(storePeriod(undefined)).toBeNull();
    });
  });

  describe('purchase()', () => {
    it('buys the chosen plan: pro active → purchased, pro_cached written, subscribers told', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      const seen: boolean[] = [];
      entitlements.subscribe(() => seen.push(entitlements.isPro()));
      await expect(entitlements.purchase('monthly')).resolves.toBe('purchased');
      expect(sdk.purchase).toHaveBeenCalledWith('$rc_monthly');
      expect(getSettings(db).proCached).toBe(true);
      expect(seen).toEqual([true]);
    });

    it('waits for the offering when it has not arrived yet', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase('monthly')).resolves.toBe('purchased');
    });

    it('a purchase that leaves pro inactive is failed', async () => {
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => NONE) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase('monthly')).resolves.toBe('failed');
      expect(entitlements.isPro()).toBe(false);
    });

    it('cancelled by the user → cancelled', async () => {
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => Promise.reject({ userCancelled: true })) });
      await expect(createRevenueCatEntitlements(db, sdk, 'key', false).purchase('monthly')).resolves.toBe('cancelled');
    });

    it('waiting for approval (Ask to Buy, a pending payment) → pending, Pro unchanged', async () => {
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => Promise.reject({ paymentPending: true })) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase('monthly')).resolves.toBe('pending');
      expect(entitlements.isPro()).toBe(false);
    });

    it('any other error → failed, Pro unchanged', async () => {
      setSetting(db, 'proCached', false);
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => Promise.reject(new Error('network'))) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase('monthly')).resolves.toBe('failed');
      expect(entitlements.isPro()).toBe(false);
    });

    it("buys the chosen plan's own package", async () => {
      const { sdk } = fakeSdk({ getPlans: jest.fn(async () => [YEARLY, MONTHLY, LIFETIME]) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase('lifetime')).resolves.toBe('purchased');
      expect(sdk.purchase).toHaveBeenCalledWith('$rc_lifetime');
      await expect(entitlements.purchase('yearly')).resolves.toBe('purchased');
      expect(sdk.purchase).toHaveBeenLastCalledWith('$rc_annual');
    });

    it('a plan the store does not sell → unavailable', async () => {
      const { sdk } = fakeSdk();
      await expect(createRevenueCatEntitlements(db, sdk, 'key', false).purchase('lifetime')).resolves.toBe('unavailable');
      expect(sdk.purchase).not.toHaveBeenCalled();
    });

    it('no package → unavailable, and the store is not asked to buy', async () => {
      const { sdk } = fakeSdk({ getPlans: jest.fn(async (): Promise<Plans> => []) });
      await expect(createRevenueCatEntitlements(db, sdk, 'key', false).purchase('monthly')).resolves.toBe('unavailable');
      expect(sdk.purchase).not.toHaveBeenCalled();
    });
    it('gives up waiting for an offering that never arrives after 10 seconds: unavailable', async () => {
      jest.useFakeTimers();
      try {
        const { sdk } = fakeSdk({ getPlans: jest.fn(() => new Promise<Plans>(() => {})) });
        const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
        let result: string | null = null;
        void entitlements.purchase('monthly').then((r) => (result = r));
        await jest.advanceTimersByTimeAsync(9_999);
        expect(result).toBeNull();
        await jest.advanceTimersByTimeAsync(1);
        expect(result).toBe('unavailable');
        expect(sdk.purchase).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('leaves no timer behind once the offering arrives', async () => {
      jest.useFakeTimers();
      try {
        const { sdk } = fakeSdk();
        const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
        await expect(entitlements.purchase('monthly')).resolves.toBe('purchased');
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('dispose()', () => {
    it('removes the foreground listener and the store listener, once', async () => {
      const remove = jest.fn();
      jest.spyOn(AppState, 'addEventListener').mockImplementation(
        () => ({ remove }) as unknown as ReturnType<typeof AppState.addEventListener>,
      );
      const unsubscribeStore = jest.fn();
      const { sdk } = fakeSdk({ onCustomerInfo: jest.fn(() => unsubscribeStore) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      entitlements.dispose();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(unsubscribeStore).toHaveBeenCalledTimes(1);
      entitlements.dispose();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(unsubscribeStore).toHaveBeenCalledTimes(1);
    });

    it('stops hearing store updates and foreground refreshes after it', async () => {
      const { sdk, push } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      const seen: boolean[] = [];
      entitlements.subscribe(() => seen.push(entitlements.isPro()));
      entitlements.dispose();
      push(PRO);
      expect(seen).toEqual([]);
      expect(getSettings(db).proCached).toBe(false);
    });

    it('is a no-op when configure failed', () => {
      const { sdk } = fakeSdk({
        configure: jest.fn(() => {
          throw new Error('no native module');
        }),
      });
      expect(() => createRevenueCatEntitlements(db, sdk, 'key', false).dispose()).not.toThrow();
    });
  });

  describe('restore()', () => {
    it('pro active after → restored', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.restore()).resolves.toBe('restored');
      expect(entitlements.isPro()).toBe(true);
    });

    it('nothing found → none, and Pro stays off', async () => {
      const { sdk } = fakeSdk({ restore: jest.fn(async () => NONE) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.restore()).resolves.toBe('none');
      expect(entitlements.isPro()).toBe(false);
    });

    it('a rejection → failed, pro_cached kept', async () => {
      setSetting(db, 'proCached', true);
      const offline = async () => Promise.reject(new Error('offline'));
      const { sdk } = fakeSdk({ getCustomerInfo: jest.fn(offline), restore: jest.fn(offline) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.restore()).resolves.toBe('failed');
      expect(entitlements.isPro()).toBe(true);
    });
  });

  describe('the debug unlock under RevenueCat (R133)', () => {
    it('turns Pro on for testing where it is allowed, and says so', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', true);
      await settle();
      const seen: boolean[] = [];
      entitlements.subscribe(() => seen.push(entitlements.isPro()));
      entitlements.setDebugUnlock(true);
      expect(entitlements.isPro()).toBe(true);
      expect(entitlements.isDebugPro()).toBe(true);
      expect(seen).toEqual([true]);
      entitlements.setDebugUnlock(false);
      expect(entitlements.isPro()).toBe(false);
    });

    it('is not "for testing" when the store also says Pro', async () => {
      setSetting(db, 'proCached', true);
      setSetting(db, 'proDebugUnlock', true);
      const entitlements = createRevenueCatEntitlements(db, fakeSdk({ getCustomerInfo: jest.fn(async () => PRO) }).sdk, 'key', true);
      expect(entitlements.isPro()).toBe(true);
      expect(entitlements.isDebugPro()).toBe(false);
    });

    it('is ignored where it is not allowed: a stored unlock does nothing, setDebugUnlock is a no-op', async () => {
      setSetting(db, 'proDebugUnlock', true);
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      const seen: boolean[] = [];
      entitlements.subscribe(() => seen.push(entitlements.isPro()));
      expect(entitlements.isPro()).toBe(false);
      entitlements.setDebugUnlock(false);
      entitlements.setDebugUnlock(true);
      expect(entitlements.isPro()).toBe(false);
      expect(seen).toEqual([]);
    });
  });
});
