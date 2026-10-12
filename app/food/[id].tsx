import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { archiveCustomFood, createCustomFood, customFoodNames, getFood, listFoods, updateCustomFood } from '../../src/db/repositories/foodsRepo';
import { type CustomFoodInput, validateCustomFood } from '../../src/domain/fuel';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { useCreatedFood } from '../../src/state/createdFood';
import { bumpData } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { FuelField, MacroFields } from '../../src/ui/fuel/MacroFields';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { Body, Display } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

/** Back to what the editor opened over: the add screen; with nothing behind it, Fuel. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/fuel');
}

/** A stored number as the field shows it: "330", "28.4". */
const numberText = (n: number) => `${n}`;

const BLANK: CustomFoodInput = { name: '', servingLabel: '', servingGrams: '', kcal: '', protein: '', carbs: '', fat: '' };

const same = (a: CustomFoodInput, b: CustomFoodInput) => JSON.stringify(a) === JSON.stringify(b);

/** The problems in the order the fields read, each once, for the screen reader. */
const FIELD_ORDER = ['name', 'servingLabel', 'servingGrams', 'kcal', 'protein', 'carbs', 'fat'] as const;

type EditorProps = {
  /** The food to edit, or null to make a new one. */
  foodId: string | null;
  /** A new food's name to start from: the add screen's search. */
  prefill: string;
  /** Opened by the add screen's **New food**: the saved food is handed back to it. */
  fromAdd: boolean;
};

/**
 * Your own food (R144): a name, what one serving is, its weight if you know it, and the calories, protein, carbs and
 * fat in one serving. What stops **Save** shows beside its field once Save is tapped, and is said to the screen reader.
 * **Delete food** archives it: days you've logged keep their copies. Closing with changes not saved asks "Discard
 * changes?" first, by the close button, the Android back button or (held while there are changes) the swipe down.
 */
function FoodEditor({ foodId, prefill, fromAdd }: EditorProps) {
  const db = useDb();
  const { colors } = useTheme();
  const [existing] = useState(() => (foodId === null ? null : getFood(db, foodId)));
  const [initial] = useState<CustomFoodInput | null>(() => {
    if (foodId === null) return { ...BLANK, name: prefill };
    if (existing === null || existing.source !== 'custom') return null;
    // Deleted (archived): out of the food list, so there is nothing here to edit.
    if (!listFoods(db).some((f) => f.id === existing.id)) return null;
    return {
      name: existing.name,
      servingLabel: existing.servingLabel,
      servingGrams: existing.servingGrams === null ? '' : numberText(existing.servingGrams),
      kcal: numberText(existing.kcal),
      protein: numberText(existing.proteinG),
      carbs: numberText(existing.carbsG),
      fat: numberText(existing.fatG),
    };
  });
  const [draft, setDraft] = useState(initial);
  /** Save was tapped: what stops it shows, and keeps up as the draft changes. */
  const [tried, setTried] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  /** The names a new name must not repeat: your other foods. */
  const otherNames = useMemo(() => customFoodNames(db, foodId ?? undefined), [db, foodId]);

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

  if (existing !== null && existing.source !== 'custom') {
    return (
      <Screen>
        {header('Food')}
        <Body muted style={{ marginBottom: 16 }}>
          That food can't be edited.
        </Body>
        <Button label="Back" variant="secondary" onPress={goBack} />
      </Screen>
    );
  }

  if (initial === null || draft === null) {
    return (
      <Screen>
        {header('Food')}
        <Body muted>That isn't here.</Body>
      </Screen>
    );
  }

  const update = (patch: Partial<CustomFoodInput>) => setDraft((d) => (d === null ? d : { ...d, ...patch }));
  const checked = validateCustomFood(draft, otherNames);
  const errors = tried && !checked.ok ? checked.errors : {};

  const save = () => {
    Keyboard.dismiss();
    setTried(true);
    if (!checked.ok) {
      announce([...new Set(FIELD_ORDER.map((key) => checked.errors[key]).filter((m): m is string => m !== undefined))].join(' '));
      return;
    }
    if (foodId === null) {
      const id = createCustomFood(db, checked.food);
      if (fromAdd) useCreatedFood.getState().set(id);
    } else {
      updateCustomFood(db, foodId, checked.food);
    }
    done.current = true;
    bumpData();
    goBack();
  };

  const remove = () => {
    if (foodId === null || existing === null) return;
    archiveCustomFood(db, foodId);
    done.current = true;
    bumpData();
    setAskDelete(false);
    announce(`Deleted ${existing.name}.`);
    afterSheetCloses(goBack);
  };

  return (
    <Screen>
      {/* The swipe down would close the editor without asking, so it is held while there are changes. */}
      <Stack.Screen options={{ gestureEnabled: !changed }} />
      {header(foodId === null ? 'New food' : 'Edit food')}
      <View style={{ gap: 24 }}>
        <FuelField
          label="Name"
          value={draft.name}
          onChangeText={(name) => update({ name })}
          error={errors.name}
          autoFocus={foodId === null && prefill === ''}
        />
        <FuelField
          label="Serving"
          value={draft.servingLabel}
          onChangeText={(servingLabel) => update({ servingLabel })}
          placeholder="1 cup"
          error={errors.servingLabel}
        />
        <FuelField
          label="Serving weight (g, optional)"
          value={draft.servingGrams}
          onChangeText={(servingGrams) => update({ servingGrams })}
          numeric
          error={errors.servingGrams}
        />
        <MacroFields value={draft} onChange={(macros) => update(macros)} errors={errors} kcalLabel="Calories per serving" />
      </View>
      <View style={{ marginTop: 32, gap: 16 }}>
        <Button label="Save" onPress={save} />
        {existing !== null ? (
          <View style={{ alignItems: 'center' }}>
            <Button
              label="Delete food"
              variant="quiet"
              onPress={() => {
                Keyboard.dismiss();
                setAskDelete(true);
              }}
            />
          </View>
        ) : null}
      </View>
      {existing !== null ? (
        <ConfirmSheet
          visible={askDelete}
          title={`Delete ${existing.name}?`}
          body="Days you've logged keep it. It leaves the food list."
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

/** The editor's title and Close, over the pitch. */
function Locked({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8, marginBottom: 24 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Display>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={4}
          onPress={goBack}
          style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Ionicons name="close" size={28} color={colors.text} />
        </Pressable>
      </View>
      <ProPitch context="tab" />
    </Screen>
  );
}

/**
 * Your own food (R144, R154), a modal over the add screen: `/food/new` makes one, with `name` to start from and
 * `from=add` to hand it back to the add screen; `/food/{id}` edits one of yours. A bundled food can't be edited.
 * Without Pro the pitch takes the editor's place (R151), with Close to leave: Pro lapsing while it is open locks it at
 * once, and an address can't open it around the lock. Your foods are kept.
 */
export default function FoodEditorScreen() {
  const { id, name, from } = useLocalSearchParams<{ id: string; name?: string; from?: string }>();
  const pro = useIsPro();
  if (!pro) return <Locked title={id === 'new' ? 'New food' : 'Edit food'} />;
  // A fresh editor for each food: what one held never shows in another's.
  return <FoodEditor key={id} foodId={id === 'new' ? null : id} prefill={typeof name === 'string' ? name : ''} fromAdd={from === 'add'} />;
}
