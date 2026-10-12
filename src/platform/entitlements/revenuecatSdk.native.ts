import type { PlanKind, PurchasesSdk } from './index';
import { DEFAULT_OFFERING, PRO_ENTITLEMENT, storePeriod } from './revenuecat';

type PurchasesModule = typeof import('react-native-purchases');
type PurchasesPackage = import('react-native-purchases').PurchasesPackage;
type CustomerInfo = import('react-native-purchases').CustomerInfo;

const toInfo = (info: CustomerInfo) => ({
  activeEntitlements: Object.keys(info.entitlements.active),
  proExpires: info.entitlements.active[PRO_ENTITLEMENT]?.expirationDate != null,
});

/** Days in one of the store's period units, for a free trial's length. */
const UNIT_DAYS: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

/**
 * The RevenueCat SDK behind GymHound's narrow adapter (R134). This is the only file that names `react-native-purchases`,
 * and only inside this function: `createEntitlements` calls it only outside Expo Go and with a store key set, so
 * nothing on the app's start path loads the package. Not unit-tested (Jest has no native module); tests use a fake
 * `PurchasesSdk`.
 */
export function loadPurchasesSdk(): PurchasesSdk | null {
  const rc = require('react-native-purchases') as PurchasesModule;
  const Purchases = rc.default;
  /** The packages handed out by `getPlans`, by identifier, so `purchase` can buy the store's own object. */
  const packages = new Map<string, PurchasesPackage>();

  return {
    configure(apiKey) {
      Purchases.configure({ apiKey });
    },
    async getCustomerInfo() {
      return toInfo(await Purchases.getCustomerInfo());
    },
    onCustomerInfo(listener) {
      const native = (info: CustomerInfo) => listener(toInfo(info));
      Purchases.addCustomerInfoUpdateListener(native);
      return () => {
        Purchases.removeCustomerInfoUpdateListener(native);
      };
    },
    async getPlans() {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all[DEFAULT_OFFERING] ?? offerings.current;
      const kinds: Partial<Record<string, PlanKind>> = {
        [rc.PACKAGE_TYPE.ANNUAL]: 'yearly',
        [rc.PACKAGE_TYPE.MONTHLY]: 'monthly',
        [rc.PACKAGE_TYPE.LIFETIME]: 'lifetime',
      };
      return (offering?.availablePackages ?? []).flatMap((pkg) => {
        const kind = kinds[pkg.packageType];
        if (kind === undefined) return [];
        packages.set(pkg.identifier, pkg);
        const { product } = pkg;
        const intro = product.introPrice;
        const freeTrialDays = intro !== null && intro.price === 0 ? intro.periodNumberOfUnits * (UNIT_DAYS[intro.periodUnit] ?? 0) || null : null;
        const period = kind === 'lifetime' ? null : storePeriod(product.subscriptionPeriod);
        return [
          {
            id: pkg.identifier,
            kind,
            priceString: product.priceString,
            price: product.price,
            perMonthString: kind === 'yearly' ? product.pricePerMonthString : null,
            period,
            freeTrialDays,
          },
        ];
      });
    },
    async purchase(packageId) {
      const pkg = packages.get(packageId);
      if (pkg === undefined) throw new Error(`No package ${packageId}`);
      try {
        const result = await Purchases.purchasePackage(pkg);
        return toInfo(result.customerInfo);
      } catch (error) {
        // Ask to Buy or a delayed payment: not a failure, the store finishes it later.
        const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
        if (code === rc.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) throw { paymentPending: true };
        throw error;
      }
    },
    async restore() {
      return toInfo(await Purchases.restorePurchases());
    },
    async showManageSubscriptions() {
      await Purchases.showManageSubscriptions();
    },
  };
}
