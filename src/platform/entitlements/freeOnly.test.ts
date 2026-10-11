/** @jest-environment node */
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import { seededDb } from '../../db/testing/fixtures';
import { createFreeOnlyEntitlements, debugUnlockAllowed } from './freeOnly';
import { createEntitlements, entitlementsFor } from './index';

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_DEBUG_UNLOCK;

/** A development build (`__DEV__`) unless `dev` is false; `flag` is `EXPO_PUBLIC_DEBUG_UNLOCK`, unset when undefined. */
function build(dev: boolean, flag?: string): void {
  globals.__DEV__ = dev;
  if (flag === undefined) delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
  else process.env.EXPO_PUBLIC_DEBUG_UNLOCK = flag;
}

beforeEach(() => build(true));

afterEach(() => {
  globals.__DEV__ = originalDev;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
  else process.env.EXPO_PUBLIC_DEBUG_UNLOCK = originalFlag;
});

describe('free-only entitlements (R88)', () => {
  it('is not Pro by default', () => {
    expect(createFreeOnlyEntitlements(seededDb()).isPro()).toBe(false);
  });

  it('is Pro while the debug unlock is on, read live from Settings', () => {
    const db = seededDb();
    const entitlements = createFreeOnlyEntitlements(db);
    setSetting(db, 'proDebugUnlock', true);
    expect(entitlements.isPro()).toBe(true);
    setSetting(db, 'proDebugUnlock', false);
    expect(entitlements.isPro()).toBe(false);
  });

  it('setDebugUnlock writes the setting and tells subscribers only when it changes', () => {
    const db = seededDb();
    const entitlements = createFreeOnlyEntitlements(db);
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

  it('has nothing to buy or restore until Pro exists', async () => {
    const entitlements = createFreeOnlyEntitlements(seededDb());
    await expect(entitlements.purchase()).resolves.toBe('unavailable');
    await expect(entitlements.restore()).resolves.toBe(false);
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
    const db = seededDb();
    const entitlements = createFreeOnlyEntitlements(db);
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
    const db = seededDb();
    setSetting(db, 'proDebugUnlock', true);
    expect(createFreeOnlyEntitlements(db).isPro()).toBe(true);
  });
});

describe('createEntitlements', () => {
  it('is the free-only implementation for now, and its debug toggle tells subscribers', () => {
    const db = seededDb();
    const entitlements = createEntitlements(db);
    const seen: boolean[] = [];
    entitlements.subscribe(() => seen.push(entitlements.isPro()));
    expect(entitlements.isPro()).toBe(false);

    entitlements.setDebugUnlock(true);
    expect(entitlements.isPro()).toBe(true);
    expect(seen).toEqual([true]);
  });

  it('entitlementsFor gives one object per database, so the Settings switch reaches every screen (R126)', () => {
    const db = seededDb();
    const shared = entitlementsFor(db);
    expect(entitlementsFor(db)).toBe(shared);

    const seen: boolean[] = [];
    shared.subscribe(() => seen.push(true));
    entitlementsFor(db).setDebugUnlock(true);
    expect(seen).toEqual([true]);
  });
});
