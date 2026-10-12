import { loadOptional, nativeEnv, type NativeEnv } from '../native/optional';
import { createAppleHealthStore, type HealthKitLike } from './appleHealth';
import { createHealthConnectStore, type HealthConnectLike } from './healthConnect';
import type { HealthStore } from './types';

export type { HealthAccess, HealthRead, HealthStore } from './types';

/**
 * PHASE 7: the phone's health store (§17.1, R307), or null in Expo Go, on the web, and in a build without the store's
 * package. These are the only lines that name `@kingstinct/react-native-healthkit` and `react-native-health-connect`,
 * and only through `loadOptional`. With null, every caller does what it did before phase 7: nothing is written, and
 * no offer or reading appears.
 */
export function loadHealthStore(env: NativeEnv = nativeEnv()): HealthStore | null {
  if (env.os === 'ios') {
    const hk = loadOptional<HealthKitLike>(() => require('@kingstinct/react-native-healthkit'), env);
    return hk && typeof hk.saveWorkoutSample === 'function' ? createAppleHealthStore(hk) : null;
  }
  if (env.os === 'android') {
    const hc = loadOptional<HealthConnectLike>(() => require('react-native-health-connect'), env);
    return hc && typeof hc.insertRecords === 'function' ? createHealthConnectStore(hc) : null;
  }
  return null;
}

let store: HealthStore | null | undefined;

/** The app's one health store, made on first use (null where there is none). */
export function getHealthStore(): HealthStore | null {
  if (store === undefined) store = loadHealthStore();
  return store;
}
