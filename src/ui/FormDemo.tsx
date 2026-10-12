import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, Platform, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useDb } from '../db/DbProvider';
import { getExercise, type ExerciseDetail } from '../db/repositories/exercisesRepo';
import { musclesLine } from '../domain/labels';
import { Button } from './Button';
import { canHaveOwnPhotos, useExercisePhotos } from './exercisePhotos';
import { OwnPhotos } from './OwnPhotos';
import { afterSheetCloses, Sheet } from './Sheet';
import { Body, Display, Num } from './Text';
import { useTheme } from './ThemeProvider';

/** How long each photo shows before the other swaps in (R86, R98). */
const PHOTO_MS = 1200;
/** The steps shown before **Show all steps**. */
const FIRST_STEPS = 3;

/**
 * Whether the phone asks for less motion, and null until it has said. A check that fails counts as on, so nothing moves
 * that the phone may have asked to keep still. It follows the setting while it is mounted.
 */
function useReduceMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    /** A change the phone has reported outranks a first answer that arrives after it. */
    let changed = false;
    const first = (on: boolean) => {
      if (live && !changed) setReduced(on);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(first, () => first(true));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      changed = true;
      setReduced(on);
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/**
 * The start and end photos in a 3:2 frame: every 1.2 s the shown photo flips, instantly, like a flipbook (R98: a blend of
 * two poses of the same person shows a ghost of the first). Both photos stay mounted, the end photo stacked over the
 * start photo, and only the end photo's opacity flips between 0 and 1, so iOS never shows a blank frame decoding a new
 * source. The end photo sits in an opaque view that fills the frame, so none of the start photo shows around it (Round 7). With Reduce Motion on (or until the phone says it is off) nothing moves: on, the two sit side by side; while
 * unknown, the start photo shows alone. With one photo only (your own, R111), it shows alone and still.
 */
function Photos({ name, photos }: { name: string; photos: readonly [ImageSourcePropType, ImageSourcePropType | null] }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  /** Whether the end photo is shown: its opacity is 1 and it covers the start photo, or 0 and the start photo shows. */
  const [endShown, setEndShown] = useState(false);
  const single = photos[1] === null;

  useEffect(() => {
    if (reduced !== false || single) return;
    const timer = setInterval(() => setEndShown((shown) => !shown), PHOTO_MS);
    return () => {
      clearInterval(timer);
      setEndShown(false);
    };
  }, [reduced, single]);

  const frame = { aspectRatio: 3 / 2, borderRadius: 12, overflow: 'hidden' as const, backgroundColor: colors.surfaceRaised };
  // Neither photo is a stop for the screen reader, so it never lands on the hidden one: the frame is (review of R86).
  const photo = (which: 0 | 1) => ({
    source: photos[which] ?? photos[0],
    testID: which === 0 ? 'form-demo-start' : 'form-demo-end',
    accessible: false,
    accessibilityIgnoresInvertColors: true,
    resizeMode: 'contain' as const,
  });
  const described = { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: `${name}, start and end positions` };

  if (single) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={`${name}, photo`} style={frame}>
        <Image {...photo(0)} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }
  if (reduced) {
    return (
      <View {...described} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[frame, { flex: 1 }]}>
          <Image {...photo(0)} style={{ width: '100%', height: '100%' }} />
        </View>
        <View style={[frame, { flex: 1 }]}>
          <Image {...photo(1)} style={{ width: '100%', height: '100%' }} />
        </View>
      </View>
    );
  }
  return (
    <View {...described} style={frame}>
      <Image {...photo(0)} style={{ width: '100%', height: '100%' }} />
      {/*
        The end photo sits in an opaque view that fills the frame, sized like the start photo. On the phone an Image given
        only absoluteFill drew at its own size, smaller than the frame, so the start photo showed along the right and
        bottom (Round 7).
      */}
      <View testID="form-demo-end-cover" style={[StyleSheet.absoluteFill, { opacity: endShown ? 1 : 0, backgroundColor: colors.surfaceRaised }]}>
        <Image {...photo(1)} style={{ width: '100%', height: '100%' }} />
      </View>
    </View>
  );
}

/** The steps, numbered: the first three, then all of them after **Show all steps**. */
function Steps({ steps }: { steps: readonly string[] }) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const shown = all ? steps : steps.slice(0, FIRST_STEPS);
  return (
    <View style={{ gap: 8 }}>
      {shown.map((step, i) => (
        // One stop for the screen reader: the number, then the step.
        <View key={i} accessible style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Num weight={700} style={{ fontSize: 17, minWidth: 16, color: colors.textMuted }}>
            {String(i + 1)}
          </Num>
          <Body style={{ flex: 1 }}>{step}</Body>
        </View>
      ))}
      {steps.length > shown.length ? (
        // A quiet button has no edge, so it steps back by its 12pt padding to line up with the numbers.
        <View style={{ flexDirection: 'row', marginLeft: -12 }}>
          <Button label="Show all steps" variant="quiet" size="compact" onPress={() => setAll(true)} />
        </View>
      ) : null}
    </View>
  );
}

function Demo({ exercise, onEdit }: { exercise: ExerciseDetail; onEdit: (() => void) | null }) {
  const photos = useExercisePhotos(exercise.id);
  /** Your own exercise has no steps: the demo says so and offers its editor instead. */
  const yours = exercise.isCustom && exercise.instructions.length === 0;
  return (
    <>
      <Display weight={700} accessibilityRole="header">
        {exercise.name}
      </Display>
      <Body muted style={{ fontSize: 14, marginTop: 4 }}>
        {musclesLine(exercise.primaryMuscles, exercise.secondaryMuscles)}
      </Body>
      {photos ? (
        <View style={{ marginTop: 16 }}>
          <Photos name={exercise.name} photos={photos} />
        </View>
      ) : null}
      {exercise.instructions.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Steps steps={exercise.instructions} />
        </View>
      ) : null}
      {yours ? (
        <View style={{ marginTop: 16, gap: 16 }}>
          <Body muted>No steps for your own exercise.</Body>
          {onEdit ? <Button label="Edit exercise" variant="secondary" onPress={onEdit} /> : null}
        </View>
      ) : null}
      {/* Your own photos: only where none are bundled, and on a phone (R111). */}
      {Platform.OS !== 'web' && canHaveOwnPhotos(exercise.id) ? (
        <View style={{ marginTop: 16 }}>
          <OwnPhotos exerciseId={exercise.id} />
        </View>
      ) : null}
    </>
  );
}

type Props = {
  /** The exercise to show, or null while the sheet is closed. */
  exerciseId: string | null;
  onClose: () => void;
  /**
   * Whether your own exercise offers **Edit exercise** (default true). The picker for a routine says false: the routine
   * editor's unsaved draft may hold the exercise, which an edit could delete or retype under it.
   */
  canEdit?: boolean;
};

/**
 * The form demo (R86): a sheet with the exercise's name, its start and end photos swapping every 1.2 s (side by
 * side with Reduce Motion), its primary and secondary muscles, and its first three steps with **Show all steps**.
 * An exercise without photos shows its steps only; one with neither shows its name and muscles. Your own exercise
 * says it has no steps and offers **Edit exercise**, which opens its editor once the sheet has closed. It opens when
 * given an exercise and reads it then, never before.
 */
export function FormDemo({ exerciseId, onClose, canEdit = true }: Props) {
  const db = useDb();
  // The exercise last opened, kept after it closes so the sheet does not empty while it fades.
  const [shownId, setShownId] = useState(exerciseId);
  if (exerciseId !== null && exerciseId !== shownId) setShownId(exerciseId);
  const exercise = useMemo(() => (shownId === null ? null : getExercise(db, shownId)), [db, shownId]);

  return (
    <Sheet visible={exerciseId !== null} onClose={onClose}>
      {exercise ? (
        <Demo
          exercise={exercise}
          onEdit={
            canEdit
              ? () => {
                  const id = exercise.id;
                  onClose();
                  afterSheetCloses(() => router.push({ pathname: '/exercise/[id]', params: { id } }));
                }
              : null
          }
        />
      ) : null}
      <View style={{ marginTop: 16 }}>
        <Button label="Close" onPress={onClose} />
      </View>
    </Sheet>
  );
}
