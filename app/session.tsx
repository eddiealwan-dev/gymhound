import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { listNames } from '../src/domain/finishCheck';
import { latestTickedSetId, restWaitsFor } from '../src/domain/rest';
import { joinsNextInSuperset, startsSuperset } from '../src/domain/sessionMenu';
import { nextSetId, progressLabel, progressParts, restUpText, workoutProgress, type Progress } from '../src/domain/sessionProgress';
import { flushAll } from '../src/state/draftFlush';
import { useDbQuery } from '../src/state/dataVersion';
import { discard, finish } from '../src/state/sessionActions';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
import { ExerciseMenu } from '../src/ui/session/ExerciseMenu';
import { FoodOfferBanner } from '../src/ui/session/FoodOfferBanner';
import { MusicBar } from '../src/ui/session/MusicBar';
import { MusicSheet } from '../src/ui/session/MusicSheet';
import { RestBar } from '../src/ui/session/RestBar';
import { useRestUp } from '../src/ui/session/useRestUp';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../src/ui/Sheet';
import { SheetTitle } from '../src/ui/SheetTitle';
import { Body, Display } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';

/**
 * Back to the Train screen already under the session, as the finish summary's Done does (R78), so leaving never stacks
 * a second Train screen. With nothing under it (the page was opened by address, or reloaded), Train takes its place.
 * Back to Train leaves the workout as it is; Discard calls this once the workout is gone.
 */
function toTrain() {
  router.dismissTo('/');
}

/** Module-level so `useDbQuery` reads again only when the data changes. */
function readSession(db: Db) {
  const settings = getSettings(db);
  const { unit, distanceUnit, musicApp, restSeconds } = settings;
  return { workout: getActiveWorkoutView(db), unit, gear: gearFor(unit, settings), distanceUnit, musicApp, restSeconds };
}

/** The question open over the session, if any. Only one at a time. */
type Ask = 'nothing_ticked' | 'confirm_finish' | 'discard' | 'finish_failed';

/** Back and Music: a 44pt target that never shrinks. */
const ICON_BUTTON = { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' } as const;

/** The music apps this phone can have. None on web, so the web build shows no music button. */
const MUSIC_APPS_HERE = musicAppsFor(Platform.OS);

/**
 * The back chevron, the workout name with its progress and time under it, on a phone the music button, whose sheet shows
 * `musicApp` as picked, and Finish (spec 18.6). A 2pt line along the bottom fills with the share of sets ticked. The name,
 * the line under it and the Finish label stop growing at 1.3× the text size, so the header stays one row. The row grows
 * taller as its text does, the progress line has its own strip under it, and the row never overflows sideways: the name
 * column takes what is left and truncates, and in the line under it the count gives way before the time (Round 4).
 * There is no app header and no dock here.
 */
function SessionHeader({
  name,
  startedAt,
  musicApp,
  progress,
  onFinish,
}: {
  name: string;
  startedAt: number;
  musicApp: MusicAppId | null;
  progress: Progress;
  onFinish: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);
  const [musicOpen, setMusicOpen] = useState(false);
  const elapsed = formatElapsed(now - startedAt);
  const { done, total } = progress;
  const { count, time } = progressParts(progress, elapsed);
  return (
    // The 2pt under the row is the progress line's own strip, so the line never covers the text (Round 4).
    <View style={{ backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View
        style={{
          width: '100%',
          maxWidth: 512,
          alignSelf: 'center',
          paddingHorizontal: 8,
          // At 1.3× the name and the line need 55pt: the padding grows the header rather than letting them touch its edges.
          paddingVertical: 4,
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
          onPress={toTrain}
          style={({ pressed }) => ({ ...ICON_BUTTON, opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Display weight={700} numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 22 }}>
            {name}
          </Display>
          <View accessible accessibilityLabel={progressLabel(progress, elapsed)} style={{ flexDirection: 'row', minWidth: 0 }}>
            {count === '' ? null : (
              <Body muted numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 13, flexShrink: 1 }}>
                {count}
              </Body>
            )}
            <Body muted numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 13, flexShrink: 0 }}>
              {time}
            </Body>
          </View>
        </View>
        {MUSIC_APPS_HERE.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Music"
            hitSlop={4}
            onPress={() => {
              Keyboard.dismiss();
              setMusicOpen(true);
            }}
            // 4pt more than the row's gap, so its hitSlop and Finish's never meet.
            style={({ pressed }) => ({ ...ICON_BUTTON, marginRight: 4, opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="musical-notes" size={24} color={colors.text} />
          </Pressable>
        ) : null}
        <Button
          label="Finish"
          variant="secondary"
          size="compact"
          maxFontSizeMultiplier={1.3}
          onPress={onFinish}
        />
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 2,
          width: `${total === 0 ? 0 : (done / total) * 100}%`,
          backgroundColor: colors.text,
        }}
      />
      {MUSIC_APPS_HERE.length > 0 ? (
        <MusicSheet visible={musicOpen} apps={MUSIC_APPS_HERE} musicApp={musicApp} onClose={() => setMusicOpen(false)} />
      ) : null}
    </View>
  );
}

/** The workout in progress: its exercises, each with a set table, the ⋯ menus, adding exercises, the rest timer, Finish in the header, and Discard. */
export default function Session() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { workout, unit, gear, distanceUnit, musicApp, restSeconds } = useDbQuery(readSession);
  /**
   * The exercise whose ⋯ menu is open, and what it opens on: its menu, its rest choices from the countdown, or its
   * Something off reasons from the name row (R81).
   */
  const [menuFor, setMenuFor] = useState<{ id: string; panel: 'menu' | 'rest' | 'mark' } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  /** The question Finish asks before it drops unticked sets. Kept after the sheet closes so its text does not change while it fades. */
  const [finishAsk, setFinishAsk] = useState<FinishConfirm | null>(null);
  /** Set by Finish anyway until its finish runs (B1): Finish, Discard and a second Finish anyway then do nothing. */
  const finishing = useRef(false);
  /** How tall the bars docked at the bottom are (0 with none), so the content can scroll clear of them. */
  const [dockHeight, setDockHeight] = useState(0);
  /** The header's count and the next set's ring, worked out once per data change rather than on every tick of the clock. */
  const { progress, next } = useMemo(
    () => ({
      progress: workoutProgress(workout?.exercises ?? []),
      next: workout === null ? null : nextSetId(workout.exercises),
    }),
    [workout],
  );
  /** The rest that has just run out, whose "Rest's up" still shows under its set. Hooks run before the early return. */
  const restUp = useRestUp(workout?.restEndsAt ?? null, workout?.restSetId ?? null, progress.done);

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
          <Button label="Back to Train" onPress={toTrain} />
        </View>
      </View>
    );
  }

  const { restEndsAt, restSetId } = workout;
  /** The set ticked last: mid-superset it shows when the rest comes (R100). */
  const lastTicked = latestTickedSetId(workout.exercises);
  /** What the rest row says at zero, by the set the rest is (or was) under. */
  const upText = restUpText(workout.exercises, restSetId ?? restUp?.setId ?? '');
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
   * Either way the workout is still there, so Finish and Discard work again.
   */
  const finishNow = () => {
    setAsk(null);
    let result: ReturnType<typeof finish>;
    try {
      result = finish(db, workout.id);
    } catch (error) {
      console.warn('GymHound could not finish the workout.', error);
      finishing.current = false;
      setAsk('finish_failed');
      return;
    }
    if (result === 'nothing_ticked') {
      finishing.current = false;
      setAsk('nothing_ticked');
      return;
    }
    router.replace(`/finish/${workout.id}`);
  };

  /**
   * Puts the keyboard away (it opens a sheet), saves what is typed, then reads the workout from the database (not from
   * what was last rendered): with nothing ticked it says so; with every set ticked it finishes; otherwise it asks first,
   * since unticked sets will be dropped. While Finish anyway waits for its sheet to go, it does nothing.
   */
  const onFinish = () => {
    if (finishing.current) return;
    Keyboard.dismiss();
    flushAll();
    const view = getActiveWorkoutView(db);
    if (view === null) {
      setAsk('nothing_ticked');
      return;
    }
    const check = finishCheck(view.exercises);
    if (check.done === 0) {
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

  /** Finish anyway: the finish runs once the sheet has gone (R55), and only once, however often it is tapped as it fades. */
  const onFinishAnyway = () => {
    if (finishing.current) return;
    finishing.current = true;
    setAsk(null);
    afterSheetCloses(finishNow);
  };

  const onDiscard = () => {
    if (finishing.current) return;
    flushAll();
    setAsk('discard');
  };

  const discardNow = () => {
    if (finishing.current) return;
    setAsk(null);
    discard(db, workout.id);
    toTrain();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionHeader name={workout.name} startedAt={workout.startedAt} musicApp={musicApp} progress={progress} onFinish={onFinish} />
      {/* The Short on food offer (§7.10): under the header, outside the scroll. */}
      <FoodOfferBanner workoutId={workout.id} />
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
              supersetLabel={
                startsSuperset(workout.exercises, ex.id)
                  ? `Superset of ${listNames(workout.exercises.filter((e) => e.supersetGroup === ex.supersetGroup).map((e) => e.name))}`
                  : null
              }
              restWaitsFor={restWaitsFor(workout.exercises, ex.id, restSeconds)}
              latestTickedSetId={lastTicked}
              restEndsAt={restEndsAt}
              restSetId={restSetId}
              nextSetId={next}
              restUp={restUp}
              upText={upText}
              settingsRestSeconds={restSeconds}
              onOpenMenu={() => {
                flushAll();
                Keyboard.dismiss();
                setMenuFor({ id: ex.id, panel: 'menu' });
              }}
              // A rest length chosen here sets future rests only; the running rest keeps its end (R50).
              onOpenRest={() => {
                flushAll();
                Keyboard.dismiss();
                setMenuFor({ id: ex.id, panel: 'rest' });
              }}
              onOpenMark={() => {
                flushAll();
                Keyboard.dismiss();
                setMenuFor({ id: ex.id, panel: 'mark' });
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
          <View style={{ marginTop: 24 }}>
            <Button label="Discard workout" variant="quiet" onPress={onDiscard} />
          </View>
        </View>
      </ScrollView>
      <ExerciseMenu
        exercises={workout.exercises}
        exerciseId={menuFor?.id ?? null}
        initialPanel={menuFor?.panel}
        onClose={() => setMenuFor(null)}
      />
      {/* Nothing ticked: the finish is refused. Keep logging is the safe answer, so it is the primary button. */}
      <Sheet visible={ask === 'nothing_ticked'} onClose={() => setAsk(null)}>
        <SheetTitle>Nothing is ticked yet.</SheetTitle>
        <View style={{ gap: 8 }}>
          <Button label="Keep logging" onPress={() => setAsk(null)} />
          {/* Discarding deletes what was typed, so it still asks first. */}
          <Button label="Discard workout" variant="secondary" onPress={() => setAsk('discard')} />
        </View>
      </Sheet>
      {/* An error the finish did not expect: nothing was lost, and the workout is still active. */}
      <Sheet visible={ask === 'finish_failed'} onClose={() => setAsk(null)}>
        <SheetTitle>GymHound couldn't finish this workout. It's still here — try again.</SheetTitle>
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
        onConfirm={onFinishAnyway}
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
