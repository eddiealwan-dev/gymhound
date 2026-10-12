import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { ActiveWorkoutExistsError, getActiveWorkoutId } from '../../../src/db/repositories/activeWorkout';
import { getWorkoutDetail, startRepeatWorkout, type WorkoutDetail } from '../../../src/db/repositories/historyRepo';
import { getSettings } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { calendarDayTitle, toLocalDate } from '../../../src/domain/dates';
import { formatWorkoutDuration } from '../../../src/domain/history';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { formatVolume } from '../../../src/domain/volume';
import { announce } from '../../../src/platform/announce';
import { deviceLocale } from '../../../src/platform/locale';
import { bumpData, useFocusedDbQuery } from '../../../src/state/dataVersion';
import { flushAll } from '../../../src/state/draftFlush';
import { deleteHistoryWorkout } from '../../../src/state/historyActions';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { FinishPrs } from '../../../src/ui/finish/FinishPrs';
import { PbCardHost } from '../../../src/ui/finish/PbCardHost';
import { SaveAsWorkout } from '../../../src/ui/finish/SaveAsWorkout';
import { DetailExercise, nextLinesFor } from '../../../src/ui/history/DetailExercise';
import { Screen } from '../../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../../src/ui/Sheet';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';
import { pbCardFor } from '../../../src/db/repositories/shareCardsRepo';
import { WorkoutInProgressSheet } from '../../../src/ui/WorkoutInProgressSheet';

/** Back where it was opened from; a link opened with no history goes to /history. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.navigate('/history');
}

const START_FAILED = "Couldn't start. Try again.";
const DELETE_FAILED = "Couldn't delete. Try again.";

const setCount = (n: number) => (n === 1 ? '1 set' : `${n} sets`);

/**
 * A finished workout (R165): its name; when it was, the start time and how long it took; the routine and day it came
 * from; the volume and set count; each exercise with its sets, red PR marks, the Something off reason, the note saved
 * with it and the next-time line, a superset under one bar; then the personal bests (with Share). Actions: **Repeat**
 * (filled, R171), **Edit**, **Save as a workout** and a quiet **Delete workout**. A hidden tab route under History, with
 * no footer (§18.4). It reads on focus only (R185). Opened for an id that isn't a finished workout, it says so.
 *
 * A hidden tab stays mounted when it opens another workout, so the screen is keyed by the id: a sheet, a failure line,
 * "Saved as …" or a held workout never carries over to the next one.
 */
export default function WorkoutDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkoutDetailScreen key={id} id={id} />;
}

function WorkoutDetailScreen({ id }: { id: string }) {
  const db = useDb();
  const { colors } = useTheme();
  /** Shown and focused: a delete that finishes after the screen has gone or lost focus doesn't navigate. */
  const here = useRef(true);
  /** A Repeat is starting (or has started and opened the session): a second tap does nothing until the screen is back. */
  const starting = useRef(false);
  useFocusEffect(
    useCallback(() => {
      here.current = true;
      starting.current = false;
      return () => {
        here.current = false;
      };
    }, []),
  );
  const read = useCallback((d: Db) => {
    const { unit } = getSettings(d);
    return { detail: getWorkoutDetail(d, id, unit), unit };
  }, [id]);
  const current = useFocusedDbQuery(read);
  /** The workout as last shown, held once Delete has removed it so the screen doesn't flash "not in your history" on its way out. */
  const held = useRef<WorkoutDetail | null>(null);
  const detail = current.detail ?? held.current;
  const { unit } = current;
  const [inProgress, setInProgress] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  if (detail === null) {
    return (
      <Screen>
        <BackLink label="History" onPress={leave} />
        <Body style={{ marginTop: 8 }}>This workout isn't in your history.</Body>
      </Screen>
    );
  }

  const locale = deviceLocale();
  const { summary } = detail;

  const fail = (line: string) => {
    setFailed(line);
    announce(line);
  };

  const repeat = () => {
    if (starting.current) return;
    starting.current = true;
    flushAll();
    setFailed(null);
    if (getActiveWorkoutId(db) !== null) {
      starting.current = false;
      setInProgress(true);
      return;
    }
    try {
      startRepeatWorkout(db, id, Date.now());
    } catch (error) {
      starting.current = false;
      if (error instanceof ActiveWorkoutExistsError) setInProgress(true);
      else {
        console.warn('GymHound could not repeat the workout.', error);
        fail(START_FAILED);
      }
      return;
    }
    bumpData();
    router.push('/session');
  };

  const edit = () => {
    flushAll();
    router.push({ pathname: '/history/edit/[id]', params: { id } });
  };

  const remove = () => {
    setAskDelete(false);
    afterSheetCloses(() => {
      // Held before the delete, whose bump reads again and finds nothing.
      held.current = detail;
      try {
        deleteHistoryWorkout(db, id);
      } catch (error) {
        console.warn('GymHound could not delete the workout.', error);
        // Nothing was deleted, so nothing is held, the screen stays and a muted line under the buttons says so.
        held.current = null;
        fail(DELETE_FAILED);
        return;
      }
      announce('Workout deleted.');
      // Asked for, so it is deleted; but a screen that has gone or been left meanwhile doesn't pull the lifter back.
      if (here.current) leave();
    });
  };

  const when = [calendarDayTitle(detail.localDate, toLocalDate(Date.now()), locale), new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(detail.startedAt), formatWorkoutDuration(summary.durationMs)].join(' · ');
  const from = detail.routineName === null ? null : [detail.routineName, ...(detail.dayName === null ? [] : [detail.dayName])].join(' · ');
  const totals = [...(summary.volume > 0 ? [formatVolume(summary.volume, unit, locale)] : []), setCount(summary.setCount)].join(' · ');

  const nextLines = nextLinesFor(detail.exercises, summary.next);
  const items = detail.exercises.map((exercise, i) => ({ exercise, nextLine: nextLines[i] }));
  const links = linksFromGroups(detail.exercises.map((e) => e.supersetGroup));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The personal best card is drawn first, under the page, which paints over it (R106). */}
      <PbCardHost locale={locale} modelFor={(h) => pbCardFor(db, h, id, locale)}>
        <Screen>
          <BackLink label="History" onPress={leave} />
          <ScreenTitle>{summary.name}</ScreenTitle>
          <View style={{ gap: 4, marginTop: 4 }}>
            <Body muted style={{ fontSize: 14 }}>
              {when}
            </Body>
            {from !== null && (
              <Body muted style={{ fontSize: 14 }}>
                {from}
              </Body>
            )}
            <Body muted style={{ fontSize: 14 }}>
              {totals}
            </Body>
          </View>

          <View style={{ marginTop: 24, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, gap: 16 }}>
            {supersetRuns(items, links).map((run) => {
              const rows = run.members.map(({ exercise, nextLine }) => (
                <DetailExercise key={exercise.workoutExerciseId} exercise={exercise} unit={unit} nextLine={nextLine} />
              ));
              return run.superset ? (
                <SupersetBar key={run.members[0].exercise.workoutExerciseId}>
                  <View style={{ gap: 16 }}>{rows}</View>
                </SupersetBar>
              ) : (
                rows
              );
            })}
          </View>

          <View style={{ marginTop: 16 }}>
            <FinishPrs summary={summary} />
          </View>

          <View style={{ gap: 8, marginTop: 32 }}>
            <Button label="Repeat" onPress={repeat} />
            <Button label="Edit" variant="secondary" onPress={edit} />
          </View>
          <View style={{ marginTop: 8 }}>
            <SaveAsWorkout workoutId={id} workoutName={summary.name} inHistory />
          </View>
          <Button
            label="Delete workout"
            variant="quiet"
            onPress={() => {
              flushAll();
              setFailed(null);
              setAskDelete(true);
            }}
          />
          {failed !== null && (
            <Body muted style={{ marginTop: 8 }}>
              {failed}
            </Body>
          )}

          <WorkoutInProgressSheet
            visible={inProgress}
            onClose={() => setInProgress(false)}
            body="Finish or discard the workout in progress before starting another."
          />
          <ConfirmSheet
            visible={askDelete}
            title="Delete this workout?"
            body="Its sets leave your history and stats. Next time's weights are worked out again from the workouts left."
            confirmLabel="Delete"
            cancelLabel="Keep"
            onConfirm={remove}
            onCancel={() => setAskDelete(false)}
          />
        </Screen>
      </PbCardHost>
    </View>
  );
}
