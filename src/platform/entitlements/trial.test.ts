/** @jest-environment node */
import { setSetting } from '../../db/repositories/settingsRepo';
import { createTestDb } from '../../db/testing/createTestDb';
import { createFreeOnlyEntitlements } from './freeOnly';
import type { AppEntitlements } from './index';
import { withTrial } from './trial';

const DAY = 86_400_000;
const START = new Date(2026, 9, 12, 18, 40).getTime();

/** A store-less base whose Pro can be flipped, and that tells its subscribers when it is. */
function fakeBase(): AppEntitlements & { setPro(on: boolean): void } {
  const base = createFreeOnlyEntitlements();
  let pro = false;
  const listeners = new Set<() => void>();
  return {
    ...base,
    isPro: () => pro,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    setPro(on) {
      pro = on;
      for (const l of listeners) l();
    },
  };
}

afterEach(() => jest.useRealTimers());

describe('withTrial (§18.19, R483)', () => {
  it('is not Pro before the trial starts, and keeps the base kind', () => {
    const { db } = createTestDb();
    const entitlements = withTrial(db, createFreeOnlyEntitlements(), () => START);
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.kind).toBe('free');
    expect(entitlements.trialStatus().phase).toBe('not_started');
  });

  it('is Pro for the seven days after the start, then not', () => {
    const { db } = createTestDb();
    setSetting(db, 'trialStartedAt', START);
    let now = START;
    const entitlements = withTrial(db, createFreeOnlyEntitlements(), () => now);
    expect(entitlements.isPro()).toBe(true);
    now = START + 6 * DAY;
    expect(entitlements.isPro()).toBe(true);
    now = START + 7 * DAY + 3_600_000;
    expect(entitlements.isPro()).toBe(false);
    expect(entitlements.trialStatus().phase).toBe('ended');
  });

  it('is Pro when the store says so, trial or not, and passes the store on to subscribers', () => {
    const { db } = createTestDb();
    const base = fakeBase();
    const entitlements = withTrial(db, base, () => START);
    const heard = jest.fn();
    entitlements.subscribe(heard);
    base.setPro(true);
    expect(entitlements.isPro()).toBe(true);
    expect(heard).toHaveBeenCalled();
  });

  it('reads a new start on refreshTrial and tells subscribers', () => {
    const { db } = createTestDb();
    const entitlements = withTrial(db, createFreeOnlyEntitlements(), () => START);
    const heard = jest.fn();
    entitlements.subscribe(heard);
    setSetting(db, 'trialStartedAt', START);
    expect(entitlements.isPro()).toBe(false);
    entitlements.refreshTrial();
    expect(entitlements.isPro()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('tells subscribers the moment the trial ends, so an open screen locks without a restart', () => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
    const { db } = createTestDb();
    setSetting(db, 'trialStartedAt', START);
    const entitlements = withTrial(db, createFreeOnlyEntitlements());
    const heard = jest.fn();
    entitlements.subscribe(heard);
    jest.advanceTimersByTime(7 * DAY - 1_000);
    expect(heard).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2_000);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(entitlements.isPro()).toBe(false);
    entitlements.dispose();
  });
});
