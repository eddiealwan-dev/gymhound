/** @jest-environment node */
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import { createTestDb } from '../../db/testing/createTestDb';
import type { Db } from '../../db/types';
import type { PurchasesSdk } from './index';
import { createRevenueCatEntitlements, DEFAULT_OFFERING, PRO_ENTITLEMENT, storePeriod } from './revenuecat';

type Info = { activeEntitlements: string[] };
const PRO: Info = { activeEntitlements: ['pro'] };
const NONE: Info = { activeEntitlements: [] };
const MONTHLY = { id: '$rc_monthly', priceString: '$4.99', period: 'month' as const };

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
    getDefaultPackage: jest.fn<ReturnType<PurchasesSdk['getDefaultPackage']>, []>(async () => MONTHLY),
    purchase: jest.fn<Promise<Info>, [string]>(async () => PRO),
    restore: jest.fn<Promise<Info>, []>(async () => PRO),
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
    expect(sdk.getDefaultPackage).toHaveBeenCalledTimes(1);
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
    const { sdk } = fakeSdk({ getCustomerInfo: jest.fn(async () => PRO), getDefaultPackage: jest.fn(async () => null) });
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
    await expect(entitlements.purchase()).resolves.toBe('unavailable');
    await expect(entitlements.restore()).resolves.toBe('unavailable');
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

  describe('offer()', () => {
    it('reads the price and period of the default package and notifies when it arrives', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      const seen: number[] = [];
      entitlements.subscribe(() => seen.push(1));
      expect(entitlements.offer()).toBeNull();
      await settle();
      expect(entitlements.offer()).toEqual({ priceString: '$4.99', period: 'month' });
      expect(seen).toEqual([1]);
    });

    it('a lifetime product has period null', async () => {
      const { sdk } = fakeSdk({ getDefaultPackage: jest.fn(async () => ({ id: 'lifetime', priceString: '$29.99', period: null })) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      expect(entitlements.offer()).toEqual({ priceString: '$29.99', period: null });
    });

    it('no package, or the offering failing, leaves no offer and nothing to buy', async () => {
      const none = createRevenueCatEntitlements(db, fakeSdk({ getDefaultPackage: jest.fn(async () => null) }).sdk, 'key', false);
      const broken = createRevenueCatEntitlements(
        db,
        fakeSdk({ getDefaultPackage: jest.fn(async () => Promise.reject(new Error('offline'))) }).sdk,
        'key',
        false,
      );
      await settle();
      for (const entitlements of [none, broken]) {
        expect(entitlements.offer()).toBeNull();
        expect(entitlements.canPurchase()).toBe(false);
      }
    });

    it('maps the store subscription period: P1W, P1M, P1Y; anything else is null', () => {
      expect(storePeriod('P1W')).toBe('week');
      expect(storePeriod('P1M')).toBe('month');
      expect(storePeriod('P1Y')).toBe('year');
      expect(storePeriod('P3M')).toBeNull();
      expect(storePeriod(null)).toBeNull();
      expect(storePeriod(undefined)).toBeNull();
    });
  });

  describe('purchase()', () => {
    it('buys the default package: pro active → purchased, pro_cached written, subscribers told', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await settle();
      const seen: boolean[] = [];
      entitlements.subscribe(() => seen.push(entitlements.isPro()));
      await expect(entitlements.purchase()).resolves.toBe('purchased');
      expect(sdk.purchase).toHaveBeenCalledWith('$rc_monthly');
      expect(getSettings(db).proCached).toBe(true);
      expect(seen).toEqual([true]);
    });

    it('waits for the offering when it has not arrived yet', async () => {
      const { sdk } = fakeSdk();
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase()).resolves.toBe('purchased');
    });

    it('a purchase that leaves pro inactive is failed', async () => {
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => NONE) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase()).resolves.toBe('failed');
      expect(entitlements.isPro()).toBe(false);
    });

    it('cancelled by the user → cancelled', async () => {
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => Promise.reject({ userCancelled: true })) });
      await expect(createRevenueCatEntitlements(db, sdk, 'key', false).purchase()).resolves.toBe('cancelled');
    });

    it('any other error → failed, Pro unchanged', async () => {
      setSetting(db, 'proCached', false);
      const { sdk } = fakeSdk({ purchase: jest.fn(async () => Promise.reject(new Error('network'))) });
      const entitlements = createRevenueCatEntitlements(db, sdk, 'key', false);
      await expect(entitlements.purchase()).resolves.toBe('failed');
      expect(entitlements.isPro()).toBe(false);
    });

    it('no package → unavailable, and the store is not asked to buy', async () => {
      const { sdk } = fakeSdk({ getDefaultPackage: jest.fn(async () => null) });
      await expect(createRevenueCatEntitlements(db, sdk, 'key', false).purchase()).resolves.toBe('unavailable');
      expect(sdk.purchase).not.toHaveBeenCalled();
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
