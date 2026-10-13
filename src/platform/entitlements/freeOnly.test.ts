/** @jest-environment node */
import { createFreeOnlyEntitlements } from './freeOnly';

describe('free-only entitlements (R133): a build with no store and no debug unlock', () => {
  it('is never Pro and never for testing', () => {
    const entitlements = createFreeOnlyEntitlements();
    expect(entitlements.kind).toBe('free');
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.isDebugPro()).toBe(false);
  });

  it('setDebugUnlock is a no-op: Pro stays off and subscribers hear nothing', () => {
    const entitlements = createFreeOnlyEntitlements();
    const seen: boolean[] = [];
    const unsubscribe = entitlements.subscribe(() => seen.push(entitlements.isPro()));
    entitlements.setDebugUnlock(true);
    expect(entitlements.isPro()).toBe(false);
    expect(seen).toEqual([]);
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('has no store: nothing to buy or restore, no plans', async () => {
    const entitlements = createFreeOnlyEntitlements();
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
