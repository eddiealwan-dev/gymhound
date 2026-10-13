import type { PurchasesSdk } from './index';

/**
 * The RevenueCat SDK, where the platform has one. This is the web (and default) twin: there is no store, so the web
 * bundle never includes `react-native-purchases` (R134). Phones use `revenuecatSdk.native.ts`.
 */
export function loadPurchasesSdk(): PurchasesSdk | null {
  return null;
}
