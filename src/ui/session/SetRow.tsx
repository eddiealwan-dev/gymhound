import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, Vibration, View } from 'react-native';
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
import { announce } from '../../platform/announce';
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
      // 4pt wider than the 40pt ring, which sits centred in it (R67).
      return { width: 44, alignItems: 'center' };
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

/**
 * The warning buzz when a tick that is not ready is tapped. Nothing focuses a field with it (R99). On iPhone it is a
 * plain vibration, not a haptic: the phone gave no haptic in Rounds 4 to 7, and a vibration plays even with System
 * Haptics off (R170). Elsewhere it is the warning haptic. A missing buzz changes nothing.
 */
function warningHaptic(): void {
  try {
    if (Platform.OS === 'ios') Vibration.vibrate();
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  } catch {
    // no vibration here
  }
}

/**
 * How far the tick's target reaches past its 40pt ring (R67): 4pt up, down and right, for a 44pt-wide, 48pt-tall
 * target, and none to the left, where the reps field is. A tap just left of the ring then lands in the 6pt between them
 * (the column gap and half the space round the ring), not on reps.
 */
const TICK_HIT_SLOP = { top: 4, bottom: 4, right: 4, left: 0 };

/** The line above a row's inputs once its tick was tapped before it was ready (spec 18.6, R82). */
const NEED_LINE: Record<FieldKey, string> = {
  weight: 'Add weight to complete set',
  reps: 'Add reps to complete set',
  durationS: 'Add time to complete set',
  distance: 'Add distance to complete set',
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
export function inputLook(look: FieldLook, invalid: boolean, colors: Colors, needed = false): TextStyle {
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
    // Red is reserved, so a number that needs another look, or the field a not-ready tick asks for (R99), gets a heavier
    // muted underline.
    ...((invalid && look === 'entered') || needed ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
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
 * or a needed field with no value) keeps a dashed ring and stays pressable: a tap ticks nothing, buzzes, marks the
 * field and says why, and leaves the person to tap the field (spec 18.6, R99).
 */
export function SetRow({ ex, row, columns, unit, distanceUnit, onChangeType, onLongPress, isNext }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const { set } = row;
  const [drafts, setDrafts] = useState<Drafts>({});
  /** Inputs that have been left since they were typed in. A half-typed number is only called wrong once it is left. */
  const [left, setLeft] = useState<InputKey[]>([]);
  /** Whether the tick was tapped before it was ready. Typing clears it. */
  const [asked, setAsked] = useState(false);

  const reading = readRow(row, drafts, unit, distanceUnit);
  const showHint = reading.invalid.some((key) => left.includes(key));
  const canTick = reading.tickable;
  /**
   * The field a not-ready tick asks for: the one missing now, which a value carried from the row above may have changed
   * since the tap (B10). A number to check wins over it.
   */
  const needed = asked && !set.done && !canTick && !showHint ? reading.missing : null;
  /** The line above the row's inputs, where a keyboard already up for this row's field can't cover it (R82). */
  const line = showHint ? 'Check this number' : needed !== null ? NEED_LINE[needed] : null;

  const type = (key: InputKey, text: string) => {
    setDrafts((d) => ({ ...d, [key]: text }));
    // Typing again means it has not been left since: the hint waits until it is.
    setLeft((l) => l.filter((k) => k !== key));
    setAsked(false);
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
    if (set.done && key !== 'rpe' && !isComplete(row.loggingType, { ...readRow(row, {}, unit, distanceUnit).entered, [key]: parsed.value })) {
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
   * buzzes first, then points at the number to check, else at the missing field, and says the line to VoiceOver (which
   * does not read a live region on iOS). It focuses nothing and leaves the keyboard as it was: the keyboard coming up
   * swallowed the buzz and hid the line (spec 18.6, R99).
   */
  /**
   * Says `next`, the line a not-ready tick shows. TalkBack reads the line's live region as it changes, so on Android it
   * is announced only when the line already shows it (the live region stays quiet); VoiceOver reads no live region.
   */
  const say = (next: string) => {
    if (Platform.OS === 'android' && line !== next) return;
    announce(next);
  };

  const toggle = () => {
    if (set.done) {
      untick(db, set.id);
      Keyboard.dismiss();
      return;
    }
    if (!canTick) {
      warningHaptic();
      const { invalid, missing } = reading;
      if (invalid.length > 0) {
        setLeft((l) => [...l, ...invalid.filter((k) => !l.includes(k))]);
        say('Check this number');
      } else {
        setAsked(true);
        if (missing !== null) say(NEED_LINE[missing]);
      }
      return;
    }
    if (tick(db, ex, set, reading.entered, reading.weightUnit, reading.distanceUnit)) {
      // RPE is not part of a tick; save it if it is still being typed.
      if (drafts.rpe !== undefined) commitSetField(db, set.id, fieldPatch('rpe', reading.rpe, unit, distanceUnit));
      setDrafts({});
      setLeft([]);
      setAsked(false);
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
        value={drafts[key] ?? valueText(row, key, unit, distanceUnit)}
        placeholder={hintText(row, key)}
        placeholderTextColor={colors.textFaint}
        onChangeText={(text) => type(key, text)}
        onBlur={() => leave(key)}
        keyboardType={KEYBOARD[key]}
        // iOS adds its own Done bar above a number pad with this key (R43); Done blurs, and the blur saves.
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={`${header}, set ${row.label}`}
        // Not on a ticked set, whose tick would untick it (B2).
        accessibilityHint={look === 'suggested' && !set.done ? SUGGESTED_HINT : undefined}
        style={{
          minHeight: 44,
          paddingHorizontal: 2,
          borderRadius: 8,
          ...inputLook(look, invalid, colors, needed === key),
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
            hitSlop={TICK_HIT_SLOP}
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
      {line !== null ? (
        // Full text colour at body size, led by an alert icon inside the text so it wraps and scales with it; never red (R99).
        <Body accessibilityLiveRegion="polite" accessibilityLabel={line} style={{ marginBottom: 4 }}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.text} allowFontScaling />
          {' '}
          {line}
        </Body>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: COLUMN_GAP }}>
        {columns.map((column) => (
          <View key={column.key} style={cellStyle(column.key)}>
            {cell(column)}
          </View>
        ))}
      </View>
    </Pressable>
  );
}
