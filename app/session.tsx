import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSettings } from '../src/db/repositories/settingsRepo';
import { getActiveWorkoutView } from '../src/db/repositories/workoutViewsRepo';
import type { Db } from '../src/db/types';
import { formatElapsed } from '../src/domain/dates';
import { useDbQuery } from '../src/state/dataVersion';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
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

/** The workout in progress: its exercises, each with a set table. Finishing, adding exercises and the rest timer come in later tasks. */
export default function Session() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workout, unit, distanceUnit } = useDbQuery(readSession);

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
        <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 + insets.bottom }}>
          {workout.exercises.map((ex) => (
            <ExerciseBlock key={ex.id} ex={ex} unit={unit} distanceUnit={distanceUnit} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
