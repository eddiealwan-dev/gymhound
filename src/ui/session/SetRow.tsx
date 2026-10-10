import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, ViewStyle } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import {
  fieldPatch,
  hintText,
  isComplete,
  parseField,
  readRow,
  valueText,
  type Column,
  type ColumnKey,
  type Drafts,
  type InputKey,
  type RowModel,
} from '../../domain/setTable';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { commitSetField, tick, untick } from '../../state/sessionActions';
import { Body, Num } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/** The space between columns. */
export const COLUMN_GAP = 4;

/** How wide each column is. The header row and every set row use this, so they line up. Inputs and Previous share what the fixed columns leave. */
export function cellStyle(key: ColumnKey): ViewStyle {
  switch (key) {
    case 'set':
      return { width: 32 };
    case 'tick':
      return { width: 40, alignItems: 'center' };
    case 'previous':
      return { flex: 1.5, minWidth: 0 };
    case 'rpe':
      return { flex: 0.8, minWidth: 40, maxWidth: 56 };
    default:
      return { flex: 1, minWidth: 48, maxWidth: 88 };
  }
}

const KEYBOARD: Record<InputKey, KeyboardTypeOptions> = {
  weight: 'decimal-pad',
  distance: 'decimal-pad',
  reps: 'number-pad',
  rpe: 'decimal-pad',
  // The time can be "90" or "1:30", so it needs the colon.
  durationS: 'numbers-and-punctuation',
};

/** A light tap when a set is ticked. Not every device has one, and a missing haptic never stops a tick. */
function lightHaptic(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // no haptics here
  }
}

type Props = {
  ex: WorkoutExerciseView;
  row: RowModel;
  columns: Column[];
  unit: WeightUnit;
  distanceUnit: DistanceUnit;
  onChangeType: () => void;
  onLongPress: () => void;
};

/**
 * One set. Each input keeps what is typed locally and saves on blur; blank is "no value", and only non-blank text
 * that does not parse is marked (an underline and "Check this number") and keeps the tick off.
 */
export function SetRow({ ex, row, columns, unit, distanceUnit, onChangeType, onLongPress }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const { set } = row;
  const [drafts, setDrafts] = useState<Drafts>({});
  /** Inputs that have been left since they were typed in. A half-typed number is only called wrong once it is left. */
  const [left, setLeft] = useState<InputKey[]>([]);

  const reading = readRow(row, drafts, unit);
  const showHint = reading.invalid.some((key) => left.includes(key));
  const canTick = reading.tickable;

  const type = (key: InputKey, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    // Typing again means it has not been left since: the hint waits until it is.
    setLeft((l) => l.filter((k) => k !== key));
  };

  const leave = (key: InputKey) => {
    const text = drafts[key];
    if (text === undefined) return;
    const parsed = parseField(key, text);
    if (!parsed.valid) {
      setLeft((l) => (l.includes(key) ? l : [...l, key]));
      return;
    }
    commitSetField(db, set.id, fieldPatch(key, parsed.value, unit, distanceUnit));
    // Clearing a field a ticked set needs takes the tick off, rather than leaving a ticked set with a hole in it.
    if (set.done && key !== 'rpe' && !isComplete(row.loggingType, { ...readRow(row, {}, unit).entered, [key]: parsed.value })) {
      untick(db, set.id);
    }
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[key];
      return rest;
    });
    setLeft((l) => l.filter((k) => k !== key));
  };

  const toggle = () => {
    if (set.done) {
      untick(db, set.id);
      return;
    }
    if (!canTick || !tick(db, ex, set, reading.entered)) return;
    // RPE is not part of a tick; save it if it is still being typed.
    if (drafts.rpe !== undefined) commitSetField(db, set.id, fieldPatch('rpe', reading.rpe, unit, distanceUnit));
    setDrafts({});
    setLeft([]);
    lightHaptic();
  };

  const input = (key: InputKey, header: string) => {
    const invalid = reading.invalid.includes(key) && left.includes(key);
    return (
      <TextInput
        value={drafts[key] ?? valueText(row, key, unit)}
        placeholder={hintText(row, key)}
        placeholderTextColor={colors.textMuted}
        onChangeText={(text) => type(key, text)}
        onBlur={() => leave(key)}
        keyboardType={KEYBOARD[key]}
        selectTextOnFocus
        accessibilityLabel={`${header}, set ${row.label}`}
        style={{
          minHeight: 44,
          paddingHorizontal: 2,
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
    );
  };

  const cell = (column: Column) => {
    switch (column.key) {
      case 'set':
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${row.label}`}
            accessibilityHint="Changes the set type"
            onPress={onChangeType}
            style={({ pressed }) => ({
              width: 32,
              height: 44,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Num style={{ fontSize: 20 }}>{row.label}</Num>
          </Pressable>
        );
      case 'previous':
        return (
          <Num
            weight={600}
            accessibilityLabel={row.previous === '' ? undefined : `Previous ${row.previous}`}
            style={{ fontSize: 17, color: colors.textMuted }}
          >
            {row.previous}
          </Num>
        );
      case 'tick':
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`Set ${row.label} done`}
            aria-checked={set.done}
            disabled={!set.done && !canTick}
            onPress={toggle}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: set.done ? colors.text : colors.textMuted,
              backgroundColor: set.done ? colors.text : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !set.done && !canTick ? 0.35 : pressed ? 0.8 : 1,
            })}
          >
            {set.done ? <Ionicons name="checkmark" size={24} color={colors.bg} /> : null}
          </Pressable>
        );
      default:
        return input(column.key, column.header);
    }
  };

  return (
    <Pressable
      accessible={false}
      onLongPress={onLongPress}
      style={{
        // The done tint reaches 4px into the gutter, so the columns still line up with the header.
        marginHorizontal: -4,
        paddingHorizontal: 4,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: set.done ? colors.surfaceRaised : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: COLUMN_GAP }}>
        {columns.map((column) => (
          <View key={column.key} style={cellStyle(column.key)}>
            {cell(column)}
          </View>
        ))}
      </View>
      {showHint ? (
        <Body muted accessibilityLiveRegion="polite" style={{ fontSize: 12, marginTop: 2 }}>
          Check this number
        </Body>
      ) : null}
    </Pressable>
  );
}
