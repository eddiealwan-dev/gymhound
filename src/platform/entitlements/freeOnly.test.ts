/** @jest-environment node */
import { getSettings, setSetting } from '../../db/repositories/settingsRepo';
import { seededDb } from '../../db/testing/fixtures';
import { createFreeOnlyEntitlements } from './freeOnly';
import { createEntitlements } from './index';

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

  it('createEntitlements is the free-only implementation for now', () => {
    const db = seededDb();
    const entitlements = createEntitlements(db);
    expect(entitlements.isPro()).toBe(false);
    setSetting(db, 'proDebugUnlock', true);
    expect(entitlements.isPro()).toBe(true);
  });
});
