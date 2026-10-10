import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useDb } from '../db/DbProvider';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { parseField } from '../domain/setTable';
import type { WeightUnit } from '../domain/types';
import { formatWeight } from '../domain/units';
import { bumpData, useDbQuery } from '../state/dataVersion';
import { Body } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

export const BAR_PRESETS: Record<WeightUnit, { label: string; weight: number }[]> = {
  lb: [
    { label: 'Standard', weight: 45 },
    { label: "Women's", weight: 35 },
    { label: 'Technique', weight: 15 },
  ],
  kg: [
    { label: 'Standard', weight: 20 },
    { label: "Women's", weight: 15 },
    { label: 'Technique', weight: 5 },
  ],
};

/** The heaviest custom bar each unit accepts. */
const CUSTOM_MAX: Record<WeightUnit, number> = { lb: 100, kg: 45 };

const BAR_KEY = { lb: 'barLb', kg: 'barKg' } as const;

/** A custom bar weight as typed, or null when it is not a number above 0 and up to the unit's maximum. */
function parseCustomBar(text: string, unit: WeightUnit): number | null {
  const { valid, value } = parseField('weight', text);
  if (!valid || value === null || !(value > 0) || value > CUSTOM_MAX[unit]) return null;
  return value;
}

/** One choice in the list: its name, its weight, and a tick when it is the bar in use. */
function Choice({ label, detail, selected, onPress }: { label: string; detail?: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: 9,
        backgroundColor: selected ? colors.surface : 'transparent',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body weight={selected ? 600 : 400} style={{ flex: 1 }}>
        {label}
      </Body>
      {detail ? (
        <Body muted style={{ fontVariant: ['tabular-nums'] }}>
          {detail}
        </Body>
      ) : null}
      <View style={{ width: 22, alignItems: 'center' }}>
        {selected ? <Ionicons name="checkmark" size={20} color={colors.text} /> : null}
      </View>
    </Pressable>
  );
}

/** The presets for one unit plus Custom. Keyed by unit, so a half-typed custom weight does not carry across a switch. */
function BarChoices({ unit, bar }: { unit: WeightUnit; bar: number }) {
  const db = useDb();
  const { colors } = useTheme();
  const presets = BAR_PRESETS[unit];
  const matched = presets.find((p) => p.weight === bar) ?? null;
  // The custom field stays open once chosen, even if the typed weight matches a preset.
  const [customOpen, setCustomOpen] = useState(matched === null);
  const [draft, setDraft] = useState(String(bar));
  const invalid = customOpen && parseCustomBar(draft, unit) === null;

  const save = (weight: number) => {
    setSetting(db, BAR_KEY[unit], weight);
    bumpData();
  };

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Bar" style={{ backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 2 }}>
      {presets.map((preset) => (
        <Choice
          key={preset.label}
          label={preset.label}
          detail={formatWeight(preset.weight, unit)}
          selected={!customOpen && matched === preset}
          onPress={() => {
            setCustomOpen(false);
            save(preset.weight);
          }}
        />
      ))}
      <Choice
        label="Custom"
        selected={customOpen}
        onPress={() => {
          setDraft(String(bar));
          setCustomOpen(true);
        }}
      />
      {customOpen ? (
        <View style={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                const weight = parseCustomBar(text, unit);
                if (weight !== null) save(weight);
              }}
              keyboardType="decimal-pad"
              selectTextOnFocus
              accessibilityLabel={`Custom bar weight, ${unit}`}
              style={{
                width: 96,
                minHeight: 44,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                // Red is reserved, so a number that needs another look gets a heavier muted underline.
                ...(invalid ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
                backgroundColor: colors.surface,
                color: colors.text,
                fontFamily: fonts.display700,
                fontSize: 20,
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              }}
            />
            <Body muted>{unit}</Body>
          </View>
          {invalid ? <Body muted>{`Enter a weight above 0, up to ${formatWeight(CUSTOM_MAX[unit], unit)}.`}</Body> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The bar the plate calculator loads, for the display unit: Standard, Women's, Technique, or a custom weight above 0
 * and up to 100 lb or 45 kg (a comma or a dot). Writes `barLb` or `barKg`, then bumps.
 */
export function BarPicker() {
  const { unit, barLb, barKg } = useDbQuery(getSettings);
  return <BarChoices key={unit} unit={unit} bar={unit === 'lb' ? barLb : barKg} />;
}
