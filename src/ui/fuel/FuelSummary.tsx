import type { ReactElement } from 'react';
import { View } from 'react-native';
import { type EntryTotals, kcalProteinText, leftSpoken, leftText } from '../../domain/fuel';
import type { Macros } from '../../domain/types';
import { useLargeText } from '../largeText';
import { Body, Label, Num } from '../Text';

/**
 * One big number over its label, read by VoiceOver as one ("Protein left, 86 grams"). Two sit side by side down to a
 * 320pt screen at default text (2 x 120 + 16 inside 288). Past 1.3× text each takes the whole width: side by side,
 * "1,440" at twice its size broke into "1,44" and "0" (Round 13).
 */
function LeftNumber({ value, label, spoken }: { value: string; label: string; spoken: string }) {
  const stacked = useLargeText();
  return (
    <View accessible accessibilityLabel={`${label}, ${spoken}`} style={{ flexGrow: 1, flexBasis: stacked ? '100%' : 120, gap: 4 }}>
      <Num style={{ fontSize: 44 }}>{value}</Num>
      <Label accessibilityRole="none">{label}</Label>
    </View>
  );
}

/**
 * Exactly two big numbers, Calories left and Protein left, counted down from the day's targets; past a target they read
 * "over" (§8.10, R147). Under them, muted, the target they count from; the day header above already says whether it is
 * a training or a rest day, so this line doesn't say it again. Nothing here is red.
 */
export function FuelSummary({ target, totals, locale }: { target: Macros; totals: EntryTotals; locale: string }): ReactElement {
  const kcal = leftText(target.kcal, totals.kcal, '', locale);
  const protein = leftText(target.protein, totals.proteinG, ' g', locale);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 12 }}>
        <LeftNumber value={kcal.value} label="Calories left" spoken={leftSpoken(target.kcal, totals.kcal, 'calories', locale)} />
        <LeftNumber value={protein.value} label="Protein left" spoken={leftSpoken(target.protein, totals.proteinG, 'grams', locale)} />
      </View>
      <Body muted>{`Target: ${kcalProteinText({ kcal: target.kcal, proteinG: target.protein }, locale)}`}</Body>
    </View>
  );
}
