import { getLocales } from 'expo-localization';
import { useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { addBodyEntry } from '../../db/repositories/bodyRepo';
import { BODY_LABELS, dailySeries, formatBodyValue, parseBodyValue } from '../../domain/body';
import type { BodyEntry, BodyKind, BodyUnit } from '../../domain/body';
import { chartSummary, formatChartDate, pointsInRange } from '../../domain/chart';
import type { ChartRange } from '../../domain/chart';
import { fromLocalDate } from '../../domain/dates';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { LineChart } from '../charts/LineChart';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

/** The phone's language and region, for dates ("3 Aug", or "Aug 3" in en-US). */
export const deviceLocale = () => getLocales()[0]?.languageTag ?? 'en-US';

/** An entry's day: "3 Aug" this year, "3 Aug 2025" in another. */
export function formatEntryDate(localDate: string, today: string, locale: string): string {
  if (localDate.slice(0, 4) === today.slice(0, 4)) return formatChartDate(localDate, locale);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(fromLocalDate(localDate));
}

/** A body value's number alone, as `formatBodyValue` rounds it: "182.5". */
export function bodyNumber(value: number): string {
  return `${Number(value.toFixed(1))}`;
}

/**
 * "Check this number" under a field. The caller announces it on both phones, so it has no live region: TalkBack would
 * read it a second time.
 */
export function CheckLine({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <Body muted>
      Check this number
    </Body>
  );
}

/** The number field the body screens share: Barlow, centred, a heavier muted underline when the number needs a look. */
export function BodyField({
  value,
  onChangeText,
  onSubmit,
  accessibilityLabel,
  invalid,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  accessibilityLabel: string;
  invalid: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onSubmitEditing={onSubmit}
      keyboardType="decimal-pad"
      // iOS adds its own Done bar above the number pad with this key (R43).
      returnKeyType="done"
      accessibilityLabel={accessibilityLabel}
      // Capped so a value like "182.5" stays whole in the field at the largest text size.
      maxFontSizeMultiplier={1.5}
      style={{
        minWidth: 112,
        minHeight: 44,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderStrong,
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
}

const LOG_FAILED = "Couldn't log. Try again.";

/**
 * Logs a value of `kind` for today (R115) in `unit`: the field, its unit and a filled **Log**. A number outside the
 * R117 bounds, or not a number, shows "Check this number" and writes nothing. An empty field logs nothing.
 */
export function BodyQuickEntry({ kind, unit }: { kind: BodyKind; unit: BodyUnit }) {
  const db = useDb();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [failed, setFailed] = useState(false);

  const log = () => {
    if (draft.trim() === '') return;
    const parsed = parseBodyValue(kind, draft, unit);
    if (!parsed.valid || parsed.value === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    try {
      addBodyEntry(db, kind, parsed.value, unit, Date.now());
    } catch {
      // Nothing was written: the number stays in the field for another go.
      setFailed(true);
      announce(LOG_FAILED);
      return;
    }
    setFailed(false);
    announce(`Logged ${formatBodyValue(parsed.value, unit)}.`);
    setDraft('');
    setInvalid(false);
    Keyboard.dismiss();
    bumpData();
  };

  return (
    <View style={{ gap: 8 }}>
      {/* At a large text size Log drops under the field rather than squeezing it. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BodyField
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setInvalid(false);
              setFailed(false);
            }}
            onSubmit={log}
            accessibilityLabel={`${BODY_LABELS[kind]}, ${unit}`}
            invalid={invalid}
          />
          <Body muted>{unit}</Body>
        </View>
        <Button label="Log" onPress={log} accessibilityLabel={`Log ${BODY_LABELS[kind].toLowerCase()}`} />
      </View>
      <CheckLine shown={invalid} />
      {failed ? <Body muted>{LOG_FAILED}</Body> : null}
    </View>
  );
}

const RANGES: { value: ChartRange; label: string; spoken: string }[] = [
  { value: '3M', label: '3M', spoken: '3M, last 3 months' },
  { value: '1Y', label: '1Y', spoken: '1Y, last year' },
  { value: 'All', label: 'All', spoken: 'All, all time' },
];

/** 3M, 1Y and All as a segmented control: the chosen one filled with the text colour. */
export function RangeChips({ value, onChange }: { value: ChartRange; onChange: (range: ChartRange) => void }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Chart range"
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}
    >
      {RANGES.map((range) => {
        const selected = range.value === value;
        return (
          <Pressable
            key={range.value}
            accessibilityRole="radio"
            accessibilityLabel={range.spoken}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(range.value)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text }}>
              {range.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A kind's chart (R116) with its range chips, 3M first: each day's latest entry converted to `unit` (R112, R115). With
 * no entries at all it draws nothing (the screen says so); with none in the range it says so under the chips.
 */
export function BodyChart({
  kind,
  entries,
  unit,
  today,
  locale,
}: {
  kind: BodyKind;
  entries: readonly BodyEntry[];
  unit: BodyUnit;
  today: string;
  locale: string;
}) {
  const [range, setRange] = useState<ChartRange>('3M');
  if (entries.length === 0) return null;
  const points = pointsInRange(dailySeries(entries, unit), range, today);
  const format = (v: number) => formatBodyValue(v, unit);
  return (
    <View style={{ gap: 12 }}>
      {points.length === 0 ? (
        <Body muted>No entries in this range.</Body>
      ) : (
        <LineChart points={points} formatValue={format} locale={locale} accessibilityLabel={`${BODY_LABELS[kind]}. ${chartSummary(points, format, locale)}`} />
      )}
      <RangeChips value={range} onChange={setRange} />
    </View>
  );
}
