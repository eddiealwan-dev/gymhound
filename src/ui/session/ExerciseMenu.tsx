import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { getSettings } from '../../db/repositories/settingsRepo';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { formatRest } from '../../domain/dates';
import { parseDecimal } from '../../domain/input';
import { MARK_LABELS } from '../../domain/labels';
import { gearFor } from '../../domain/plates';
import { REST_CHOICES, restLengthFor, supersetRestLine, supersetRestSource } from '../../domain/rest';
import { canMoveBlock, hasDoneSets, replaceNeedsConfirm, supersetAction } from '../../domain/sessionMenu';
import { HAS_LOAD, round2, targetFor } from '../../domain/setTable';
import type { ExerciseMark } from '../../domain/types';
import { formatWeight } from '../../domain/units';
import { announce } from '../../platform/announce';
import { flushAll } from '../../state/draftFlush';
import { useDbQuery } from '../../state/dataVersion';
import {
  markExercise,
  moveBlock,
  overrideWeight,
  removeFromWorkout,
  setExerciseRest,
  setRpeShown,
  toggleSuperset,
} from '../../state/sessionActions';
import { Button } from '../Button';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../Sheet';
import { Body, Display } from '../Text';
import { fonts } from '../theme';
import { useTheme } from '../ThemeProvider';
import { PlateSheet } from './PlateSheet';

type Props = {
  /** The workout's exercises in order. */
  exercises: WorkoutExerciseView[];
  /** The exercise whose ⋯ menu is open, or null when none is. */
  exerciseId: string | null;
  /**
   * What it opens on: the menu (the default), the rest choices when the countdown under a set was tapped, or the
   * Something off reasons when the name row's Something off was (R81).
   */
  initialPanel?: 'menu' | 'rest' | 'mark';
  onClose: () => void;
};

/**
 * What is showing for the open exercise: its menu, the Reorder list, the rest choices or the Something off reasons (all
 * four in one sheet), the remove or replace check, the plate calculator, today's weight, or nothing between sheets.
 */
type Panel = 'menu' | 'reorder' | 'rest' | 'mark' | 'confirmRemove' | 'confirmReplace' | 'plates' | 'override' | 'none';

/** The Something off reasons in the sheet's order. */
const MARKS = Object.keys(MARK_LABELS) as ExerciseMark[];

/** A rest length as the menu shows it: "Off" for 0, else m:ss. */
function restLabel(seconds: number): string {
  return seconds === 0 ? 'Off' : formatRest(seconds);
}

/**
 * Today's weight (spec 18.7): one field in the display unit, starting from today's target exactly as the set rows show
 * it (R71). Saving stores it in the display unit; it changes today's target only. Saved unedited, an override stays as
 * it was stored, in its own unit. Mounted while its sheet shows, so it starts afresh.
 */
function TodaysWeight({ ex, onClose }: { ex: WorkoutExerciseView; onClose: () => void }) {
  const db = useDb();
  const { colors } = useTheme();
  const settings = useDbQuery(getSettings);
  const { unit } = settings;
  /** What the field starts with: the override, else the planned weight, in the display unit as the rows show it. */
  const [shown] = useState(() => {
    const target = targetFor(ex, unit, gearFor(unit, settings));
    return target === null ? '' : String(round2(target));
  });
  const [text, setText] = useState(shown);
  /** Whether Save found a number that needs another look; typing again clears it. */
  const [check, setCheck] = useState(false);

  const save = () => {
    if (text === shown && ex.overrideWeight !== null) {
      onClose();
      return;
    }
    const weight = parseDecimal(text);
    if (weight === null) {
      setCheck(true);
      announce('Check this number');
      return;
    }
    overrideWeight(db, ex.id, weight, unit);
    onClose();
  };

  const clear = () => {
    overrideWeight(db, ex.id, null, null);
    onClose();
  };

  return (
    <>
      <Display weight={700}>
        Today's weight
      </Display>
      <Body muted style={{ marginBottom: 12 }}>
        {ex.name}
      </Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            setCheck(false);
          }}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          // iOS adds its own Done bar above the number pad with this key (R43).
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={`Today's weight, ${unit}`}
          style={{
            width: 120,
            minHeight: 48,
            paddingHorizontal: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            // Red is reserved, so a number that needs another look gets a heavier muted underline.
            ...(check ? { borderBottomWidth: 2, borderBottomColor: colors.textMuted } : null),
            backgroundColor: colors.surface,
            color: colors.text,
            fontFamily: fonts.display700,
            fontSize: 24,
            fontVariant: ['tabular-nums'],
            textAlign: 'center',
          }}
        />
        <Body muted>{unit}</Body>
      </View>
      {check ? (
        <Body muted accessibilityLiveRegion="polite" style={{ fontSize: 12, marginTop: 2 }}>
          Check this number
        </Body>
      ) : null}
      <View style={{ gap: 8, marginTop: 12 }}>
        <Button label="Save" onPress={save} />
        {ex.overrideWeight !== null ? <Button label="Clear" variant="secondary" onPress={clear} /> : null}
        <Button label="Cancel" variant="quiet" onPress={onClose} />
      </View>
    </>
  );
}

/**
 * The ⋯ menu of an exercise (spec 8.4) and the sheets it opens: Something off, today's weight, Reorder, the rest time of
 * the exercise, the check before removing or replacing an exercise that has ticked sets, and the plate calculator on a
 * barbell exercise. One instance serves the whole session screen. Tapping the countdown opens it straight on the rest
 * choices, and the name row's Something off straight on the reasons (`initialPanel`).
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
  const { restSeconds: settingsRest, unit } = useDbQuery(getSettings);
  const defaultLabel = `Default (${restLabel(settingsRest)})`;
  const currentRest = ex === null || ex.restSeconds === null ? defaultLabel : restLabel(ex.restSeconds);
  /**
   * Mid-superset, the rest comes after the last member at that member's rest time, whatever is chosen here (R101). The
   * choices stay: they apply whenever this exercise isn't mid-superset.
   */
  const source = ex ? supersetRestSource(exercises, ex.id) : null;
  const supersetLine = source === null ? null : supersetRestLine(source.name, restLengthFor(source.restSeconds, settingsRest));

  const close = () => onClose();

  /** Saves the exercise's own rest (null for Default). A rest already running keeps its end. */
  const chooseRest = (seconds: number | null) => {
    if (ex) setExerciseRest(db, ex.exerciseId, seconds);
    close();
  };

  /** Flags the exercise Something off with a reason, or clears it with null (Nothing off). */
  const chooseMark = (mark: ExerciseMark | null) => {
    if (ex) markExercise(db, ex.id, mark);
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

  const openOverride = () => {
    setPanel('none');
    afterSheetCloses(() => setPanel('override'));
  };

  return (
    <>
      <Sheet visible={ex !== null && (panel === 'menu' || panel === 'reorder' || panel === 'rest' || panel === 'mark')} onClose={close}>
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
                  <Body weight={600} style={{ flex: 1, minWidth: 0, marginLeft: 8 }}>
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
            <Display weight={700}>
              Rest time
            </Display>
            <Body muted style={{ marginBottom: supersetLine === null ? 12 : 4 }}>
              {ex?.name ?? ''}
            </Body>
            {supersetLine !== null ? (
              <Body muted style={{ fontSize: 14, marginBottom: 12 }}>
                {supersetLine}
              </Body>
            ) : null}
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
        ) : panel === 'mark' ? (
          <>
            <Display weight={700}>
              Something off
            </Display>
            <Body muted style={{ marginBottom: 12 }}>
              {ex?.name ?? ''}
            </Body>
            <View style={{ gap: 8 }}>
              {MARKS.map((mark) => (
                <Button
                  key={mark}
                  label={MARK_LABELS[mark]}
                  variant={ex?.mark === mark ? 'primary' : 'secondary'}
                  selected={ex?.mark === mark}
                  onPress={() => chooseMark(mark)}
                />
              ))}
              {ex?.mark ? <Button label="Nothing off" variant="secondary" onPress={() => chooseMark(null)} /> : null}
            </View>
            <View style={{ marginTop: 12 }}>
              <Button label="Cancel" variant="quiet" onPress={close} />
            </View>
          </>
        ) : (
          <>
            <Display weight={700} style={{ marginBottom: 12 }}>
              {ex?.name ?? ''}
            </Display>
            <View style={{ gap: 8 }}>
              <Button
                label={ex?.mark ? `Something off · ${MARK_LABELS[ex.mark]}` : 'Something off'}
                variant="secondary"
                onPress={() => setPanel('mark')}
              />
              {ex !== null && HAS_LOAD.includes(ex.loggingType) ? (
                <Button
                  label={
                    ex.overrideWeight === null
                      ? "Override today's weight"
                      : `Override today's weight · ${formatWeight(ex.overrideWeight, ex.overrideUnit ?? unit)}`
                  }
                  variant="secondary"
                  onPress={openOverride}
                />
              ) : null}
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

      <Sheet visible={ex !== null && panel === 'override'} onClose={close}>
        {ex !== null && panel === 'override' ? <TodaysWeight ex={ex} onClose={close} /> : null}
      </Sheet>
    </>
  );
}
