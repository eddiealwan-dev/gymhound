import { forwardRef } from 'react';
import { Image, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { fromLocalDate } from '../../domain/dates';
import { prCard } from '../../domain/prs';
import type { PrHighlight } from '../../domain/prs';
import { darkColors, fonts } from '../theme';

/** The owner's GruntHound hound, dark export (48px with @2x and @3x); never redrawn. */
const MARK_DARK = require('../../../assets/brand/mark-dark.png');

/** Card size in points; `sharePbImage` captures it at 1080 × 1350 pixels. */
export const PB_CARD_WIDTH = 360;
export const PB_CARD_HEIGHT = 450;

/** The day of a personal best, upper case with the year, laid out for the locale: "SUN 11 OCT 2026" or "SUN OCT 11 2026". */
export function formatCardDate(localDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .format(fromLocalDate(localDate))
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const c = darkColors;
/** Fixed size: the card is an image, so it never follows the phone's text size. */
const fixed = { allowFontScaling: false } as const;
const display = (weight: 700 | 800, fontSize: number, extra?: TextStyle): TextStyle => ({
  fontFamily: weight === 800 ? fonts.display800 : fonts.display700,
  fontSize,
  includeFontPadding: false,
  ...extra,
});

/**
 * The personal best card shared as an image (R106). Always the dark palette, whatever the app theme, since a shared
 * image has no theme; every text at a fixed size. The hound mark beside the red GYMHOUND wordmark as the header
 * lockup, then the red PERSONAL BEST (a PR mark), the exercise, the value, the caption and the day. No footer.
 * Mounted off-screen only while it is captured.
 */
export const PbCard = forwardRef<View, { highlight: PrHighlight; locale: string }>(function PbCard({ highlight, locale }, ref) {
  const { value, caption } = prCard(highlight);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: PB_CARD_WIDTH, height: PB_CARD_HEIGHT, backgroundColor: c.bg, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 28 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={MARK_DARK} style={{ width: 48, height: 48 }} />
        <Text {...fixed} numberOfLines={1} style={display(800, 38, { color: c.red, letterSpacing: -0.5 })}>
          GYMHOUND
        </Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text {...fixed} style={display(800, 22, { color: c.red, letterSpacing: 1 })}>
          PERSONAL BEST
        </Text>
        <Text {...fixed} numberOfLines={2} style={display(700, 32, { color: c.text, lineHeight: 36, marginTop: 8 })}>
          {highlight.name}
        </Text>
        <Text
          {...fixed}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={display(800, 64, { color: c.text, lineHeight: 70, fontVariant: ['tabular-nums'], marginTop: 4 })}
        >
          {value}
        </Text>
        <Text {...fixed} numberOfLines={2} style={{ fontFamily: fonts.body400, fontSize: 18, lineHeight: 24, color: c.textMuted }}>
          {caption}
        </Text>
      </View>
      <Text {...fixed} numberOfLines={1} style={display(700, 20, { color: c.textMuted, letterSpacing: 0.5 })}>
        {formatCardDate(highlight.localDate, locale)}
      </Text>
    </View>
  );
});
