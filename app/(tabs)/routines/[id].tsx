import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { deleteRoutine, duplicateRoutine, getRoutineDetail, setActiveRoutine } from '../../../src/db/repositories/routinesRepo';
import type { RoutineDetail, RoutineDetailExercise } from '../../../src/db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../../src/db/repositories/workoutsRepo';
import type { Db } from '../../../src/db/types';
import { formatRepScheme } from '../../../src/domain/labels';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { useRoutineLimit } from '../../../src/ui/RoutineLimit';
import { Screen } from '../../../src/ui/Screen';
import { ConfirmSheet } from '../../../src/ui/Sheet';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, Display } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';
import { WorkoutInProgressSheet } from '../../../src/ui/WorkoutInProgressSheet';

/** Back to Routines. With nothing to go back to (opened by address, or reloaded), it lands on Routines. */
function toRoutines() {
  if (router.canGoBack()) router.back();
  else router.navigate('/routines');
}

/** An exercise of a day: its name, and its sets and reps (seconds for timed ones) as Up next shows them. */
function ExerciseRow({ exercise }: { exercise: RoutineDetailExercise }) {
  return (
    // At a large text size the scheme drops under the name rather than squeezing it, as on Up next.
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, paddingVertical: 8 }}>
      <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>{exercise.name}</Body>
      <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType)}
      </Body>
    </View>
  );
}

/** A day as a card: its name, then its exercises in order, a superset marked by the bar down its members' edge. */
function DayCard({ day }: { day: RoutineDetail['days'][number] }) {
  const { colors } = useTheme();
  const links = linksFromGroups(day.exercises.map((e) => e.supersetGroup));
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <Display accessibilityRole="header" style={{ fontSize: 22, marginBottom: 4 }}>
        {day.name}
      </Display>
      {supersetRuns(day.exercises, links).map((run) => {
        const rows = run.members.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} />);
        return run.superset ? <SupersetBar key={run.members[0].id}>{rows}</SupersetBar> : rows;
      })}
    </View>
  );
}

/**
 * A routine (§8.6): its days and exercises, with **Set active** and **Duplicate**, and for your own **Edit** and
 * **Delete**. Premades are read-only but still progress when run. Set active waits for a workout in progress (R80);
 * Duplicate keeps to the free limit (R88) and opens the copy; Delete asks first, keeps the history and, for the active
 * routine, leaves none active (R90).
 */
export default function RoutineDetailScreen() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useCallback((d: Db) => getRoutineDetail(d, id), [id]);
  const routine = useDbQuery(read);
  const [blocked, setBlocked] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const limit = useRoutineLimit();

  if (routine === null) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={toRoutines} />
        <Body muted style={{ marginTop: 8 }}>
          Routine not found.
        </Body>
      </Screen>
    );
  }

  const setActive = () => {
    if (getActiveWorkoutId(db) !== null) {
      setBlocked(true);
      return;
    }
    setActiveRoutine(db, routine.id);
    bumpData();
  };

  const duplicate = () =>
    limit.whenRoomFor(() => {
      const copyId = duplicateRoutine(db, routine.id, Date.now());
      bumpData();
      router.push(`/routines/${copyId}`);
    });

  const remove = () => {
    setAskDelete(false);
    deleteRoutine(db, routine.id);
    bumpData();
    toRoutines();
  };

  return (
    <Screen>
      <BackLink label="Routines" onPress={toRoutines} />
      <Display>{routine.name}</Display>
      <Body muted style={{ fontSize: 14 }}>
        {routine.days.length === 1 ? '1 day' : `${routine.days.length} days`}
      </Body>
      <View style={{ gap: 8, marginTop: 24 }}>
        {routine.isActive ? <ActiveBadge /> : <Button label="Set active" onPress={setActive} />}
        {/* Side by side when both fit; at a large text size the second drops under the first. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1 }}>
            <Button label="Duplicate" variant="secondary" onPress={duplicate} />
          </View>
          {routine.isPremade ? null : (
            <View style={{ flexGrow: 1 }}>
              <Button label="Edit" variant="secondary" onPress={() => router.push(`/routines/edit/${routine.id}`)} />
            </View>
          )}
        </View>
      </View>
      <View style={{ gap: 16, marginTop: 32 }}>
        {routine.days.map((day) => (
          <DayCard key={day.id} day={day} />
        ))}
      </View>
      {routine.isPremade ? null : (
        // A quiet button steps back by its padding, so its label lines up with the content edge.
        <View style={{ alignSelf: 'flex-start', marginTop: 16, marginLeft: -20 }}>
          <Button label="Delete" variant="quiet" accessibilityLabel="Delete routine" onPress={() => setAskDelete(true)} />
        </View>
      )}
      <WorkoutInProgressSheet visible={blocked} onClose={() => setBlocked(false)} />
      <ConfirmSheet
        visible={askDelete}
        title="Delete this routine?"
        body="Workouts you finished with it stay in History."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={remove}
        onCancel={() => setAskDelete(false)}
      />
      {limit.sheets}
    </Screen>
  );
}
