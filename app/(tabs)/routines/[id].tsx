import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { getRoutineDetail, swapRoutineExercise } from '../../../src/db/repositories/routinesRepo';
import { programExerciseId } from '../../../src/domain/alternatives';
import { routineLine } from '../../../src/domain/programInfo';
import type { RoutineDetail, RoutineDetailExercise } from '../../../src/db/repositories/routinesRepo';
import type { Db } from '../../../src/db/types';
import { formatRepScheme } from '../../../src/domain/labels';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { ActiveBadge } from '../../../src/ui/ActiveBadge';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { canUseRoutine, lockedRoutineReason, proReasonText } from '../../../src/domain/routineLimit';
import { useIsPro } from '../../../src/platform/entitlements';
import { useOpenPaywall } from '../../../src/ui/pro/openPaywall';
import { ModifySheet } from '../../../src/ui/ModifySheet';
import { useProGate } from '../../../src/ui/RoutineLimit';
import { useRoutineActions } from '../../../src/ui/routines/useRoutineActions';
import { afterSheetCloses, Sheet } from '../../../src/ui/Sheet';
import { SheetTitle } from '../../../src/ui/SheetTitle';
import { Screen } from '../../../src/ui/Screen';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, Display, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to Routines. With nothing to go back to (opened by address, or reloaded), it lands on Routines. */
function toRoutines() {
  if (router.canGoBack()) router.back();
  else router.navigate('/routines');
}

/**
 * An exercise of a day: its name, and its sets and reps (seconds for timed ones) as Up next shows them. Tapping it opens
 * its Modify and Stats (R553, R554).
 */
function ExerciseRow({ exercise, onPress }: { exercise: RoutineDetailExercise; onPress: (exercise: RoutineDetailExercise) => void }) {
  const scheme = formatRepScheme(exercise.setCount, exercise.repMin, exercise.repMax, exercise.loggingType);
  return (
    // At a large text size the scheme drops under the name rather than squeezing it, as on Up next.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${scheme}`}
      accessibilityHint="Modify or see its stats"
      onPress={() => onPress(exercise)}
      style={({ pressed }) => ({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, paddingVertical: 8, minHeight: 44, opacity: pressed ? 0.8 : 1 })}
    >
      <Body style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }}>{exercise.name}</Body>
      <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {scheme}
      </Body>
    </Pressable>
  );
}

/** A day as a card: its name, then its exercises in order, a superset marked by the bar down its members' edge. */
function DayCard({ day, onExercise }: { day: RoutineDetail['days'][number]; onExercise: (exercise: RoutineDetailExercise) => void }) {
  const { colors } = useTheme();
  const links = linksFromGroups(day.exercises.map((e) => e.supersetGroup));
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <Display accessibilityRole="header" style={{ fontSize: 22, marginBottom: 4 }}>
        {day.name}
      </Display>
      {supersetRuns(day.exercises, links).map((run) => {
        const rows = run.members.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} onPress={onExercise} />);
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
  const db = useDb();
  const gate = useProGate();
  /** The exercise whose sheet is open, and the one Modify is open for. */
  const [chosen, setChosen] = useState<RoutineDetailExercise | null>(null);
  const [modifying, setModifying] = useState<RoutineDetailExercise | null>(null);

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
        {routineLine({ id: routine.id, isPremade: routine.isPremade, dayCount: routine.days.length })}
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
          <DayCard key={day.id} day={day} onExercise={setChosen} />
        ))}
      </View>
      {routine.isPremade ? null : (
        // At the foot of the page, quiet and centred, as Delete workout is on a workout and Discard workout in the session.
        <View style={{ marginTop: 24 }}>
          <Button label="Delete routine" variant="quiet" onPress={() => actions.askDelete(routine)} />
          {failed?.action === 'delete' ? <Body muted style={{ textAlign: 'center' }}>{failed.text}</Body> : null}
        </View>
      )}
      <Sheet visible={chosen !== null} onClose={() => setChosen(null)}>
        <SheetTitle
          subtitle={chosen === null ? null : formatRepScheme(chosen.setCount, chosen.repMin, chosen.repMax, chosen.loggingType)}
        >
          {chosen?.name ?? ''}
        </SheetTitle>
        <View style={{ gap: 8 }}>
          <Button
            label="Modify"
            variant="secondary"
            onPress={() => {
              const exercise = chosen;
              setChosen(null);
              // A Pro program or a kept routine can't change until Pro is back (R524, R525).
              if (exercise) afterSheetCloses(() => gate.when(canUseRoutine(routine, gate.isPro()), lockedRoutineReason(routine), () => setModifying(exercise)));
            }}
          />
          <Button
            label="Stats"
            variant="secondary"
            onPress={() => {
              const exercise = chosen;
              setChosen(null);
              if (exercise) afterSheetCloses(() => router.push(`/lift/${exercise.exerciseId}`));
            }}
          />
          <Button label="Cancel" variant="quiet" onPress={() => setChosen(null)} />
        </View>
      </Sheet>
      <ModifySheet
        target={
          modifying === null
            ? null
            : {
                exerciseId: modifying.exerciseId,
                name: modifying.name,
                programExerciseId: programExerciseId(modifying.id, routine.isPremade),
                inUse: routine.days.find((d) => d.exercises.some((e) => e.id === modifying.id))?.exercises.map((e) => e.exerciseId) ?? [],
              }
        }
        note={`Changes it in ${routine.name} from the next workout. Its sets and reps stay; the next workout asks for a starting weight.`}
        onClose={() => setModifying(null)}
        onChoose={(exerciseId) => {
          if (modifying) swapRoutineExercise(db, modifying.id, exerciseId);
          setModifying(null);
          bumpData();
        }}
      />
      {gate.sheets}
      {actions.sheets}
    </Screen>
  );
}
