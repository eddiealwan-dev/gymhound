import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { StoreOffer } from '../../platform/entitlements';
import { entitlementsFor, useEntitlementsState } from '../../platform/entitlements';
import { Button } from '../Button';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';
import { PURCHASES_UNAVAILABLE, STORE_NOT_ANSWERING, useStoreAction } from './useStoreAction';

/** What Pro adds (§8.12 with §18.1's macro graphs, R137), each led by a check. */
const PRO_LINES = ['Unlimited routines', 'Fuel: calories and protein, with training and rest day targets, and macro graphs'];

/** What stays free (R137: §8.12's list brought up to date). */
const FREE_LINE =
  'Everything else stays free: logging, history, premade routines, your first routine, saved workouts, timer, plates, PRs, Something off, body measurements and water.';

/** Under a subscription's price (R159), as the stores ask. */
const RENEWS = 'Renews automatically until you cancel in your App Store or Google Play account.';

/**
 * The store's price, as the store words it, shown before every purchase (§8.12, R157, R159): "$4.99 a month", "$14.99
 * every 3 months", or "$24.99 once" for a one-time unlock. Null with no offer: the app writes no price of its own.
 */
export function priceLine(offer: StoreOffer | null): string | null {
  if (offer === null) return null;
  if (offer.period === null) return `${offer.priceString} once`;
  const { count, unit } = offer.period;
  return count === 1 ? `${offer.priceString} a ${unit}` : `${offer.priceString} every ${count} ${unit}s`;
}

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

/**
 * What GymHound Pro adds, with Unlock and Restore (§8.12, R137, R159). `screen` is the full-screen paywall and adds
 * **Not now**; `tab` sits inside a locked Fuel tab (R151). `onDone` runs once Pro is on (a purchase or a restore), or
 * on Not now. Opening it asks the store for its offer again. The price shows before purchase, with the renewal line
 * for a subscription. With no store in the build, Unlock and Restore purchases are disabled under one line; with a
 * store that has nothing to sell yet, only Unlock is. While either runs, both are, over "Working…" (R136).
 */
export function ProPitch({ context, onDone }: { context: 'screen' | 'tab'; onDone?: () => void }): ReactElement | null {
  const { colors } = useTheme();
  const db = useDb();
  const { canPurchase, canRestore, offer } = useEntitlementsState();
  const { busy, status, run } = useStoreAction(onDone);
  const price = canPurchase ? priceLine(offer) : null;
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
      <Body muted>{FREE_LINE}</Body>
      <View style={{ gap: 8, marginTop: 8 }}>
        <Button label="Unlock" disabled={!canPurchase || busy} onPress={() => run('purchase')} />
        {price !== null ? (
          <Body muted style={{ textAlign: 'center' }}>
            {price}
          </Body>
        ) : null}
        {price !== null && offer?.period ? <Body muted>{RENEWS}</Body> : null}
        {!canRestore ? <Body muted>{PURCHASES_UNAVAILABLE}</Body> : !canPurchase ? <Body muted>{STORE_NOT_ANSWERING}</Body> : null}
        <Button label="Restore purchases" variant="secondary" disabled={!canRestore || busy} onPress={() => run('restore')} />
        {context === 'screen' ? <Button label="Not now" variant="secondary" onPress={() => onDone?.()} /> : null}
        {status !== null ? <Body muted>{status}</Body> : null}
      </View>
      {links.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
          {links.map((link) => (
            <Pressable
              key={link.label}
              accessibilityRole="link"
              accessibilityLabel={link.label}
              onPress={() => {
                Linking.openURL(link.url).catch(() => {});
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
