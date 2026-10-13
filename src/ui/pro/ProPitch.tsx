import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Linking, Pressable, useWindowDimensions, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { PlanKind, StorePlan } from '../../platform/entitlements';
import { entitlementsFor, useEntitlementsState } from '../../platform/entitlements';
import { Button } from '../Button';
import { Body, Display, TITLE_MAX_SCALE } from '../Text';
import { useTheme } from '../ThemeProvider';
import { buyLabel, buyTerms, PLAN_TITLES, planBilling, planPrice, planTrial, PLANNED_PLANS, yearlySaving } from './plans';
import { PURCHASES_UNAVAILABLE, STORE_NOT_ANSWERING, useStoreAction } from './useStoreAction';

/** What Pro adds (§8.12 with §18.1's macro graphs, R137), each led by a check. */
const PRO_LINES = [
  'All nine programs',
  'Routines of your own and saved workouts',
  'Fuel: calories and protein, with training and rest day targets, and macro graphs',
];

/** What stays free (R137: §8.12's list brought up to date). */
const FREE_LINE =
  'Everything else stays free: logging, history, Stats, four programs (Beginner full body, 5×5, Dumbbell full body and Mobility), the rest timer, plates, PRs, Something off, body measurements and water.';

/** Under a subscription's price (R159), as the stores ask. */
const RENEWS = 'Renews automatically until you cancel in your App Store or Google Play account.';

export { priceLine } from './plans';

/**
 * The Terms of use and Privacy policy links (R159), from `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`, each
 * only when the build sets it. Phase 7 supplies them with the store listing; until then none show. Each variable is
 * named in full so Expo inlines it at build time.
 */
function legalLinks(): { label: string; url: string }[] {
  const links = [
    { label: 'Terms of use', url: process.env.EXPO_PUBLIC_TERMS_URL },
    { label: 'Privacy policy', url: process.env.EXPO_PUBLIC_PRIVACY_URL },
  ];
  return links.filter((link): link is { label: string; url: string } => typeof link.url === 'string' && link.url !== '');
}

/** Above this text size a plan's price moves under its title instead of beside it (Round 11: it squeezed the words). */
const PRICE_BESIDE_MAX_SCALE = 1.3;

/**
 * One plan to choose (R556): its title, a "Save 50%" mark on the yearly, how it bills, its free days, its price. The
 * price sits at the right; at a large text size it moves under the title, so nothing is squeezed (R562).
 */
function PlanCard({ plan, chosen, saving, onChoose }: { plan: StorePlan; chosen: boolean; saving: number | null; onChoose: () => void }) {
  const { colors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const priceBeside = fontScale <= PRICE_BESIDE_MAX_SCALE;
  const title = PLAN_TITLES[plan.kind];
  const badge = plan.kind === 'yearly' && saving !== null ? `Save ${saving}%` : null;
  const trial = planTrial(plan);
  const price = planPrice(plan);
  const billing = planBilling(plan);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: chosen }}
      accessibilityLabel={[title, badge, price, billing, trial].filter((part) => part !== null).join(', ')}
      onPress={onChoose}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 72,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: chosen ? colors.text : colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name={chosen ? 'radio-button-on' : 'radio-button-off'} size={22} color={chosen ? colors.text : colors.textMuted} style={{ alignSelf: priceBeside ? 'center' : 'flex-start' }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Body weight={600}>{title}</Body>
          {badge !== null ? (
            <View style={{ backgroundColor: colors.text, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Body weight={600} style={{ fontSize: 13, color: colors.bg }}>
                {badge}
              </Body>
            </View>
          ) : null}
        </View>
        {priceBeside ? null : (
          <Body weight={600} maxFontSizeMultiplier={TITLE_MAX_SCALE} style={{ fontSize: 18 }}>
            {price}
          </Body>
        )}
        <Body muted style={{ fontSize: 14 }}>
          {billing}
        </Body>
        {trial !== null ? (
          <Body muted style={{ fontSize: 14 }}>
            {trial}
          </Body>
        ) : null}
      </View>
      {priceBeside ? (
        <Body weight={600} maxFontSizeMultiplier={TITLE_MAX_SCALE} style={{ fontSize: 18, flexShrink: 0 }}>
          {price}
        </Body>
      ) : null}
    </Pressable>
  );
}

/**
 * What GymHound Pro adds, its plans, and buy and Restore (§8.12, R137, R159, R556). `screen` is the full-screen paywall
 * and adds **Not now**; `tab` sits inside a locked Fuel tab (R151). `onDone` runs once Pro is on (a purchase or a
 * restore), or on Not now. Opening it asks the store for its plans again. Yearly, Monthly and Lifetime are chosen
 * like radio buttons, Yearly first and chosen, marked with its saving over Monthly. The button says what it starts
 * ("Start your free trial" on a plan with the store's free trial, "Buy lifetime"), with the terms and the renewal line
 * under it. With no store in the build, the owner's planned prices show so the screen can be checked, and buy and
 * Restore purchases are disabled under one line; with a store that has nothing to sell yet, no plans show and only
 * buy is disabled. While either runs, both are, over "Working…" (R136).
 */
export function ProPitch({ context, onDone }: { context: 'screen' | 'tab'; onDone?: () => void }): ReactElement | null {
  const { colors } = useTheme();
  const db = useDb();
  const { canPurchase, canRestore, plans: storePlans } = useEntitlementsState();
  const { busy, status, run } = useStoreAction(onDone);
  const plans = canPurchase ? storePlans : canRestore ? [] : PLANNED_PLANS;
  const [chosen, setChosen] = useState<PlanKind>('yearly');
  const plan = plans.find((p) => p.kind === chosen) ?? plans[0] ?? null;
  const saving = yearlySaving(plans);
  const links = legalLinks();

  useEffect(() => {
    try {
      entitlementsFor(db).refreshOffer();
    } catch {
      // The store is a nicety here; the pitch still shows.
    }
  }, [db]);

  return (
    <View style={{ gap: 16 }}>
      <Display accessibilityRole="header">GymHound Pro</Display>
      <View style={{ gap: 12 }}>
        {PRO_LINES.map((line) => (
          <View key={line} accessible accessibilityLabel={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Ionicons name="checkmark" size={20} color={colors.text} style={{ marginTop: 1 }} />
            <Body weight={600} style={{ flex: 1 }}>
              {line}
            </Body>
          </View>
        ))}
      </View>
      {plans.length > 0 ? (
        <View accessibilityRole="radiogroup" accessibilityLabel="Choose a plan" style={{ gap: 8, marginTop: 8 }}>
          {plans.map((p) => (
            <PlanCard key={p.kind} plan={p} chosen={p === plan} saving={saving} onChoose={() => setChosen(p.kind)} />
          ))}
        </View>
      ) : null}
      <View style={{ gap: 8, marginTop: 8 }}>
        <Button label={buyLabel(plan)} disabled={!canPurchase || plan === null || busy} onPress={() => plan !== null && run('purchase', plan.kind)} />
        {plan !== null ? (
          <Body muted style={{ textAlign: 'center' }}>
            {buyTerms(plan)}
          </Body>
        ) : null}
        {plan?.period ? <Body muted>{RENEWS}</Body> : null}
        {!canRestore ? <Body muted>{PURCHASES_UNAVAILABLE}</Body> : !canPurchase ? <Body muted>{STORE_NOT_ANSWERING}</Body> : null}
        <Button label="Restore purchases" variant="secondary" disabled={!canRestore || busy} onPress={() => run('restore')} />
        {context === 'screen' ? <Button label="Not now" variant="secondary" onPress={() => onDone?.()} /> : null}
        {status !== null ? <Body muted>{status}</Body> : null}
      </View>
      <Body muted>{FREE_LINE}</Body>
      {links.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
          {links.map((link) => (
            <Pressable
              key={link.label}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => {
                Linking.openURL(link.url).catch((error: unknown) => console.warn('GymHound could not open the link.', error));
              }}
              style={{ minHeight: 44, justifyContent: 'center' }}
            >
              <Body muted style={{ textDecorationLine: 'underline' }}>
                {link.label}
              </Body>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
