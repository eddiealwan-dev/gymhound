import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, Keyboard, View } from 'react-native';
import { useDb } from '../../../../src/db/DbProvider';
import { getWorkoutDetail } from '../../../../src/db/repositories/historyRepo';
import { getSettings } from '../../../../src/db/repositories/settingsRepo';
import { loadWorkoutDraft } from '../../../../src/db/repositories/workoutHistoryRepo';
import type { Db } from '../../../../src/db/types';
import { calendarDayTitle, toLocalDate } from '../../../../src/domain/dates';
import {
  addDraftSet,
  draftLeavesNothing,
  draftProblems,
  isDraftDirty,
  patchDraftSet,
  removeDraftSet,
  setDraftMark,
  type DraftSet,
  type WorkoutDraft,
} from '../../../../src/domain/historyDraft';
import { MARK_LABELS } from '../../../../src/domain/labels';
import { setLabels, setName } from '../../../../src/domain/setEntry';
import type { ExerciseMark, SetType } from '../../../../src/domain/types';
import { announce } from '../../../../src/platform/announce';
import { deviceLocale } from '../../../../src/platform/locale';
import { useDbQuery } from '../../../../src/state/dataVersion';
import { flushAll } from '../../../../src/state/draftFlush';
import { deleteHistoryWorkout, saveHistoryEdit } from '../../../../src/state/historyActions';
import { setLeaveGuard } from '../../../../src/state/leaveGuard';
import { BackLink } from '../../../../src/ui/BackLink';
import { Button } from '../../../../src/ui/Button';
import { EditExercise } from '../../../../src/ui/history/EditExercise';
import { Screen } from '../../../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet, Sheet } from '../../../../src/ui/Sheet';
import { Body, Display } from '../../../../src/ui/Text';

const SET_TYPES: { type: SetType; label: string }[] = [
  { type: 'working', label: 'Working' },
  { type: 'warmup', label: 'Warmup' },
  { type: 'drop', label: 'Drop' },
  { type: 'failure', label: 'Failure' },
];

/** The Something off reasons, in the sheet's order (spec 18.7). */
const MARKS = Object.keys(MARK_LABELS) as ExerciseMark[];

/** Said, and shown over Save, when a ticked set lacks a value its type needs. */
const SETS_NEED_VALUES = 'Some ticked sets need a value.';

/**
 * What Save would drop that may have been meant (R195), in plain words: an unticked set holding a value ("Bench press set
 * 4 isn't ticked."), and an exercise with no ticked set, which leaves the workout ("Curl has no ticked sets, so it leaves
 * this workout."). An unticked set with nothing in it goes without a word.
 */
export function droppedLines(draft: WorkoutDraft): string[] {
  const lines: string[] = [];
  for (const e of draft.exercises) {
    if (!e.sets.some((s) => s.done)) {
      lines.push(`${e.name} has no ticked sets, so it leaves this workout.`);
      continue;
    }
    const labels = setLabels(e.sets.map((s) => s.setType));
    e.sets.forEach((s, i) => {
      const holds = [s.weight, s.reps, s.rpe, s.durationS, s.distance].some((v) => v !== null);
      if (!s.done && holds) lines.push(`${e.name} ${setName(labels[i]).toLowerCase()} isn't ticked.`);
    });
  }
  return lines;
}

/**
 * The draft with a stable key per set, so a row keeps what is typed in it while sets above it are removed. A set from
 * the database is keyed by its id; one added here by a counter.
 */
type Editing = { draft: WorkoutDraft; keys: Record<string, string[]> };

let added = 0;
const keysFor = (draft: WorkoutDraft): Record<string, string[]> =>
  Object.fromEntries(draft.exercises.map((e) => [e.workoutExerciseId, e.sets.map((s) => s.id ?? `new-${++added}`)]));

const editingOf = (draft: WorkoutDraft | null): Editing | null => (draft === null ? null : { draft, keys: keysFor(draft) });

/** The workout's name and date, muted under the title: "Push A · Thu, Oct 1". */
function workoutLine(db: Db, workoutId: string, name: string): string {
  const detail = getWorkoutDetail(db, workoutId, getSettings(db).unit);
  if (!detail) return name;
  return `${name} · ${calendarDayTitle(detail.localDate, toLocalDate(Date.now()), deviceLocale())}`;
}

/**
 * The editor for one finished workout (§8.8, §7.12, R166): set values, types and ticks, sets added and removed, and each
 * exercise's Something off. Nothing is written until **Save**, which saves the whole draft in one transaction and
 * re-runs the rule, the PR check and next weights (`saveHistoryEdit`); a save that would leave no set offers **Delete
 * workout** instead. Leaving with changes asks "Discard changes?" first, by Cancel, the Android back button, the dock or
 * the header. No footer (§18.4).
 */
function WorkoutEditor({ workoutId }: { workoutId: string }) {
  const db = useDb();
  const { unit, distanceUnit } = useDbQuery(getSettings);
  /** The workout as last saved: what Discard goes back to. Null when there is no such finished workout. */
  const [saved, setSaved] = useState<WorkoutDraft | null>(() => loadWorkoutDraft(db, workoutId));
  const savedRef = useRef(saved);
  const [editing, setEditing] = useState<Editing | null>(() => editingOf(saved));
  const latest = useRef(editing);
  const [line, setLine] = useState(() => (saved === null ? '' : workoutLine(db, workoutId, saved.name)));
  /** Bumped when the draft starts over, so every row drops what was typed in it. */
  const [generation, setGeneration] = useState(0);
  /** Rows holding a number that does not read, by set key: Save waits until there are none. */
  const invalidRows = useRef(new Set<string>());
  /** Save was tapped: what stops it shows, and keeps up as the draft changes, until the editor is left or saved. */
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [nothingLeft, setNothingLeft] = useState(false);
  /** What Save would drop, asked about before it writes (R195); null when the question is not open. */
  const [dropping, setDropping] = useState<string[] | null>(null);
  /** The set whose chip was tapped: its type sheet is open. */
  const [setFor, setSetFor] = useState<{ workoutExerciseId: string; index: number } | null>(null);
  /** The exercise whose Something off was tapped. */
  const [markFor, setMarkFor] = useState<string | null>(null);

  const change = useCallback((next: Editing) => {
    latest.current = next;
    setEditing(next);
  }, []);

  /** Applies a draft function; the set keys stay as they are. */
  const apply = (fn: (d: WorkoutDraft) => WorkoutDraft) => {
    const current = latest.current;
    if (current === null) return;
    const draft = fn(current.draft);
    if (draft !== current.draft) change({ ...current, draft });
  };

  const startOver = (next: WorkoutDraft | null) => {
    savedRef.current = next;
    setSaved(next);
    change(editingOf(next) as Editing);
    invalidRows.current = new Set();
    setGeneration((g) => g + 1);
    setTried(false);
    setFailure(null);
    if (next !== null) setLine(workoutLine(db, workoutId, next.name));
  };

  const unsaved = () =>
    savedRef.current !== null && latest.current !== null && (isDraftDirty(savedRef.current, latest.current.draft) || invalidRows.current.size > 0);

  /** Back where the editor was opened from: the workout's detail. */
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.navigate(`/history/${workoutId}`);
  }, [workoutId]);

  /** Takes `leave` over when there are changes to lose, opening "Discard changes?"; false lets it go now. */
  const askBeforeLeaving = useRef<(leave: () => void) => boolean>(() => false);
  askBeforeLeaving.current = (leave) => {
    flushAll();
    if (!unsaved()) return false;
    Keyboard.dismiss();
    setPendingLeave(() => leave);
    return true;
  };

  const leave = () => {
    if (!askBeforeLeaving.current(goBack)) goBack();
  };

  /** A hidden tab stays mounted: with nothing unsaved, the workout is read again on focus, as it may have changed or gone. */
  const refresh = useRef(() => {});
  refresh.current = () => {
    if (unsaved()) return;
    const fresh = loadWorkoutDraft(db, workoutId);
    const same = fresh !== null && savedRef.current !== null && !isDraftDirty(savedRef.current, fresh);
    if (!same) startOver(fresh);
  };

  useFocusEffect(
    useCallback(() => {
      refresh.current();
      const unguard = setLeaveGuard((go) => askBeforeLeaving.current(go));
      const back = BackHandler.addEventListener('hardwareBackPress', () => askBeforeLeaving.current(goBack));
      return () => {
        unguard();
        back.remove();
        // Left with nothing to lose: the next Edit starts without the last Save's problems.
        if (!unsaved()) {
          setTried(false);
          setFailure(null);
        }
      };
    }, [goBack]),
  );

  if (saved === null || editing === null) {
    return (
      <Screen>
        <BackLink label="Cancel" accessibilityLabel="Cancel" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/history'))} />
        <Display>Edit workout</Display>
        <Body muted style={{ marginTop: 8 }}>
          This workout isn&apos;t in your history.
        </Body>
      </Screen>
    );
  }

  const problems = tried ? draftProblems(editing.draft) : [];

  const save = () => {
    flushAll();
    Keyboard.dismiss();
    setTried(true);
    setFailure(null);
    const current = latest.current;
    if (current === null) return;
    if (invalidRows.current.size > 0) {
      announce('Check this number');
      return;
    }
    // Nothing changed: nothing to write, so no snapshot and no re-run.
    if (savedRef.current !== null && !isDraftDirty(savedRef.current, current.draft)) {
      setTried(false);
      goBack();
      return;
    }
    if (draftProblems(current.draft).length > 0) {
      announce(SETS_NEED_VALUES);
      return;
    }
    // With no set left, "Nothing would be left" asks instead.
    const drops = draftLeavesNothing(current.draft) ? [] : droppedLines(current.draft);
    if (drops.length > 0) {
      setDropping(drops);
      return;
    }
    write();
  };

  /** Writes the draft (`saveHistoryEdit`) and goes back, or asks "Nothing would be left". */
  const write = () => {
    const current = latest.current;
    if (current === null) return;
    let result: 'saved' | 'nothing_left';
    try {
      result = saveHistoryEdit(db, current.draft);
    } catch (e) {
      // Nothing was written (one transaction): the changes stay here to try again.
      console.warn('GymHound: the workout could not be saved.', e);
      setFailure("Couldn't save. Try again.");
      announce("Couldn't save. Try again.");
      return;
    }
    if (result === 'nothing_left') {
      setNothingLeft(true);
      return;
    }
    startOver(loadWorkoutDraft(db, workoutId));
    announce('Saved.');
    goBack();
  };

  const deleteWorkout = () => {
    setNothingLeft(false);
    afterSheetCloses(() => {
      try {
        deleteHistoryWorkout(db, workoutId);
      } catch (e) {
        console.warn('GymHound: the workout could not be deleted.', e);
        setFailure("Couldn't delete. Try again.");
        announce("Couldn't delete. Try again.");
        return;
      }
      startOver(null);
      announce('Workout deleted.');
      // Its detail is gone too: back to the list.
      router.navigate('/history');
    });
  };

  const onInvalidChange = (setKey: string, invalid: boolean) => {
    if (invalid) invalidRows.current.add(setKey);
    else invalidRows.current.delete(setKey);
  };

  const openSet = setFor === null ? null : editing.draft.exercises.find((e) => e.workoutExerciseId === setFor.workoutExerciseId);
  const openSetType = openSet?.sets[setFor?.index ?? -1]?.setType;
  const markExercise = markFor === null ? null : editing.draft.exercises.find((e) => e.workoutExerciseId === markFor);

  const removeSet = () => {
    const at = setFor;
    setSetFor(null);
    const current = latest.current;
    if (at === null || current === null) return;
    const keys = current.keys[at.workoutExerciseId] ?? [];
    change({
      draft: removeDraftSet(current.draft, at.workoutExerciseId, at.index),
      keys: { ...current.keys, [at.workoutExerciseId]: keys.filter((_, i) => i !== at.index) },
    });
  };

  const addSet = (workoutExerciseId: string) => {
    const current = latest.current;
    if (current === null) return;
    change({
      draft: addDraftSet(current.draft, workoutExerciseId, unit, distanceUnit),
      keys: { ...current.keys, [workoutExerciseId]: [...(current.keys[workoutExerciseId] ?? []), `new-${++added}`] },
    });
  };

  return (
    <Screen>
      <BackLink label="Cancel" accessibilityLabel="Cancel" onPress={leave} />
      <Display>Edit workout</Display>
      <Body muted style={{ marginTop: 4, marginBottom: 24 }}>
        {line}
      </Body>
      {editing.draft.exercises.map((exercise) => (
        <EditExercise
          key={`${generation}:${exercise.workoutExerciseId}`}
          exercise={exercise}
          setKeys={(editing.keys[exercise.workoutExerciseId] ?? []).map((k) => `${generation}:${k}`)}
          unit={unit}
          distanceUnit={distanceUnit}
          problems={problems.filter((p) => p.workoutExerciseId === exercise.workoutExerciseId)}
          tried={tried}
          onPatch={(index, patch: Partial<DraftSet>) => apply((d) => patchDraftSet(d, exercise.workoutExerciseId, index, patch))}
          onAddSet={() => addSet(exercise.workoutExerciseId)}
          onOpenSet={(index) => setSetFor({ workoutExerciseId: exercise.workoutExerciseId, index })}
          onOpenMark={() => setMarkFor(exercise.workoutExerciseId)}
          onInvalidChange={onInvalidChange}
        />
      ))}
      <View style={{ marginTop: 4, gap: 8 }}>
        {problems.length > 0 || failure !== null ? (
          // Never red, and no live region: Save says it (`announce`).
          <View style={{ gap: 4, marginBottom: 8 }}>
            {problems.length > 0 ? <Body muted>{SETS_NEED_VALUES}</Body> : null}
            {failure !== null ? <Body muted>{failure}</Body> : null}
          </View>
        ) : null}
        <Button label="Save" onPress={save} />
        <Button label="Cancel" variant="secondary" onPress={leave} />
      </View>

      <Sheet visible={openSetType !== undefined} onClose={() => setSetFor(null)}>
        <Display weight={700} style={{ marginBottom: 12 }}>
          Set type
        </Display>
        <View style={{ gap: 8 }}>
          {SET_TYPES.map(({ type, label }) => (
            <Button
              key={type}
              label={label}
              variant={openSetType === type ? 'primary' : 'secondary'}
              selected={openSetType === type}
              onPress={() => {
                const at = setFor;
                setSetFor(null);
                if (at !== null) apply((d) => patchDraftSet(d, at.workoutExerciseId, at.index, { setType: type }));
              }}
            />
          ))}
        </View>
        <View style={{ marginTop: 16 }}>
          <Button label="Remove set" variant="secondary" onPress={removeSet} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Button label="Cancel" variant="quiet" onPress={() => setSetFor(null)} />
        </View>
      </Sheet>

      <Sheet visible={dropping !== null} onClose={() => setDropping(null)}>
        <Display weight={700} style={{ marginBottom: 8 }}>
          Some sets will be dropped
        </Display>
        <View style={{ gap: 4, marginBottom: 16 }}>
          {(dropping ?? []).map((text, i) => (
            <Body key={i} muted>
              {text}
            </Body>
          ))}
        </View>
        <View style={{ gap: 8 }}>
          <Button label="Keep editing" variant="primary" onPress={() => setDropping(null)} />
          <Button
            label="Save anyway"
            variant="secondary"
            onPress={() => {
              setDropping(null);
              afterSheetCloses(write);
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={markExercise != null} onClose={() => setMarkFor(null)}>
        <Display weight={700}>Something off</Display>
        <Body muted style={{ marginBottom: 12 }}>
          {markExercise?.name ?? ''}
        </Body>
        <View style={{ gap: 8 }}>
          {MARKS.map((mark) => (
            <Button
              key={mark}
              label={MARK_LABELS[mark]}
              variant={markExercise?.mark === mark ? 'primary' : 'secondary'}
              selected={markExercise?.mark === mark}
              onPress={() => {
                const id = markFor;
                setMarkFor(null);
                if (id !== null) apply((d) => setDraftMark(d, id, mark));
              }}
            />
          ))}
          {markExercise?.mark ? (
            <Button
              label="Nothing off"
              variant="secondary"
              onPress={() => {
                const id = markFor;
                setMarkFor(null);
                if (id !== null) apply((d) => setDraftMark(d, id, null));
              }}
            />
          ) : null}
        </View>
        <View style={{ marginTop: 12 }}>
          <Button label="Cancel" variant="quiet" onPress={() => setMarkFor(null)} />
        </View>
      </Sheet>

      <ConfirmSheet
        visible={nothingLeft}
        title="Nothing would be left"
        body="Untick fewer sets, or delete the workout."
        confirmLabel="Delete workout"
        cancelLabel="Keep editing"
        primary="cancel"
        onConfirm={deleteWorkout}
        onCancel={() => setNothingLeft(false)}
      />
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
    </Screen>
  );
}

/** The history editor (R166), a hidden tab route under History (R172). */
export default function EditWorkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // A fresh editor for each workout: what one held never shows in another's.
  return <WorkoutEditor key={id} workoutId={id} />;
}
