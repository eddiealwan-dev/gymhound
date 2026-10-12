import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import { formatTrainDate, fromLocalDate } from '../../domain/dates';
import { prCard } from '../../domain/prs';
import type { PrHighlight } from '../../domain/prs';
import { splitValue, type PbCardModel } from '../../domain/shareCards';
import { body, cardColors as c, display, fixed, SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH, ShareFrame } from '../share/ShareFrame';

/** Card size in points; `sharePbImage` captures it at 1080 × 1350 pixels. */
export const PB_CARD_WIDTH = SHARE_CARD_WIDTH;
export const PB_CARD_HEIGHT = SHARE_CARD_HEIGHT;

type Props = {
  highlight: PrHighlight;
  locale: string;
  /**
   * The card's fuller words (§18.17, R444–R446): the previous best and how far it was beaten, and the session count.
   * Without it the card shows the personal best alone, as R106's did.
   */
  model?: PbCardModel | null;
  /** Called once the hound mark has loaded or failed to, so the card can be captured complete. */
  onReady?: () => void;
};

/**
 * The personal best card shared as an image (R106, §18.17). In the shared dark frame: a red PR mark and PERSONAL BEST,
 * the lift, the big figure with its unit beside it, what kind of best it is, how far it beat the one before ("Up 5 kg
 * from 135 kg on 2 Sep."), then the day and how many sessions of the lift it took ("12 SESSIONS": this one included). Drawn by `PbCardHost` only while it
 * is captured.
 */
export const PbCard = forwardRef<View, Props>(function PbCard({ highlight, locale, model, onReady }, ref) {
  const value = model?.value ?? splitValue(prCard(highlight).value);
  const caption = model?.caption ?? prCard(highlight).caption;
  const date = model?.date ?? formatTrainDate(fromLocalDate(highlight.localDate), locale, { year: true });
  const sessions = model?.sessions ?? null;
  return (
    <ShareFrame ref={ref} onReady={onReady}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ backgroundColor: c.red, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text {...fixed} style={display(800, 16, { color: c.text, letterSpacing: 0.5 })}>
              PR
            </Text>
          </View>
          <Text {...fixed} style={display(800, 18, { color: c.red, letterSpacing: 1 })}>
            PERSONAL BEST
          </Text>
        </View>
        <Text {...fixed} numberOfLines={2} style={display(700, 30, { color: c.text, lineHeight: 34, marginTop: 14 })}>
          {model?.name ?? highlight.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
          <Text
            {...fixed}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={display(800, value.rest === '' ? 64 : 80, { color: c.text, lineHeight: value.rest === '' ? 70 : 86, fontVariant: ['tabular-nums'], flexShrink: 1 })}
          >
            {value.main}
          </Text>
          {value.rest !== '' ? (
            <Text {...fixed} numberOfLines={1} style={display(700, 30, { color: c.text, fontVariant: ['tabular-nums'], flexShrink: 1 })}>
              {value.rest}
            </Text>
          ) : null}
        </View>
        <Text {...fixed} numberOfLines={1} style={body(17, { color: c.text })}>
          {caption}
        </Text>
        {model?.comparison ? (
          <Text {...fixed} numberOfLines={2} style={body(15, { marginTop: 10 })}>
            {model.comparison}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
        <Text {...fixed} numberOfLines={1} style={display(700, 18, { color: c.textMuted, letterSpacing: 0.5, flexShrink: 1 })}>
          {date}
        </Text>
        {sessions !== null ? (
          <Text {...fixed} numberOfLines={1} style={display(700, 18, { color: c.textMuted, letterSpacing: 0.5 })}>
            {sessions === 1 ? '1 SESSION' : `${sessions} SESSIONS`}
          </Text>
        ) : null}
      </View>
    </ShareFrame>
  );
});
