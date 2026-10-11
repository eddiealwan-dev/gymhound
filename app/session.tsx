import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../src/db/DbProvider';
import { getSettings } from '../src/db/repositories/settingsRepo';
import { getNextDayTitle } from '../src/db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../src/db/repositories/workoutViewsRepo';
import type { Db } from '../src/db/types';
import { formatElapsed } from '../src/domain/dates';
import { finishCheck, finishConfirm, type FinishConfirm } from '../src/domain/finishCheck';
import { gearFor } from '../src/domain/plates';
import type { MusicAppId } from '../src/domain/types';
import { musicAppOn, musicAppsFor } from '../src/platform/music';
import { joinsNextInSuperset } from '../src/domain/sessionMenu';
import { flushAll } from '../src/state/draftFlush';
import { useDbQuery } from '../src/state/dataVersion';
import { discard, finish } from '../src/state/sessionActions';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
import { ExerciseMenu } from '../src/ui/session/ExerciseMenu';
import { MusicBar } from '../src/ui/session/MusicBar';
import { MusicSheet } from '../src/ui/session/MusicSheet';
import { RestBar } from '../src/ui/session/RestBar';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../src/ui/Sheet';
import { Body, Display, Num } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';

/** Leaves the session without touching the workout. With nothing to go back to (the page was opened by address, or reloaded), it lands on Train. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Module-level so `useDbQuery` reads again only when the data changes. */
function readSession(db: Db) {
  const settings = getSettings(db);
  const { unit, distanceUnit, musicApp } = settings;
  return { workout: getActiveWorkoutView(db), unit, gear: gearFor(unit, settings), distanceUnit, musicApp };
}

/** The question open over the session, if any. Only one at a time. */
type Ask = 'nothing_ticked' | 'confirm_finish' | 'discard' | 'finish_failed';

/** The music apps this phone can have. None on web, so the web build shows no music button. */
const MUSIC_APPS_HERE = musicAppsFor(Platform.OS);

/**
 * The back chevron, the workout name, the running clock and, on a phone, the music button, whose sheet shows `musicApp`
 * as picked. There is no app header and no dock here.
 */
function SessionHeader({ name, startedAt, musicApp }: { name: string; startedAt: number; musicApp: MusicAppId | null }) {
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
            onPress={() => {
              Keyboard.dismiss();
              setMusicOpen(true);
            }}
            style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="musical-notes" size={24} color={colors.text} />
          </Pressable>
        ) : null}
      </View>
      {MUSIC_APPS_HERE.length > 0 ? (
        <MusicSheet visible={musicOpen} apps={MUSIC_APPS_HERE} musicApp={musicApp} onClose={() => setMusicOpen(false)} />
      ) : null}
    </View>
  );
}

/** The workout in progress: its exercises, each with a set table, the ⋯ menus, adding exercises, the rest timer, and Finish and Discard. */
export default function Session() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workout, unit, gear, distanceUnit, musicApp } = useDbQuery(readSession);
  /** The exercise whose ⋯ menu is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  /** The question Finish asks before it drops unticked sets. Kept after the sheet closes so its text does not change while it fades. */
  const [finishAsk, setFinishAsk] = useState<FinishConfirm | null>(null);
  /** How tall the bars docked at the bottom are (0 with none), so the content can scroll clear of them. */
  const [dockHeight, setDockHeight] = useState(0);

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
   * The rest bar is the fallback for a rest no set row can show (R41): one started without a set, or by a set that has
   * since gone. Otherwise the countdown is only under its set (`RestInline`, Task 26).
   */
  const showRestBar =
    restEndsAt !== null && (restSetId === null || !workout.exercises.some((ex) => ex.sets.some((set) => set.id === restSetId)));
  /** The music bar's app: the one picked in the music sheet, if this platform can have it (never on web). */
  const musicBarApp = musicAppOn(Platform.OS, musicApp);

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

  /**
   * Saves what is typed, then reads the workout from the database (not from what was last rendered): with nothing
   * ticked it says so; with every set ticked it finishes; otherwise it asks first, since unticked sets will be dropped.
   */
  const onFinish = () => {
    flushAll();
    const view = getActiveWorkoutView(db);
    const check = view === null ? null : finishCheck(view.exercises);
    if (view === null || check === null || check.done === 0) {
      setAsk('nothing_ticked');
      return;
    }
    if (check.done === check.total) {
      finishNow();
      return;
    }
    setFinishAsk(finishConfirm(view.name, check, getNextDayTitle(db, view.id)));
    setAsk('confirm_finish');
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
      <SessionHeader name={workout.name} startedAt={workout.startedAt} musicApp={musicApp} />
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
            // The docked bars sit over the bottom of the page and already clear the safe area, so the content ends above them.
            paddingBottom: 16 + Math.max(dockHeight, insets.bottom),
          }}
        >
          {workout.exercises.map((ex) => (
            <ExerciseBlock
              // A replaced exercise keeps its row but is a new exercise: start its block fresh.
              key={`${ex.id}:${ex.exerciseId}`}
              workoutId={workout.id}
              ex={ex}
              unit={unit}
              gear={gear}
              distanceUnit={distanceUnit}
              inSuperset={ex.supersetGroup !== null}
              joinsNext={joinsNextInSuperset(workout.exercises, ex.id)}
              restEndsAt={restEndsAt}
              restSetId={restSetId}
              onOpenMenu={() => {
                flushAll();
                Keyboard.dismiss();
                setMenuFor(ex.id);
              }}
            />
          ))}
          <Button
            label="Add exercise"
            variant="secondary"
            onPress={() => {
              flushAll();
              Keyboard.dismiss();
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
      {/* Finish drops unticked sets, so it asks first. With a whole exercise untouched, Keep logging is the safe answer.
          Finish anyway waits for the sheet to go: iOS can't present the summary or another sheet while one is closing. */}
      <ConfirmSheet
        visible={ask === 'confirm_finish'}
        title={finishAsk?.title ?? ''}
        body={finishAsk?.body}
        confirmLabel="Finish anyway"
        cancelLabel="Keep logging"
        primary={finishAsk?.safeDefault ? 'cancel' : 'confirm'}
        onConfirm={() => {
          setAsk(null);
          afterSheetCloses(finishNow);
        }}
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
      {/* The bottom dock: the fallback rest bar stacked above the music bar. It is always there, so its height follows them both, down to 0. */}
      <View onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        {showRestBar ? <RestBar workoutId={workout.id} endsAt={restEndsAt} bottomInset={musicBarApp === null} /> : null}
        {musicBarApp !== null ? <MusicBar app={musicBarApp} /> : null}
      </View>
    </View>
  );
}
