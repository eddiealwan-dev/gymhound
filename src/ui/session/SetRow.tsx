import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, PressableStateCallbackType, TextStyle, ViewStyle } from 'react-native';
import { useDb } from '../../db/DbProvider';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import {
  fieldLook,
  fieldPatch,
  hintText,
  isComplete,
  parseField,
  readRow,
  valueText,
  type Column,
  type ColumnKey,
  type Drafts,
  type FieldKey,
  type FieldLook,
  type InputKey,
  type RowModel,
} from '../../domain/setTable';
import type { DistanceUnit, WeightUnit } from '../../domain/types';
import { useDraftFlush } from '../../state/draftFlush';
import { commitSetField, tick, untick } from '../../state/sessionActions';
import { Body, Num } from '../Text';
import { fonts, type Colors } from '../theme';
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

/** A warning buzz when a tick that is not ready is tapped. As with `lightHaptic`, a missing haptic changes nothing. */
function warningHaptic(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  } catch {
    // no haptics here
  }
}

/** The line under a row whose tick was tapped before it was ready (spec 18.6). */
const NEED_LINE: Record<FieldKey, string> = {
  weight: 'Add a weight to tick',
  reps: 'Add reps to tick',
  durationS: 'Add a time to tick',
  distance: 'Add a distance to tick',
};

/** The tick's VoiceOver hint while it is not ready (spec 18.6). */
const NEED_HINT: Record<FieldKey, string> = {
  weight: 'Enter a weight first',
  reps: 'Enter reps first',
  durationS: 'Enter a time first',
  distance: 'Enter a distance first',
};

/** The VoiceOver hint on a field showing a suggestion (a target or last time's value) rather than a value. */
export const SUGGESTED_HINT = 'Suggested. Tick the set to log it.';

/**
 * How a set field looks (spec 18.6): a suggestion is faint, light and dashed on no fill; a typed or saved value (or an
 * empty field) is solid, bold and filled. Only an entered field can be invalid, so the heavier underline only ever
 * sits on a solid edge: iOS cannot draw a dashed edge with a thicker bottom.
 */
export function inputLook(look: FieldLook, invalid: boolean, colors: Colors): TextStyle {
  if (look === 'suggested') {
    return {
      backgroundColor: 'transparent',
      borderStyle: 'dashed',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      color: colors.textFaint,
      fontFamily: fonts.display600,
    };
  }
  return {
    backgroundColor: colors.surface,
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    color: colors.text,
    fontFamily: fonts.display800,
    // Red is reserved, so a number that needs another look gets a heavier muted underline.
    ...(invalid && look === 'entered' ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
  };
}

type Props = {
  ex: WorkoutExerciseView;
  row: RowModel;
  columns: Column[];
  unit: WeightUnit;
  distanceUnit: DistanceUnit;
  onChangeType: () => void;
  onLongPress: () => void;
  /** Whether this is the next set to do (spec 18.6): its open tick gets the bolder ring. */
  isNext: boolean;
};

/**
 * One set. Each input keeps what is typed locally and saves on blur; blank is "no value", and only non-blank text
 * that does not parse is marked (an underline and "Check this number"). A tick that is not ready (a number to check,
 * or a needed field with no value) keeps a dashed ring and stays pressable: a tap ticks nothing, focuses the field
 * and says why (spec 18.6).
 */
export function SetRow({ ex, row, columns, unit, distanceUnit, onChangeType, onLongPress, isNext }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const { set } = row;
  const [drafts, setDrafts] = useState<Drafts>({});
  /** Inputs that have been left since they were typed in. A half-typed number is only called wrong once it is left. */
  const [left, setLeft] = useState<InputKey[]>([]);
  /** The field a tap on the not-ready tick asked for. Typing clears it. */
  const [need, setNeed] = useState<FieldKey | null>(null);
  const inputs = useRef<Partial<Record<InputKey, TextInput | null>>>({});

  const reading = readRow(row, drafts, unit);
  const showHint = reading.invalid.some((key) => left.includes(key));
  const canTick = reading.tickable;
  /** Under the row: a number to check wins over the field a not-ready tick asked for. */
  const line = showHint ? 'Check this number' : need !== null && !set.done && !canTick ? NEED_LINE[need] : null;

  const type = (key: InputKey, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    // Typing again means it has not been left since: the hint waits until it is.
    setLeft((l) => l.filter((k) => k !== key));
    setNeed(null);
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

  // Back, the ⋯ menu and the picker commit a half-typed entry as leaving the input would; the screen may unmount before a blur (R29).
  useDraftFlush(() => (Object.keys(drafts) as InputKey[]).forEach(leave));

  /**
   * Ticks or unticks the set, then closes the keyboard. `reading` was read from the drafts first, so the number in the
   * focused field is the one ticked; other rows are not flushed first (R48). A tick that is not ready ticks nothing: it
   * points at the number to check, else at the missing field, focuses it and keeps the keyboard up (spec 18.6).
   */
  const toggle = () => {
    if (set.done) {
      untick(db, set.id);
      Keyboard.dismiss();
      return;
    }
    if (!canTick) {
      const { invalid, missing } = reading;
      if (invalid.length > 0) {
        setLeft((l) => [...l, ...invalid.filter((key) => !l.includes(key))]);
        inputs.current[invalid[0]]?.focus();
      } else {
        setNeed(missing);
        if (missing !== null) inputs.current[missing]?.focus();
      }
      warningHaptic();
      return;
    }
    if (tick(db, ex, set, reading.entered, reading.weightUnit)) {
      // RPE is not part of a tick; save it if it is still being typed.
      if (drafts.rpe !== undefined) commitSetField(db, set.id, fieldPatch('rpe', reading.rpe, unit, distanceUnit));
      setDrafts({});
      setLeft([]);
      setNeed(null);
      lightHaptic();
    }
    Keyboard.dismiss();
  };

  /** The tick's look: filled when done; otherwise an open ring, bolder on the next set and dashed while it is not ready. */
  const tickStyle = ({ pressed }: PressableStateCallbackType): ViewStyle => {
    const shape: ViewStyle = {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: pressed ? 0.8 : 1,
    };
    if (set.done) {
      return { ...shape, borderWidth: 1.5, borderColor: colors.text, borderStyle: 'solid', backgroundColor: colors.text };
    }
    const ring: ViewStyle = { borderWidth: isNext ? 2.5 : 1.5, borderColor: isNext ? colors.text : colors.textMuted };
    return { ...shape, ...ring, borderStyle: canTick ? 'solid' : 'dashed', backgroundColor: 'transparent' };
  };

  const input = (key: InputKey, header: string) => {
    const invalid = reading.invalid.includes(key) && left.includes(key);
    const look = fieldLook(row, key, drafts[key]);
    return (
      <TextInput
        ref={(node) => {
          inputs.current[key] = node;
        }}
        value={drafts[key] ?? valueText(row, key, unit)}
        placeholder={hintText(row, key)}
        placeholderTextColor={colors.textFaint}
        onChangeText={(text) => type(key, text)}
        onBlur={() => leave(key)}
        keyboardType={KEYBOARD[key]}
        // iOS adds its own Done bar above a number pad with this key (R43); Done blurs, and the blur saves.
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={`${header}, set ${row.label}`}
        accessibilityHint={look === 'suggested' ? SUGGESTED_HINT : undefined}
        style={{
          minHeight: 44,
          paddingHorizontal: 2,
          borderRadius: 8,
          ...inputLook(look, invalid, colors),
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
            accessibilityHint="Changes the set type or removes the set"
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
            accessibilityHint={!set.done && !canTick && reading.missing !== null ? NEED_HINT[reading.missing] : undefined}
            onPress={toggle}
            hitSlop={4}
            style={tickStyle}
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
      {line !== null ? (
        <Body muted accessibilityLiveRegion="polite" style={{ fontSize: 12, marginTop: 2 }}>
          {line}
        </Body>
      ) : null}
    </Pressable>
  );
}
