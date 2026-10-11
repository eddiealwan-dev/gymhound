import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { formatRest } from '../../domain/dates';
import { REST_CHOICES } from '../../domain/rest';
import { canMoveBlock, hasDoneSets, replaceNeedsConfirm, supersetAction } from '../../domain/sessionMenu';
import { flushAll } from '../../state/draftFlush';
import { useDbQuery } from '../../state/dataVersion';
import { moveBlock, removeFromWorkout, setExerciseRest, setRpeShown, toggleSuperset } from '../../state/sessionActions';
import { Button } from '../Button';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../Sheet';
import { Body, Display } from '../Text';
import { useTheme } from '../ThemeProvider';
import { PlateSheet } from './PlateSheet';

type Props = {
  /** The workout's exercises in order. */
  exercises: WorkoutExerciseView[];
  /** The exercise whose ⋯ menu is open, or null when none is. */
  exerciseId: string | null;
  /** What it opens on: the menu (the default), or the rest choices when the countdown under a set was tapped. */
  initialPanel?: 'menu' | 'rest';
  onClose: () => void;
};

/**
 * What is showing for the open exercise: its menu, the Reorder list or the rest choices (all three in one sheet), the
 * remove or replace check, the plate calculator, or nothing between sheets.
 */
type Panel = 'menu' | 'reorder' | 'rest' | 'confirmRemove' | 'confirmReplace' | 'plates' | 'none';

/** A rest length as the menu shows it: "Off" for 0, else m:ss. */
function restLabel(seconds: number): string {
  return seconds === 0 ? 'Off' : formatRest(seconds);
}

/**
 * The ⋯ menu of an exercise (spec 8.4) and the sheets it opens: Reorder, the rest time of the exercise, the check before
 * removing or replacing an exercise that has ticked sets, and the plate calculator on a barbell exercise. One instance
 * serves the whole session screen. Tapping the countdown opens it straight on the rest choices (`initialPanel`).
 */
export function ExerciseMenu({ exercises, exerciseId, initialPanel, onClose }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const [panel, setPanel] = useState<Panel>(initialPanel ?? 'menu');
  // It opens on `initialPanel`, set in the render in which it opens, so its first frame is already right. Closing leaves
  // the panel alone, so a sheet fades out showing what it showed (not the ⋯ menu).
  const [openFor, setOpenFor] = useState(exerciseId);
  if (openFor !== exerciseId) {
    setOpenFor(exerciseId);
    if (exerciseId !== null) setPanel(initialPanel ?? 'menu');
  }
  const ex = exercises.find((e) => e.id === exerciseId) ?? null;
  const superset = ex ? supersetAction(exercises, ex.id) : 'hidden';
  const settingsRest = useDbQuery(getSettings).restSeconds;
  const defaultLabel = `Default (${restLabel(settingsRest)})`;
  const currentRest = ex === null || ex.restSeconds === null ? defaultLabel : restLabel(ex.restSeconds);

  const close = () => onClose();

  /** Saves the exercise's own rest (null for Default). A rest already running keeps its end. */
  const chooseRest = (seconds: number | null) => {
    if (ex) setExerciseRest(db, ex.exerciseId, seconds);
    close();
  };

  const openReplacePicker = () => {
    if (!ex) return;
    const id = ex.id;
    flushAll();
    close();
    afterSheetCloses(() => router.push({ pathname: '/pick-exercise', params: { mode: 'replace', workoutExerciseId: id } }));
  };

  const replace = () => {
    if (!ex) return;
    if (!replaceNeedsConfirm(ex)) {
      openReplacePicker();
      return;
    }
    setPanel('none');
    afterSheetCloses(() => setPanel('confirmReplace'));
  };

  const remove = () => {
    if (!ex) return;
    if (!hasDoneSets(ex)) {
      removeFromWorkout(db, ex.id);
      close();
      return;
    }
    setPanel('none');
    afterSheetCloses(() => setPanel('confirmRemove'));
  };

  const openPlates = () => {
    setPanel('none');
    afterSheetCloses(() => setPanel('plates'));
  };

  return (
    <>
      <Sheet visible={ex !== null && (panel === 'menu' || panel === 'reorder' || panel === 'rest')} onClose={close}>
        {panel === 'reorder' ? (
          <>
            <Display weight={700} style={{ marginBottom: 12 }}>
              Reorder
            </Display>
            {/* The sheet scrolls too, so on Android this list must be allowed to scroll inside it. */}
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 4 }} nestedScrollEnabled>
              {exercises.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 48 }}>
                  {/* The same bar as on the session screen, so a superset reads as one block here too. */}
                  <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: e.supersetGroup === null ? 'transparent' : colors.text }} />
                  <Body weight={600} numberOfLines={1} style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
                    {e.name}
                  </Body>
                  {(['up', 'down'] as const).map((dir) => {
                    const enabled = canMoveBlock(exercises, e.id, dir);
                    return (
                      <Pressable
                        key={dir}
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${e.name} ${dir}`}
                        disabled={!enabled}
                        onPress={() => moveBlock(db, e.id, dir)}
                        style={({ pressed }) => ({
                          width: 44,
                          height: 44,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: !enabled ? 0.3 : pressed ? 0.8 : 1,
                        })}
                      >
                        <Ionicons name={dir === 'up' ? 'arrow-up' : 'arrow-down'} size={22} color={colors.text} />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <View style={{ marginTop: 12 }}>
              <Button label="Done" onPress={close} />
            </View>
          </>
        ) : panel === 'rest' ? (
          <>
            <Display weight={700} numberOfLines={1}>
              Rest time
            </Display>
            <Body muted numberOfLines={1} style={{ marginBottom: 12 }}>
              {ex?.name ?? ''}
            </Body>
            <View style={{ gap: 8 }}>
              <Button
                label={defaultLabel}
                variant={ex?.restSeconds === null ? 'primary' : 'secondary'}
                selected={ex?.restSeconds === null}
                onPress={() => chooseRest(null)}
              />
              {REST_CHOICES.map((seconds) => (
                <Button
                  key={seconds}
                  label={restLabel(seconds)}
                  variant={ex?.restSeconds === seconds ? 'primary' : 'secondary'}
                  selected={ex?.restSeconds === seconds}
                  onPress={() => chooseRest(seconds)}
                />
              ))}
            </View>
            <View style={{ marginTop: 12 }}>
              <Button label="Cancel" variant="quiet" onPress={close} />
            </View>
          </>
        ) : (
          <>
            <Display weight={700} numberOfLines={1} style={{ marginBottom: 12 }}>
              {ex?.name ?? ''}
            </Display>
            <View style={{ gap: 8 }}>
              {ex?.equipment === 'barbell' ? <Button label="Plate calculator" variant="secondary" onPress={openPlates} /> : null}
              <Button label={`Rest time · ${currentRest}`} variant="secondary" onPress={() => setPanel('rest')} />
              <Button
                label={ex?.showRpe ? 'Hide RPE' : 'Show RPE'}
                variant="secondary"
                onPress={() => {
                  if (ex) setRpeShown(db, ex.id, !ex.showRpe);
                  close();
                }}
              />
              {superset !== 'hidden' ? (
                <Button
                  label={superset === 'remove' ? 'Remove from superset' : 'Superset with next'}
                  variant="secondary"
                  onPress={() => {
                    if (ex) toggleSuperset(db, ex.id);
                    close();
                  }}
                />
              ) : null}
              <Button label="Reorder" variant="secondary" onPress={() => setPanel('reorder')} />
              <Button label="Replace" variant="secondary" onPress={replace} />
              <Button label="Remove" variant="secondary" onPress={remove} />
            </View>
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={ex !== null && panel === 'confirmRemove'}
        title={`Remove ${ex?.name ?? ''}?`}
        body="Its sets will be deleted."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {
          if (ex) removeFromWorkout(db, ex.id);
          close();
        }}
        onCancel={close}
      />

      <ConfirmSheet
        visible={ex !== null && panel === 'confirmReplace'}
        title={`Replace ${ex?.name ?? ''}?`}
        body="Its ticked sets will be cleared."
        confirmLabel="Replace"
        cancelLabel="Keep"
        onConfirm={openReplacePicker}
        onCancel={close}
      />

      <PlateSheet ex={panel === 'plates' ? ex : null} onClose={close} />
    </>
  );
}
