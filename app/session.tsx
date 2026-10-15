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
import { programWeekText } from '../src/domain/upNext';
import { finishCheck, finishConfirm, type FinishConfirm } from '../src/domain/finishCheck';
import { gearFor } from '../src/domain/plates';
import type { MusicAppId } from '../src/domain/types';
import { musicAppOn, musicAppsFor } from '../src/platform/music';
import { listNames } from '../src/domain/finishCheck';
import { latestTickedSetId, restWaitsFor } from '../src/domain/rest';
import { joinsNextInSuperset, replaceNeedsConfirm, startsSuperset } from '../src/domain/sessionMenu';
import { nextSetId, progressLabel, progressParts, restUpText, workoutProgress, type Progress } from '../src/domain/sessionProgress';
import { flushAll } from '../src/state/draftFlush';
import { useDbQuery } from '../src/state/dataVersion';
import { changeRungTo, discard, finish, replaceWith } from '../src/state/sessionActions';
import { ModifySheet } from '../src/ui/ModifySheet';
import { useShareEqual } from '../src/state/shareEqual';
import { useNow } from '../src/state/useNow';
import { Button } from '../src/ui/Button';
import { EmptyState } from '../src/ui/EmptyState';
import { SessionTip } from '../src/ui/SessionTip';
import { ExerciseBlock } from '../src/ui/session/ExerciseBlock';
import { ExerciseMenu } from '../src/ui/session/ExerciseMenu';
import { FoodOfferBanner } from '../src/ui/session/FoodOfferBanner';
import { MusicBar } from '../src/ui/session/MusicBar';
import { MusicSheet } from '../src/ui/session/MusicSheet';
import { RestBar } from '../src/ui/session/RestBar';
import { useRestUp } from '../src/ui/session/useRestUp';
import { SleepOfferBanner } from '../src/ui/native/SleepOfferBanner';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../src/ui/Sheet';
import { SheetTitle } from '../src/ui/SheetTitle';
import { Body, Display } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';
import { useSafeScroll } from '../src/ui/useSafeScroll';
import { useCallbacksByKey } from '../src/ui/useCallbacksByKey';

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
type Ask = 'nothing_ticked' | 'confirm_finish' | 'discard' | 'finish_failed' | 'discard_failed';

/** Back and Music: a 44pt target that never shrinks. */
/** Under a short "Couldn't finish" or "Couldn't discard" title: nothing was lost, and what to do. */
const STILL_HERE = 'Your workout is still here, as you left it. Try again.';

/** What an empty workout says over Add exercise (R406). */
const NO_EXERCISES = 'No exercises yet. Add one and it shows here, ready to log.';

const ICON_BUTTON = { width: 44, height: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' } as const;

/** The music apps this phone can have. None on web, so the web build shows no music button. */
const MUSIC_APPS_HERE = musicAppsFor(Platform.OS);

/**
 * The count and the time under the workout name. It is the only part of the header that reads the clock, so each second
 * redraws this line alone, not the header with its buttons and music sheet. In the line the count gives way before the time.
 */
function ProgressLine({ startedAt, progress }: { startedAt: number; progress: Progress }) {
  const now = useNow(1000);
  const elapsed = formatElapsed(now - startedAt);
  const { count, time } = progressParts(progress, elapsed);
  return (
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
  );
}

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
  const [musicOpen, setMusicOpen] = useState(false);
  const { done, total } = progress;
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
          <ProgressLine startedAt={startedAt} progress={progress} />
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

/**
 * A program's week at the top of the session (R616, R617): "Week 3 of 12", and the week's line muted under it when it
 * has one (a deload, a taper, a phase note). One stop for VoiceOver. It wraps at any text size.
 */
function ProgramWeek({ week, weeks, line }: { week: number; weeks: number; line: string | null }) {
  // After the last week the normal rules carry on until Start over (R616).
  const head = programWeekText({ week, weeks, done: week > weeks });
  return (
    <View accessible accessibilityLabel={line === null ? head : `${head}. ${line}`} style={{ marginBottom: 16, gap: 2 }}>
      <Body weight={600}>{head}</Body>
      {line === null ? null : (
        <Body muted style={{ fontSize: 14 }}>
          {line}
        </Body>
      )}
    </View>
  );
}

/** The workout in progress: its exercises, each with a set table, the ⋯ menus, adding exercises, the rest timer, Finish in the header, and Discard. */
export default function Session() {
  const db = useDb();
  // A set's field keeps clear of the keyboard; a keyboard raised elsewhere (the picker, a sheet) changes nothing here (R560).
  const safeScroll = useSafeScroll();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Every write reads the workout again; what did not change keeps its objects, so only the blocks that changed draw again.
  const { workout, unit, gear, distanceUnit, musicApp, restSeconds } = useShareEqual(useDbQuery(readSession));
  /**
   * The exercise whose ⋯ menu is open, and what it opens on: its menu, its rest choices from the countdown, or its
   * Something off reasons from the name row (R81).
   */
  const [menuFor, setMenuFor] = useState<{ id: string; panel: 'menu' | 'rest' | 'mark' } | null>(null);
  /** The exercise Modify is open for (R553), and the swap waiting on "Replace?" when it has completed sets. */
  const [modifyFor, setModifyFor] = useState<string | null>(null);
  const [swapAsk, setSwapAsk] = useState<{ id: string; name: string; exerciseId: string } | null>(null);
  /** Change rung waiting on "Change to {rung}?" when the exercise has completed sets (R618). */
  const [rungAsk, setRungAsk] = useState<{ id: string; rung: number; name: string } | null>(null);
  /** The workout's exercises as last drawn, for openers made once per exercise. */
  const exercisesRef = useRef(workout?.exercises ?? []);
  exercisesRef.current = workout?.exercises ?? [];
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
  /**
   * Each block's ⋯ menu, rest choices and Something off openers, the same functions on every draw. A rest length chosen
   * from the countdown sets future rests only; the running rest keeps its end (R50).
   */
  const openersFor = useCallbacksByKey((id) => {
    const open = (panel: 'menu' | 'rest' | 'mark') => () => {
      flushAll();
      Keyboard.dismiss();
      setMenuFor({ id, panel });
    };
    return {
      menu: open('menu'),
      rest: open('rest'),
      mark: open('mark'),
      modify: () => {
        flushAll();
        Keyboard.dismiss();
        setModifyFor(id);
      },
      // The exercise is read when tapped: a replaced one keeps its row (and these openers) with a new exercise.
      stats: () => {
        const exerciseId = exercisesRef.current.find((e) => e.id === id)?.exerciseId;
        if (exerciseId === undefined) return;
        flushAll();
        Keyboard.dismiss();
        router.push(`/lift-stats/${exerciseId}`);
      },
    };
  });

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
  /** The exercise Modify (or Change rung) is open for, and its program rule if it has one. */
  const modifying = workout.exercises.find((e) => e.id === modifyFor) ?? null;
  const modifyingRule = modifying?.program?.rule ?? null;
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
  /** The set the rest row's words are about: the running rest's, else the one whose "Rest's up" still shows. */
  const restRowSetId = restSetId ?? restUp?.setId ?? null;
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
    try {
      discard(db, workout.id);
    } catch (error) {
      // As for a failed finish: nothing was deleted, the workout is still active, and a press handler must not throw.
      console.warn('GymHound could not discard the workout.', error);
      setAsk('discard_failed');
      return;
    }
    toTrain();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SessionHeader name={workout.name} startedAt={workout.startedAt} musicApp={musicApp} progress={progress} onFinish={onFinish} />
      {/* The Short on food offer (§7.10): under the header, outside the scroll. */}
      <FoodOfferBanner workoutId={workout.id} />
      <SleepOfferBanner workoutId={workout.id} />
      <ScrollView
        ref={safeScroll.ref}
        {...safeScroll.scrollProps}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View
          ref={safeScroll.contentRef}
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
          {workout.program ? <ProgramWeek week={workout.program.week} weeks={workout.program.weeks} line={workout.program.weekLine} /> : null}
          {workout.exercises.length > 0 ? <SessionTip /> : null}
          {workout.exercises.map((ex) => {
            // What is about one set goes only to the block that has it, so a tick redraws the blocks it changed, not all.
            const has = (setId: string | null) => setId !== null && ex.sets.some((set) => set.id === setId);
            const holdsRest = has(restSetId);
            const waits = restWaitsFor(workout.exercises, ex.id, restSeconds);
            const openers = openersFor(ex.id);
            return (
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
                restWaitsFor={waits}
                latestTickedSetId={has(lastTicked) ? lastTicked : null}
                restEndsAt={holdsRest ? restEndsAt : null}
                // Only the block with the countdown, or with a "Rest after" line that a running rest hides, needs to know.
                restRunning={restEndsAt !== null && (holdsRest || (waits !== null && has(lastTicked)))}
                restSetId={holdsRest ? restSetId : null}
                nextSetId={has(next) ? next : null}
                restUp={restUp !== null && has(restUp.setId) ? restUp : null}
                upText={has(restRowSetId) ? upText : ''}
                settingsRestSeconds={restSeconds}
                onOpenMenu={openers.menu}
                onOpenRest={openers.rest}
                onOpenMark={openers.mark}
                onOpenModify={openers.modify}
                onOpenStats={openers.stats}
              />
            );
          })}
          {/* An empty workout (R406): say what fills it, and Add exercise becomes its one filled action. */}
          {workout.exercises.length === 0 ? <EmptyState style={{ marginBottom: 16 }} text={NO_EXERCISES} /> : null}
          <Button
            label="Add exercise"
            variant={workout.exercises.length === 0 ? 'primary' : 'secondary'}
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
        {safeScroll.room > 0 ? <View style={{ height: safeScroll.room }} /> : null}
      </ScrollView>
      <ModifySheet
        target={modifying ? { exerciseId: modifying.exerciseId, name: modifying.name, programExerciseId: null, inUse: workout.exercises.map((e) => e.exerciseId) } : null}
        // A program's ladder slot changes its rung here, for today and from now on (R618).
        ladder={modifyingRule?.kind === 'ladder' && modifyingRule.rungs ? { rungs: modifyingRule.rungs, current: modifyingRule.rung ?? 0, sets: modifyingRule.sets } : null}
        note={
          modifyingRule?.kind === 'ladder'
            ? 'Changes it today and from now on. Its sets today start fresh.'
            : "Just for this workout. To swap it for good, use Modify on the routine's page."
        }
        onChooseRung={(rung) => {
          const ex = modifying;
          setModifyFor(null);
          if (!ex) return;
          const name = ex.program?.rule.rungs?.[rung]?.name ?? '';
          if (replaceNeedsConfirm(ex)) afterSheetCloses(() => setRungAsk({ id: ex.id, rung, name }));
          else changeRungTo(db, ex.id, rung);
        }}
        onClose={() => setModifyFor(null)}
        onChoose={(exerciseId) => {
          const ex = workout.exercises.find((e) => e.id === modifyFor);
          setModifyFor(null);
          if (!ex) return;
          // Swapping clears its sets, so with any completed it asks first, as Replace does.
          if (replaceNeedsConfirm(ex)) afterSheetCloses(() => setSwapAsk({ id: ex.id, name: ex.name, exerciseId }));
          else replaceWith(db, ex.id, exerciseId);
        }}
      />
      <ConfirmSheet
        visible={rungAsk !== null}
        title={`Change to ${rungAsk?.name ?? ''}?`}
        body="Its completed sets will be cleared."
        confirmLabel="Change"
        cancelLabel="Keep"
        onConfirm={() => {
          if (rungAsk) changeRungTo(db, rungAsk.id, rungAsk.rung);
          setRungAsk(null);
        }}
        onCancel={() => setRungAsk(null)}
      />
      <ConfirmSheet
        visible={swapAsk !== null}
        title={`Replace ${swapAsk?.name ?? ''}?`}
        body="Its completed sets will be cleared."
        confirmLabel="Replace"
        cancelLabel="Keep"
        onConfirm={() => {
          if (swapAsk) replaceWith(db, swapAsk.id, swapAsk.exerciseId);
          setSwapAsk(null);
        }}
        onCancel={() => setSwapAsk(null)}
      />
      <ExerciseMenu
        exercises={workout.exercises}
        exerciseId={menuFor?.id ?? null}
        initialPanel={menuFor?.panel}
        onClose={() => setMenuFor(null)}
      />
      {/* Nothing ticked: the finish is refused. Keep logging is the safe answer, so it is the primary button. */}
      <Sheet visible={ask === 'nothing_ticked'} onClose={() => setAsk(null)}>
        <SheetTitle>No sets completed yet</SheetTitle>
        <View style={{ gap: 8 }}>
          <Button label="Keep logging" onPress={() => setAsk(null)} />
          {/* Discarding deletes what was typed, so it still asks first. */}
          <Button label="Discard workout" variant="secondary" onPress={() => setAsk('discard')} />
        </View>
      </Sheet>
      {/* An error the finish did not expect: nothing was lost, and the workout is still active. */}
      <Sheet visible={ask === 'finish_failed'} onClose={() => setAsk(null)}>
        <SheetTitle subtitle={STILL_HERE}>Couldn't finish</SheetTitle>
        <Button label="OK" onPress={() => setAsk(null)} />
      </Sheet>
      <Sheet visible={ask === 'discard_failed'} onClose={() => setAsk(null)}>
        <SheetTitle subtitle={STILL_HERE}>Couldn't discard</SheetTitle>
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
