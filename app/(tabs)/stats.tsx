import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { latestBodyEntries, listBodyEntries } from '../../src/db/repositories/bodyRepo';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import type { Db } from '../../src/db/types';
import { BODY_KINDS, BODY_LABELS, bodyUnit, convertBody, formatBodyValue } from '../../src/domain/body';
import type { BodyEntry, BodyKind, BodyUnit } from '../../src/domain/body';
import { toLocalDate } from '../../src/domain/dates';
import { useDbQuery } from '../../src/state/dataVersion';
import { flushAll } from '../../src/state/draftFlush';
import { BodyChart, BodyQuickEntry, bodyNumber, deviceLocale, formatEntryDate } from '../../src/ui/body/BodyLog';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display, Label, Num } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

const MEASUREMENT_KINDS = BODY_KINDS.filter((kind) => kind !== 'bodyweight');

/** Everything Stats reads: the display unit, every bodyweight entry for the chart, and each kind's latest. */
function readStats(db: Db) {
  return { unit: getSettings(db).unit, bodyweight: listBodyEntries(db, 'bodyweight'), latest: latestBodyEntries(db) };
}

function openKind(kind: BodyKind) {
  flushAll();
  // The cast can go once .expo/types/router.d.ts is regenerated: it predates the body route.
  router.push(`/body/${kind}` as Href);
}

/** A latest entry shown in the unit the screen uses now (it keeps its own unit in the database, R112). */
const shownValue = (entry: BodyEntry, unit: BodyUnit) => convertBody(entry.value, entry.unit, unit);

/** A measurement: its name, its latest "{value} · {date}" or "No entries", and a chevron to its detail. */
function MeasurementRow({ kind, entry, unit, today, locale }: { kind: BodyKind; entry?: BodyEntry; unit: BodyUnit; today: string; locale: string }) {
  const { colors } = useTheme();
  const latest = entry ? `${formatBodyValue(shownValue(entry, unit), unit)} · ${formatEntryDate(entry.localDate, today, locale)}` : null;
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
 * Stats (§8.9, R114): Body, with the Bodyweight card (the latest, a quick entry, the chart with its ranges and a link
 * to every entry), then each measurement's latest, opening its detail. Phase 6 puts the lift charts above Body.
 */
export default function Stats() {
  const { colors } = useTheme();
  const { unit: displayUnit, bodyweight, latest } = useDbQuery(readStats);
  const today = toLocalDate(Date.now());
  const locale = deviceLocale();
  const weightUnit = bodyUnit('bodyweight', displayUnit);
  const lastWeight = latest.bodyweight;

  return (
    <Screen footer>
      <Display>Stats</Display>
      <Label style={{ marginTop: 24, marginBottom: 8 }}>Body</Label>
      <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 }}>
        <View style={{ gap: 4 }}>
          <Display accessibilityRole="header" style={{ fontSize: 22 }}>
            Bodyweight
          </Display>
          {lastWeight ? (
            <View
              accessible
              accessibilityLabel={`${formatBodyValue(shownValue(lastWeight, weightUnit), weightUnit)}, ${formatEntryDate(lastWeight.localDate, today, locale)}`}
              style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }}
            >
              <Num style={{ fontSize: 44 }}>{bodyNumber(shownValue(lastWeight, weightUnit))}</Num>
              <Body muted>{weightUnit}</Body>
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
          <Button label="All entries ›" variant="quiet" accessibilityLabel="All bodyweight entries" onPress={() => openKind('bodyweight')} />
        </View>
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Measurements</Label>
      <View>
        {MEASUREMENT_KINDS.map((kind) => (
          <MeasurementRow key={kind} kind={kind} entry={latest[kind]} unit={bodyUnit(kind, displayUnit)} today={today} locale={locale} />
        ))}
      </View>
    </Screen>
  );
}
