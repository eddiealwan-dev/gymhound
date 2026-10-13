/** @jest-environment node */
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import { createTestDb } from '../../db/testing/createTestDb';
import { createDebugEntitlements, debugUnlockAllowed } from './debug';

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_DEBUG_UNLOCK;

/** A development build (`__DEV__`) unless `dev` is false; `flag` is `EXPO_PUBLIC_DEBUG_UNLOCK`, unset when undefined. */
function build(dev: boolean, flag?: string): void {
  globals.__DEV__ = dev;
  if (flag === undefined) delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
  else process.env.EXPO_PUBLIC_DEBUG_UNLOCK = flag;
}

const freshDb = () => createTestDb().db;

beforeEach(() => build(true));

afterEach(() => {
  globals.__DEV__ = originalDev;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
  else process.env.EXPO_PUBLIC_DEBUG_UNLOCK = originalFlag;
});

describe('debug entitlements (R88, R133)', () => {
  it('is not Pro by default', () => {
    const entitlements = createDebugEntitlements(freshDb());
    expect(entitlements.kind).toBe('debug');
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.isDebugPro()).toBe(false);
  });

  it('is Pro while the debug unlock is on, read live from Settings, and says it is for testing', () => {
    const db = freshDb();
    const entitlements = createDebugEntitlements(db);
    setSetting(db, 'proDebugUnlock', true);
    expect(entitlements.isPro()).toBe(true);
    expect(entitlements.isDebugPro()).toBe(true);
    setSetting(db, 'proDebugUnlock', false);
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.isDebugPro()).toBe(false);
  });

  it('ignores pro_cached: only a store can say Pro was bought', () => {
    const db = freshDb();
    setSetting(db, 'proCached', true);
    expect(createDebugEntitlements(db).isPro()).toBe(false);
  });

  it('setDebugUnlock writes the setting and tells subscribers only when it changes', () => {
    const db = freshDb();
    const entitlements = createDebugEntitlements(db);
    const seen: boolean[] = [];
    const unsubscribe = entitlements.subscribe(() => seen.push(entitlements.isPro()));

    entitlements.setDebugUnlock(true);
    expect(getSettings(db).proDebugUnlock).toBe(true);
    entitlements.setDebugUnlock(true);
    entitlements.setDebugUnlock(false);
    expect(seen).toEqual([true, false]);

    unsubscribe();
    entitlements.setDebugUnlock(true);
    expect(seen).toEqual([true, false]);
  });

  it('has no store: nothing to buy or restore, no plans', async () => {
    const entitlements = createDebugEntitlements(freshDb());
    expect(entitlements.canPurchase()).toBe(false);
    expect(entitlements.plans()).toEqual([]);
    expect(entitlements.isSubscribed()).toBe(false);
    await expect(entitlements.purchase('yearly')).resolves.toBe('unavailable');
    await expect(entitlements.restore()).resolves.toBe('unavailable');
    expect(entitlements.canRestore()).toBe(false);
    expect(() => entitlements.refreshOffer()).not.toThrow();
    await expect(entitlements.manageSubscription()).resolves.toBe(false);
  });
});

describe('the debug unlock is allowed only in development or with EXPO_PUBLIC_DEBUG_UNLOCK=1 (§9)', () => {
  it('is allowed in a development build', () => {
    build(true);
    expect(debugUnlockAllowed()).toBe(true);
  });

  it('is allowed in a release build that sets EXPO_PUBLIC_DEBUG_UNLOCK=1, and only to 1', () => {
    build(false, '1');
    expect(debugUnlockAllowed()).toBe(true);
    build(false, 'true');
    expect(debugUnlockAllowed()).toBe(false);
  });

  it('is ignored in a release build without the flag: Pro stays off, and subscribers hear nothing', () => {
    build(false);
    const db = freshDb();
    const entitlements = createDebugEntitlements(db);
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isPro()));

    setSetting(db, 'proDebugUnlock', true);
    expect(debugUnlockAllowed()).toBe(false);
    expect(entitlements.isPro()).toBe(false);
    entitlements.setDebugUnlock(false);
    entitlements.setDebugUnlock(true);
    expect(seen).toEqual([]);
  });

  it('a release build with the flag honours it', () => {
    build(false, '1');
    const db = freshDb();
    setSetting(db, 'proDebugUnlock', true);
    expect(createDebugEntitlements(db).isPro()).toBe(true);
  });
});
