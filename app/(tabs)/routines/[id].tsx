import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { getRoutineDetail } from '../../../src/db/repositories/routinesRepo';
import type { RoutineDetail, RoutineDetailExercise } from '../../../src/db/repositories/routinesRepo';
import type { Db } from '../../../src/db/types';
import { formatRepScheme } from '../../../src/domain/labels';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { canUseRoutine, lockedRoutineReason, proReasonText } from '../../../src/domain/routineLimit';
import { useIsPro } from '../../../src/platform/entitlements';
import { useOpenPaywall } from '../../../src/ui/pro/openPaywall';
import { useRoutineActions } from '../../../src/ui/routines/useRoutineActions';
import { Screen } from '../../../src/ui/Screen';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, Display, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

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
 * **Delete**. Premades are read-only but still progress when run. The actions are `useRoutineActions`, shared with the
 * ⋯ sheet on Routines (R542); Delete leaves for Routines.
 */
export default function RoutineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useCallback((d: Db) => getRoutineDetail(d, id), [id]);
  const routine = useDbQuery(read);
  const actions = useRoutineActions(toRoutines);
  const pro = useIsPro();
  const openPaywall = useOpenPaywall();

  if (routine === null) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={toRoutines} />
        <Body muted style={{ marginTop: 8 }}>
          That routine isn't here.
        </Body>
      </Screen>
    );
  }

  const locked = !canUseRoutine(routine, pro);
  const failed = actions.failed?.routineId === routine.id ? actions.failed : null;

  return (
    <Screen>
      <BackLink label="Routines" onPress={toRoutines} />
      <ScreenTitle>{routine.name}</ScreenTitle>
      <Body muted style={{ fontSize: 14, marginTop: 4 }}>
        {routine.days.length === 1 ? '1 day' : `${routine.days.length} days`}
      </Body>
      <View style={{ gap: 8, marginTop: 24 }}>
        {locked ? <Body muted>{proReasonText(lockedRoutineReason(routine))}</Body> : null}
        {routine.isActive && !locked ? <ActiveBadge /> : <Button label={locked ? 'See Pro' : 'Set active'} onPress={locked ? openPaywall : () => actions.setActive(routine)} />}
        {/* Side by side when both fit; at a large text size the second drops under the first. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1 }}>
            <Button label="Duplicate" variant="secondary" onPress={() => actions.duplicate(routine)} />
          </View>
          {routine.isPremade ? null : (
            <View style={{ flexGrow: 1 }}>
              <Button label="Edit" variant="secondary" onPress={() => actions.edit(routine)} />
            </View>
          )}
        </View>
        {failed?.action === 'copy' ? <Body muted>{failed.text}</Body> : null}
        <Button
          label="Share routine"
          variant="quiet"
          accessibilityLabel={`Share ${routine.name}`}
          onPress={() => actions.share(routine)}
        />
        {failed?.action === 'share' ? <Body muted>{failed.text}</Body> : null}
      </View>
      <View style={{ gap: 16, marginTop: 32 }}>
        {routine.days.map((day) => (
          <DayCard key={day.id} day={day} />
        ))}
      </View>
      {routine.isPremade ? null : (
        // At the foot of the page, quiet and centred, as Delete workout is on a workout and Discard workout in the session.
        <View style={{ marginTop: 24 }}>
          <Button label="Delete routine" variant="quiet" onPress={() => actions.askDelete(routine)} />
          {failed?.action === 'delete' ? <Body muted style={{ textAlign: 'center' }}>{failed.text}</Body> : null}
        </View>
      )}
      {actions.sheets}
    </Screen>
  );
}
