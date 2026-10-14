import type { Db } from '../../db/types';
import { isExpoGo, isTesterBuild, revenueCatApiKey } from '../runtime';
import { createDebugEntitlements, debugUnlockAllowed } from './debug';
import { createFreeOnlyEntitlements } from './freeOnly';
import type { AppEntitlements, EntitlementsKind, PurchasesSdk } from './index';
import { createRevenueCatEntitlements } from './revenuecat';
import { loadPurchasesSdk } from './revenuecatSdk';

type Env = { expoGo: boolean; apiKey: string | null; debugAllowed: boolean; tester?: boolean };

/**
 * Which entitlements this build uses (§9, R133): a tester build's Pro for everyone (R592); RevenueCat outside Expo Go
 * with a store key; else the debug unlock where it is allowed; else free-only.
 */
export function selectKind(env: Env): EntitlementsKind {
  if (env.tester) return 'debug';
  if (!env.expoGo && env.apiKey !== null) return 'revenuecat';
  return env.debugAllowed ? 'debug' : 'free';
}

/**
 * A new entitlements object for this build. `env` overrides what the app reads (Expo Go, the key, whether the debug
 * unlock is allowed, the SDK loader) for tests. The SDK loader is called only when RevenueCat is chosen, so Expo Go and
 * keyless builds never load `react-native-purchases` (R134); if it returns null or throws, debug or free answers.
 * Screens use `entitlementsFor`, so they share one object and its listeners.
 */
export function createEntitlements(
  db: Db,
  env: Partial<Env & { loadSdk: () => PurchasesSdk | null }> = {},
): AppEntitlements {
  const expoGo = env.expoGo ?? isExpoGo();
  const apiKey = env.apiKey !== undefined ? env.apiKey : revenueCatApiKey();
  const debugAllowed = env.debugAllowed ?? debugUnlockAllowed();
  const loadSdk = env.loadSdk ?? loadPurchasesSdk;
  const tester = env.tester ?? isTesterBuild();

  if (tester) return createDebugEntitlements(db, true);
  let kind = selectKind({ expoGo, apiKey, debugAllowed });
  if (kind === 'revenuecat' && apiKey !== null) {
    let sdk: PurchasesSdk | null = null;
    try {
      sdk = loadSdk();
    } catch {
      sdk = null;
    }
    if (sdk !== null) return createRevenueCatEntitlements(db, sdk, apiKey, debugAllowed);
    kind = selectKind({ expoGo, apiKey: null, debugAllowed });
  }
  return kind === 'debug' ? createDebugEntitlements(db) : createFreeOnlyEntitlements();
}

/** The app's one entitlements object and the database it reads, made on first use. */
let shared: { db: Db; entitlements: AppEntitlements } | null = null;

/**
 * The app's entitlements, one per app (R126): every screen gets the same object, so when Settings' "Unlock Pro for
 * testing" calls `setDebugUnlock`, what subscribed on another screen hears it. The app opens one database; another one
 * (a test's) gets a fresh object. A free trial is the App Store's (R563), so it is Pro from the store like any other.
 */
export function entitlementsFor(db: Db): AppEntitlements {
  if (shared === null || shared.db !== db) {
    shared?.entitlements.dispose();
    shared = { db, entitlements: createEntitlements(db) };
  }
  return shared.entitlements;
}
