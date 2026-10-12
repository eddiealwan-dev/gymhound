import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { BackHandler, Platform, Pressable, TextInput, View } from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { useDb } from '../../../../src/db/DbProvider';
import { getExercise } from '../../../../src/db/repositories/exercisesRepo';
import { getRoutineDetail, routineToDraft, saveRoutine } from '../../../../src/db/repositories/routinesRepo';
import { getSavedWorkout, listSavedWorkouts } from '../../../../src/db/repositories/savedWorkoutsRepo';
import type { Db } from '../../../../src/db/types';
import { getSettings } from '../../../../src/db/repositories/settingsRepo';
import { parseDecimal, parseDuration, parseReps } from '../../../../src/domain/input';
import { dayLabel, defaultIncrement, draftReducer, hasChanges, MAX_SETS, MIN_SETS, newDraft, refreshDraft, validateDraft, withLibraryNames } from '../../../../src/domain/routineDraft';
import type { DraftAction, DraftDay, DraftExercise, RoutineDraft } from '../../../../src/domain/routineDraft';
import { dayFromSaved } from '../../../../src/domain/savedWorkout';
import type { LoggingType, WeightUnit } from '../../../../src/domain/types';
import { convertIncrement } from '../../../../src/domain/units';
import { announce } from '../../../../src/platform/announce';
import { bumpData, useDbQuery } from '../../../../src/state/dataVersion';
import { flushAll, useDraftFlush } from '../../../../src/state/draftFlush';
import { setLeaveGuard } from '../../../../src/state/leaveGuard';
import { usePendingPick } from '../../../../src/state/pendingPick';
import { BackLink } from '../../../../src/ui/BackLink';
import { Button } from '../../../../src/ui/Button';
import { useRoutineLimit } from '../../../../src/ui/RoutineLimit';
import { Screen } from '../../../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../../../../src/ui/Sheet';
import { SupersetBar, supersetRuns } from '../../../../src/ui/SupersetBar';
import { SheetTitle } from '../../../../src/ui/SheetTitle';
import { Body, Label, Num, ScreenTitle } from '../../../../src/ui/Text';
import { fonts } from '../../../../src/ui/theme';
import { useTheme } from '../../../../src/ui/ThemeProvider';
import { Toggle } from '../../../../src/ui/Toggle';

/** Types whose rep range counts seconds. */
const IN_SECONDS: LoggingType[] = ['timed', 'weighted_time'];
/** Distance and time has no rep range to set. */
const NO_REPS: LoggingType[] = ['distance_time'];
/** Types with no load for the rule to raise, so no increment to set. */
const NO_LOAD: LoggingType[] = ['timed', 'distance_time'];

/** Back to the screen the editor was opened from: the routine, or Routines for a new one. */
function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.navigate(fallback);
}

/** A field's name 8pt over its control, as on Settings. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Body>{label}</Body>
      {children}
    </View>
  );
}

/** A 44pt icon with no chrome, like the session's ⋯. Faded and ignored when there is nowhere to go. */
function IconButton({ icon, label, onPress, disabled = false }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

/**
 * What a number field reads: whole reps; seconds, typed "90" or "1:30" as in the session's time fields; or a decimal
 * with a comma or a dot.
 */
type NumberKind = 'reps' | 'seconds' | 'decimal';
const PARSE: Record<NumberKind, (text: string) => number | null> = { reps: parseReps, seconds: parseDuration, decimal: parseDecimal };
const KEYBOARD: Record<NumberKind, KeyboardTypeOptions> = {
  reps: 'number-pad',
  // "1:30" needs the colon.
  seconds: 'numbers-and-punctuation',
  decimal: 'decimal-pad',
};

/**
 * How wide a number field is on the web, where a text field is as wide as 20 characters whatever it holds (the
 * browser's own size for an input), which pushed "to" off a phone's screen. Sized there to what it holds: about 11 per
 * figure at 20pt Barlow Condensed, with the padding and border, and never under 64. On a phone the field takes the
 * width of its text itself.
 */
const webFieldWidth = (shown: string) => (Platform.OS === 'web' ? { width: Math.max(64, 18 + 11 * shown.length) } : null);

/**
 * A number typed as text and kept as a draft until the field is left (R29): typing "12" never passes through 1, which
 * the rule's limits would act on. A blank or unreadable entry goes back to the number. Back, the picker and Save
 * commit a draft not yet left (`flushAll`). The field is at least 64 wide and grows with the phone's text size.
 */
function NumberField({ value, label, kind, onCommit }: { value: number; label: string; kind: NumberKind; onCommit: (n: number) => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const n = PARSE[kind](text);
    setText(null);
    if (n !== null && n !== value) onCommit(n);
  };
  useDraftFlush(commit);
  const shown = text ?? String(value);
  return (
    <TextInput
      value={shown}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType={KEYBOARD[kind]}
      // iOS adds its own Done bar above the number pad with this key (R43); Done submits and blurs.
      returnKeyType="done"
      selectTextOnFocus
      accessibilityLabel={label}
      style={{
        minWidth: 64,
        minHeight: 44,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        color: colors.text,
        fontFamily: fonts.display800,
        fontSize: 20,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
        ...webFieldWidth(shown),
      }}
    />
  );
}

/** A text field for a name, filled a step away from what it sits on. */
function NameField({ value, label, onChangeText, fill }: { value: string; label: string; onChangeText: (text: string) => void; fill: string }) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={label}
      autoCapitalize="sentences"
      returnKeyType="done"
      style={{
        flex: 1,
        // A web text field asks for 20 characters' width; without this it pushed a day's buttons off its card.
        minWidth: 0,
        minHeight: 48,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: fill,
        color: colors.text,
        fontFamily: fonts.body400,
        fontSize: 16,
      }}
    />
  );
}

/** The set count, 1 to 10, as − and + compact pills either side of the number. */
function SetStepper({ exercise, onChange }: { exercise: DraftExercise; onChange: (setCount: number) => void }) {
  const n = exercise.setCount;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Button label="−" variant="secondary" size="compact" accessibilityLabel={`Fewer sets for ${exercise.name}`} disabled={n <= MIN_SETS} onPress={() => onChange(n - 1)} />
      <View accessible accessibilityLabel={n === 1 ? '1 set' : `${n} sets`} style={{ minWidth: 32, alignItems: 'center' }}>
        <Num weight={800} style={{ fontSize: 20 }}>
          {String(n)}
        </Num>
      </View>
      <Button label="+" variant="secondary" size="compact" accessibilityLabel={`More sets for ${exercise.name}`} disabled={n >= MAX_SETS} onPress={() => onChange(n + 1)} />
    </View>
  );
}

/** Each action of a union without its day. */
type WithoutDay<A> = A extends unknown ? Omit<A, 'dayKey'> : never;
/** An exercise action as an exercise sends it: the day it is in adds its key. */
type ExerciseAction = WithoutDay<Extract<DraftAction, { exerciseKey: string }>>;

type ExerciseProps = {
  exercise: DraftExercise;
  index: number;
  count: number;
  unit: WeightUnit;
  apply: (action: ExerciseAction) => void;
};

/**
 * One exercise of a day: its name with move and remove, then its set count, rep range (seconds for timed ones) and
 * increment, wrapping onto more lines as the text grows, and Superset with next on all but the day's last. The
 * increment shows in the display unit; once edited it is kept in that unit, and one left alone keeps its own.
 */
function ExerciseEditor({ exercise, index, count, unit, apply }: ExerciseProps) {
  const { colors } = useTheme();
  const { key: exerciseKey, name, loggingType } = exercise;
  const update = (patch: Extract<DraftAction, { type: 'updateExercise' }>['patch']) => apply({ type: 'updateExercise', exerciseKey, patch });
  const repWord: NumberKind = IN_SECONDS.includes(loggingType) ? 'seconds' : 'reps';
  const increment = Number(convertIncrement(exercise.increment, exercise.incrementUnit, unit).toFixed(2));
  return (
    <View style={{ gap: 12, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Body weight={600} style={{ flex: 1, minWidth: 0, paddingTop: 11 }}>
          {name}
        </Body>
        <IconButton icon="chevron-up" label={`Move ${name} up`} disabled={index === 0} onPress={() => apply({ type: 'moveExercise', exerciseKey, dir: 'up' })} />
        <IconButton icon="chevron-down" label={`Move ${name} down`} disabled={index === count - 1} onPress={() => apply({ type: 'moveExercise', exerciseKey, dir: 'down' })} />
        <IconButton icon="close" label={`Remove ${name}`} onPress={() => apply({ type: 'removeExercise', exerciseKey })} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 12 }}>
        <Field label="Sets">
          <SetStepper exercise={exercise} onChange={(setCount) => update({ setCount })} />
        </Field>
        {NO_REPS.includes(loggingType) ? null : (
          <Field label={repWord === 'seconds' ? 'Seconds' : 'Reps'}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <NumberField value={exercise.repMin} kind={repWord} label={`${name} ${repWord} from`} onCommit={(repMin) => update({ repMin })} />
              <Body muted>–</Body>
              <NumberField value={exercise.repMax} kind={repWord} label={`${name} ${repWord} to`} onCommit={(repMax) => update({ repMax })} />
            </View>
          </Field>
        )}
        {NO_LOAD.includes(loggingType) ? null : (
          <Field label="Increment">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <NumberField
                value={increment}
                kind="decimal"
                label={`${name} increment in ${unit}`}
                onCommit={(value) => update({ increment: value, incrementUnit: unit })}
              />
              {/* 0 adds no weight, so in place of the unit it says what the rule does instead. */}
              <Body muted>{increment === 0 ? 'reps only' : unit}</Body>
            </View>
          </Field>
        )}
      </View>
      {index < count - 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
          <Body style={{ flexShrink: 1 }}>Superset with next</Body>
          <Toggle
            accessibilityLabel={`Superset ${name} with next`}
            value={exercise.supersetWithNext}
            onValueChange={() => apply({ type: 'toggleSuperset', exerciseKey })}
          />
        </View>
      ) : null}
    </View>
  );
}

type DayProps = {
  day: DraftDay;
  index: number;
  count: number;
  unit: WeightUnit;
  apply: (action: DraftAction) => void;
  onAddExercise: (dayKey: string) => void;
};

/** A day as a card: its name with move and delete, its exercises (a superset marked by the bar), and + Add exercise. */
function DayEditor({ day, index, count, unit, apply, onAddExercise }: DayProps) {
  const { colors } = useTheme();
  const label = dayLabel(day, index);
  const dayKey = day.key;
  const links = day.exercises.map((e) => e.supersetWithNext);
  const editor = (exercise: DraftExercise) => (
    <ExerciseEditor
      key={exercise.key}
      exercise={exercise}
      index={day.exercises.indexOf(exercise)}
      count={day.exercises.length}
      unit={unit}
      apply={(action) => apply({ ...action, dayKey } as DraftAction)}
    />
  );
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <NameField value={day.name} label={`Day ${index + 1} name`} fill={colors.bg} onChangeText={(name) => apply({ type: 'renameDay', dayKey, name })} />
        <IconButton icon="chevron-up" label={`Move ${label} up`} disabled={index === 0} onPress={() => apply({ type: 'moveDay', dayKey, dir: 'up' })} />
        <IconButton icon="chevron-down" label={`Move ${label} down`} disabled={index === count - 1} onPress={() => apply({ type: 'moveDay', dayKey, dir: 'down' })} />
        <IconButton icon="trash-outline" label={`Delete ${label}`} onPress={() => apply({ type: 'deleteDay', dayKey })} />
      </View>
      <View style={{ marginTop: 4 }}>
        {supersetRuns(day.exercises, links).map((run) =>
          run.superset ? <SupersetBar key={run.members[0].key}>{run.members.map(editor)}</SupersetBar> : run.members.map(editor),
        )}
      </View>
      {/* A quiet button steps back by its padding, so its label lines up with the content edge. */}
      <View style={{ alignSelf: 'flex-start', marginLeft: -12, marginTop: 4 }}>
        <Button label="+ Add exercise" variant="quiet" size="compact" accessibilityLabel={`Add exercise to ${label}`} onPress={() => onAddExercise(dayKey)} />
      </View>
    </View>
  );
}

/**
 * What the editor holds, brought up to date when it regains focus (steps 1 and 2 of the focus order).
 * 1. A hidden tab stays mounted, so the routine may have changed since it was read (saved or deleted from another
 *    editor). With nothing unsaved here, it is read again as both the saved version and the draft (`reread`), so
 *    nothing looks unsaved; null when it is gone. Changes not yet saved are kept as they are.
 * 2. The library: a custom exercise can be deleted, renamed or retyped while the editor is away (R108, R109). The draft
 *    follows it (`refreshDraft`), saying what changed in plain words; the saved copy takes the new names only, so a
 *    rename made elsewhere never counts as a change here.
 */
function readAgain(
  db: Db,
  routineId: string | null,
  saved: RoutineDraft,
  draft: RoutineDraft,
): { saved: RoutineDraft | null; draft: RoutineDraft | null; notices: string[]; reread: boolean } {
  let base = saved;
  let current = draft;
  const reread = routineId !== null && !hasChanges(saved, draft);
  if (reread) {
    const fresh = routineToDraft(db, routineId);
    if (fresh === null) return { saved: null, draft: null, notices: [], reread };
    base = current = fresh;
  }
  const lookup = (exerciseId: string) => getExercise(db, exerciseId);
  const refreshed = refreshDraft(current, lookup, defaultIncrement(getSettings(db)));
  return { saved: withLibraryNames(base, lookup), draft: refreshed.draft, notices: refreshed.notices, reread };
}

const exerciseCount = (n: number) => (n === 1 ? '1 exercise' : `${n} exercises`);

/** The saved workouts **Add a saved workout** offers, each a row that adds it as a day (R121). */
function SavedWorkoutSheet({ visible, onPick, onClose }: { visible: boolean; onPick: (savedId: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const saved = useDbQuery(listSavedWorkouts);
  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetTitle marginBottom={8}>Add a saved workout</SheetTitle>
      <View style={{ marginBottom: 16 }}>
        {saved.map((w, i) => (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            accessibilityLabel={`${w.name}, ${exerciseCount(w.exerciseCount)}`}
            onPress={() => onPick(w.id)}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border, opacity: pressed ? 0.8 : 1 })}
          >
            <Body weight={600}>{w.name}</Body>
            <Body muted style={{ fontSize: 14 }}>
              {exerciseCount(w.exerciseCount)}
            </Body>
          </Pressable>
        ))}
      </View>
      <Button label="Cancel" variant="quiet" onPress={onClose} />
    </Sheet>
  );
}

/** The draft as React state, with a ref that always holds the latest, so Save and Back read what a flush just wrote. */
function useDraft(initial: RoutineDraft | null) {
  const latest = useRef(initial);
  const [draft, setDraft] = useState(initial);
  const apply = useCallback((action: DraftAction) => {
    if (latest.current === null) return;
    const next = draftReducer(latest.current, action);
    if (next === latest.current) return;
    latest.current = next;
    setDraft(next);
  }, []);
  const reset = useCallback((next: RoutineDraft | null) => {
    latest.current = next;
    setDraft(next);
  }, []);
  return { draft, latest, apply, reset };
}

/** Whether `draft` holds anything the routine as saved does not: leaving would lose it. */
const unsaved = (saved: RoutineDraft | null, draft: RoutineDraft | null) => saved !== null && draft !== null && hasChanges(saved, draft);

/**
 * The editor for one routine of your own, or a new one (`routineId` null). Nothing is written until **Save**, which
 * writes the whole routine in one go (`saveRoutine`), so an exercise that stays keeps its next weight and a workout in
 * progress is never touched. Leaving with changes not saved asks "Discard changes?" first, whether by Back, the
 * Android back button, the dock or the header's Settings button. A premade is read-only (§8.6): its editor address
 * shows its detail instead.
 */
function RoutineEditor({ routineId }: { routineId: string | null }) {
  const db = useDb();
  const { colors } = useTheme();
  const { unit } = useDbQuery(getSettings);
  const [premade] = useState(() => routineId !== null && getRoutineDetail(db, routineId)?.isPremade === true);
  /** The routine as last saved: what Discard goes back to. Null when there is no such routine of your own. */
  const [saved, setSaved] = useState(() => (premade ? null : routineId === null ? newDraft() : routineToDraft(db, routineId)));
  const savedRef = useRef(saved);
  const { draft, latest, apply, reset } = useDraft(saved);
  /** Save was tapped: what stops it shows, and keeps up as the draft changes, until the editor is left or saved. */
  const [tried, setTried] = useState(false);
  /** The last Save failed to write: it says so over the button until the next Save. */
  const [saveFailed, setSaveFailed] = useState(false);
  /** The move Back, the dock or the header was making when "Discard changes?" opened. */
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  /** The day + Add exercise was tapped on: the picker's choice lands there. */
  const pickFor = useRef<string | null>(null);
  const limit = useRoutineLimit();
  /** What changed in the library while the editor was away, said once it is back (`readAgain`). */
  const [notices, setNotices] = useState<string[]>([]);
  const [pickingSaved, setPickingSaved] = useState(false);
  const hasSaved = useDbQuery(listSavedWorkouts).length > 0;
  const backTo: Href = routineId === null ? '/routines' : `/routines/${routineId}`;

  const startOver = (next: RoutineDraft | null) => {
    savedRef.current = next;
    setSaved(next);
    reset(next);
    setTried(false);
    setSaveFailed(false);
    setNotices([]);
  };

  /** Takes `leave` over when there are changes to lose, opening "Discard changes?"; false lets it go now. */
  const askBeforeLeaving = useRef<(leave: () => void) => boolean>(() => false);
  askBeforeLeaving.current = (leave: () => void) => {
    flushAll();
    if (!unsaved(savedRef.current, latest.current)) return false;
    setPendingLeave(() => leave);
    return true;
  };

  const leave = () => {
    if (!askBeforeLeaving.current(() => goBack(backTo))) goBack(backTo);
  };

  /**
   * Brings the draft and the saved copy up to date (`readAgain`). A routine read again clears the last Save's problems;
   * notices from the last focus go, and new ones are said to the screen reader.
   */
  const refresh = useRef(() => {});
  refresh.current = () => {
    if (premade || savedRef.current === null || latest.current === null) return;
    const next = readAgain(db, routineId, savedRef.current, latest.current);
    if (next.saved !== savedRef.current) {
      savedRef.current = next.saved;
      setSaved(next.saved);
    }
    if (next.draft !== latest.current) reset(next.draft);
    if (next.reread) {
      setTried(false);
      setSaveFailed(false);
    }
    setNotices(next.notices);
    for (const notice of next.notices) announce(notice);
  };

  useFocusEffect(
    useCallback(() => {
      // In this order: (1) read the routine again if nothing is unsaved, (2) re-check the library, both in `readAgain`,
      // then (3) add what the picker chose. The re-read must see the draft before the pick makes it unsaved, and the
      // pick was just read from the library, so it needs no re-check.
      refresh.current();
      // 3. The picker hands over what it chose for + Add exercise; anything else waiting is dropped.
      const exerciseId = usePendingPick.getState().take();
      const dayKey = pickFor.current;
      pickFor.current = null;
      const exercise = exerciseId === null || dayKey === null ? null : getExercise(db, exerciseId);
      if (exercise && dayKey !== null) {
        apply({
          type: 'addExercise',
          dayKey,
          exercise: { id: exercise.id, name: exercise.name, loggingType: exercise.loggingType },
          increment: defaultIncrement(getSettings(db)),
        });
      }
      const unguard = setLeaveGuard((go) => askBeforeLeaving.current(go));
      const back = BackHandler.addEventListener('hardwareBackPress', () => askBeforeLeaving.current(() => goBack(backTo)));
      return () => {
        unguard();
        back.remove();
        // Left with nothing to lose: the next New routine or Edit starts without the last Save's problems.
        if (!unsaved(savedRef.current, latest.current)) {
          setTried(false);
          setSaveFailed(false);
        }
      };
    }, [db, apply, reset, backTo, routineId, premade]),
  );

  useEffect(() => {
    if (premade) router.navigate(backTo);
  }, [premade, backTo]);

  if (premade) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={() => goBack('/routines')} />
        <Body muted style={{ marginTop: 8 }}>
          Premade routines are read-only.
        </Body>
      </Screen>
    );
  }

  if (draft === null || saved === null) {
    return (
      <Screen>
        <BackLink label="Routines" onPress={() => goBack('/routines')} />
        <Body muted style={{ marginTop: 8 }}>
          That routine isn't here.
        </Body>
      </Screen>
    );
  }

  const addExercise = (dayKey: string) => {
    flushAll();
    pickFor.current = dayKey;
    router.push('/pick-exercise?mode=routine');
  };

  const openSaved = () => {
    flushAll();
    setPickingSaved(true);
  };

  const addSaved = (savedId: string) => {
    setPickingSaved(false);
    const saved = getSavedWorkout(db, savedId);
    if (saved) apply({ type: 'addDayFromSaved', day: dayFromSaved(saved, defaultIncrement(getSettings(db))) });
  };

  const write = () => {
    const current = latest.current;
    if (current === null) return;
    let id: string;
    try {
      id = saveRoutine(db, current, Date.now());
    } catch (e) {
      // Nothing was written (one transaction): the changes stay here to try again.
      console.warn('GymHound: the routine could not be saved.', e);
      setSaveFailed(true);
      return;
    }
    bumpData();
    startOver(routineId === null ? newDraft() : routineToDraft(db, id));
    goBack(routineId === null ? '/routines' : `/routines/${id}`);
  };

  const save = () => {
    flushAll();
    setTried(true);
    setSaveFailed(false);
    if (latest.current === null || validateDraft(latest.current).length > 0) return;
    // A new routine keeps to the free limit however the editor was reached (R88).
    if (routineId === null) limit.whenRoomFor(write);
    else write();
  };

  const problems = [...(tried ? validateDraft(draft) : [])];
  if (saveFailed) problems.push("Couldn't save. Try again.");

  return (
    <Screen>
      <BackLink label={routineId === null ? 'Routines' : saved.name} onPress={leave} />
      <ScreenTitle>{routineId === null ? 'New routine' : 'Edit routine'}</ScreenTitle>
      <View style={{ marginTop: 24 }}>
        <Field label="Name">
          <View style={{ flexDirection: 'row' }}>
            <NameField value={draft.name} label="Routine name" fill={colors.surface} onChangeText={(name) => apply({ type: 'rename', name })} />
          </View>
        </Field>
      </View>
      <Label style={{ marginTop: 32, marginBottom: 8 }}>Days</Label>
      {notices.length > 0 ? (
        // Said to the screen reader when they appear (`announce`).
        <View style={{ gap: 4, marginBottom: 8 }}>
          {notices.map((notice, i) => (
            <Body key={i} muted>
              {notice}
            </Body>
          ))}
        </View>
      ) : null}
      <View style={{ gap: 16 }}>
        {draft.days.map((day, index) => (
          <DayEditor key={day.key} day={day} index={index} count={draft.days.length} unit={unit} apply={apply} onAddExercise={addExercise} />
        ))}
        <Button label="+ Add day" variant="secondary" onPress={() => apply({ type: 'addDay' })} />
        {hasSaved ? <Button label="Add a saved workout" variant="secondary" onPress={openSaved} /> : null}
      </View>
      <View style={{ marginTop: 32, gap: 16 }}>
        {problems.length > 0 ? (
          // Never red: what stops the save is said in muted words over the button.
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            {problems.map((problem, i) => (
              <Body key={i} muted>
                {problem}
              </Body>
            ))}
          </View>
        ) : null}
        <Button label="Save" onPress={save} />
      </View>
      <ConfirmSheet
        visible={pendingLeave !== null}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        primary="cancel"
        onConfirm={() => {
          const go = pendingLeave;
          setPendingLeave(null);
          startOver(savedRef.current);
          if (go) afterSheetCloses(go);
        }}
        onCancel={() => setPendingLeave(null)}
      />
      <SavedWorkoutSheet visible={pickingSaved} onPick={addSaved} onClose={() => setPickingSaved(false)} />
      {limit.sheets}
    </Screen>
  );
}

/** The routine editor (§8.6, R89): `/routines/edit/new` makes a routine, `/routines/edit/{id}` edits one of your own. */
export default function EditRoutine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // A fresh editor for each routine: what one held never shows in another's.
  return <RoutineEditor key={id} routineId={id === 'new' ? null : id} />;
}
