import { Ionicons } from '@expo/vector-icons';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import type { StoreOffer } from '../../platform/entitlements';
import { useEntitlementsState } from '../../platform/entitlements';
import { Button } from '../Button';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';
import { PURCHASES_UNAVAILABLE, useStoreAction } from './useStoreAction';

/** What Pro adds (§8.12 with §18.1's macro graphs, R137), each led by a check. */
const PRO_LINES = ['Unlimited routines', 'Fuel: calories and protein, with training and rest day targets, and macro graphs'];

/** What stays free (R137: §8.12's list brought up to date). */
const FREE_LINE =
  'Everything else stays free: logging, history, premade routines, your first routine, saved workouts, timer, plates, PRs, Something off, body measurements and water.';

/**
 * The store's price for a subscription, as the store words it, with its period (§8.12, R157): "$4.99 a month", or
 * "$14.99 every 3 months". Null for a one-time unlock or no offer: the app writes no price of its own.
 */
export function priceLine(offer: StoreOffer | null): string | null {
  if (offer === null || offer.period === null) return null;
  const { count, unit } = offer.period;
  return count === 1 ? `${offer.priceString} a ${unit}` : `${offer.priceString} every ${count} ${unit}s`;
}

/**
 * What GymHound Pro adds, with Unlock and Restore (§8.12, R137). `screen` is the full-screen paywall and adds **Not
 * now**; `tab` sits inside a locked Fuel tab (R151). `onDone` runs once Pro is on (a purchase or a restore), or on Not
 * now. With no store to buy from, Unlock and Restore purchases are disabled under one line; while either runs, both
 * are (R136).
 */
export function ProPitch({ context, onDone }: { context: 'screen' | 'tab'; onDone?: () => void }): ReactElement | null {
  const { colors } = useTheme();
  const { canPurchase, offer } = useEntitlementsState();
  const { busy, message, run } = useStoreAction(onDone);
  const price = canPurchase ? priceLine(offer) : null;

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
        {!canPurchase ? <Body muted>{PURCHASES_UNAVAILABLE}</Body> : null}
        <Button label="Restore purchases" variant="secondary" disabled={!canPurchase || busy} onPress={() => run('restore')} />
        {message !== null ? <Body muted>{message}</Body> : null}
        {context === 'screen' ? <Button label="Not now" variant="secondary" onPress={() => onDone?.()} /> : null}
      </View>
    </View>
  );
}
