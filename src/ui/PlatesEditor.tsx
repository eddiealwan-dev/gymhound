import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { AccessibilityActionEvent } from 'react-native';
import { useDb } from '../db/DbProvider';
import { defaultSettings, getSettings, setSetting } from '../db/repositories/settingsRepo';
import { MAX_PAIRS, parsePlateSize, plateRows, setPairs, totalPairs } from '../domain/platesOwned';
import type { WeightUnit } from '../domain/types';
import { formatWeight } from '../domain/units';
import { bumpData, useDbQuery } from '../state/dataVersion';
import { useDraftFlush } from '../state/draftFlush';
import { Button } from './Button';
import { Body, Num } from './Text';
import { fonts } from './theme';
import { useTheme } from './ThemeProvider';

const PLATES_KEY = { lb: 'platesLb', kg: 'platesKg' } as const;

const pairsText = (pairs: number) => (pairs === 1 ? '1 pair' : `${pairs} pairs`);

/** A 44pt − or + in the stepper: a surface square on the well, faded and ignoring presses when it can't step. */
function StepButton({ glyph, label, disabled, onPress }: { glyph: string; label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600} style={{ fontSize: 22 }}>
        {glyph}
      </Body>
    </Pressable>
  );
}

/**
 * One size: its weight and a − count + stepper. VoiceOver reads the row as one adjustable element ("45 lb plates,
 * 4 pairs") and swipes up or down to step it.
 */
function PlateRow({
  size,
  pairs,
  unit,
  canRemove,
  onChange,
}: {
  size: number;
  pairs: number;
  unit: WeightUnit;
  canRemove: boolean;
  onChange: (pairs: number) => void;
}) {
  const sizeText = formatWeight(size, unit);
  const canAdd = pairs < MAX_PAIRS;
  const canTake = pairs > 0 && canRemove;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${sizeText} plates`}
      accessibilityValue={{ text: pairsText(pairs) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === 'increment' && canAdd) onChange(pairs + 1);
        if (event.nativeEvent.actionName === 'decrement' && canTake) onChange(pairs - 1);
      }}
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, minHeight: 44, paddingLeft: 12, paddingRight: 4 }}
    >
      <Body weight={600} style={{ flexGrow: 1, fontVariant: ['tabular-nums'] }}>
        {sizeText}
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <StepButton glyph={'−'} label={`Remove a pair of ${sizeText}`} disabled={!canTake} onPress={() => onChange(pairs - 1)} />
        <Num style={{ fontSize: 20, minWidth: 32, textAlign: 'center' }}>{pairs}</Num>
        <StepButton glyph="+" label={`Add a pair of ${sizeText}`} disabled={!canAdd} onPress={() => onChange(pairs + 1)} />
      </View>
    </View>
  );
}

/** The plate list and the add field for one unit. Keyed by unit, so a half-typed size does not carry across a switch. */
function PlateList({ unit, owned }: { unit: WeightUnit; owned: Record<string, number> }) {
  const db = useDb();
  const { colors } = useTheme();
  const rows = plateRows(owned, unit);
  const total = totalPairs(owned);
  // The size being typed, and whether the last one entered was a number this can't take.
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const save = (next: Record<string, number>) => {
    setSetting(db, PLATES_KEY[unit], next);
    bumpData();
  };

  /** Adds a typed size with one pair. A size already listed is left as it is; text that isn't a size shows the hint. */
  const commit = () => {
    if (draft.trim() === '') return;
    const size = parsePlateSize(draft, unit);
    if (size === null) {
      setInvalid(true);
      return;
    }
    setDraft('');
    setInvalid(false);
    if (rows.some((row) => Math.round(row.size * 100) === Math.round(size * 100))) return;
    save(setPairs(owned, size, 1));
  };
  // Back, the browser's back button and the app going to the background add a size typed but not yet entered (R29).
  useDraftFlush(commit);

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Body muted>Pairs you own, for the plate calculator and barbell rounding.</Body>
        <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 2 }}>
          {rows.map((row) => (
            <PlateRow
              key={row.size}
              size={row.size}
              pairs={row.pairs}
              unit={unit}
              // The last pair stays: with no plates, every barbell raise would hold forever.
              canRemove={total > 1}
              onChange={(pairs) => save(setPairs(owned, row.size, pairs))}
            />
          ))}
        </View>
        {total <= 1 ? <Body muted>Keep at least one pair.</Body> : null}
      </View>
      <View style={{ gap: 8 }}>
        <Body>Add a plate size</Body>
        {invalid ? <Body muted>Check this number</Body> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setInvalid(false);
            }}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            // iOS adds its own Done bar above the number pad with this key (R43); Done submits and blurs.
            returnKeyType="done"
            accessibilityLabel={`Add a plate size, ${unit}`}
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
      </View>
      <View style={{ alignItems: 'flex-start' }}>
        <Button label="Reset to defaults" variant="quiet" onPress={() => save({ ...defaultSettings(null)[PLATES_KEY[unit]] })} />
      </View>
    </View>
  );
}

/**
 * The plate pairs you own for the display unit (R107), as Bar is edited: each standard size and each size of your own
 * with a − count + stepper (0 to 20 pairs, the last pair kept), a field to add a size, and Reset to defaults. Writes
 * `platesLb` or `platesKg`, then bumps.
 */
export function PlatesEditor() {
  const { unit, platesLb, platesKg } = useDbQuery(getSettings);
  return <PlateList key={unit} unit={unit} owned={(unit === 'lb' ? platesLb : platesKg) ?? {}} />;
}
