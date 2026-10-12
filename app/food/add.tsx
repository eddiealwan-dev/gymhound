import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { BackHandler, FlatList, Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../src/db/DbProvider';
import { getFood, recentFoods, saveOnlineFood } from '../../src/db/repositories/foodsRepo';
import { calendarDayInSentence, toLocalDate } from '../../src/domain/dates';
import { type FoodPerServing, kcalProteinSpoken, kcalProteinText } from '../../src/domain/fuel';
import type { OnlineFood } from '../../src/domain/openFoodFacts';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { createLocalFoodLookup } from '../../src/platform/foodLookup';
import { deviceLocale } from '../../src/platform/locale';
import { searchOnline, type SearchResult } from '../../src/platform/openFoodFacts';
import { useCreatedFood } from '../../src/state/createdFood';
import { bumpData, useDataVersion, useDbQuery } from '../../src/state/dataVersion';
import { flushAll } from '../../src/state/draftFlush';
import { Button } from '../../src/ui/Button';
import { EMPTY_QUICK_ADD, QuickAddForm, quickAddStarted, type QuickAddDraft } from '../../src/ui/fuel/QuickAddForm';
import { ServingsSheet } from '../../src/ui/fuel/ServingsSheet';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { Segmented } from '../../src/ui/Segmented';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { Body, Display, Label } from '../../src/ui/Text';
import { fonts } from '../../src/ui/theme';
import { useTheme } from '../../src/ui/ThemeProvider';
import { useOnce } from '../../src/ui/useOnce';
import { useKeyboardHeight } from '../../src/ui/useSafeScroll';

type Mode = 'search' | 'quick';

const MODES: { value: Mode; label: string }[] = [
  { value: 'search', label: 'Search' },
  { value: 'quick', label: 'Quick add' },
];

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A row of the search list: a food on the phone, one found online, or a line between them. */
type Item =
  | { kind: 'food'; key: string; food: FoodPerServing }
  | { kind: 'online'; key: string; food: OnlineFood }
  | { kind: 'heading'; key: string; text: string }
  | { kind: 'note'; key: string; text: string };

/** What Search online found for a query, or that it is still looking. */
type OnlineSearch = { query: string; result: SearchResult | 'searching' };

const ONLINE_NOTES = {
  offline: "Couldn't reach Open Food Facts. Check your connection and try again.",
  unavailable: "Open Food Facts didn't answer. Try again in a minute.",
} as const;

/** Closes the screen. With nothing to go back to (opened by address, or reloaded), it lands on Fuel. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/fuel');
}

/** A food: its name, then "{serving} · {kcal} kcal · {protein} g protein", and " · Yours" for your own. Tapping opens its servings. */
const FoodRow = memo(function FoodRow({ food, onChoose }: { food: FoodPerServing; onChoose: (food: FoodPerServing) => void }) {
  return <FoodLine food={food} yours={food.source === 'custom'} onPress={() => onChoose(food)} />;
});

/** A food found on Open Food Facts, drawn as a food on the phone is; tapping keeps it on the phone and opens its servings. */
const OnlineRow = memo(function OnlineRow({ food, onChoose }: { food: OnlineFood; onChoose: (food: OnlineFood) => void }) {
  return <FoodLine food={food} yours={false} onPress={() => onChoose(food)} />;
});

function FoodLine({ food, yours, onPress }: { food: FoodPerServing | OnlineFood; yours: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const locale = deviceLocale();
  const amounts = kcalProteinText(food, locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${food.name}, ${food.servingLabel}, ${kcalProteinSpoken(food, locale)}${yours ? ', Yours' : ''}`}
      onPress={onPress}
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
}

/**
 * Add food (R140, R141), a modal over Fuel: `date` is the day it logs for (the day Fuel is showing, R148; today without
 * one) and `mode=quick` opens on Quick add. Search finds foods on the phone through the food lookup (about 8,300, R545),
 * with your recent foods before anything is typed; **Search online** asks Open Food Facts for packaged foods (R546) and
 * **Scan barcode** reads a pack's code (R547). A food opens its servings, and **Add** logs it, empties the search and stays, saying
 * "Added {name}." so a meal goes in one visit. **New food** opens your own food's editor with the search as its name;
 * saved, it comes back here and opens its servings. **Done** closes; a quick add typed and not added asks first.
 */
function AddFood() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
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
  const [online, setOnline] = useState<OnlineSearch | null>(null);

  const searching = query.trim() !== '';
  // Search goes through the food lookup (R140), which reads the food list and folds its names once per data version: a
  // keystroke only searches what was read, and a food saved since shows once its write bumps the version.
  const lookup = useMemo(() => createLocalFoodLookup(db, () => useDataVersion.getState().version), [db]);
  const version = useDataVersion((state) => state.version);
  const recent = useDbQuery(recentFoods);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new data version means the lookup reads the list again
  const foods = useMemo(() => (searching ? lookup.searchLocal(query) : recent), [searching, lookup, query, recent, version]);

  const trimmed = query.trim();
  /** Search online's answer for what is in the field now; a changed search shows the button again. */
  const onlineNow = online !== null && online.query === trimmed ? online.result : null;
  const items = useMemo((): Item[] => {
    const local = foods.map((food): Item => ({ kind: 'food', key: food.id, food }));
    if (!searching || onlineNow === null) return local;
    const top: Item[] = [{ kind: 'heading', key: 'h-online', text: 'Online · Open Food Facts' }];
    if (onlineNow === 'searching') top.push({ kind: 'note', key: 'n-online', text: 'Searching Open Food Facts…' });
    else if (onlineNow.status !== 'ok') top.push({ kind: 'note', key: 'n-online', text: ONLINE_NOTES[onlineNow.status] });
    else if (onlineNow.foods.length === 0) top.push({ kind: 'note', key: 'n-online', text: `Nothing found online for ${trimmed}.` });
    else {
      // One already kept on the phone shows once, under On your phone.
      const onPhone = new Set(foods.map((f) => f.id));
      for (const food of onlineNow.foods) if (!onPhone.has(`off-${food.barcode}`)) top.push({ kind: 'online', key: `off-${food.barcode}`, food });
    }
    return local.length === 0 ? top : [...top, { kind: 'heading', key: 'h-phone', text: 'On your phone' }, ...local];
  }, [foods, searching, onlineNow, trimmed]);

  /** Search online (R546): asked for, never as you type, since Open Food Facts allows few searches a minute. */
  const runOnlineSearch = () => {
    if (trimmed === '') return;
    Keyboard.dismiss();
    setOnline({ query: trimmed, result: 'searching' });
    announce('Searching Open Food Facts');
    void searchOnline(trimmed).then((result) => {
      setOnline((current) => (current !== null && current.query === trimmed ? { query: trimmed, result } : current));
      if (result.status === 'ok') announce(result.foods.length === 0 ? `Nothing found online for ${trimmed}.` : `${result.foods.length} found online.`);
      else announce(ONLINE_NOTES[result.status]);
    });
  };

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

  /** A food found online is kept on the phone first (R546), so it logs, shows in Recent and works offline after. */
  const chooseOnline = useCallback(
    (found: OnlineFood) => {
      const id = saveOnlineFood(db, found);
      bumpData();
      const food = getFood(db, id);
      if (food !== null) choose(food);
    },
    [db, choose],
  );

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
  /** Scan barcode (R547): the food it finds comes back here with its servings open, as New food's does. */
  const scan = () =>
    once(() => {
      flushAll();
      Keyboard.dismiss();
      router.push('/food/scan');
    });

  const header = (
    <View style={{ paddingHorizontal: 16, gap: 16, paddingBottom: 8 }}>
      {/* Done steps back by the quiet button's padding, so its word ends on the gutter. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -20, paddingTop: 8 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Add food
        </Display>
        <Button label="Done" variant="quiet" onPress={done} />
      </View>
      <Body muted style={{ marginTop: -12 }}>{`Logging for ${calendarDayInSentence(localDate, today, locale)}`}</Body>
      <Segmented
        label="Add by"
        options={MODES}
        value={mode}
        onChange={(m) => {
          Keyboard.dismiss();
          // "Added {name}." belongs to the side it was said on.
          if (m !== mode) setAdded(null);
          setMode(m);
        }}
      />
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
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              color: colors.text,
              fontFamily: fonts.body400,
              fontSize: 16,
            }}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {/* Scanning needs the phone's camera; the web build has none to offer. */}
            {Platform.OS !== 'web' ? <Button label="Scan barcode" variant="secondary" size="compact" onPress={scan} /> : null}
            {searching && onlineNow === null ? (
              <Button label="Search online" variant="secondary" size="compact" accessibilityLabel={`Search online for ${trimmed}`} onPress={runOnlineSearch} />
            ) : null}
            {searching && onlineNow !== null && onlineNow !== 'searching' && onlineNow.status !== 'ok' ? (
              <Button label="Try again" variant="secondary" size="compact" accessibilityLabel={`Search online again for ${trimmed}`} onPress={runOnlineSearch} />
            ) : null}
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
        data={mode === 'search' ? items : []}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          item.kind === 'food' ? (
            <FoodRow food={item.food} onChoose={choose} />
          ) : item.kind === 'online' ? (
            <OnlineRow food={item.food} onChoose={chooseOnline} />
          ) : item.kind === 'heading' ? (
            <Label style={{ paddingHorizontal: 16, marginTop: 16, marginBottom: 4 }}>{item.text}</Label>
          ) : (
            <Body muted style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              {item.text}
            </Body>
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          mode === 'search' ? (
            <Body muted style={{ textAlign: 'center', padding: 24 }}>
              {searching ? `No food called ${trimmed}. Search online, scan its barcode, or make your own.` : 'Search the food list, scan a barcode, or make your own.'}
            </Body>
          ) : null
        }
        // Rows wrap at large text, so their heights are not known ahead: a screenful is drawn, the rest as it scrolls.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={{ flex: 1, width: '100%', maxWidth: 512, alignSelf: 'center' }}
        // Room under the rows for the keyboard, so the last results scroll above it (R560: no iOS keyboard insets).
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 + Math.max(insets.bottom, keyboard) }}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -20, marginBottom: 24 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Add food
        </Display>
        <Button label="Done" variant="quiet" onPress={close} />
      </View>
      <ProPitch context="tab" />
    </Screen>
  );
}
