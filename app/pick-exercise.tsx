import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Image, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../src/db/DbProvider';
import { listExercises, type ExerciseRow } from '../src/db/repositories/exercisesRepo';
import { equipmentLabel, muscleLabel, primaryMusclesLabel } from '../src/domain/labels';
import { filterExercises, searchExercises } from '../src/domain/search';
import type { Equipment, Muscle } from '../src/domain/types';
import { useDbQuery } from '../src/state/dataVersion';
import { usePendingPick } from '../src/state/pendingPick';
import { addExercise, replaceWith } from '../src/state/sessionActions';
import { Button } from '../src/ui/Button';
import { exercisePhotos } from '../src/ui/exercisePhotos';
import { FormDemo } from '../src/ui/FormDemo';
import { Body, Display } from '../src/ui/Text';
import { fonts } from '../src/ui/theme';
import { useTheme } from '../src/ui/ThemeProvider';

/** The muscle chips, head to toe. The three delts are one chip, Shoulders, as they read everywhere (`muscleLabel`). */
const MUSCLE_CHIPS: Muscle[] = [
  'chest',
  'front_delts',
  'lats',
  'upper_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
];

/** The equipment chips: the six since phase 1, then the ones the library brings (R85). */
const EQUIPMENT_CHIPS: Equipment[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'bodyweight',
  'ez_bar',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
];

/** Closes the picker. With nothing to go back to (the page was opened by address, or reloaded), it lands on Train. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * One row of chips that scrolls sideways. At most one is chosen: it is filled with ink, and tapping it again clears it.
 * Compact pills, 36pt tall with a 4pt hit slop; the row's 4pt padding keeps that reach inside it.
 */
function ChipRow<T extends string>({
  values,
  label,
  chosen,
  onChoose,
}: {
  values: readonly T[];
  label: (value: T) => string;
  chosen: T | undefined;
  onChoose: (value: T | undefined) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4, gap: 8 }}
    >
      {values.map((value) => (
        <Button
          key={value}
          label={label(value)}
          size="compact"
          variant={value === chosen ? 'primary' : 'secondary'}
          selected={value === chosen}
          onPress={() => onChoose(value === chosen ? undefined : value)}
        />
      ))}
    </ScrollView>
  );
}

/** The start photo at 44pt, or the same tile without one, so every name lines up. */
function Thumbnail({ exercise }: { exercise: ExerciseRow }) {
  const { colors } = useTheme();
  const photos = exercisePhotos(exercise.id);
  const tile = { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceRaised };
  // resizeMethod="resize": Android decodes the photo at the tile's size, not its own, so a long list stays light on memory.
  if (photos) return <Image source={photos[0]} resizeMode="cover" resizeMethod="resize" accessibilityIgnoresInvertColors style={tile} />;
  return (
    <View style={[tile, { alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name="barbell-outline" size={20} color={colors.textMuted} />
    </View>
  );
}

/**
 * A row: the start photo, the name, and "{Equipment} · {Primary muscle}", then an info button. Tapping the row chooses
 * the exercise; the info button opens its form demo instead (R86). They are two targets side by side, so the screen
 * reader reaches each.
 */
const ExerciseOption = memo(function ExerciseOption({
  exercise,
  onChoose,
  onShowForm,
}: {
  exercise: ExerciseRow;
  onChoose: (id: string) => void;
  onShowForm: (id: string) => void;
}) {
  const { colors } = useTheme();
  const equipment = equipmentLabel(exercise.equipment);
  const muscles = primaryMusclesLabel(exercise.primaryMuscles);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${exercise.name}, ${equipment}, ${muscles}`}
        accessibilityHint="Chooses this exercise"
        onPress={() => onChoose(exercise.id)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 60,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 16,
          // 12 between the text and the info button, the row's action.
          paddingRight: 12,
          paddingVertical: 8,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Thumbnail exercise={exercise} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight={600}>{exercise.name}</Body>
          <Body muted style={{ fontSize: 14 }}>
            {`${equipment} · ${muscles}`}
          </Body>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show form for ${exercise.name}`}
        onPress={() => onShowForm(exercise.id)}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          marginRight: 4,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name="information-circle-outline" size={24} color={colors.textMuted} />
      </Pressable>
    </View>
  );
});

/**
 * The exercise picker, a modal over the session or the routine editor. `mode=add` appends the tapped exercise to the
 * workout; `mode=replace` with a `workoutExerciseId` swaps it in for that exercise; `mode=routine` hands it to the routine
 * editor through `usePendingPick` (§18.8). Search matches names, aliases, primary muscles and equipment, and chips filter
 * by a muscle and by equipment (spec 8.7). The whole library is one virtualized list. Each row's info button opens the
 * exercise's form demo (R86).
 */
export default function PickExercise() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode, workoutExerciseId } = useLocalSearchParams<{ mode?: string; workoutExerciseId?: string }>();
  const replacing = mode === 'replace' && typeof workoutExerciseId === 'string';
  const forRoutine = mode === 'routine';
  const everything = useDbQuery(listExercises);
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<Muscle | undefined>(undefined);
  const [equipment, setEquipment] = useState<Equipment | undefined>(undefined);
  const results = useMemo(
    () => searchExercises(filterExercises(everything, { muscle, equipment }), query),
    [everything, muscle, equipment, query],
  );

  const choose = useCallback(
    (exerciseId: string) => {
      if (forRoutine) {
        // The routine editor takes it when it is back in focus.
        usePendingPick.getState().set(exerciseId);
        close();
        return;
      }
      try {
        if (replacing) replaceWith(db, workoutExerciseId, exerciseId);
        else addExercise(db, exerciseId);
      } catch (e) {
        // No workout to add to (the page was opened by address after the workout ended): there is nothing to do but close.
        console.warn('GymHound: the exercise could not be added.', e);
      }
      close();
    },
    [db, forRoutine, replacing, workoutExerciseId],
  );

  /** The exercise whose form demo is open, or null. */
  const [demoFor, setDemoFor] = useState<string | null>(null);
  const showForm = useCallback((exerciseId: string) => {
    // The search field may still have the keyboard up; it would cover the sheet.
    Keyboard.dismiss();
    setDemoFor(exerciseId);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ExerciseRow }) => <ExerciseOption exercise={item} onChoose={choose} onShowForm={showForm} />,
    [choose, showForm],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8, minHeight: 56 }}>
          <Display weight={700} style={{ flex: 1 }}>
            {replacing ? 'Replace exercise' : 'Add exercise'}
          </Display>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={4}
            onPress={close}
            style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search exercises"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search exercises"
            style={{
              minHeight: 48,
              paddingHorizontal: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.body400,
              fontSize: 16,
            }}
          />
        </View>
        <ChipRow values={MUSCLE_CHIPS} label={muscleLabel} chosen={muscle} onChoose={setMuscle} />
        <ChipRow values={EQUIPMENT_CHIPS} label={equipmentLabel} chosen={equipment} onChoose={setEquipment} />
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          // Rows wrap at large text, so their heights are not known ahead: a screenful is drawn, the rest as it scrolls.
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={11}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          style={{ marginTop: 4 }}
          contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
          ListEmptyComponent={
            <Body muted style={{ textAlign: 'center', padding: 24 }}>
              No exercises match.
            </Body>
          }
        />
      </View>
      <FormDemo exerciseId={demoFor} onClose={() => setDemoFor(null)} />
    </View>
  );
}
