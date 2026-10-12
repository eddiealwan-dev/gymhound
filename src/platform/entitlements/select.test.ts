/** @jest-environment node */
import { createElement } from 'react';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { setSetting } from '../../db/repositories/settingsRepo';
import { createTestDb } from '../../db/testing/createTestDb';
import type { Db } from '../../db/types';
import type { PurchasesSdk } from './index';
import { createEntitlements, entitlementsFor, selectKind, useEntitlementsState, useIsPro } from './index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
jest.mock('../../db/DbProvider', () => ({ useDb: () => mockDb }));

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;
afterEach(() => {
  globals.__DEV__ = originalDev;
  jest.restoreAllMocks();
});

const freshDb = () => createTestDb().db;

function fakeSdk(): PurchasesSdk {
  return {
    configure: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({ activeEntitlements: [] })),
    onCustomerInfo: jest.fn(() => () => {}),
    getPlans: jest.fn(async () => [{ id: 'p', kind: 'monthly' as const, priceString: '$4.99', price: 4.99, perMonthString: null, period: { count: 1, unit: 'month' as const }, freeTrialDays: null }]),
    purchase: jest.fn(async () => ({ activeEntitlements: ['pro'] })),
    restore: jest.fn(async () => ({ activeEntitlements: [] })),
    showManageSubscriptions: jest.fn(async () => {}),
  };
}

beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(
    () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
  );
});

describe('selectKind (§9, R133)', () => {
  it.each([
    // Expo Go never loads the store, key or not.
    [{ expoGo: true, apiKey: 'key', debugAllowed: true }, 'debug'],
    [{ expoGo: true, apiKey: 'key', debugAllowed: false }, 'free'],
    // A build outside Expo Go with a key uses the store.
    [{ expoGo: false, apiKey: 'key', debugAllowed: false }, 'revenuecat'],
    [{ expoGo: false, apiKey: 'key', debugAllowed: true }, 'revenuecat'],
    // No key: debug where allowed, else free.
    [{ expoGo: false, apiKey: null, debugAllowed: true }, 'debug'],
    [{ expoGo: false, apiKey: null, debugAllowed: false }, 'free'],
    [{ expoGo: true, apiKey: null, debugAllowed: true }, 'debug'],
  ] as const)('%j → %s', (env, kind) => {
    expect(selectKind(env)).toBe(kind);
  });
});

describe('createEntitlements', () => {
  it('in Expo Go never calls the SDK loader, even with a key', () => {
    const loadSdk = jest.fn(fakeSdk);
    const entitlements = createEntitlements(freshDb(), { expoGo: true, apiKey: 'key', debugAllowed: true, loadSdk });
    expect(loadSdk).not.toHaveBeenCalled();
    expect(entitlements.kind).toBe('debug');
  });

  it('with no key never calls the SDK loader', () => {
    const loadSdk = jest.fn(fakeSdk);
    const entitlements = createEntitlements(freshDb(), { expoGo: false, apiKey: null, debugAllowed: false, loadSdk });
    expect(loadSdk).not.toHaveBeenCalled();
    expect(entitlements.kind).toBe('free');
  });

  it('outside Expo Go with a key loads the SDK and configures it', () => {
    const sdk = fakeSdk();
    const entitlements = createEntitlements(freshDb(), { expoGo: false, apiKey: 'key', debugAllowed: false, loadSdk: () => sdk });
    expect(entitlements.kind).toBe('revenuecat');
    expect(sdk.configure).toHaveBeenCalledWith('key');
  });

  it('falls back to debug when the loader throws, and to free when it returns null where debug is not allowed', () => {
    const throwing = createEntitlements(freshDb(), {
      expoGo: false,
      apiKey: 'key',
      debugAllowed: true,
      loadSdk: () => {
        throw new Error('no native module');
      },
    });
    expect(throwing.kind).toBe('debug');
    const missing = createEntitlements(freshDb(), { expoGo: false, apiKey: 'key', debugAllowed: false, loadSdk: () => null });
    expect(missing.kind).toBe('free');
  });

  it('free-only stays off even with the debug unlock stored', () => {
    const db = freshDb();
    setSetting(db, 'proDebugUnlock', true);
    const entitlements = createEntitlements(db, { expoGo: false, apiKey: null, debugAllowed: false });
    expect(entitlements.kind).toBe('free');
    expect(entitlements.isPro()).toBe(false);
  });

  it('by default, in a development build with no key, is the debug implementation and its toggle tells subscribers', () => {
    globals.__DEV__ = true;
    const entitlements = createEntitlements(freshDb());
    expect(entitlements.kind).toBe('debug');
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isPro()));
    entitlements.setDebugUnlock(true);
    expect(entitlements.isPro()).toBe(true);
    expect(seen).toEqual([true]);
  });
});

describe('entitlementsFor (R126)', () => {
  it('gives one object per database, so the Settings switch reaches every screen', () => {
    globals.__DEV__ = true;
    const db = freshDb();
    const shared = entitlementsFor(db);
    expect(entitlementsFor(db)).toBe(shared);
    expect(entitlementsFor(freshDb())).not.toBe(shared);

    const db2 = freshDb();
    const seen: boolean[] = [];
    entitlementsFor(db2).subscribe(() => seen.push(true));
    entitlementsFor(db2).setDebugUnlock(true);
    expect(seen).toEqual([true]);
  });

  it('disposes the object it replaces when another database arrives', () => {
    const first = entitlementsFor(freshDb());
    const dispose = jest.spyOn(first, 'dispose');
    entitlementsFor(freshDb());
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('dispose on every kind', () => {
  it('free and debug have a dispose that does nothing harmful', () => {
    expect(() => createEntitlements(freshDb(), { expoGo: false, apiKey: null, debugAllowed: false }).dispose()).not.toThrow();
    expect(() => createEntitlements(freshDb(), { expoGo: false, apiKey: null, debugAllowed: true }).dispose()).not.toThrow();
  });
});

describe('useIsPro and useEntitlementsState', () => {
  it('read the shared object and re-render when the debug switch flips', () => {
    globals.__DEV__ = true;
    mockDb = freshDb();
    const seen: string[] = [];
    function Probe() {
      const pro = useIsPro();
      const state = useEntitlementsState();
      seen.push(JSON.stringify({ pro, ...state }));
      return null;
    }
    act(() => {
      create(createElement(Probe));
    });
    expect(JSON.parse(seen[seen.length - 1])).toEqual({
      pro: false,
      isPro: false,
      isDebugPro: false,
      canPurchase: false,
      canRestore: false,
      plans: [],
      subscribed: false,
      kind: 'debug',
      trialOnly: false,
    });
    act(() => entitlementsFor(mockDb).setDebugUnlock(true));
    expect(JSON.parse(seen[seen.length - 1])).toMatchObject({ pro: true, isPro: true, isDebugPro: true });
  });
});
