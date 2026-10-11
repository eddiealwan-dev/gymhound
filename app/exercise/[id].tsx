import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, BackHandler, Keyboard, Pressable, TextInput, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { createCustomExercise, deleteCustomExercise, isExerciseArchived, isExerciseUsed, updateCustomExercise } from '../../src/db/repositories/customExercisesRepo';
import { getExercise, listExercises } from '../../src/db/repositories/exercisesRepo';
import { normalizeCustomExercise, validateCustomExercise, type CustomExerciseDraft } from '../../src/domain/customExercise';
import { EQUIPMENT_ORDER, equipmentLabel, LOGGING_TYPE_LABELS, MUSCLE_ORDER, muscleChoiceLabel } from '../../src/domain/labels';
import type { LoggingType, Muscle } from '../../src/domain/types';
import { useCreatedExercise } from '../../src/state/createdExercise';
import { bumpData } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { Body, Display } from '../../src/ui/Text';
import { fonts } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';

/** The logging types in the order the editor lists them. */
const LOGGING_TYPES = Object.keys(LOGGING_TYPE_LABELS) as LoggingType[];

/**
 * A new exercise starts logged by weight and reps, with no equipment chosen (R128): a default barbell would turn on
 * barbell rounding and the plate calculator unseen.
 */
const BLANK: Omit<CustomExerciseDraft, 'name'> = { primaryMuscles: [], secondaryMuscles: [], equipment: null, loggingType: 'weighted' };

/** Back to what the editor opened over: the picker or the form demo's screen; with nothing behind it, Train. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** A field's name 8pt over its control, as on Settings and the routine editor. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Body>{label}</Body>
      {children}
    </View>
  );
}

/** Compact pills that wrap onto more lines as the text grows; a chosen one is filled with ink, as in the picker. */
function Chips({ children }: { children: ReactNode }) {
  // 4pt inset keeps each pill's 4pt hit slop inside the group.
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4, margin: -4 }}>{children}</View>;
}

function Chip({ label, chosen, onPress, accessibilityLabel }: { label: string; chosen: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Button
      label={label}
      size="compact"
      variant={chosen ? 'primary' : 'secondary'}
      selected={chosen}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    />
  );
}

/** One choice of a single-choice list: a 44pt row with a radio mark, then the label, which wraps. */
function RadioRow({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 })}
    >
      <Ionicons name={checked ? 'radio-button-on' : 'radio-button-off'} size={22} color={checked ? colors.text : colors.textMuted} />
      <Body style={{ flex: 1 }}>{label}</Body>
    </Pressable>
  );
}

/** `list` with `muscle` added at the end, or taken out if it is there. */
const toggled = (list: readonly Muscle[], muscle: Muscle) => (list.includes(muscle) ? list.filter((m) => m !== muscle) : [...list, muscle]);

const same = (a: CustomExerciseDraft, b: CustomExerciseDraft) => JSON.stringify(a) === JSON.stringify(b);

type EditorProps = {
  /** The exercise to edit, or null to make a new one. */
  exerciseId: string | null;
  /** A new exercise's name to start from: the picker's search text. */
  prefill: string;
  /** Opened by the picker's **New exercise**: the saved exercise is handed back to it (R110). */
  fromPicker: boolean;
};

/**
 * The custom exercise editor (§8.7, R108): a name, primary and secondary muscles (the three delts apart), one
 * equipment (none chosen for a new one, R128) and one logging type. Once the exercise is used anywhere its logging type
 * is shown, not offered. What stops Save is listed over it once Save is tapped, and said to the screen reader.
 * **Delete exercise** archives a used exercise and deletes an unused one (R109); an archived one does not offer it. Closing with changes not saved asks "Discard changes?" first, by the close button, the Android back button or
 * (held while there are changes) the swipe down.
 */
function ExerciseEditor({ exerciseId, prefill, fromPicker }: EditorProps) {
  const db = useDb();
  const { colors } = useTheme();
  const [existing] = useState(() => (exerciseId === null ? null : getExercise(db, exerciseId)));
  const [used] = useState(() => (existing === null ? false : isExerciseUsed(db, existing.id)));
  /** Already archived: out of the picker, so there is nothing left to delete. */
  const [archived] = useState(() => (existing === null ? false : isExerciseArchived(db, existing.id)));
  const [initial] = useState<CustomExerciseDraft | null>(() => {
    if (exerciseId === null) return { name: prefill, ...BLANK };
    if (existing === null || !existing.isCustom) return null;
    const { name, primaryMuscles, secondaryMuscles, equipment, loggingType } = existing;
    return { name, primaryMuscles, secondaryMuscles, equipment, loggingType };
  });
  const [draft, setDraft] = useState(initial);
  /** Save was tapped: what stops it shows, and keeps up as the draft changes. */
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  /** The names a new name must not repeat: the exercises you can see, without this one. */
  const otherNames = useMemo(() => listExercises(db).filter((e) => e.id !== exerciseId).map((e) => e.name), [db, exerciseId]);

  const changed = initial !== null && draft !== null && !same(initial, draft);
  /** Read by the back button's listener, which is added once. */
  const changedRef = useRef(changed);
  changedRef.current = changed;
  /** Saved or deleted: leaving now loses nothing. */
  const done = useRef(false);

  const leave = () => {
    Keyboard.dismiss();
    if (changedRef.current && !done.current) setAskDiscard(true);
    else goBack();
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!changedRef.current || done.current) return false;
      leaveRef.current();
      return true;
    });
    return () => back.remove();
  }, []);

  const header = (title: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8, marginBottom: 24 }}>
      <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Display>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={4}
        onPress={leave}
        style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
      >
        <Ionicons name="close" size={28} color={colors.text} />
      </Pressable>
    </View>
  );

  if (initial === null || draft === null) {
    return (
      <Screen>
        {header('Exercise')}
        <Body muted>That isn't here.</Body>
      </Screen>
    );
  }

  const update = (patch: Partial<CustomExerciseDraft>) => {
    setFailure(null);
    setDraft((d) => (d === null ? d : { ...d, ...patch }));
  };
  const togglePrimary = (m: Muscle) =>
    update({ primaryMuscles: toggled(draft.primaryMuscles, m), secondaryMuscles: draft.secondaryMuscles.filter((s) => s !== m) });
  const toggleSecondary = (m: Muscle) =>
    update({ secondaryMuscles: toggled(draft.secondaryMuscles, m), primaryMuscles: draft.primaryMuscles.filter((p) => p !== m) });

  const clean = normalizeCustomExercise(draft);
  const problems = tried ? validateCustomExercise(clean, otherNames) : [];
  if (failure !== null) problems.push(failure);

  const save = () => {
    Keyboard.dismiss();
    setTried(true);
    const refused = validateCustomExercise(clean, otherNames);
    const { equipment } = clean;
    if (refused.length > 0 || equipment === null) {
      // The live region over Save speaks on Android only; VoiceOver is told here.
      AccessibilityInfo.announceForAccessibility(refused.join(' '));
      return;
    }
    try {
      if (exerciseId === null) {
        const id = createCustomExercise(db, { ...clean, equipment }, Date.now());
        if (fromPicker) useCreatedExercise.getState().set(id);
      } else {
        updateCustomExercise(db, exerciseId, { ...clean, equipment });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setFailure(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }
    done.current = true;
    bumpData();
    goBack();
  };

  const remove = () => {
    if (exerciseId === null) return;
    // Task 7 (R111): pass the function that deletes each own photo file (`deleteExercisePhotoFile`) as the third argument.
    deleteCustomExercise(db, exerciseId);
    done.current = true;
    bumpData();
    setAskDelete(false);
    afterSheetCloses(goBack);
  };

  return (
    <Screen>
      {/* The swipe down would close the editor without asking, so it is held while there are changes. */}
      <Stack.Screen options={{ gestureEnabled: !changed }} />
      {header(exerciseId === null ? 'New exercise' : 'Edit exercise')}
      <View style={{ gap: 24 }}>
        <Field label="Name">
          <TextInput
            value={draft.name}
            onChangeText={(name) => update({ name })}
            accessibilityLabel="Exercise name"
            autoFocus={exerciseId === null}
            autoCapitalize="sentences"
            returnKeyType="done"
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
        </Field>
        <Field label="Primary muscles">
          <Chips>
            {MUSCLE_ORDER.map((m) => (
              <Chip
                key={m}
                label={muscleChoiceLabel(m)}
                accessibilityLabel={`${muscleChoiceLabel(m)}, primary muscle`}
                chosen={draft.primaryMuscles.includes(m)}
                onPress={() => togglePrimary(m)}
              />
            ))}
          </Chips>
        </Field>
        <Field label="Secondary muscles">
          <Chips>
            {MUSCLE_ORDER.map((m) => (
              <Chip
                key={m}
                label={muscleChoiceLabel(m)}
                accessibilityLabel={`${muscleChoiceLabel(m)}, secondary muscle`}
                chosen={draft.secondaryMuscles.includes(m)}
                onPress={() => toggleSecondary(m)}
              />
            ))}
          </Chips>
        </Field>
        <Field label="Equipment">
          <Chips>
            {EQUIPMENT_ORDER.map((e) => (
              <Chip key={e} label={equipmentLabel(e)} chosen={draft.equipment === e} onPress={() => update({ equipment: e })} />
            ))}
          </Chips>
        </Field>
        <Field label="Logging">
          {used ? (
            <View style={{ gap: 4 }}>
              <Body weight={600}>{LOGGING_TYPE_LABELS[draft.loggingType]}</Body>
              <Body muted>It's in use, so this stays.</Body>
            </View>
          ) : (
            <View accessibilityRole="radiogroup">
              {LOGGING_TYPES.map((t) => (
                <RadioRow key={t} label={LOGGING_TYPE_LABELS[t]} checked={draft.loggingType === t} onPress={() => update({ loggingType: t })} />
              ))}
            </View>
          )}
        </Field>
      </View>
      <View style={{ marginTop: 32, gap: 16 }}>
        {problems.length > 0 ? (
          // Never red: what stops the save is said in muted words over the button.
          <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
            {problems.map((problem) => (
              <Body key={problem} muted>
                {problem}
              </Body>
            ))}
          </View>
        ) : null}
        <Button label="Save" onPress={save} />
        {existing !== null && !archived ? (
          <View style={{ alignItems: 'center' }}>
            <Button
              label="Delete exercise"
              variant="quiet"
              onPress={() => {
                Keyboard.dismiss();
                setAskDelete(true);
              }}
            />
          </View>
        ) : null}
      </View>
      {existing !== null && !archived ? (
        <ConfirmSheet
          visible={askDelete}
          title={`Delete ${existing.name}?`}
          body={used ? 'It stays in your history and routines but leaves the exercise list.' : "This can't be undone."}
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={remove}
          onCancel={() => setAskDelete(false)}
        />
      ) : null}
      <ConfirmSheet
        visible={askDiscard}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        primary="cancel"
        onConfirm={() => {
          done.current = true;
          setAskDiscard(false);
          afterSheetCloses(goBack);
        }}
        onCancel={() => setAskDiscard(false)}
      />
    </Screen>
  );
}

/**
 * Your own exercise (§8.7): `/exercise/new` makes one, with `name` to start from and `from=picker` to hand it back to
 * the picker (R110); `/exercise/{id}` edits one of yours. It opens as a modal over the picker or the form demo's screen.
 */
export default function ExerciseEditorScreen() {
  const { id, name, from } = useLocalSearchParams<{ id: string; name?: string; from?: string }>();
  // A fresh editor for each exercise: what one held never shows in another's.
  return <ExerciseEditor key={id} exerciseId={id === 'new' ? null : id} prefill={typeof name === 'string' ? name : ''} fromPicker={from === 'picker'} />;
}
