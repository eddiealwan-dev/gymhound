import type { ReactElement } from 'react';
import { View } from 'react-native';
import { type EntryTotals, fuelNumber } from '../../domain/fuel';
import type { Macros } from '../../domain/types';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

type Macro = { key: 'protein' | 'carbs' | 'fat'; name: string; eaten: number; target: number | null };

/** The share of a target eaten, from 0 to 1: capped full, never past it (R147). A 0 target is full once anything is eaten. */
function share(eaten: number, target: number): number {
  if (target <= 0) return eaten > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, eaten / target));
}

/** "{name} {eaten} / {target} g" over a 3pt bar in the text colour on the raised surface. */
function Bar({ macro, target, locale }: { macro: Macro; target: number; locale: string }) {
  const { colors } = useTheme();
  const eaten = fuelNumber(macro.eaten, locale);
  const goal = fuelNumber(target, locale);
  return (
    <View accessible accessibilityLabel={`${macro.name} ${eaten} of ${goal} grams`} style={{ gap: 6 }}>
      <Body>{`${macro.name} ${eaten} / ${goal} g`}</Body>
      <View style={{ height: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}>
        <View testID={`macro-fill-${macro.key}`} style={{ height: 3, backgroundColor: colors.text, width: `${share(macro.eaten, target) * 100}%` }} />
      </View>
    </View>
  );
}

/**
 * The day's macro graph (§18.1, R147): protein against its target, and carbs and fat against theirs when they are set.
 * A macro without a target is only counted, on one muted line ("Carbs 210 g · Fat 64 g").
 */
export function MacroBars({ target, totals, locale }: { target: Macros; totals: EntryTotals; locale: string }): ReactElement {
  const macros: Macro[] = [
    { key: 'protein', name: 'Protein', eaten: totals.proteinG, target: target.protein },
    { key: 'carbs', name: 'Carbs', eaten: totals.carbsG, target: target.carbs },
    { key: 'fat', name: 'Fat', eaten: totals.fatG, target: target.fat },
  ];
  const untargeted = macros.filter((m) => m.target === null);
  return (
    <View style={{ gap: 12 }}>
      {macros.map((m) => (m.target === null ? null : <Bar key={m.key} macro={m} target={m.target} locale={locale} />))}
      {untargeted.length > 0 ? (
        <Body muted accessibilityLabel={untargeted.map((m) => `${m.name} ${fuelNumber(m.eaten, locale)} grams`).join(', ')}>
          {untargeted.map((m) => `${m.name} ${fuelNumber(m.eaten, locale)} g`).join(' · ')}
        </Body>
      ) : null}
    </View>
  );
}
