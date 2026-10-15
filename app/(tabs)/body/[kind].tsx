import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { listBodyEntries } from '../../../src/db/repositories/bodyRepo';
import { getSettings } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { BODY_LABELS, bodyUnit, formatBodyValue, isBodyKind, labelBodyValue, shownEntry } from '../../../src/domain/body';
import type { BodyEntry, BodyKind } from '../../../src/domain/body';
import { formatEntryDate, toLocalDate } from '../../../src/domain/dates';
import type { LengthUnit } from '../../../src/domain/types';
import { deviceLocale } from '../../../src/platform/locale';
import { useDbQuery } from '../../../src/state/dataVersion';
import { flushAll } from '../../../src/state/draftFlush';
import { BackLink } from '../../../src/ui/BackLink';
import { BodyEntrySheet } from '../../../src/ui/body/BodyEntrySheet';
import { BodyChart, BodyQuickEntry } from '../../../src/ui/body/BodyLog';
import { EmptyState } from '../../../src/ui/EmptyState';
import { Screen } from '../../../src/ui/Screen';
import { Body, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to Stats. With nothing to go back to (opened by address, or reloaded), it lands on Stats. */
function toStats() {
  if (router.canGoBack()) router.back();
  else router.navigate('/stats');
}

/** One entry: its date on the left, its value on the right (a length in the chosen length unit). Tapping it edits it. */
function EntryRow({ stored, lengthUnit, date, onPress }: { stored: BodyEntry; lengthUnit: LengthUnit; date: string; onPress: () => void }) {
  const { colors } = useTheme();
  const entry = shownEntry(stored, lengthUnit);
  const value = formatBodyValue(entry.value, entry.unit);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${labelBodyValue(entry.value, entry.unit)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        columnGap: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body>{date}</Body>
      <Body weight={600} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Body>
    </Pressable>
  );
}

function KindDetail({ kind }: { kind: BodyKind }) {
  const read = useCallback((d: Db) => {
    const s = getSettings(d);
    return { entries: listBodyEntries(d, kind), weightUnit: s.unit, lengthUnit: s.lengthUnit };
  }, [kind]);
  const { entries, weightUnit, lengthUnit } = useDbQuery(read);
  const [editing, setEditing] = useState<BodyEntry | null>(null);
  const unit = bodyUnit(kind, weightUnit, lengthUnit);
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  const dateOf = (entry: BodyEntry) => formatEntryDate(entry.localDate, today, locale);

  const open = (entry: BodyEntry) => {
    flushAll();
    Keyboard.dismiss();
    setEditing(entry);
  };

  return (
    <Screen>
      <BackLink label="Stats" onPress={toStats} />
      <ScreenTitle>{BODY_LABELS[kind]}</ScreenTitle>
      <View style={{ gap: 16, marginTop: 24 }}>
        <BodyQuickEntry kind={kind} unit={unit} />
        <BodyChart kind={kind} entries={entries} unit={unit} today={today} locale={locale} />
      </View>
      <View style={{ marginTop: 32 }}>
        {entries.length === 0 ? (
          <EmptyState text="No entries yet. Log one above and it shows here." />
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} stored={entry} lengthUnit={lengthUnit} date={dateOf(entry)} onPress={() => open(entry)} />)
        )}
      </View>
      <BodyEntrySheet entry={editing} lengthUnit={lengthUnit} dateLabel={editing ? dateOf(editing) : ''} onClose={() => setEditing(null)} />
    </Screen>
  );
}

/** One body kind (R114): its entry row, its chart with range chips, and every entry newest first, each editable. */
export default function BodyDetail() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  if (typeof kind !== 'string' || !isBodyKind(kind)) {
    return (
      <Screen>
        <BackLink label="Stats" onPress={toStats} />
        <Body muted style={{ marginTop: 8 }}>
          That measurement isn't here.
        </Body>
      </Screen>
    );
  }
  return <KindDetail key={kind} kind={kind} />;
}
