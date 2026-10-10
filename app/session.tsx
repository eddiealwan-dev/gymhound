import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../src/db/DbProvider';
import { getSettings } from '../src/db/repositories/settingsRepo';
import { countUntickedWithValues } from '../src/db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../src/db/repositories/workoutViewsRepo';
import type { Db } from '../src/db/types';
import { formatElapsed } from '../src/domain/dates';
import { musicAppsFor } from '../src/platform/music';
import { joinsNextInSuperset } from '../src/domain/sessionMenu';
import { flushAll } from '../src/state/draftFlush';
import { useDbQuery } from '../src/state/dataVersion';
import { discard, finish } from '../src/state/sessionActions';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
import { ExerciseMenu } from '../src/ui/session/ExerciseMenu';
import { MusicSheet } from '../src/ui/session/MusicSheet';
import { RestBar } from '../src/ui/session/RestBar';
import { ConfirmSheet, Sheet } from '../src/ui/Sheet';
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

/** Whether any set of the workout in progress is ticked, read from the database now (not from what was last rendered). */
function anySetTicked(db: Db): boolean {
  return getActiveWorkoutView(db)?.exercises.some((ex) => ex.sets.some((set) => set.done)) ?? false;
}

/** The question open over the session, if any. Only one at a time. */
type Ask = 'nothing_ticked' | 'unticked' | 'discard' | 'finish_failed';

/** The music apps this phone can have. None on web, so the web build shows no music button. */
const MUSIC_APPS_HERE = musicAppsFor(Platform.OS);

/** The back chevron, the workout name, the running clock and, on a phone, the music button. There is no app header and no dock here. */
function SessionHeader({ name, startedAt }: { name: string; startedAt: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const [musicOpen, setMusicOpen] = useState(false);
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
        <Num
          weight={600}
          accessibilityLabel={`Workout time ${formatElapsed(now - startedAt)}`}
          style={{ fontSize: 24, paddingRight: MUSIC_APPS_HERE.length > 0 ? 0 : 8 }}
        >
          {formatElapsed(now - startedAt)}
        </Num>
        {MUSIC_APPS_HERE.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Music"
            hitSlop={4}
            onPress={() => setMusicOpen(true)}
            style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="musical-notes" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {MUSIC_APPS_HERE.length > 0 ? <MusicSheet visible={musicOpen} apps={MUSIC_APPS_HERE} onClose={() => setMusicOpen(false)} /> : null}
    </View>
  );
}

/** The workout in progress: its exercises, each with a set table, the ⋯ menus, adding exercises, the rest timer, and Finish and Discard. */
export default function Session() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workout, unit, distanceUnit } = useDbQuery(readSession);
  /** The exercise whose ⋯ menu is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  /** How many sets are typed but not ticked, for the question about them. Kept after the question closes so its text does not change while it fades. */
  const [untickedCount, setUntickedCount] = useState(0);
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

  const { restEndsAt, restSetId } = workout;

  /**
   * Finishes and shows the summary. The finish refuses with nothing ticked, and that answer wins over the check made a
   * moment ago. Any other error is logged and told to the user: the workout is still active, and a press handler must not throw.
   */
  const finishNow = () => {
    setAsk(null);
    let result: ReturnType<typeof finish>;
    try {
      result = finish(db, workout.id);
    } catch (error) {
      console.warn('GymHound could not finish the workout.', error);
      setAsk('finish_failed');
      return;
    }
    if (result === 'nothing_ticked') {
      setAsk('nothing_ticked');
      return;
    }
    router.replace(`/finish/${workout.id}`);
  };

  /** Saves what is typed, then checks the workout in the database: nothing ticked, sets typed but not ticked, or ready. */
  const onFinish = () => {
    flushAll();
    if (!anySetTicked(db)) {
      setAsk('nothing_ticked');
      return;
    }
    const count = countUntickedWithValues(db, workout.id);
    if (count > 0) {
      setUntickedCount(count);
      setAsk('unticked');
    } else {
      finishNow();
    }
  };

  const onDiscard = () => {
    flushAll();
    setAsk('discard');
  };

  const discardNow = () => {
    setAsk(null);
    discard(db, workout.id);
    router.replace('/');
  };

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
              workoutId={workout.id}
              ex={ex}
              unit={unit}
              distanceUnit={distanceUnit}
              inSuperset={ex.supersetGroup !== null}
              joinsNext={joinsNextInSuperset(workout.exercises, ex.id)}
              restEndsAt={restEndsAt}
              restSetId={restSetId}
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
          <View style={{ gap: 8, marginTop: 24 }}>
            <Button label="Finish" onPress={onFinish} />
            <Button label="Discard workout" variant="quiet" onPress={onDiscard} />
          </View>
        </View>
      </ScrollView>
      <ExerciseMenu exercises={workout.exercises} exerciseId={menuFor} onClose={() => setMenuFor(null)} />
      {/* Nothing ticked: the finish is refused. Keep logging is the safe answer, so it is the primary button. */}
      <Sheet visible={ask === 'nothing_ticked'} onClose={() => setAsk(null)}>
        <Display weight={700} style={{ marginBottom: 16 }}>
          Nothing is ticked yet.
        </Display>
        <View style={{ gap: 8 }}>
          <Button label="Keep logging" onPress={() => setAsk(null)} />
          {/* Discarding deletes what was typed, so it still asks first. */}
          <Button label="Discard workout" variant="secondary" onPress={() => setAsk('discard')} />
        </View>
      </Sheet>
      {/* An error the finish did not expect: nothing was lost, and the workout is still active. */}
      <Sheet visible={ask === 'finish_failed'} onClose={() => setAsk(null)}>
        <Display weight={700} style={{ marginBottom: 16 }}>
          GymHound couldn't finish this workout. It's still here — try again.
        </Display>
        <Button label="OK" onPress={() => setAsk(null)} />
      </Sheet>
      <ConfirmSheet
        visible={ask === 'unticked'}
        title={`${untickedCount} sets aren't ticked. They won't count.`}
        confirmLabel="Finish anyway"
        cancelLabel="Keep logging"
        onConfirm={finishNow}
        onCancel={() => setAsk(null)}
      />
      <ConfirmSheet
        visible={ask === 'discard'}
        title="Discard this workout?"
        body="Its sets will be deleted."
        confirmLabel="Discard"
        cancelLabel="Keep logging"
        onConfirm={discardNow}
        onCancel={() => setAsk(null)}
      />
      {restEndsAt !== null ? (
        <RestBar workoutId={workout.id} endsAt={restEndsAt} onHeight={setRestBarHeight} />
      ) : null}
    </View>
  );
}
