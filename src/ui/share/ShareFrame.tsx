import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Image, Text, View } from 'react-native';
import type { TextStyle } from 'react-native';
import { SHARE_CARD_FOOTER } from '../../domain/shareCards';
import { darkColors, fonts } from '../theme';

/** The owner's GruntHound hound, dark export (48px with @2x and @3x); never redrawn. */
const MARK_DARK = require('../../../assets/brand/mark-dark.png');

/** Card size in points; captured at 1080 × 1350 pixels (4:5, which feeds and stories crop safely). */
export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 450;

export const cardColors = darkColors;
/** Fixed size: a card is an image, so it never follows the phone's text size. */
export const fixed = { allowFontScaling: false } as const;

/** Barlow Condensed at a fixed size, with no font padding, for the card's display type. */
export const display = (weight: 700 | 800, fontSize: number, extra?: TextStyle): TextStyle => ({
  fontFamily: weight === 800 ? fonts.display800 : fonts.display700,
  fontSize,
  includeFontPadding: false,
  ...extra,
});

/** Inter at a fixed size for the card's body lines. */
export const body = (fontSize: number, extra?: TextStyle): TextStyle => ({
  fontFamily: fonts.body400,
  fontSize,
  lineHeight: Math.round(fontSize * 1.35),
  color: cardColors.textMuted,
  ...extra,
});

/**
 * The frame every share card uses (§18.17, R441–R443): always the warm dark palette, whatever the app theme, since a
 * shared image has no theme. The header lockup (the hound mark beside the red GYMHOUND wordmark), the card's content,
 * then a hairline and the quiet footer line. Red is the wordmark here; the cards add it only for PR marks.
 */
export const ShareFrame = forwardRef<View, { onReady?: () => void; children: ReactNode }>(function ShareFrame({ onReady, children }, ref) {
  const c = cardColors;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, backgroundColor: c.bg, paddingHorizontal: 28, paddingTop: 28, paddingBottom: 22 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image source={MARK_DARK} style={{ width: 44, height: 44 }} onLoad={onReady} onError={onReady} />
        <Text {...fixed} numberOfLines={1} style={display(800, 34, { color: c.red, letterSpacing: -0.5 })}>
          GYMHOUND
        </Text>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}>
        <Text {...fixed} numberOfLines={1} style={body(12, { letterSpacing: 0.4 })}>
          {SHARE_CARD_FOOTER}
        </Text>
      </View>
    </View>
  );
});
