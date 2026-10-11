/** @jest-environment node */
import { router, Stack } from 'expo-router';
import { BackHandler, Keyboard, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import AddFoodScreen from '../../app/food/add';
import { createCustomFood, getFood } from '../db/repositories/foodsRepo';
import { listEntries, logFood } from '../db/repositories/foodLogRepo';
import * as foodsRepo from '../db/repositories/foodsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { useCreatedFood } from '../state/createdFood';
import { Footer } from './Footer';
import { ConfirmSheet, Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real, seeded database: the screen searches the bundled foods and logs through the food log, and every write bumps
// the data version, which makes it read again, as on the phone.
let mockDb: Db;
let mockParams: { date?: string; mode?: string };
/**
 * Every focus effect registered, with the clean-up its last run returned: a test plays the editor opening over the
 * screen (blur: the clean-ups run) and closing (focus: the effects run again).
 */
const mockFocusEffects = new Map<() => void | (() => void), void | (() => void)>();

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        mockFocusEffects.set(effect, effect());
        return () => {
          const cleanup = mockFocusEffects.get(effect);
          mockFocusEffects.delete(effect);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [effect]);
    },
    Stack: { Screen: jest.fn(() => null) },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: (text: string) => mockAnnounce(text) }));
const mockFlushAll = jest.fn();
jest.mock('../state/draftFlush', () => ({ flushAll: () => mockFlushAll() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** 9:00 on Sunday 11 October 2026, local time: "now" for every test. */
const NOW = new Date(2026, 9, 11, 9, 0, 0).getTime();
const TODAY = '2026-10-11';
const YESTERDAY = '2026-10-10';
const EGG = 'fdc-171287';

const mounted: ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockDb = seededDb();
  mockParams = {};
  useCreatedFood.setState({ id: null });
  mockAnnounce.mockClear();
  mockFlushAll.mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(Stack.Screen).mockClear();
});

afterEach(() => {
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<AddFoodScreen />);
  });
  mounted.push(tree);
  return tree;
}

/** Every string drawn, joined. */
function allText(tree: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out.join('\n');
}

/** What can be pressed by that VoiceOver label, or (with none) by its text. */
const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => {
  const byLabel = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label && typeof n.type !== 'string');
  if (byLabel.length > 0) return byLabel;
  return tree.root.findAll(
    (n) =>
      typeof n.type !== 'string' &&
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole !== undefined &&
      n.props.accessibilityLabel === undefined &&
      n.findAll((c) => c.children.includes(label)).length > 0,
  );
};

const press = (tree: ReactTestRenderer, label: string) => {
  const found = pressables(tree, label);
  if (found.length === 0) throw new Error(`Nothing to press called ${label}`);
  act(() => found[found.length - 1].props.onPress());
};

const field = (tree: ReactTestRenderer, label: string) => {
  const found = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label);
  if (!found) throw new Error(`No field called ${label}`);
  return found;
};
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label).props.onChangeText(text));

const openSheet = (tree: ReactTestRenderer) => tree.root.findAllByType(Sheet).find((s) => s.props.visible);
const blur = () =>
  act(() =>
    [...mockFocusEffects].forEach(([effect, cleanup]) => {
      if (typeof cleanup === 'function') cleanup();
      mockFocusEffects.set(effect, undefined);
    }),
  );
const focusAgain = () => act(() => [...mockFocusEffects.keys()].forEach((effect) => mockFocusEffects.set(effect, effect())));

/** The Android back button's listeners now registered, as BackHandler keeps them. */
function spyBackHandler(): Set<() => boolean> {
  const listeners = new Set<() => boolean>();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const listener = handler as () => boolean;
    listeners.add(listener);
    return { remove: () => void listeners.delete(listener) };
  });
  return listeners;
}

describe('/food/add (R140, R141)', () => {
  it('says which day it logs for: today without a date', () => {
    const tree = mount();
    const text = allText(tree);
    expect(text).toContain('Add food');
    expect(text).toContain('Logging for Today');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('the date param wins over today', () => {
    mockParams = { date: YESTERDAY };
    expect(allText(mount())).toContain('Logging for Yesterday');
    mockParams = { date: '2026-10-03' };
    expect(allText(mount())).toContain('Logging for Sat, Oct 3');
  });

  it('with nothing logged and no search, points to the list and your own foods', () => {
    const tree = mount();
    expect(allText(tree)).toContain('Search the food list, or make your own.');
    expect(field(tree, 'Search foods').props.placeholder).toBe('Search foods');
    expect(field(tree, 'Search foods').props.autoFocus).toBe(true);
  });

  it('searching "egg" lists the egg with its serving, calories and protein', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    const text = allText(tree);
    expect(text).toContain('Egg, large');
    expect(text).toContain('1 large · 72 kcal · 6 g protein');
  });

  it('a search with no match says so', () => {
    const tree = mount();
    type(tree, 'Search foods', 'zzqx');
    expect(allText(tree)).toContain('No food called zzqx.');
  });

  it('tags your own foods "Yours"', () => {
    createCustomFood(mockDb, { name: 'Gran shake', servingLabel: '1 bottle', servingGrams: null, kcal: 250, proteinG: 40, carbsG: 10, fatG: 5 });
    const tree = mount();
    type(tree, 'Search foods', 'gran');
    expect(allText(tree)).toContain('1 bottle · 250 kcal · 40 g protein · Yours');
  });

  it('shows Recent foods once something is logged', () => {
    logFood(mockDb, EGG, 1, TODAY, NOW - 60_000);
    const tree = mount();
    const text = allText(tree);
    expect(text).toContain('Recent');
    expect(text).toContain('Egg, large');
    expect(text).not.toContain('Search the food list, or make your own.');
  });

  it('logs 1,5 servings for the date param, clears the search, stays open and says so', () => {
    mockParams = { date: YESTERDAY };
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    expect(dismiss).toHaveBeenCalled();
    expect(mockFlushAll).toHaveBeenCalled();
    const sheet = openSheet(tree)!;
    expect(sheet).toBeTruthy();
    expect(allText(tree)).toContain('1 large (50 g)');
    expect(field(tree, 'Servings').props.value).toBe('1');
    expect(field(tree, 'Servings').props.keyboardType).toBe('decimal-pad');
    type(tree, 'Servings', '1,5');
    expect(allText(tree)).toContain('108 kcal · 9 g protein');
    press(tree, 'Add');

    const entries = listEntries(mockDb, YESTERDAY);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Egg, large', servings: 1.5 });
    expect(entries[0].kcal).toBeCloseTo(108);
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
    expect(openSheet(tree)).toBeUndefined();
    expect(field(tree, 'Search foods').props.value).toBe('');
    expect(allText(tree)).toContain('Added Egg, large.');
    expect(mockAnnounce).toHaveBeenCalledWith('Added Egg, large.');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('the chips set the servings', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, '1 and a half servings');
    expect(field(tree, 'Servings').props.value).toBe('1.5');
    press(tree, 'Half a serving');
    expect(field(tree, 'Servings').props.value).toBe('0.5');
    expect(allText(tree)).toContain('36 kcal · 3 g protein');
  });

  it('bad servings show "Check this number", say it, and log nothing', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    type(tree, 'Servings', '0');
    press(tree, 'Add');
    expect(allText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
    expect(openSheet(tree)).toBeTruthy();
  });

  it('Cancel closes the servings without logging', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, 'Cancel');
    expect(openSheet(tree)).toBeUndefined();
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
  });

  it('offers Edit food only for your own food, opening it after the sheet closes', () => {
    const id = createCustomFood(mockDb, { name: 'Gran shake', servingLabel: '1 bottle', servingGrams: null, kcal: 250, proteinG: 40, carbsG: 10, fatG: 5 });
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    expect(pressables(tree, 'Edit food')).toHaveLength(0);
    press(tree, 'Cancel');

    type(tree, 'Search foods', 'gran');
    press(tree, 'Gran shake, 1 bottle, 250 kcal, 40 g protein, Yours');
    expect(allText(tree)).not.toContain('1 bottle (');
    press(tree, 'Edit food');
    expect(openSheet(tree)).toBeUndefined();
    expect(router.push).not.toHaveBeenCalled();
    act(() => jest.runAllTimers());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/food/[id]', params: { id } });
  });

  it('New food opens the editor with the search as its name', () => {
    const tree = mount();
    type(tree, 'Search foods', ' Gran shake ');
    press(tree, 'New food');
    expect(router.push).toHaveBeenCalledWith({ pathname: '/food/[id]', params: { id: 'new', name: 'Gran shake', from: 'add' } });
  });

  it('back in focus after a new food is saved, opens its servings', () => {
    const tree = mount();
    const id = createCustomFood(mockDb, { name: 'Gran shake', servingLabel: '1 bottle', servingGrams: null, kcal: 250, proteinG: 40, carbsG: 10, fatG: 5 });
    act(() => useCreatedFood.getState().set(id));
    focusAgain();
    // The sheet rises once the editor has gone.
    expect(openSheet(tree)).toBeUndefined();
    act(() => jest.runAllTimers());
    expect(openSheet(tree)).toBeTruthy();
    expect(allText(tree)).toContain('Gran shake');
    expect(useCreatedFood.getState().id).toBeNull();
    press(tree, 'Add');
    expect(listEntries(mockDb, TODAY)).toMatchObject([{ foodId: id, servings: 1 }]);
  });

  it('drops a food left waiting by an earlier screen when it opens', () => {
    act(() => useCreatedFood.getState().set(EGG));
    const tree = mount();
    expect(openSheet(tree)).toBeUndefined();
    expect(useCreatedFood.getState().id).toBeNull();
  });

  it('Done closes', () => {
    const tree = mount();
    press(tree, 'Done');
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('quick add (R143)', () => {
  it('opens on Quick add with mode=quick', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    expect(field(tree, 'Calories')).toBeTruthy();
    expect(field(tree, 'Protein (g)')).toBeTruthy();
    expect(field(tree, 'Carbs (g)')).toBeTruthy();
    expect(field(tree, 'Fat (g)')).toBeTruthy();
    expect(field(tree, 'Name (optional)')).toBeTruthy();
    expect(tree.root.findAllByType(TextInput).some((n) => n.props.accessibilityLabel === 'Search foods')).toBe(false);
  });

  it('the Quick add segment switches to it, and Search back', () => {
    const tree = mount();
    press(tree, 'Quick add');
    expect(field(tree, 'Calories')).toBeTruthy();
    press(tree, 'Search');
    expect(field(tree, 'Search foods')).toBeTruthy();
  });

  it('with only protein, logs "Quick add" for the day, clears and says so', () => {
    mockParams = { mode: 'quick', date: YESTERDAY };
    const tree = mount();
    type(tree, 'Protein (g)', '30');
    press(tree, 'Add');
    const entries = listEntries(mockDb, YESTERDAY);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'Quick add', foodId: null, kcal: 0, proteinG: 30, carbsG: 0, fatG: 0 });
    expect(field(tree, 'Protein (g)').props.value).toBe('');
    expect(allText(tree)).toContain('Added Quick add.');
    expect(mockAnnounce).toHaveBeenCalledWith('Added Quick add.');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('logs a named quick add with every macro, a comma read as a point', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Name (optional)', 'Burrito');
    type(tree, 'Calories', '650');
    type(tree, 'Protein (g)', '32,5');
    type(tree, 'Carbs (g)', '70');
    type(tree, 'Fat (g)', '22');
    press(tree, 'Add');
    expect(listEntries(mockDb, TODAY)).toMatchObject([{ name: 'Burrito', kcal: 650, proteinG: 32.5, carbsG: 70, fatG: 22 }]);
    expect(mockAnnounce).toHaveBeenCalledWith('Added Burrito.');
  });

  it('needs calories or protein', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Carbs (g)', '20');
    press(tree, 'Add');
    expect(allText(tree)).toContain('Enter calories or protein.');
    expect(mockAnnounce).toHaveBeenCalledWith('Enter calories or protein.');
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
  });

  it('a bad number shows "Check this number" beside it and logs nothing', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Calories', '20000');
    press(tree, 'Add');
    expect(allText(tree)).toContain('Check this number');
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
  });

  it('keeps what was typed when switching to Search and back', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Calories', '400');
    press(tree, 'Search');
    press(tree, 'Quick add');
    expect(field(tree, 'Calories').props.value).toBe('400');
  });

  it('Done with a quick add typed asks "Discard changes?" first', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Calories', '400');
    press(tree, 'Done');
    expect(router.back).not.toHaveBeenCalled();
    const ask = tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Discard changes?')!;
    expect(ask.props.visible).toBe(true);
    expect(ask.props.confirmLabel).toBe('Discard');
    expect(ask.props.cancelLabel).toBe('Keep editing');
    act(() => ask.props.onCancel());
    expect(router.back).not.toHaveBeenCalled();
    expect(field(tree, 'Calories').props.value).toBe('400');
    press(tree, 'Done');
    act(() => tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Discard changes?')!.props.onConfirm());
    act(() => jest.runAllTimers());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('holds the swipe down and the Android back button while a quick add is typed', () => {
    mockParams = { mode: 'quick' };
    const listeners = spyBackHandler();
    const tree = mount();
    const lastOptions = () => {
      const calls = jest.mocked(Stack.Screen).mock.calls;
      return (calls[calls.length - 1][0] as { options: { gestureEnabled: boolean } }).options;
    };
    expect(lastOptions().gestureEnabled).toBe(true);
    expect([...listeners].every((l) => l() === false)).toBe(true);
    type(tree, 'Calories', '400');
    expect(lastOptions().gestureEnabled).toBe(false);
    let handled = false;
    act(() => {
      handled = [...listeners].some((l) => l());
    });
    expect(handled).toBe(true);
    expect(tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Discard changes?')!.props.visible).toBe(true);
  });
});

describe('the food itself is untouched by logging', () => {
  it('logging copies, so the food is unchanged', () => {
    const before = getFood(mockDb, EGG);
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, 'Add');
    expect(getFood(mockDb, EGG)).toEqual(before);
  });
});

describe('review fixes', () => {
  it("lets the food editor's back button be its own while it is on top", () => {
    mockParams = { mode: 'quick' };
    const listeners = spyBackHandler();
    const tree = mount();
    type(tree, 'Calories', '400');
    expect(listeners.size).toBeGreaterThan(0);
    // New food opens the editor over this screen.
    blur();
    expect(listeners.size).toBe(0);
    // Back from the editor: this screen asks again.
    focusAgain();
    let handled = false;
    act(() => {
      handled = [...listeners].some((l) => l());
    });
    expect(handled).toBe(true);
    expect(tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Discard changes?')!.props.visible).toBe(true);
  });

  it('reads the food list once per data version, not on every keystroke', () => {
    const list = jest.spyOn(foodsRepo, 'listFoods');
    const tree = mount();
    const before = list.mock.calls.length;
    type(tree, 'Search foods', 'e');
    type(tree, 'Search foods', 'eg');
    type(tree, 'Search foods', 'egg');
    expect(list.mock.calls.length).toBe(before);
    expect(allText(tree)).toContain('Egg, large');
  });

  it('a double tap on Add logs one serving', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    const [add] = pressables(tree, 'Add').slice(-1);
    act(() => {
      add.props.onPress();
      add.props.onPress();
    });
    expect(listEntries(mockDb, TODAY)).toHaveLength(1);
  });

  it('the same food opened again can be added again', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, 'Add');
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, 'Add');
    expect(listEntries(mockDb, TODAY)).toHaveLength(2);
  });

  it('a double tap on quick add Add logs one entry', () => {
    mockParams = { mode: 'quick' };
    const tree = mount();
    type(tree, 'Protein (g)', '30');
    const [add] = pressables(tree, 'Add').slice(-1);
    act(() => {
      add.props.onPress();
      add.props.onPress();
    });
    expect(listEntries(mockDb, TODAY)).toHaveLength(1);
  });

  it('keeps the food drawn in the servings sheet while it closes', () => {
    const tree = mount();
    type(tree, 'Search foods', 'egg');
    press(tree, 'Egg, large, 1 large, 72 kcal, 6 g protein');
    press(tree, 'Cancel');
    // The closing sheet is still handed the egg, not an empty panel.
    const sheets = tree.root.findAllByType(Sheet).filter((s) => (s.props.children as { props?: { food?: { name: string } } } | null)?.props?.food?.name === 'Egg, large');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].props.visible).toBe(false);
  });
});
