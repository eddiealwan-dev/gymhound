import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../src/db/DbProvider';
import { listExercises } from '../src/db/repositories/exercisesRepo';
import { equipmentLabel } from '../src/domain/labels';
import { searchExercises } from '../src/domain/search';
import { useDbQuery } from '../src/state/dataVersion';
import { addExercise, replaceWith } from '../src/state/sessionActions';
import { Body, Display } from '../src/ui/Text';
import { fonts } from '../src/ui/theme';
import { useTheme } from '../src/ui/ThemeProvider';

/** Closes the picker. With nothing to go back to (the page was opened by address, or reloaded), it lands on Train. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * The exercise picker, a modal over the session. `mode=add` appends the tapped exercise to the workout;
 * `mode=replace` with a `workoutExerciseId` swaps it in for that exercise. Search matches names and aliases (spec 8.7).
 */
export default function PickExercise() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode, workoutExerciseId } = useLocalSearchParams<{ mode?: string; workoutExerciseId?: string }>();
  const replacing = mode === 'replace' && typeof workoutExerciseId === 'string';
  const everything = useDbQuery(listExercises);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchExercises(everything, query), [everything, query]);

  const choose = (exerciseId: string) => {
    try {
      if (replacing) replaceWith(db, workoutExerciseId, exerciseId);
      else addExercise(db, exerciseId);
    } catch (e) {
      // No workout to add to (the page was opened by address after the workout ended): there is nothing to do but close.
      console.warn('GymHound: the exercise could not be added.', e);
    }
    close();
  };

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
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
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
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}
          ListEmptyComponent={
            <Body muted style={{ textAlign: 'center', padding: 24 }}>
              No exercises match.
            </Body>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${equipmentLabel(item.equipment)}`}
              onPress={() => choose(item.id)}
              style={({ pressed }) => ({
                minHeight: 56,
                paddingHorizontal: 16,
                paddingVertical: 8,
                justifyContent: 'center',
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Body weight={600}>{item.name}</Body>
              <Body muted style={{ fontSize: 13 }}>
                {equipmentLabel(item.equipment)}
              </Body>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}
