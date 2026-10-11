import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { latestBodyEntries, listBodyEntries } from '../../db/repositories/bodyRepo';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { Db } from '../../db/types';
import { BODY_KINDS, BODY_LABELS, bodyUnit, formatBodyValue } from '../../domain/body';
import type { BodyEntry, BodyKind } from '../../domain/body';
import { toLocalDate } from '../../domain/dates';
import { useFocusedDbQuery } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { BodyChart, BodyQuickEntry, bodyNumber, deviceLocale, formatEntryDate } from '../body/BodyLog';
import { Button } from '../Button';
import { Body, Display, Label, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

const MEASUREMENT_KINDS = BODY_KINDS.filter((kind) => kind !== 'bodyweight');

/** Everything Body reads: the display unit, every bodyweight entry for the chart, and each kind's latest. */
function readBody(db: Db) {
  return { unit: getSettings(db).unit, bodyweight: listBodyEntries(db, 'bodyweight'), latest: latestBodyEntries(db) };
}

function openKind(kind: BodyKind) {
  flushAll();
  router.push(`/body/${kind}`);
}

/**
 * A measurement: its name, its latest "{value} · {date}" or "No entries", and a chevron to its detail. A logged value
 * shows in the unit it was logged in (spec §7, R112); only the chart converts.
 */
function MeasurementRow({ kind, entry, today, locale }: { kind: BodyKind; entry?: BodyEntry; today: string; locale: string }) {
  const { colors } = useTheme();
  const latest = entry ? `${formatBodyValue(entry.value, entry.unit)} · ${formatEntryDate(entry.localDate, today, locale)}` : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${BODY_LABELS[kind]}, ${latest ? latest.replace(' · ', ', ') : 'No entries'}`}
      onPress={() => openKind(kind)}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {/* At a large text size the value drops under the name rather than squeezing it. */}
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 12 }}>
        <Body weight={600} style={{ flexGrow: 1 }}>
          {BODY_LABELS[kind]}
        </Body>
        <Body muted style={{ fontVariant: ['tabular-nums'] }}>
          {latest ?? 'No entries'}
        </Body>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/**
 * Stats → Body (§8.9, R114), moved here unchanged in phase 6 (R172): the Bodyweight card (the latest, a quick entry, the
 * chart with its ranges and a link to every entry), then each measurement's latest, opening its detail. Stats draws the
 * "Body" Label above it. It reads only while Stats is in sight (R185).
 */
export function BodySection(): ReactElement {
  const { colors } = useTheme();
  const { unit: displayUnit, bodyweight, latest } = useFocusedDbQuery(readBody);
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  const weightUnit = bodyUnit('bodyweight', displayUnit);
  const lastWeight = latest.bodyweight;

  return (
    <View>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Display accessibilityRole="header" style={{ fontSize: 22 }}>
            Bodyweight
          </Display>
          {lastWeight ? (
            <View
              accessible
              accessibilityLabel={`${formatBodyValue(lastWeight.value, lastWeight.unit)}, ${formatEntryDate(lastWeight.localDate, today, locale)}`}
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}
            >
              {/* In the unit it was logged in (spec §7); the chart below converts it. */}
              <Num style={{ fontSize: 44 }}>{bodyNumber(lastWeight.value)}</Num>
              <Body muted>{lastWeight.unit}</Body>
              <Body muted>{formatEntryDate(lastWeight.localDate, today, locale)}</Body>
            </View>
          ) : (
            <Body muted>No entries yet.</Body>
          )}
        </View>
        <BodyQuickEntry kind="bodyweight" unit={weightUnit} />
        <BodyChart kind="bodyweight" entries={bodyweight} unit={weightUnit} today={today} locale={locale} />
        {/* A quiet button steps back by its padding, so its label lines up with the card's content edge. */}
        <View style={{ alignSelf: 'flex-start', marginLeft: -20, marginVertical: -4 }}>
          <Button label="All entries ›" variant="quiet" accessibilityLabel="All entries, bodyweight" onPress={() => openKind('bodyweight')} />
        </View>
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Measurements</Label>
      <View>
        {MEASUREMENT_KINDS.map((kind) => (
          <MeasurementRow key={kind} kind={kind} entry={latest[kind]} today={today} locale={locale} />
        ))}
      </View>
    </View>
  );
}
