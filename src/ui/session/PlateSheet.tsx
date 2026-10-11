import { useState } from 'react';
import { TextInput, View } from 'react-native';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import { loadPlates } from '../../domain/plates';
import { plateTarget } from '../../domain/sessionMenu';
import { parseField } from '../../domain/setTable';
import { formatWeight } from '../../domain/units';
import { useDbQuery } from '../../state/dataVersion';
import { BarPicker } from '../BarPicker';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body, Display } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

type Props = {
  /** The barbell exercise the calculator was opened from, or null when it is closed. */
  ex: WorkoutExerciseView | null;
  onClose: () => void;
};

/** The weight field and what it loads. Mounted while the sheet shows, so the field starts from `plateTarget` each time. */
function PlateCalculator({ ex, onClose }: { ex: WorkoutExerciseView; onClose: () => void }) {
  const { colors } = useTheme();
  const { unit, barLb, barKg, platesLb, platesKg } = useDbQuery(getSettings);
  const bar = unit === 'lb' ? barLb : barKg;
  const [text, setText] = useState(() => {
    const target = plateTarget(ex, unit);
    return target === null ? '' : String(target);
  });
  const { valid, value: target } = parseField('weight', text);
  const load = valid && target !== null ? { target, ...loadPlates(target, bar, unit === 'lb' ? platesLb : platesKg) } : null;

  return (
    <>
      <Display weight={700}>
        Plate calculator
      </Display>
      <Body muted style={{ marginBottom: 12 }}>
        {ex.name}
      </Body>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            // iOS adds its own Done bar above the number pad with this key (R43).
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={`Weight to load, ${unit}`}
            style={{
              width: 120,
              minHeight: 48,
              paddingHorizontal: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              // Red is reserved, so a number that needs another look gets a heavier muted underline.
              ...(!valid ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.display700,
              fontSize: 24,
              fontVariant: ['tabular-nums'],
              textAlign: 'center',
            }}
          />
          <Body muted>{unit}</Body>
        </View>

        {load === null ? (
          <Body muted>{valid ? 'Enter the weight to load.' : 'Enter a weight, like 102.5.'}</Body>
        ) : (
          <View style={{ gap: 4 }}>
            {load.target < bar ? (
              <Body weight={600}>Below the bar: just the bar.</Body>
            ) : (
              <Body weight={600} style={{ fontVariant: ['tabular-nums'] }}>
                {load.perSide.length > 0 ? `Per side: ${load.perSide.join(' · ')}` : 'Just the bar.'}
              </Body>
            )}
            {load.total !== Number(load.target.toFixed(2)) ? (
              <Body muted style={{ fontVariant: ['tabular-nums'] }}>{`Loads ${formatWeight(load.total, unit)}`}</Body>
            ) : null}
          </View>
        )}

        <Body weight={600} muted style={{ marginTop: 8 }}>
          {`Bar ${formatWeight(bar, unit)}`}
        </Body>
        <BarPicker />
      </View>
      <View style={{ marginTop: 12 }}>
        <Button label="Done" onPress={onClose} />
      </View>
    </>
  );
}

/**
 * The plate calculator from a barbell exercise's ⋯ menu (spec 7.7): the bar plus the plates per side for a weight,
 * with the display unit's bar and plates from Settings. The bar can be changed here too.
 */
export function PlateSheet({ ex, onClose }: Props) {
  return (
    <Sheet visible={ex !== null} onClose={onClose}>
      {ex ? <PlateCalculator ex={ex} onClose={onClose} /> : null}
    </Sheet>
  );
}
