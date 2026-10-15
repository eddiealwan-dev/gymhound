import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions, ViewStyle } from 'react-native';
import { formatRest } from '../../domain/dates';
import type { DraftProblem, DraftSet } from '../../domain/historyDraft';
import { weightText } from '../../domain/setEntry';
import { DISTANCE_WORDS, needLine, parseField, round2, type Column, type FieldKey, type InputKey } from '../../domain/setTable';
import type { DistanceUnit, LoggingType, WeightUnit } from '../../domain/types';
import { cellStyle, COLUMN_GAP, inputLook } from '../session/SetRow';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

const KEYBOARD: Record<InputKey, KeyboardTypeOptions> = {
  weight: 'decimal-pad',
  distance: 'decimal-pad',
  reps: 'number-pad',
  extraReps: 'number-pad',
  rpe: 'decimal-pad',
  // The time can be "90" or "1:30", so it needs the colon.
  durationS: 'numbers-and-punctuation',
};

/** The input a problem points at. */
const NEED_KEY: Record<DraftProblem['need'], FieldKey> = { weight: 'weight', reps: 'reps', time: 'durationS', distance: 'distance' };

/** What the screen reader calls an input. A weight and a distance say the unit the set is in, which may not be the display unit. */
function fieldName(key: InputKey, loggingType: LoggingType, weightUnit: WeightUnit, distanceUnit: DistanceUnit): string {
  switch (key) {
    case 'weight':
      if (loggingType === 'bodyweight_plus') return `added weight in ${weightUnit}`;
      if (loggingType === 'assisted') return `assistance in ${weightUnit}`;
      return `weight in ${weightUnit}`;
    case 'reps':
      // An AMRAP score's rounds are its reps (R607).
      return loggingType === 'rounds' ? 'rounds' : 'reps';
    case 'extraReps':
      return 'extra reps';
    case 'durationS':
      return 'time';
    case 'distance':
      // In words: VoiceOver reads "ft" letter by letter.
      return `distance in ${DISTANCE_WORDS[distanceUnit]}`;
    case 'rpe':
      return 'RPE';
  }
}

/**
 * A set's value as the field shows it: in the unit it was logged in, with that unit when it is not the display unit
 * ("60 kg" under lb, spec 7.1); a time as "40" or "1:30", as typed. Empty for no value.
 */
function shownValue(set: DraftSet, key: InputKey, unit: WeightUnit, distanceUnit: DistanceUnit): string {
  switch (key) {
    case 'weight':
      return set.weight === null ? '' : weightText(set.weight, set.weightUnit ?? unit, unit);
    case 'distance': {
      if (set.distance === null) return '';
      const own = set.distanceUnit ?? distanceUnit;
      return own === distanceUnit ? String(round2(set.distance)) : `${round2(set.distance)} ${own}`;
    }
    case 'durationS':
      return set.durationS === null ? '' : set.durationS < 60 ? String(set.durationS) : formatRest(set.durationS);
    case 'reps':
      return set.reps === null ? '' : String(set.reps);
    case 'extraReps':
      return set.extraReps === null || set.extraReps === undefined ? '' : String(set.extraReps);
    case 'rpe':
      return set.rpe === null ? '' : String(set.rpe);
  }
}

/**
 * Reads what was typed into a field. A weight or a distance may still carry its own unit, as the field showed it ("62,5
 * kg"): the unit is dropped before the number is read, as the value stays in that unit anyway.
 */
export function readField(key: InputKey, text: string, ownUnit: string | null) {
  let t = text.trim();
  if (ownUnit !== null && (key === 'weight' || key === 'distance') && t.toLowerCase().endsWith(ownUnit)) t = t.slice(0, -ownUnit.length).trim();
  return parseField(key, t);
}

/**
 * The set's fields for a value read from `key`. A weight or distance keeps the set's own unit (a set with none takes the
 * display unit); clearing it clears the unit too, so what is typed next is in the display unit, as the session's
 * `fieldPatch` does. A carry's distance keeps its unit even when cleared: ft and yd are never the display unit (R607),
 * and a carry with none takes m.
 */
function patchFor(
  key: InputKey,
  value: number | null,
  set: DraftSet,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
  loggingType: LoggingType,
): Partial<DraftSet> {
  const carry = loggingType === 'weighted_distance';
  switch (key) {
    case 'weight':
      return value === null ? { weight: null, weightUnit: null } : { weight: value, weightUnit: set.weightUnit ?? unit };
    case 'distance':
      if (carry) return { distance: value, distanceUnit: set.distanceUnit ?? 'm' };
      return value === null ? { distance: null, distanceUnit: null } : { distance: value, distanceUnit: set.distanceUnit ?? distanceUnit };
    case 'reps':
      return { reps: value };
    case 'extraReps':
      return { extraReps: value };
    case 'durationS':
      return { durationS: value };
    case 'rpe':
      return { rpe: value };
  }
}

type Props = {
  exerciseName: string;
  loggingType: LoggingType;
  set: DraftSet;
  /** "1", "2", "W", "D" or "F" (`setLabels`). */
  label: string;
  /** The editor's columns: SET, the inputs, RPE when shown, the tick. No Previous. */
  columns: Column[];
  unit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** What a ticked set lacks, once Save has been tried; null when nothing. */
  need: DraftProblem['need'] | null;
  /** Save has been tried: a number that does not read is pointed out even in a field not yet left. */
  tried: boolean;
  onPatch: (patch: Partial<DraftSet>) => void;
  onChip: () => void;
  /** Whether any field holds text that does not read as a number: Save waits until none does. */
  onInvalidChange: (invalid: boolean) => void;
};

/**
 * One set of a finished workout in the history editor (R166): the set chip (its type, or removing it), the fields in the
 * entered style and in the set's own unit, and the 40pt tick, which here only marks the set done or not (a set left
 * unticked is dropped on Save). Each field reads on every change (a comma or a dot): a number that reads goes straight
 * into the draft; one that doesn't stays as typed, and "Check this number" shows over the row once it is left.
 */
export function EditSetRow({ exerciseName, loggingType, set, label, columns, unit, distanceUnit, need, tried, onPatch, onChip, onInvalidChange }: Props) {
  const { colors } = useTheme();
  /** What is typed into each field and not yet left. A field with none shows the draft's value. */
  const [texts, setTexts] = useState<Partial<Record<InputKey, string>>>({});
  /** Fields left holding a number that does not read. */
  const [left, setLeft] = useState<InputKey[]>([]);
  const ownWeightUnit = set.weightUnit ?? unit;
  const ownDistanceUnit = set.distanceUnit ?? (loggingType === 'weighted_distance' ? 'm' : distanceUnit);
  const ownUnit = (key: InputKey) => (key === 'weight' ? ownWeightUnit : key === 'distance' ? ownDistanceUnit : null);
  const invalid = (Object.keys(texts) as InputKey[]).filter((key) => !readField(key, texts[key] ?? '', ownUnit(key)).valid);

  const report = useRef(onInvalidChange);
  report.current = onInvalidChange;
  const anyInvalid = invalid.length > 0;
  useEffect(() => {
    report.current(anyInvalid);
  }, [anyInvalid]);
  // A row removed while holding a bad number no longer stops Save.
  useEffect(() => () => report.current(false), []);

  const type = (key: InputKey, text: string) => {
    setTexts((t) => ({ ...t, [key]: text }));
    setLeft((l) => l.filter((k) => k !== key));
    const parsed = readField(key, text, ownUnit(key));
    if (parsed.valid) onPatch(patchFor(key, parsed.value, set, unit, distanceUnit, loggingType));
  };

  const leave = (key: InputKey) => {
    const text = texts[key];
    if (text === undefined) return;
    if (readField(key, text, ownUnit(key)).valid) {
      setTexts((t) => {
        const rest = { ...t };
        delete rest[key];
        return rest;
      });
    } else {
      setLeft((l) => (l.includes(key) ? l : [...l, key]));
    }
  };

  const flagged = invalid.filter((key) => tried || left.includes(key));
  const needKey = need === null ? null : NEED_KEY[need];
  // The session's copy (spec 18.6), in the type's words: rounds for an AMRAP score.
  const line = flagged.length > 0 ? 'Check this number' : needKey !== null ? needLine(needKey, loggingType) : null;

  const input = (key: InputKey) => {
    const name = fieldName(key, loggingType, ownWeightUnit, ownDistanceUnit);
    return (
      <TextInput
        value={texts[key] ?? shownValue(set, key, unit, distanceUnit)}
        onChangeText={(text) => type(key, text)}
        onBlur={() => leave(key)}
        keyboardType={KEYBOARD[key]}
        // iOS adds its own Done bar above a number pad with this key (R43).
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel={`${exerciseName}, set ${label}, ${name}`}
        style={{
          minHeight: 44,
          paddingHorizontal: 2,
          borderRadius: 8,
          ...inputLook('entered', flagged.includes(key), colors, needKey === key && flagged.length === 0),
          fontSize: 20,
          fontVariant: ['tabular-nums'],
          textAlign: 'center',
        }}
      />
    );
  };

  const tickStyle = ({ pressed }: { pressed: boolean }): ViewStyle => ({
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: set.done ? colors.text : colors.textMuted,
    backgroundColor: set.done ? colors.text : 'transparent',
    opacity: pressed ? 0.8 : 1,
  });

  const cell = (column: Column) => {
    switch (column.key) {
      case 'set':
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${exerciseName}, set ${label}`}
            accessibilityHint="Changes the set type or removes the set"
            onPress={() => {
              Keyboard.dismiss();
              onChip();
            }}
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
            <Num style={{ fontSize: 20 }}>{label}</Num>
          </Pressable>
        );
      case 'tick':
        return (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={`${exerciseName}, set ${label} done`}
            aria-checked={set.done}
            onPress={() => {
              onPatch({ done: !set.done });
              Keyboard.dismiss();
            }}
            hitSlop={{ top: 4, bottom: 4, right: 4, left: 0 }}
            style={tickStyle}
          >
            {set.done ? <Ionicons name="checkmark" size={24} color={colors.bg} /> : null}
          </Pressable>
        );
      case 'previous':
        return null;
      default:
        return input(column.key);
    }
  };

  return (
    <View
      style={{
        // The done tint reaches 4px into the gutter, so the columns still line up with the header (as the session's rows).
        marginHorizontal: -4,
        paddingHorizontal: 4,
        paddingVertical: 4,
        borderRadius: 10,
        backgroundColor: set.done ? colors.surfaceRaised : 'transparent',
      }}
    >
      {line !== null ? (
        // Full text colour, led by the alert icon inside the text so it wraps and scales; never red (R99). "Check this
        // number" on leaving a field is a polite live region, as in the session, so TalkBack says it (nothing announces
        // there); once Save is tried, Save announces what stops it, so the line is no live region.
        <Body accessibilityLiveRegion={line === 'Check this number' && !tried ? 'polite' : undefined} accessibilityLabel={line} style={{ marginBottom: 4 }}>
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
    </View>
  );
}
