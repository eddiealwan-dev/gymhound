import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Keyboard, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../src/db/DbProvider';
import { getFood, listFoods, recentFoods } from '../../src/db/repositories/foodsRepo';
import { calendarDayInSentence, toLocalDate } from '../../src/domain/dates';
import { indexFoods } from '../../src/domain/foodSearch';
import { type FoodPerServing, kcalProteinSpoken, kcalProteinText } from '../../src/domain/fuel';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { deviceLocale } from '../../src/platform/locale';
import { useCreatedFood } from '../../src/state/createdFood';
import { useDbQuery } from '../../src/state/dataVersion';
import { flushAll } from '../../src/state/draftFlush';
import { Button } from '../../src/ui/Button';
import { EMPTY_QUICK_ADD, QuickAddForm, quickAddStarted, type QuickAddDraft } from '../../src/ui/fuel/QuickAddForm';
import { ServingsSheet } from '../../src/ui/fuel/ServingsSheet';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { Body, Display, Label } from '../../src/ui/Text';
import { fonts } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';
import { useOnce } from '../../src/ui/useOnce';

type Mode = 'search' | 'quick';

const MODES: { value: Mode; label: string }[] = [
  { value: 'search', label: 'Search' },
  { value: 'quick', label: 'Quick add' },
];

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Closes the screen. With nothing to go back to (opened by address, or reloaded), it lands on Fuel. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/fuel');
}

/** Search / Quick add: a well with the chosen segment filled with ink, as on Settings. */
function ModeControl({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}>
      {MODES.map((mode) => {
        const selected = mode.value === value;
        return (
          <Pressable
            key={mode.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(mode.value)}
            style={{
              flex: 1,
              minHeight: 44,
              paddingHorizontal: 8,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text, textAlign: 'center' }}>
              {mode.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A food: its name, then "{serving} · {kcal} kcal · {protein} g protein", and " · Yours" for your own. Tapping opens its servings. */
const FoodRow = memo(function FoodRow({ food, onChoose }: { food: FoodPerServing; onChoose: (food: FoodPerServing) => void }) {
  const { colors } = useTheme();
  const locale = deviceLocale();
  const amounts = kcalProteinText(food, locale);
  const yours = food.source === 'custom';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${food.name}, ${food.servingLabel}, ${kcalProteinSpoken(food, locale)}${yours ? ', Yours' : ''}`}
      onPress={() => onChoose(food)}
      style={({ pressed }) => ({
        minHeight: 60,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Body weight={600}>{food.name}</Body>
      <Body muted style={{ fontSize: 14 }}>{`${food.servingLabel} · ${amounts}${yours ? ' · Yours' : ''}`}</Body>
    </Pressable>
  );
});

/**
 * Add food (R140, R141), a modal over Fuel: `date` is the day it logs for (the day Fuel is showing, R148; today without
 * one) and `mode=quick` opens on Quick add. Search finds foods on the phone through the food lookup, with your recent
 * foods before anything is typed; a food opens its servings, and **Add** logs it, empties the search and stays, saying
 * "Added {name}." so a meal goes in one visit. **New food** opens your own food's editor with the search as its name;
 * saved, it comes back here and opens its servings. **Done** closes; a quick add typed and not added asks first.
 */
function AddFood() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const locale = deviceLocale();
  // Read once: left open past midnight, it still logs for the day it says.
  const [today] = useState(() => toLocalDate(Date.now()));
  const localDate = typeof params.date === 'string' && LOCAL_DATE.test(params.date) ? params.date : today;
  const [mode, setMode] = useState<Mode>(params.mode === 'quick' ? 'quick' : 'search');
  const [query, setQuery] = useState('');
  const [quickDraft, setQuickDraft] = useState<QuickAddDraft>(EMPTY_QUICK_ADD);
  const [added, setAdded] = useState<string | null>(null);
  const [servingsFor, setServingsFor] = useState<FoodPerServing | null>(null);
  const [askDiscard, setAskDiscard] = useState(false);

  const searching = query.trim() !== '';
  // The food list is read once per data version (and on focus), with its names folded once; a keystroke only searches it
  // (R140, the same rules as `createLocalFoodLookup`).
  const allFoods = useDbQuery(listFoods);
  const search = useMemo(() => indexFoods(allFoods), [allFoods]);
  const recent = useDbQuery(recentFoods);
  const foods = useMemo(() => (searching ? search(query) : recent), [searching, search, query, recent]);

  const changed = quickAddStarted(quickDraft);
  /** Read by the back button's listener, which is added once. */
  const changedRef = useRef(changed);
  changedRef.current = changed;

  const done = () => {
    Keyboard.dismiss();
    if (changedRef.current) setAskDiscard(true);
    else close();
  };
  const doneRef = useRef(done);
  doneRef.current = done;

  // Only while this screen is in front: under the food editor, the back button is the editor's.
  useFocusEffect(
    useCallback(() => {
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!changedRef.current) return false;
        doneRef.current();
        return true;
      });
      return () => back.remove();
    }, []),
  );

  const choose = useCallback((food: FoodPerServing) => {
    flushAll();
    Keyboard.dismiss();
    setServingsFor(food);
  }, []);

  /** Whether the screen has had its first focus, which is its opening. */
  const opened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      const created = useCreatedFood.getState().take();
      // At opening, anything waiting was left by an earlier screen and is dropped.
      if (!opened.current) {
        opened.current = true;
        return;
      }
      const food = created === null ? null : getFood(db, created);
      // The editor is still going away; the sheet rises once it has.
      if (food !== null) afterSheetCloses(() => setServingsFor(food));
    }, [db]),
  );

  const logged = (name: string) => {
    const message = `Added ${name}.`;
    setAdded(message);
    announce(message);
  };

  const addedFromSheet = (name: string) => {
    setServingsFor(null);
    setQuery('');
    logged(name);
  };

  const editFood = (id: string) => {
    setServingsFor(null);
    afterSheetCloses(() => router.push({ pathname: '/food/[id]', params: { id } }));
  };

  // A double tap on New food opens one editor.
  const once = useOnce();
  const newFood = () =>
    once(() => {
      flushAll();
      Keyboard.dismiss();
      router.push({ pathname: '/food/[id]', params: { id: 'new', name: query.trim(), from: 'add' } });
    });

  const header = (
    <View style={{ paddingHorizontal: 16, gap: 16, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -12, paddingTop: 8 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Add food
        </Display>
        <Button label="Done" variant="quiet" onPress={done} />
      </View>
      <Body muted style={{ marginTop: -12 }}>{`Logging for ${calendarDayInSentence(localDate, today, locale)}`}</Body>
      <ModeControl value={mode} onChange={(m) => { Keyboard.dismiss(); setMode(m); }} />
      {/* Not a live region: `announce()` says it, and a live region would say it again on Android. */}
      {added !== null ? <Body weight={600}>{added}</Body> : null}
      {mode === 'search' ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search foods"
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Search foods"
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
          <View style={{ flexDirection: 'row' }}>
            <Button label="New food" variant="secondary" size="compact" onPress={newFood} />
          </View>
          {!searching && foods.length > 0 ? <Label style={{ marginTop: 8 }}>Recent</Label> : null}
        </View>
      ) : (
        <QuickAddForm localDate={localDate} draft={quickDraft} onChange={setQuickDraft} onAdded={logged} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* The swipe down would close the screen without asking, so it is held while a quick add is typed. */}
      <Stack.Screen options={{ gestureEnabled: !changed }} />
      <FlatList
        data={mode === 'search' ? foods : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FoodRow food={item} onChoose={choose} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          mode === 'search' ? (
            <Body muted style={{ textAlign: 'center', padding: 24 }}>
              {searching ? `No food called ${query.trim()}.` : 'Search the food list, or make your own.'}
            </Body>
          ) : null
        }
        // Rows wrap at large text, so their heights are not known ahead: a screenful is drawn, the rest as it scrolls.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        style={{ flex: 1, width: '100%', maxWidth: 512, alignSelf: 'center' }}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 + insets.bottom }}
      />
      <ServingsSheet food={servingsFor} localDate={localDate} onClose={() => setServingsFor(null)} onAdded={addedFromSheet} onEdit={editFood} />
      <ConfirmSheet
        visible={askDiscard}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        primary="cancel"
        onConfirm={() => {
          setAskDiscard(false);
          // Typed and not added: it goes, and so does the guard.
          changedRef.current = false;
          afterSheetCloses(close);
        }}
        onCancel={() => setAskDiscard(false)}
      />
    </View>
  );
}

/**
 * The add screen, or without Pro the pitch in its place (R151) with **Done** to close: Pro lapsing while it is open
 * locks it at once, and an address can't open it around the lock.
 */
export default function AddFoodScreen() {
  const pro = useIsPro();
  if (pro) return <AddFood />;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -12, marginBottom: 24 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Add food
        </Display>
        <Button label="Done" variant="quiet" onPress={close} />
      </View>
      <ProPitch context="tab" />
    </Screen>
  );
}
