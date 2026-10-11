/** @jest-environment node */
import { router, Stack } from 'expo-router';
import { BackHandler, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import FoodEditorScreen from '../../app/food/[id]';
import { archiveCustomFood, createCustomFood, getFood, listFoods } from '../db/repositories/foodsRepo';
import { listEntries, logFood } from '../db/repositories/foodLogRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { createLocalFoodLookup } from '../platform/foodLookup';
import { useCreatedFood } from '../state/createdFood';
import { Footer } from './Footer';
import { ConfirmSheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockParams: { id: string; name?: string; from?: string };

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: () => undefined,
  Stack: { Screen: jest.fn(() => null) },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const NOW = new Date(2026, 9, 11, 9, 0, 0).getTime();
const YESTERDAY = '2026-10-10';
const EGG = 'fdc-171287';
const SHAKE = { name: 'Gran shake', servingLabel: '1 bottle', servingGrams: 330, kcal: 250, proteinG: 40, carbsG: 10, fatG: 5 };

const mounted: ReactTestRenderer[] = [];

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockDb = seededDb();
  mockParams = { id: 'new' };
  useCreatedFood.setState({ id: null });
  mockAnnounce.mockClear();
  jest.mocked(router.back).mockClear();
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
    tree = create(<FoodEditorScreen />);
  });
  mounted.push(tree);
  return tree;
}

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
const confirm = (tree: ReactTestRenderer, title: string) => tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === title);

function fillShake(tree: ReactTestRenderer) {
  type(tree, 'Name', 'Gran shake');
  type(tree, 'Serving', '1 bottle');
  type(tree, 'Serving weight (g, optional)', '330');
  type(tree, 'Calories per serving', '250');
  type(tree, 'Protein (g)', '40');
  type(tree, 'Carbs (g)', '10');
  type(tree, 'Fat (g)', '5');
}

describe('a new food (R144)', () => {
  it('is titled New food, starts from the name it was given, and has no Delete', () => {
    mockParams = { id: 'new', name: 'Gran shake', from: 'add' };
    const tree = mount();
    expect(allText(tree)).toContain('New food');
    expect(field(tree, 'Name').props.value).toBe('Gran shake');
    expect(field(tree, 'Serving').props.placeholder).toBe('1 cup');
    expect(field(tree, 'Serving weight (g, optional)').props.keyboardType).toBe('decimal-pad');
    expect(field(tree, 'Calories per serving').props.keyboardType).toBe('decimal-pad');
    expect(pressables(tree, 'Delete food')).toHaveLength(0);
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('saves, hands the food to the add screen and goes back', () => {
    mockParams = { id: 'new', name: '', from: 'add' };
    const tree = mount();
    fillShake(tree);
    press(tree, 'Save');
    const mine = listFoods(mockDb).filter((f) => f.source === 'custom');
    expect(mine).toEqual([{ ...SHAKE, id: expect.any(String), source: 'custom' }]);
    expect(useCreatedFood.getState().id).toBe(mine[0].id);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('opened from elsewhere, saves without handing it on', () => {
    mockParams = { id: 'new' };
    const tree = mount();
    fillShake(tree);
    press(tree, 'Save');
    expect(useCreatedFood.getState().id).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a blank serving weight and macros save as none and 0', () => {
    const tree = mount();
    type(tree, 'Name', 'Toast');
    type(tree, 'Serving', '1 slice');
    type(tree, 'Calories per serving', '80');
    press(tree, 'Save');
    expect(listFoods(mockDb).find((f) => f.name === 'Toast')).toMatchObject({ servingGrams: null, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('says what stops Save, tells the screen reader, and saves nothing', () => {
    const tree = mount();
    press(tree, 'Save');
    const text = allText(tree);
    expect(text).toContain('Give the food a name.');
    expect(text).toContain('Say what one serving is, like 1 cup.');
    expect(text).toContain('Enter the calories in one serving.');
    expect(mockAnnounce).toHaveBeenCalledWith('Give the food a name. Say what one serving is, like 1 cup. Enter the calories in one serving.');
    expect(listFoods(mockDb).filter((f) => f.source === 'custom')).toHaveLength(0);
    expect(router.back).not.toHaveBeenCalled();
  });

  it('a bad number shows "Check this number"', () => {
    const tree = mount();
    fillShake(tree);
    type(tree, 'Calories per serving', 'abc');
    press(tree, 'Save');
    expect(allText(tree)).toContain('Check this number');
    expect(listFoods(mockDb).filter((f) => f.source === 'custom')).toHaveLength(0);
  });

  it('refuses a name you already gave one of your foods, ignoring case', () => {
    createCustomFood(mockDb, SHAKE);
    const tree = mount();
    fillShake(tree);
    type(tree, 'Name', 'GRAN SHAKE');
    press(tree, 'Save');
    expect(allText(tree)).toContain('You already have a food called Gran shake.');
    expect(listFoods(mockDb).filter((f) => f.source === 'custom')).toHaveLength(1);
  });
});

describe('editing your own food', () => {
  it('prefills, saves, and leaves a day already logged unchanged (§6)', () => {
    const id = createCustomFood(mockDb, SHAKE);
    logFood(mockDb, id, 2, YESTERDAY, NOW - 86_400_000);
    mockParams = { id };
    const tree = mount();
    expect(allText(tree)).toContain('Edit food');
    expect(field(tree, 'Name').props.value).toBe('Gran shake');
    expect(field(tree, 'Serving weight (g, optional)').props.value).toBe('330');
    expect(field(tree, 'Calories per serving').props.value).toBe('250');
    type(tree, 'Name', 'Gran shake v2');
    type(tree, 'Calories per serving', '300');
    press(tree, 'Save');
    expect(getFood(mockDb, id)).toMatchObject({ name: 'Gran shake v2', kcal: 300 });
    expect(listEntries(mockDb, YESTERDAY)).toMatchObject([{ name: 'Gran shake', kcal: 500, servingLabel: '1 bottle' }]);
    expect(useCreatedFood.getState().id).toBeNull();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps its own name without calling it a duplicate', () => {
    const id = createCustomFood(mockDb, SHAKE);
    mockParams = { id };
    const tree = mount();
    type(tree, 'Protein (g)', '42');
    press(tree, 'Save');
    expect(getFood(mockDb, id)?.proteinG).toBe(42);
  });

  it('Delete food asks, then archives it: gone from the list and search, the logged day kept', () => {
    const id = createCustomFood(mockDb, SHAKE);
    logFood(mockDb, id, 1, YESTERDAY, NOW - 86_400_000);
    mockParams = { id };
    const tree = mount();
    press(tree, 'Delete food');
    const ask = confirm(tree, 'Delete Gran shake?')!;
    expect(ask.props.visible).toBe(true);
    expect(ask.props.body).toBe("Days you've logged keep it. It leaves the food list.");
    expect(ask.props.confirmLabel).toBe('Delete');
    expect(ask.props.cancelLabel).toBe('Keep');
    act(() => ask.props.onCancel());
    expect(getFood(mockDb, id)).not.toBeNull();
    expect(listFoods(mockDb).some((f) => f.id === id)).toBe(true);

    press(tree, 'Delete food');
    act(() => confirm(tree, 'Delete Gran shake?')!.props.onConfirm());
    act(() => jest.runAllTimers());
    expect(listFoods(mockDb).some((f) => f.id === id)).toBe(false);
    expect(createLocalFoodLookup(mockDb).searchLocal('gran shake')).toHaveLength(0);
    expect(listEntries(mockDb, YESTERDAY)).toMatchObject([{ name: 'Gran shake' }]);
    expect(mockAnnounce).toHaveBeenCalledWith('Deleted Gran shake.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("a bundled food can't be edited", () => {
    mockParams = { id: EGG };
    const tree = mount();
    expect(allText(tree)).toContain("That food can't be edited.");
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    press(tree, 'Back');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("an archived food's address says it isn't here", () => {
    const id = createCustomFood(mockDb, SHAKE);
    archiveCustomFood(mockDb, id);
    mockParams = { id };
    const tree = mount();
    expect(allText(tree)).toContain("That isn't here.");
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });

  it('a food that is not there says so', () => {
    mockParams = { id: 'nope' };
    const tree = mount();
    expect(allText(tree)).toContain("That isn't here.");
  });
});

describe('leaving with changes (Discard changes?)', () => {
  it('Close without changes leaves at once', () => {
    mockParams = { id: 'new', name: 'Gran shake', from: 'add' };
    const tree = mount();
    press(tree, 'Close');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Close with changes asks; Keep editing stays, Discard leaves', () => {
    const tree = mount();
    type(tree, 'Name', 'Toast');
    press(tree, 'Close');
    expect(router.back).not.toHaveBeenCalled();
    const ask = confirm(tree, 'Discard changes?')!;
    expect(ask.props.visible).toBe(true);
    expect(ask.props.confirmLabel).toBe('Discard');
    expect(ask.props.cancelLabel).toBe('Keep editing');
    expect(ask.props.primary).toBe('cancel');
    act(() => ask.props.onCancel());
    expect(field(tree, 'Name').props.value).toBe('Toast');
    press(tree, 'Close');
    act(() => confirm(tree, 'Discard changes?')!.props.onConfirm());
    act(() => jest.runAllTimers());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(listFoods(mockDb).filter((f) => f.source === 'custom')).toHaveLength(0);
  });

  it('holds the swipe down and the Android back button while there are changes', () => {
    const listeners: (() => boolean)[] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      listeners.push(handler as () => boolean);
      return { remove: () => undefined };
    });
    const tree = mount();
    const gesture = () => {
      const calls = jest.mocked(Stack.Screen).mock.calls;
      return (calls[calls.length - 1][0] as { options: { gestureEnabled: boolean } }).options.gestureEnabled;
    };
    expect(gesture()).toBe(true);
    expect(listeners.every((l) => l() === false)).toBe(true);
    type(tree, 'Calories per serving', '100');
    expect(gesture()).toBe(false);
    let handled = false;
    act(() => {
      handled = listeners.some((l) => l());
    });
    expect(handled).toBe(true);
    expect(confirm(tree, 'Discard changes?')!.props.visible).toBe(true);
  });
});
