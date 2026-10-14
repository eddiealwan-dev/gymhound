import type { PlanKind, StorePeriod, StorePlan } from '../../platform/entitlements';

/**
 * The owner's prices (R556, R580), shown only where the build has no store (Expo Go, a development build), so the paywall can
 * be seen as it will be. A build with a store shows the store's own plans and prices instead.
 */
export const PLANNED_PLANS: StorePlan[] = [
  { kind: 'yearly', priceString: '$29.99', price: 29.99, perMonthString: '$2.50', period: { count: 1, unit: 'year' }, freeTrialDays: 7 },
  { kind: 'monthly', priceString: '$4.99', price: 4.99, perMonthString: null, period: { count: 1, unit: 'month' }, freeTrialDays: 7 },
  { kind: 'lifetime', priceString: '$69.99', price: 69.99, perMonthString: null, period: null, freeTrialDays: null },
];

export const PLAN_TITLES: Record<PlanKind, string> = { yearly: 'Yearly', monthly: 'Monthly', lifetime: 'Lifetime' };

/**
 * The store's price, as the store words it, shown before every purchase (§8.12, R157, R159): "$4.99 a month", "$14.99
 * every 3 months", or "$24.99 once" for a one-time unlock. Null with no plan: the app writes no price of its own.
 */
export function priceLine(plan: { priceString: string; period: StorePeriod | null } | null): string | null {
  if (plan === null) return null;
  if (plan.period === null) return `${plan.priceString} once`;
  const { count, unit } = plan.period;
  return count === 1 ? `${plan.priceString} a ${unit}` : `${plan.priceString} every ${count} ${unit}s`;
}

/** How much the yearly plan saves over twelve months of the monthly one, in whole percent; null without both or no saving. */
export function yearlySaving(plans: readonly StorePlan[]): number | null {
  const yearly = plans.find((p) => p.kind === 'yearly');
  const monthly = plans.find((p) => p.kind === 'monthly');
  if (!yearly || !monthly || monthly.price <= 0) return null;
  const saving = Math.round((1 - yearly.price / 12 / monthly.price) * 100);
  return saving > 0 ? saving : null;
}

/** A plan's big price: "$9.99/mo" for a subscription, the one-time price for lifetime. */
export function planPrice(plan: StorePlan): string {
  if (plan.kind === 'yearly' && plan.perMonthString !== null) return `${plan.perMonthString}/mo`;
  if (plan.kind === 'monthly' && plan.period?.count === 1 && plan.period.unit === 'month') return `${plan.priceString}/mo`;
  if (plan.period === null) return plan.priceString;
  return priceLine(plan) ?? plan.priceString;
}

/** The line under a plan's title: how it is billed. */
export function planBilling(plan: StorePlan): string {
  if (plan.period === null) return 'One-time payment';
  if (plan.kind === 'yearly' && plan.period.count === 1 && plan.period.unit === 'year') return `${plan.priceString} billed yearly`;
  if (plan.kind === 'monthly' && plan.period.count === 1 && plan.period.unit === 'month') return 'Billed monthly';
  return `Billed ${priceLine(plan)}`;
}

const daysFree = (days: number) => `${days} ${days === 1 ? 'day' : 'days'} free`;

/** "7 days free" on a plan with the store's free trial; null otherwise. */
export function planTrial(plan: StorePlan): string | null {
  return plan.period !== null && plan.freeTrialDays !== null ? daysFree(plan.freeTrialDays) : null;
}

/** The buy button for the chosen plan (R556). */
export function buyLabel(plan: StorePlan | null): string {
  if (plan === null) return 'Unlock';
  if (plan.period === null) return 'Buy lifetime';
  return planTrial(plan) !== null ? 'Start your free trial' : 'Subscribe';
}

/** What the button commits to, said under it before purchase (R159). */
export function buyTerms(plan: StorePlan): string {
  const price = priceLine(plan);
  if (plan.period === null) return `${price}. Pro is yours to keep.`;
  if (planTrial(plan) !== null) return `${daysFree(plan.freeTrialDays!)}, then ${price}. Cancel before the trial ends and you won't be charged.`;
  return `${price}.`;
}
