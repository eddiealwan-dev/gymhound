import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { addBodyEntry } from '../../db/repositories/bodyRepo';
import { BODY_LABELS, dailySeries, formatBodyValue, parseBodyValue } from '../../domain/body';
import type { BodyEntry, BodyKind, BodyUnit } from '../../domain/body';
import { chartSummary, pointsInRange, rangeChange } from '../../domain/chart';
import type { ChartRange } from '../../domain/chart';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { BodyField, CheckLine } from '../fields';
import { LineChart } from '../charts/LineChart';
import { Segmented } from '../Segmented';
import { Body } from '../Text';

/** A body value's number alone, as `formatBodyValue` rounds it: "182.5". */
export function bodyNumber(value: number): string {
  return `${Number(value.toFixed(1))}`;
}

const LOG_FAILED = "Couldn't log. Try again.";

/**
 * Logs a value of `kind` for today (R115) in `unit`: the field, its unit and a filled **Log**. A number outside the
 * R117 bounds, or not a number, shows "Check this number" and writes nothing. An empty field logs nothing.
 * `fieldLabel` and `buttonLabel` replace the VoiceOver labels ("Bodyweight, lb", "Log bodyweight") where a second
 * entry for the same kind shares the screen (the weekly check-in on Stats).
 */
export function BodyQuickEntry({
  kind,
  unit,
  fieldLabel,
  buttonLabel,
}: {
  kind: BodyKind;
  unit: BodyUnit;
  fieldLabel?: string;
  buttonLabel?: string;
}) {
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
    } catch (error) {
      console.warn('GymHound could not log the entry.', error);
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
            accessibilityLabel={fieldLabel ?? `${BODY_LABELS[kind]}, ${unit}`}
            invalid={invalid}
          />
          <Body muted>{unit}</Body>
        </View>
        <Button label="Log" onPress={log} accessibilityLabel={buttonLabel ?? `Log ${BODY_LABELS[kind].toLowerCase()}`} />
      </View>
      <CheckLine shown={invalid} />
      {failed ? <Body muted>{LOG_FAILED}</Body> : null}
    </View>
  );
}

/** Under a body chart while it has one day: a single dot, no line yet (R402). */
export const ONE_DAY = 'One day logged so far. Log on another day to start the line.';

const RANGES: { value: ChartRange; label: string; spoken: string }[] = [
  { value: '3M', label: '3M', spoken: '3M, last 3 months' },
  { value: '1Y', label: '1Y', spoken: '1Y, last year' },
  { value: 'All', label: 'All', spoken: 'All, all time' },
];

/** 3M, 1Y and All as the segmented control: the chosen one filled with the text colour. */
export function RangeChips({ value, onChange }: { value: ChartRange; onChange: (range: ChartRange) => void }) {
  return <Segmented label="Chart range" options={RANGES} value={value} onChange={onChange} />;
}

/**
 * A kind's chart (R116) with its range chips, 3M first: each day's latest entry converted to `unit` (R112, R115). With
 * no entries at all it draws nothing (the screen says so); with none in the range it says so under the chips. Under the
 * chart, the change across the range in muted words (R175): "Down 2 cm since Aug 3."
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
  const series = dailySeries(entries, unit);
  const points = pointsInRange(series, range, today);
  const format = (v: number) => formatBodyValue(v, unit);
  // R175: the change across the range in words, under the chart; none with fewer than two days.
  const change = rangeChange(points, format, locale);
  return (
    <View style={{ gap: 12 }}>
      {points.length === 0 ? (
        <Body muted>No entries in this range.</Body>
      ) : (
        <LineChart points={points} formatValue={format} locale={locale} accessibilityLabel={`${BODY_LABELS[kind]}. ${chartSummary(points, format, locale)}`} />
      )}
      {change !== null ? <Body muted>{change}</Body> : null}
      {/* One day ever is one dot: say how the line starts (R402). */}
      {series.length === 1 ? <Body muted>{ONE_DAY}</Body> : null}
      <RangeChips value={range} onChange={setRange} />
    </View>
  );
}
