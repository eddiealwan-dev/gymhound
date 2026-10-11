import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { deleteWater, logWater, setWaterGoal, type WaterEntry } from '../../db/repositories/waterRepo';
import type { WaterUnit } from '../../domain/types';
import { formatWater, formatWaterSpoken, parseWaterAmount, parseWaterGoal, waterAmountText, waterUnitLabel, waterUnitSpoken } from '../../domain/water';
import { announce } from '../../platform/announce';
import { bumpData } from '../../state/dataVersion';
import { BodyField, CheckLine, formatEntryDate } from '../body/BodyLog';
import { Button } from '../Button';
import { Sheet } from '../Sheet';
import { Body } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';

export type WaterSheetMode = 'other' | 'goal' | 'entries';

/** "today", or "on Oct 10" for an earlier day. */
export function waterDayPhrase(localDate: string, today: string, locale: string): string {
  return localDate === today ? 'today' : `on ${formatEntryDate(localDate, today, locale)}`;
}

/** What VoiceOver hears after water is added: "Added 250 ml. 1,250 ml today." (fl oz said in full). */
export function waterAddedMessage(addedMl: number, totalMl: number, unit: WaterUnit, dayPhrase: string, locale: string): string {
  return `Added ${formatWaterSpoken(addedMl, unit, locale)}. ${formatWaterSpoken(totalMl, unit, locale)} ${dayPhrase}.`;
}

/** A sheet title as ConfirmSheet draws it (Display 700); VoiceOver moves to it when the sheet opens. */
function SheetTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  const ref = useRef<Text>(null);
  useEffect(() => {
    if (ref.current) AccessibilityInfo.sendAccessibilityEvent(ref.current, 'focus');
  }, []);
  return (
    <Text ref={ref} accessibilityRole="header" style={{ fontFamily: fonts.display700, fontSize: 28, color: colors.text, marginBottom: 16 }}>
      {children}
    </Text>
  );
}

/** A number field in the unit, its unit beside it, and "Check this number" under it when it needs another look. */
function AmountField({
  value,
  onChange,
  onSubmit,
  label,
  unit,
  invalid,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  label: string;
  unit: WaterUnit;
  invalid: boolean;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <BodyField value={value} onChangeText={onChange} onSubmit={onSubmit} accessibilityLabel={`${label}, ${waterUnitSpoken(unit)}`} invalid={invalid} />
        <Body muted>{waterUnitLabel(unit)}</Body>
      </View>
      <CheckLine shown={invalid} />
    </View>
  );
}

type Shared = { localDate: string; today: string; unit: WaterUnit; locale: string; onClose: () => void };

/** "Add water": an amount in the unit, logged for the card's day. */
function OtherAmount({ localDate, today, unit, locale, totalMl, onClose }: Shared & { totalMl: number }) {
  const db = useDb();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);

  const add = () => {
    const ml = parseWaterAmount(draft, unit);
    if (ml === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    logWater(db, ml, localDate, Date.now());
    bumpData();
    announce(waterAddedMessage(ml, totalMl + ml, unit, waterDayPhrase(localDate, today, locale), locale));
    onClose();
  };

  return (
    <>
      <SheetTitle>Add water</SheetTitle>
      <AmountField
        value={draft}
        onChange={(text) => {
          setDraft(text);
          setInvalid(false);
        }}
        onSubmit={add}
        label="Amount"
        unit={unit}
        invalid={invalid}
      />
      <View style={{ gap: 8 }}>
        <Button label="Add" onPress={add} />
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </>
  );
}

/** "Daily water goal": the goal in the unit; Save, Clear goal (when one is set) and Cancel. */
function GoalEditor({ unit, locale, goalMl, onClose }: Shared & { goalMl: number | null }) {
  const db = useDb();
  const initial = goalMl === null ? '' : waterAmountText(goalMl, unit);
  const [draft, setDraft] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    // Untouched, nothing is written, so a stored goal is not rounded to the field's precision.
    if (goalMl !== null && draft === initial) {
      onClose();
      return;
    }
    const ml = parseWaterGoal(draft, unit);
    if (ml === null) {
      setInvalid(true);
      announce('Check this number');
      return;
    }
    setWaterGoal(db, ml);
    bumpData();
    announce(`Daily goal ${formatWaterSpoken(ml, unit, locale)}.`);
    onClose();
  };

  const clear = () => {
    setWaterGoal(db, null);
    bumpData();
    announce('Goal cleared.');
    onClose();
  };

  return (
    <>
      <SheetTitle>Daily water goal</SheetTitle>
      <AmountField
        value={draft}
        onChange={(text) => {
          setDraft(text);
          setInvalid(false);
        }}
        onSubmit={save}
        label="Daily water goal"
        unit={unit}
        invalid={invalid}
      />
      <View style={{ gap: 8 }}>
        <Button label="Save" onPress={save} />
        {goalMl !== null ? <Button label="Clear goal" variant="secondary" onPress={clear} /> : null}
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </>
  );
}

/**
 * The day's water, each with a compact Delete (no question: an entry is small and easy to add again). Today's entries
 * show their time; an earlier day's were logged later, so they show the amount alone.
 */
function EntryList({ localDate, today, unit, locale, entries, onClose }: Shared & { entries: readonly WaterEntry[] }) {
  const db = useDb();
  const { colors } = useTheme();
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });

  const remove = (entry: WaterEntry) => {
    deleteWater(db, entry.id);
    bumpData();
    announce(`Deleted ${formatWaterSpoken(entry.amountMl, unit, locale)}.`);
    if (entries.length <= 1) onClose();
  };

  return (
    <>
      {/* "Water today" or "Water on Oct 10". */}
      <SheetTitle>{`Water ${waterDayPhrase(localDate, today, locale)}`}</SheetTitle>
      <View style={{ marginBottom: 16 }}>
        {entries.map((entry, i) => {
          const at = localDate === today ? time.format(entry.loggedAt) : null;
          const amount = formatWater(entry.amountMl, unit, locale);
          const spoken = formatWaterSpoken(entry.amountMl, unit, locale);
          return (
            <View
              key={entry.id}
              style={{
                minHeight: 52,
                paddingVertical: 8,
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                columnGap: 12,
                rowGap: 4,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              {at !== null ? (
                <Body muted style={{ minWidth: 80 }}>
                  {at}
                </Body>
              ) : null}
              <Body weight={600} style={{ flexGrow: 1 }}>
                {amount}
              </Body>
              <Button label="Delete" variant="secondary" size="compact" accessibilityLabel={at !== null ? `Delete ${spoken} at ${at}` : `Delete ${spoken}`} onPress={() => remove(entry)} />
            </View>
          );
        })}
      </View>
      <Button label="Done" variant="quiet" onPress={onClose} />
    </>
  );
}

/** The water card's sheets (R150): Other ("Add water"), the daily goal, and the day's entries. */
export function WaterSheet({
  mode,
  localDate,
  today,
  unit,
  locale,
  goalMl,
  entries,
  onClose,
}: {
  mode: WaterSheetMode | null;
  localDate: string;
  today: string;
  unit: WaterUnit;
  locale: string;
  goalMl: number | null;
  entries: readonly WaterEntry[];
  onClose: () => void;
}) {
  const shared: Shared = { localDate, today, unit, locale, onClose };
  let content: ReactNode = null;
  if (mode === 'other') content = <OtherAmount {...shared} totalMl={entries.reduce((sum, e) => sum + e.amountMl, 0)} />;
  else if (mode === 'goal') content = <GoalEditor {...shared} goalMl={goalMl} />;
  else if (mode === 'entries') content = <EntryList {...shared} entries={entries} />;
  return (
    <Sheet visible={mode !== null} onClose={onClose}>
      {content}
    </Sheet>
  );
}
