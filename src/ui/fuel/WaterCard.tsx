import { useCallback, useState, type ReactElement } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import { listWater, logWater } from '../../db/repositories/waterRepo';
import type { Db } from '../../db/types';
import { formatWater, formatWaterSpoken, quickAmounts, toMl, waterUnitFor, waterUnitLabel } from '../../domain/water';
import { announce } from '../../platform/announce';
import { bumpData, useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { deviceLocale } from '../../platform/locale';
import { Button } from '../Button';
import { Body, Label, Num } from '../Text';
import { useTheme } from '../ThemeProvider';
import { waterAddedMessage, waterDayPhrase, WaterSheet, type WaterSheetMode } from './WaterSheet';

/**
 * The day's water on the Fuel tab (R150), free whether Pro or not: the total, " of {goal}" with a bar when a goal is
 * set (or a quiet Set a daily goal), the quick adds and Other, and Entries when the day has any. Everything is logged
 * for `localDate`, which may be an earlier day. `today` is Fuel's own (`useToday`), so the card names the day as Fuel's
 * header does.
 */
export function WaterCard({ localDate, today }: { localDate: string; today: string }): ReactElement | null {
  const db = useDb();
  const { colors } = useTheme();
  const read = useCallback(
    (d: Db) => {
      const settings = getSettings(d);
      return { entries: listWater(d, localDate), goalMl: settings.waterGoalMl, unit: waterUnitFor(settings.unit) };
    },
    [localDate],
  );
  const { entries, goalMl, unit } = useFocusedDbQuery(read);
  const [sheet, setSheet] = useState<WaterSheetMode | null>(null);
  const locale = deviceLocale();
  // Summed unrounded and rounded once for display (R156).
  const totalMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
  const total = formatWater(totalMl, unit, locale);
  const unitLabel = waterUnitLabel(unit);

  const open = (mode: WaterSheetMode) => {
    flushAll();
    Keyboard.dismiss();
    setSheet(mode);
  };

  const add = (amount: number) => {
    flushAll();
    Keyboard.dismiss();
    const ml = toMl(amount, unit);
    logWater(db, ml, localDate, Date.now());
    bumpData();
    announce(waterAddedMessage(ml, totalMl + ml, unit, waterDayPhrase(localDate, today, locale), locale));
  };

  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
      <Label>Water</Label>
      {goalMl === null ? (
        <View style={{ gap: 4, alignItems: 'flex-start' }}>
          <Num>{total}</Num>
          {/* Steps back by the quiet button's padding so its words line up with the total. */}
          <View style={{ marginLeft: -20 }}>
            <Button label="Set a daily goal" variant="quiet" onPress={() => open('goal')} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${formatWaterSpoken(totalMl, unit, locale)} of ${formatWaterSpoken(goalMl, unit, locale)}`}
            accessibilityHint="Changes your daily goal."
            onPress={() => open('goal')}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Text>
              <Num>{total}</Num>
              <Body muted>{` of ${formatWater(goalMl, unit, locale)}`}</Body>
            </Text>
          </Pressable>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ height: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}
          >
            <View testID="water-progress-fill" style={{ height: 3, backgroundColor: colors.text, width: `${Math.min(1, totalMl / goalMl) * 100}%` }} />
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quickAmounts(unit).map((amount) => {
          const n = amount.toLocaleString(locale);
          return (
            <Button
              key={amount}
              label={`+${n} ${unitLabel}`}
              accessibilityLabel={`Add ${formatWaterSpoken(toMl(amount, unit), unit, locale)} of water`}
              variant="secondary"
              size="compact"
              onPress={() => add(amount)}
            />
          );
        })}
        <Button label="Other" accessibilityLabel="Add another amount of water" variant="secondary" size="compact" onPress={() => open('other')} />
      </View>
      {entries.length > 0 ? (
        <View style={{ alignItems: 'flex-start', marginLeft: -20 }}>
          <Button label={'Entries ›'} accessibilityLabel="Water entries" variant="quiet" onPress={() => open('entries')} />
        </View>
      ) : null}
      <WaterSheet
        mode={sheet}
        localDate={localDate}
        today={today}
        unit={unit}
        locale={locale}
        goalMl={goalMl}
        entries={entries}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}
