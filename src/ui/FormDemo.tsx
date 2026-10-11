import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { useDb } from '../db/DbProvider';
import { getExercise, type ExerciseDetail } from '../db/repositories/exercisesRepo';
import { musclesLine } from '../domain/labels';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Body, Display, Num } from './Text';
import { useTheme } from './ThemeProvider';

/** How long each photo shows before the other fades in (R86). */
const PHOTO_MS = 1200;
/** The cross-fade between them. */
const FADE_MS = 250;
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
 * The start and end photos in a 3:2 frame: the end photo cross-fades in over the start photo and back out every 1.2 s.
 * With Reduce Motion on (or until the phone says it is off) nothing moves: on, the two sit side by side; while unknown,
 * the start photo shows alone.
 */
function Photos({ name, photos }: { name: string; photos: readonly [ImageSourcePropType, ImageSourcePropType] }) {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  /** The end photo's opacity: 0 shows the start photo under it, 1 covers it. */
  const endShown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced !== false) return;
    let showingEnd = false;
    const timer = setInterval(() => {
      showingEnd = !showingEnd;
      Animated.timing(endShown, { toValue: showingEnd ? 1 : 0, duration: FADE_MS, useNativeDriver: true }).start();
    }, PHOTO_MS);
    return () => {
      clearInterval(timer);
      endShown.stopAnimation();
      endShown.setValue(0);
    };
  }, [reduced, endShown]);

  const frame = { aspectRatio: 3 / 2, borderRadius: 12, overflow: 'hidden' as const, backgroundColor: colors.surfaceRaised };
  const photo = (which: 0 | 1) => ({
    source: photos[which],
    accessible: true,
    accessibilityLabel: `${name}, ${which === 0 ? 'start' : 'end'} position`,
    accessibilityIgnoresInvertColors: true,
    resizeMode: 'contain' as const,
  });

  if (reduced) {
    return (
      <View style={{ flexDirection: 'row', gap: 8 }}>
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
    <View style={frame}>
      <Image {...photo(0)} style={{ width: '100%', height: '100%' }} />
      <Animated.Image {...photo(1)} style={[StyleSheet.absoluteFill, { opacity: endShown }]} />
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

function Demo({ exercise }: { exercise: ExerciseDetail }) {
  const photos = exercise.hasPhotos ? EXERCISE_PHOTOS[exercise.id] : undefined;
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
    </>
  );
}

type Props = {
  /** The exercise to show, or null while the sheet is closed. */
  exerciseId: string | null;
  onClose: () => void;
};

/**
 * The form demo (R86): a sheet with the exercise's name, its start and end photos alternating with a cross-fade (side
 * by side with Reduce Motion), its primary and secondary muscles, and its first three steps with **Show all steps**.
 * An exercise without photos shows its steps only; one with neither shows its name and muscles. It opens when given an
 * exercise and reads it then, never before.
 */
export function FormDemo({ exerciseId, onClose }: Props) {
  const db = useDb();
  // The exercise last opened, kept after it closes so the sheet does not empty while it fades.
  const [shownId, setShownId] = useState(exerciseId);
  if (exerciseId !== null && exerciseId !== shownId) setShownId(exerciseId);
  const exercise = useMemo(() => (shownId === null ? null : getExercise(db, shownId)), [db, shownId]);

  return (
    <Sheet visible={exerciseId !== null} onClose={onClose}>
      {exercise ? <Demo exercise={exercise} /> : null}
      <View style={{ marginTop: 16 }}>
        <Button label="Close" onPress={onClose} />
      </View>
    </Sheet>
  );
}
