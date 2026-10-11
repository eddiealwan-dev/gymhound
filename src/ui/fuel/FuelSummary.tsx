import type { ReactElement } from 'react';
import { View } from 'react-native';
import { type EntryTotals, fuelNumber, leftText } from '../../domain/fuel';
import type { Macros } from '../../domain/types';
import { Body, Label, Num } from '../Text';

/**
 * One big number over its label, read by VoiceOver as one ("Protein left, 86 grams"). Two sit side by side down to a
 * 320pt screen at default text (2 x 120 + 16 inside 288) and wrap only when the text is large.
 */
function LeftNumber({ value, label, spoken }: { value: string; label: string; spoken: string }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${spoken}`} style={{ flexGrow: 1, flexBasis: 120, gap: 4 }}>
      <Num style={{ fontSize: 44 }}>{value}</Num>
      <Label accessibilityRole="none">{label}</Label>
    </View>
  );
}

/**
 * Exactly two big numbers, Calories left and Protein left, counted down from the day's targets; past a target they read
 * "over" (§8.10, R147). Under them, muted, which targets apply. Nothing here is red.
 */
export function FuelSummary({
  target,
  totals,
  trainingDay,
  locale,
}: {
  target: Macros;
  totals: EntryTotals;
  trainingDay: boolean;
  locale: string;
}): ReactElement {
  const kcal = leftText(target.kcal, totals.kcal, '', locale);
  const protein = leftText(target.protein, totals.proteinG, ' g', locale);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 12 }}>
        <LeftNumber value={kcal.value} label="Calories left" spoken={kcal.over ? kcal.value.replace(' over', ' calories over') : `${kcal.value} calories`} />
        <LeftNumber value={protein.value} label="Protein left" spoken={protein.value.replace(' g', ' grams')} />
      </View>
      <Body muted>
        {`${trainingDay ? 'Training' : 'Rest'} day target: ${fuelNumber(target.kcal, locale)} kcal · ${fuelNumber(target.protein, locale)} g protein`}
      </Body>
    </View>
  );
}
