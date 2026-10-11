import { getLocales } from 'expo-localization';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { getFinishSummary } from '../../src/db/repositories/workoutViewsRepo';
import type { Db } from '../../src/db/types';
import { formatElapsed } from '../../src/domain/dates';
import { finishLine } from '../../src/domain/ruleLine';
import { formatVolume } from '../../src/domain/volume';
import { useDbQuery } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { FinishPrs } from '../../src/ui/finish/FinishPrs';
import { PbCardHost } from '../../src/ui/finish/PbCardHost';
import { SaveAsWorkout } from '../../src/ui/finish/SaveAsWorkout';
import { Body, Display, Num } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

/**
 * Back to the Train screen already under this one, closing the summary (R78): replacing it with Train would stack a
 * second Train screen after every workout. Opened by address with nothing under it, it puts Train in its place.
 */
const goToTrain = () => router.dismissTo('/');

const deviceLocale = () => getLocales()[0]?.languageTag ?? 'en-US';

/** The summary of a finished workout, or null when there is none with this id (the page was opened by address, or the data was cleared). */
function readSummary(db: Db, id: string) {
  const { unit } = getSettings(db);
  try {
    return { summary: getFinishSummary(db, id, unit), unit };
  } catch {
    return { summary: null, unit };
  }
}

/** One big figure with a small caption above it. */
function Figure({ caption, value, label }: { caption: string; value: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} accessible accessibilityLabel={`${label} ${value}`}>
      <Body weight={600} muted style={{ fontSize: 14 }}>
        {caption}
      </Body>
      <Num weight={700} style={{ fontSize: 44, lineHeight: 52 }}>
        {value}
      </Num>
    </View>
  );
}

/**
 * Shown the moment a workout is finished: how long it took, how much was lifted, how many sets counted, then next
 * time's weight for each exercise with a rule (spec 8.5, R64). A full screen with no header, dock or footer. Done goes
 * back to Train, where Up next already has the next day. Phase 4 adds the personal bests (`FinishPrs`) after the
 * next-time lines and **Save as a workout** (`SaveAsWorkout`) just above Done.
 */
export default function FinishSummary() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useCallback((db: Db) => readSummary(db, id), [id]);
  const { summary, unit } = useDbQuery(read);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The personal best card is drawn first, under the scroll view, which paints over it (R106). */}
      <PbCardHost locale={deviceLocale()}>
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.bg }}
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexGrow: 1, width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16 }}>
            {summary === null ? (
              <Body style={{ marginBottom: 16 }}>That workout isn't here.</Body>
            ) : (
              <>
                <Display weight={800} accessibilityRole="header" style={{ fontSize: 56, lineHeight: 60 }}>
                  WORKOUT DONE
                </Display>
                <Display weight={700} style={{ fontSize: 28, marginBottom: 24, color: colors.textMuted }}>
                  {summary.name}
                </Display>
                <Figure caption="Duration" label="Duration" value={formatElapsed(summary.durationMs)} />
                <Figure caption="Volume" label="Volume" value={formatVolume(summary.volume, unit, deviceLocale())} />
                <Figure
                  caption="Logged"
                  label="Sets logged"
                  value={`${summary.setCount} ${summary.setCount === 1 ? 'set' : 'sets'}`}
                />
                {summary.next.length > 0 && (
                  <View style={{ gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                    {summary.next.map((n, i) => (
                      <Body key={i}>{finishLine(n)}</Body>
                    ))}
                  </View>
                )}
                <FinishPrs summary={summary} />
              </>
            )}
            <View style={{ flex: 1, minHeight: 24 }} />
            {summary !== null && <SaveAsWorkout workoutId={id} workoutName={summary.name} />}
            <Button label={summary === null ? 'Back to Train' : 'Done'} onPress={goToTrain} />
          </View>
        </ScrollView>
      </PbCardHost>
    </View>
  );
}
