import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { finishedWorkoutCount } from '../../src/db/repositories/onboardingRepo';
import { checkReviewAfterFinish } from '../../src/db/repositories/reviewRepo';
import { getSettings } from '../../src/db/repositories/settingsRepo';
import { getFinishSummary } from '../../src/db/repositories/workoutViewsRepo';
import type { Db } from '../../src/db/types';
import { formatElapsed } from '../../src/domain/dates';
import { finishLine } from '../../src/domain/ruleLine';
import { formatVolume } from '../../src/domain/volume';
import { deviceLocale } from '../../src/platform/locale';
import { isTesterBuild } from '../../src/platform/runtime';
import { requestStoreReview } from '../../src/platform/storeReview';
import { useDbQuery } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { FinishPrs } from '../../src/ui/finish/FinishPrs';
import { PbCardHost } from '../../src/ui/finish/PbCardHost';
import { SaveAsWorkout } from '../../src/ui/finish/SaveAsWorkout';
import { TesterQuestions } from '../../src/ui/finish/TesterQuestions';
import { Body, Display, Label, Num } from '../../src/ui/Text';
import { pbCardFor } from '../../src/db/repositories/shareCardsRepo';
import { useDb } from '../../src/db/DbProvider';
import { useTheme } from '../../src/ui/ThemeProvider';

/**
 * Back to the Train screen already under this one, closing the summary (R78): replacing it with Train would stack a
 * second Train screen after every workout. Opened by address with nothing under it, it puts Train in its place.
 */
const goToTrain = () => router.dismissTo('/');

/** How long after the summary opens the store's rating prompt is asked for (R586), so the summary is seen first. */
export const REVIEW_DELAY_MS = 1000;

/**
 * Runs the rating rules once per finished workout shown (R585–R587), and asks the store a second after the summary
 * opens when they say so. A failure is logged and never reaches the screen.
 */
function useReviewAfterFinish(db: Db, id: string, shown: boolean) {
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (!shown || checked.current === id) return;
    checked.current = id;
    let ask = false;
    try {
      ask = checkReviewAfterFinish(db, id, Date.now(), isTesterBuild());
    } catch (error) {
      console.warn('GymHound could not check the rating rules.', error);
    }
    // Not cleared on unmount: the store's prompt is fine over Train too, and a re-run must not cancel it.
    if (ask) setTimeout(() => void requestStoreReview(), REVIEW_DELAY_MS);
  }, [db, id, shown]);
}

/** The summary of a finished workout, or null when there is none with this id (the page was opened by address, or the data was cleared). */
function readSummary(db: Db, id: string) {
  const { unit } = getSettings(db);
  try {
    return { summary: getFinishSummary(db, id, unit), unit, firstWorkout: finishedWorkoutCount(db) === 1 };
  } catch (error) {
    // Logged: after a finish, "That workout isn't here." with nothing in the log would hide a real failure.
    console.warn('GymHound could not read the finish summary.', error);
    return { summary: null, unit, firstWorkout: false };
  }
}

/** What LOGGED says: the sets, and a metcon's score counted as a score, not a set (design gate #6): "12 sets · 1 score". */
function loggedParts(setCount: number, scoreCount: number): string[] {
  const sets = setCount - scoreCount;
  const parts = [sets > 0 || scoreCount === 0 ? `${sets} ${sets === 1 ? 'set' : 'sets'}` : null, scoreCount > 0 ? `${scoreCount} ${scoreCount === 1 ? 'score' : 'scores'}` : null];
  return parts.filter((p): p is string => p !== null);
}
const loggedText = (setCount: number, scoreCount: number) => loggedParts(setCount, scoreCount).join(' · ');
const loggedSpoken = (setCount: number, scoreCount: number) => loggedParts(setCount, scoreCount).join(' and ');

/** One big figure with a small caption above it. */
function Figure({ caption, value, label, spoken }: { caption: string; value: string; label: string; spoken?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border }} accessible accessibilityLabel={`${label} ${spoken ?? value}`}>
      <Label accessibilityRole="none">{caption}</Label>
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
  const db = useDb();
  const read = useCallback((db: Db) => readSummary(db, id), [id]);
  const { summary, unit, firstWorkout } = useDbQuery(read);
  useReviewAfterFinish(db, id, summary !== null);
  /** The lines under the figures: the summary's own, else next time's weights as `finishLine` says them. */
  const lines = summary === null ? [] : (summary.lines ?? summary.next.map((n) => ({ workoutExerciseId: n.workoutExerciseId, text: finishLine(n), why: null })));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The personal best card is drawn first, under the scroll view, which paints over it (R106). */}
      <PbCardHost locale={deviceLocale()} modelFor={(h) => pbCardFor(db, h, id, deviceLocale())}>
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
                {/* A run or metcon day lifts nothing: no VOLUME of 0 (design gate #6). */}
                {summary.volume > 0 ? <Figure caption="Volume" label="Volume" value={formatVolume(summary.volume, unit, deviceLocale())} /> : null}
                <Figure caption="Logged" label="Logged" value={loggedText(summary.setCount, summary.scoreCount ?? 0)} spoken={loggedSpoken(summary.setCount, summary.scoreCount ?? 0)} />
                {lines.length > 0 && (
                  <View style={{ gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                    {lines.map((line, i) => (
                      // A program's line says why under it, muted (§18.29: a reset, a ladder going back, a metcon beaten twice).
                      <View key={i} style={{ gap: 2 }}>
                        <Body>{line.text}</Body>
                        {line.why === null ? null : (
                          <Body muted style={{ fontSize: 14 }}>
                            {line.why}
                          </Body>
                        )}
                      </View>
                    ))}
                  </View>
                )}
                <FinishPrs summary={summary} firstWorkout={firstWorkout} />
                <TesterQuestions />
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
