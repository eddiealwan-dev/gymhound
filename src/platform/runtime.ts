import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Whether the app runs inside Expo Go, which has no RevenueCat native code (R134). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/**
 * The RevenueCat API key for this platform, from `EXPO_PUBLIC_REVENUECAT_IOS_KEY` or `_ANDROID_KEY`, or null when it is
 * unset or empty, and always on the web. No key is committed, so until phase 7 every build runs debug or free (R134).
 * Each variable is named in full so Expo inlines it at build time.
 */
export function revenueCatApiKey(): string | null {
  const key = Platform.select<string | undefined>({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    default: undefined,
  });
  return key === undefined || key === '' ? null : key;
}

/**
 * Whether this is a tester build (§18.28, R592): the `tester` EAS profile sets `EXPO_PUBLIC_TESTER=1` for TestFlight.
 * It turns Pro on for every tester and asks the tester questions after the 2nd and 3rd finished workouts. The store
 * build never sets it. Named in full so Expo inlines it at build time.
 */
export function isTesterBuild(): boolean {
  return process.env.EXPO_PUBLIC_TESTER === '1';
}

/**
 * The store link that share cards and routine codes carry (§18.28, R595), from `EXPO_PUBLIC_STORE_URL`, or null while it
 * is unset or empty (now: there is no listing yet). One link for both stores: a GruntHound page that sends each phone to
 * its store. Named in full so Expo inlines it at build time.
 */
export function storeUrl(): string | null {
  const url = process.env.EXPO_PUBLIC_STORE_URL;
  return url === undefined || url.trim() === '' ? null : url.trim();
}
