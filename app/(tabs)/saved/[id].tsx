import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../../src/db/DbProvider';
import { deleteSavedWorkout, getSavedWorkout, renameSavedWorkout } from '../../../src/db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutDetail } from '../../../src/db/repositories/savedWorkoutsRepo';
import { getSettings } from '../../../src/db/repositories/settingsRepo';
import type { Db } from '../../../src/db/types';
import { linksFromGroups } from '../../../src/domain/routineDraft';
import { savedSetsLine, validateSavedName } from '../../../src/domain/savedWorkout';
import type { WeightUnit } from '../../../src/domain/types';
import { announce } from '../../../src/platform/announce';
import { bumpData, useDbQuery } from '../../../src/state/dataVersion';
import { BackLink } from '../../../src/ui/BackLink';
import { Button } from '../../../src/ui/Button';
import { NameSheet, plainSaveError } from '../../../src/ui/NameSheet';
import { useStartSaved } from '../../../src/ui/StartSaved';
import { Screen } from '../../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../../src/ui/Sheet';
import { SupersetBar, supersetRuns } from '../../../src/ui/SupersetBar';
import { Body, ScreenTitle } from '../../../src/ui/Text';
import { useTheme } from '../../../src/ui/ThemeProvider';

/** Back to Routines. With nothing to go back to (opened by address, or reloaded), it lands on Routines. */
function toRoutines() {
  if (router.canGoBack()) router.back();
  else router.navigate('/routines');
}

const DELETE_FAILED = "Couldn't delete. Try again.";

const exerciseCount =(n: number) => (n === 1 ? '1 exercise' : `${n} exercises`);

type SavedExercise = SavedWorkoutDetail['exercises'][number];

/** An exercise: its name, and under it the sets it remembers, as Previous writes them. */
function ExerciseRow({ exercise, unit }: { exercise: SavedExercise; unit: WeightUnit }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Body>{exercise.name}</Body>
      <Body muted style={{ fontSize: 14, fontVariant: ['tabular-nums'] }}>
        {savedSetsLine(exercise.sets, exercise.loggingType, unit)}
      </Body>
    </View>
  );
}

/**
 * A saved workout (R122): its exercises with the sets each remembers, a superset marked by the bar, with **Start**
 * (filled), **Rename** and **Delete**. Start waits for a workout in progress (R80) and opens the session as Up next
 * does. Delete asks first; workouts already finished from it keep their history. Once deleted, the screen keeps
 * showing it while the sheet goes, then goes back to Routines.
 */
export default function SavedWorkoutScreen() {
  const db = useDb();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useCallback((d: Db) => ({ saved: getSavedWorkout(d, id), unit: getSettings(d).unit }), [id]);
  const current = useDbQuery(read);
  /** The workout as last shown, held once Delete has removed it so the screen doesn't flash "not found" on its way out. */
  const held = useRef<SavedWorkoutDetail | null>(null);
  const { unit } = current;
  const saved = current.saved ?? held.current;
  const [renaming, setRenaming] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const starter = useStartSaved();

  if (saved === null) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={toRoutines} />
        <Body muted style={{ marginTop: 8 }}>
          Saved workout not found.
        </Body>
      </Screen>
    );
  }

  const rename = (name: string): string | null => {
    const problem = validateSavedName(name);
    if (problem !== null) return problem;
    try {
      renameSavedWorkout(db, saved.id, name, Date.now());
    } catch (error) {
      return plainSaveError(error);
    }
    bumpData();
    setRenaming(false);
    return null;
  };

  const remove = () => {
    setAskDelete(false);
    try {
      deleteSavedWorkout(db, saved.id);
    } catch {
      // Nothing was deleted, so the screen stays and a muted line under the buttons says so.
      setDeleteFailed(true);
      announce(DELETE_FAILED);
      return;
    }
    held.current = saved;
    bumpData();
    afterSheetCloses(toRoutines);
  };

  const links = linksFromGroups(saved.exercises.map((e) => e.supersetGroup));

  return (
    <Screen>
      <BackLink label="Routines" onPress={toRoutines} />
      <ScreenTitle>{saved.name}</ScreenTitle>
      <Body muted style={{ fontSize: 14, marginTop: 4 }}>
        {exerciseCount(saved.exercises.length)}
      </Body>
      <View style={{ gap: 8, marginTop: 24 }}>
        <Button label="Start" onPress={() => starter.start(saved.id)} />
        {/* Side by side when both fit; at a large text size the second drops under the first. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ flexGrow: 1 }}>
            <Button label="Rename" variant="secondary" onPress={() => setRenaming(true)} />
          </View>
          <View style={{ flexGrow: 1 }}>
            <Button
              label="Delete"
              variant="secondary"
              onPress={() => {
                setDeleteFailed(false);
                setAskDelete(true);
              }}
            />
          </View>
        </View>
        {deleteFailed ? <Body muted>{DELETE_FAILED}</Body> : null}
      </View>
      <View style={{ marginTop: 32, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
        {supersetRuns(saved.exercises, links).map((run) => {
          const rows = run.members.map((exercise) => <ExerciseRow key={exercise.id} exercise={exercise} unit={unit} />);
          return run.superset ? <SupersetBar key={run.members[0].id}>{rows}</SupersetBar> : rows;
        })}
      </View>
      <NameSheet
        visible={renaming}
        title="Rename workout"
        fieldLabel="Workout name"
        initial={saved.name}
        onSave={rename}
        onCancel={() => setRenaming(false)}
      />
      <ConfirmSheet
        visible={askDelete}
        title={`Delete ${saved.name}?`}
        body="Workouts you've finished keep their history."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={remove}
        onCancel={() => setAskDelete(false)}
      />
      {starter.sheet}
    </Screen>
  );
}
