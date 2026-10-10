import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSettings } from '../src/db/repositories/settingsRepo';
import { getActiveWorkoutView } from '../src/db/repositories/workoutViewsRepo';
import type { Db } from '../src/db/types';
import { formatElapsed } from '../src/domain/dates';
import { joinsNextInSuperset } from '../src/domain/sessionMenu';
import { flushAll } from '../src/state/draftFlush';
import { useDbQuery } from '../src/state/dataVersion';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
import { ExerciseMenu } from '../src/ui/session/ExerciseMenu';
import { RestBar } from '../src/ui/session/RestBar';
import { Body, Display, Num } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';

/** Leaves the session without touching the workout. With nothing to go back to (the page was opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Module-level so `useDbQuery` reads again only when the data changes. */
function readSession(db: Db) {
  const { unit, distanceUnit } = getSettings(db);
  return { workout: getActiveWorkoutView(db), unit, distanceUnit };
}

/** The back chevron, the workout name and the running clock. There is no app header and no dock here. */
function SessionHeader({ name, startedAt }: { name: string; startedAt: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  return (
    <View style={{ backgroundColor: colors.bg, paddingTop: insets.top, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View
        style={{
          width: '100%',
          maxWidth: 512,
          alignSelf: 'center',
          paddingHorizontal: 8,
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Train"
          hitSlop={4}
          onPress={leave}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Display weight={700} numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 26 }}>
          {name}
        </Display>
        <Num weight={600} accessibilityLabel={`Workout time ${formatElapsed(now - startedAt)}`} style={{ fontSize: 24, paddingRight: 8 }}>
          {formatElapsed(now - startedAt)}
        </Num>
      </View>
    </View>
  );
}

/** The workout in progress: its exercises, each with a set table, the ⋯ menus, adding exercises, and the rest timer. Finishing comes in a later task. */
export default function Session() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workout, unit, distanceUnit } = useDbQuery(readSession);
  /** The exercise whose ⋯ menu is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  /** How tall the rest bar is while it shows, so the content can scroll clear of it. */
  const [restBarHeight, setRestBarHeight] = useState(0);

  // The chevron and Android's back button remove this screen. It can go before the input being typed in is left, so save
  // what is typed first (R29, R31). The browser's back button does not remove it (expo-router resets the navigator, which
  // sends no `beforeRemove`); `draftFlush` listens for that itself.
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('beforeRemove', () => flushAll()), [navigation]);

  if (workout === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', padding: 16, gap: 16 }}>
          <Body style={{ textAlign: 'center' }}>No workout in progress.</Body>
          <Button label="Back to Train" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
  }

  const { restEndsAt } = workout;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionHeader name={workout.name} startedAt={workout.startedAt} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
      >
        <View
          style={{
            width: '100%',
            maxWidth: 512,
            alignSelf: 'center',
            paddingHorizontal: 16,
            paddingTop: 16,
            // The rest bar sits over the bottom of the page and already clears the safe area, so the content ends above it.
            paddingBottom: 16 + (restEndsAt !== null ? restBarHeight : insets.bottom),
          }}
        >
          {workout.exercises.map((ex) => (
            <ExerciseBlock
              // A replaced exercise keeps its row but is a new exercise: start its block fresh.
              key={`${ex.id}:${ex.exerciseId}`}
              ex={ex}
              unit={unit}
              distanceUnit={distanceUnit}
              inSuperset={ex.supersetGroup !== null}
              joinsNext={joinsNextInSuperset(workout.exercises, ex.id)}
              onOpenMenu={() => {
                flushAll();
                setMenuFor(ex.id);
              }}
            />
          ))}
          <Button
            label="Add exercise"
            variant="secondary"
            onPress={() => {
              flushAll();
              router.push({ pathname: '/pick-exercise', params: { mode: 'add' } });
            }}
          />
        </View>
      </ScrollView>
      <ExerciseMenu exercises={workout.exercises} exerciseId={menuFor} onClose={() => setMenuFor(null)} />
      {restEndsAt !== null ? (
        <RestBar workoutId={workout.id} endsAt={restEndsAt} onHeight={setRestBarHeight} />
      ) : null}
    </View>
  );
}
