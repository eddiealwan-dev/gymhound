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
