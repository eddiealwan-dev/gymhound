/** @jest-environment node */
import { StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Fuel from '../../app/(tabs)/fuel';
import { createCustomFood } from '../db/repositories/foodsRepo';
import { listEntries, logFood, logQuickAdd, setFuelTargets } from '../db/repositories/foodLogRepo';
import { eq } from 'drizzle-orm';
import { foodLog, workouts } from '../db/schema';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { bumpData } from '../state/dataVersion';
import { Footer } from './Footer';
import { FoodEntrySheet } from './fuel/FoodEntrySheet';
import { Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the screen reads through the food log and settings, and every write bumps the data version.
let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));

// Focus callbacks run on mount, as on the phone; `refocus()` runs them again, as returning to the tab does.
const mockFocusCallbacks = new Set<() => void>();
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
    useFocusEffect: (cb: () => void | (() => void)) => {
      React.useEffect(() => {
        mockFocusCallbacks.add(cb as () => void);
        const cleanup = cb();
        return () => {
          mockFocusCallbacks.delete(cb as () => void);
          if (typeof cleanup === 'function') cleanup();
        };
      }, [cb]);
    },
  };
});

// Pro is a store the test flips, as the debug switch or a lapse would.
let mockPro = false;
const mockProListeners = new Set<() => void>();
jest.mock('../platform/entitlements', () => {
  const React = require('react');
  return {
    useIsPro: () =>
      React.useSyncExternalStore(
        (listener: () => void) => {
          mockProListeners.add(listener);
          return () => mockProListeners.delete(listener);
        },
        () => mockPro,
      ),
  };
});

// Other tasks fill these; here they only need to be placed.
jest.mock('./pro/ProPitch', () => {
  const { Text: T } = require('react-native');
  return { ProPitch: ({ context }: { context: string }) => <T>{`PRO PITCH ${context}`}</T> };
});
jest.mock('./fuel/TargetsForm', () => {
  const { Text: T } = require('react-native');
  return { TargetsForm: ({ submitLabel, initial }: { submitLabel: string; initial: unknown }) => <T>{`TARGETS FORM ${submitLabel} ${initial === null ? 'empty' : 'set'}`}</T> };
});
jest.mock('./fuel/FuelTrends', () => {
  const { Text: T } = require('react-native');
  return { FuelTrends: ({ today }: { today: string }) => <T>{`TRENDS ${today}`}</T> };
});
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: (text: string) => mockAnnounce(text) }));
const mockFlushAll = jest.fn();
jest.mock('../state/draftFlush', () => ({ flushAll: () => mockFlushAll() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** 9:00 on Sunday 11 October 2026, local time. */
const NOW = new Date(2026, 9, 11, 9, 0, 0).getTime();
const TODAY = '2026-10-11';
const YESTERDAY = '2026-10-10';
const TARGETS = {
  training: { kcal: 2800, protein: 200, carbs: null, fat: null },
  rest: { kcal: 2400, protein: 180, carbs: null, fat: null },
};
const shake = { name: 'Protein shake', servingLabel: '1 scoop', servingGrams: 32, kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5 };

let closeDb: () => void;
let nowSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockPro = false;
  mockAnnounce.mockClear();
  mockFlushAll.mockClear();
  mockPush.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  closeDb();
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Fuel />);
  });
  return tree;
}

function setPro(on: boolean): void {
  mockPro = on;
  act(() => mockProListeners.forEach((l) => l()));
}

function refocus(): void {
  act(() => [...mockFocusCallbacks].forEach((cb) => cb()));
}

function bump(): void {
  act(() => bumpData());
}

/** Every string drawn, in order. */
function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

const allText = (tree: ReactTestRenderer) => shownText(tree).join('\n');

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length > 0) return found;
  return tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === undefined &&
      n.findAll((c) => c.children.includes(label)).length > 0,
  );
};

const press = (tree: ReactTestRenderer, label: string) => {
  const found = pressables(tree, label);
  if (found.length === 0) throw new Error(`Nothing to press called ${label}`);
  act(() => found[found.length - 1].props.onPress());
};

const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label);
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label)!.props.onChangeText(text));

/** The pressable for an entry row, found by the start of its VoiceOver label. */
const entryRow = (tree: ReactTestRenderer, name: string) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(`${name}, `));

const fill = (tree: ReactTestRenderer, id: string) => tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

function addWorkout(id: string, localDate: string, status: 'active' | 'finished'): void {
  mockDb
    .insert(workouts)
    .values({ id, name: 'Workout', status, startedAt: NOW, finishedAt: status === 'finished' ? NOW + 3_600_000 : null, localDate })
    .run();
}

describe('locked Fuel (R151)', () => {
  it('shows the day, water and the pitch in the tab, no food, and the footer', () => {
    setFuelTargets(mockDb, TARGETS);
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    const text = shownText(tree);
    expect(text[0]).toBe('Fuel');
    expect(text).toContain('Today');
    expect(text).toContain('Water');
    expect(text).toContain('PRO PITCH tab');
    expect(allText(tree)).not.toContain('Lunch');
    expect(allText(tree)).not.toContain('Calories left');
    expect(tree.root.findAllByType(Footer)).toHaveLength(1);
    // Water comes before the pitch.
    expect(text.indexOf('Water')).toBeLessThan(text.indexOf('PRO PITCH tab'));
  });

  it('Pro turning off locks Fuel at once and keeps the entries; turning on shows them again (Review Focus 2)', () => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    expect(allText(tree)).toContain('Lunch');
    setPro(false);
    expect(shownText(tree)).toContain('PRO PITCH tab');
    expect(allText(tree)).not.toContain('Lunch');
    expect(shownText(tree)).toContain('Water');
    expect(listEntries(mockDb, TODAY).map((e) => e.name)).toEqual(['Lunch']);
    setPro(true);
    expect(allText(tree)).toContain('Lunch');
    expect(allText(tree)).not.toContain('PRO PITCH');
    expect(tree.root.findAllByType(Footer)).toHaveLength(1);
  });
});

describe('Pro without targets', () => {
  it('shows the setup card with the targets form, and the footer', () => {
    mockPro = true;
    const tree = mount();
    const text = shownText(tree);
    expect(text).toContain('Set your targets');
    expect(text).toContain('Fuel counts down from a target. Set one for training days and one for rest days.');
    expect(text).toContain('TARGETS FORM Save targets empty');
    expect(allText(tree)).not.toContain('Calories left');
    expect(allText(tree)).not.toContain('PRO PITCH');
    expect(text).toContain('Water');
    expect(tree.root.findAllByType(Footer)).toHaveLength(1);
  });

  it('turns into the day once targets are saved and the data version bumps', () => {
    mockPro = true;
    const tree = mount();
    setFuelTargets(mockDb, TARGETS);
    bump();
    expect(shownText(tree)).toContain('Calories left');
    expect(allText(tree)).not.toContain('Set your targets');
  });
});

describe('the summary (§8.10, R147)', () => {
  beforeEach(() => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
  });

  it('on a rest day counts down from the rest targets, with exactly two big numbers', () => {
    logQuickAdd(mockDb, 'Breakfast', { kcal: 600.4, proteinG: 40.4, carbsG: 50, fatG: 20 }, TODAY, NOW);
    logQuickAdd(mockDb, 'Snack', { kcal: 100.4, proteinG: 10.4, carbsG: 10, fatG: 5 }, TODAY, NOW);
    const tree = mount();
    const text = shownText(tree);
    expect(text).toContain('Rest day');
    // 2,400 − 700.8 = 1,699.2 → "1,699"; 180 − 50.8 = 129.2 → "129 g" (summed unrounded, rounded once).
    expect(text).toContain('1,699');
    expect(text).toContain('129 g');
    expect(text).toContain('Calories left');
    expect(text).toContain('Protein left');
    expect(text).toContain('Rest day target: 2,400 kcal · 180 g protein');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Calories left, 1,699 calories').length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Protein left, 129 grams').length).toBeGreaterThan(0);
  });

  it('switches to the training targets once a workout of the day is finished (R146)', () => {
    const tree = mount();
    expect(shownText(tree)).toContain('Rest day');
    addWorkout('w1', TODAY, 'active');
    bump();
    expect(shownText(tree)).toContain('Rest day');
    act(() => {
      mockDb.update(workouts).set({ status: 'finished', finishedAt: NOW + 3_600_000 }).run();
      bumpData();
    });
    const text = shownText(tree);
    expect(text).toContain('Training day');
    expect(text).toContain('2,800');
    expect(text).toContain('200 g');
    expect(text).toContain('Training day target: 2,800 kcal · 200 g protein');
  });

  it('says "120 over" past the calorie target, and "12 g over" past protein', () => {
    logQuickAdd(mockDb, 'Feast', { kcal: 2520, proteinG: 192, carbsG: 0, fatG: 0 }, TODAY, NOW);
    const tree = mount();
    const text = shownText(tree);
    expect(text).toContain('120 over');
    expect(text).toContain('12 g over');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Protein left, 12 grams over').length).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Calories left, 120 calories over').length).toBeGreaterThan(0);
  });
});

describe('the summary at 320pt', () => {
  it('fits Calories left and Protein left side by side in a 320pt screen at default text (288pt inside the gutters)', () => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
    const tree = mount();
    const [calories] = tree.root.findAll((n) => n.props.accessibilityLabel === 'Calories left, 2,400 calories' && typeof n.type !== 'string');
    const [protein] = tree.root.findAll((n) => n.props.accessibilityLabel === 'Protein left, 180 grams' && typeof n.type !== 'string');
    const own = StyleSheet.flatten(calories.props.style);
    // The View's parent is LeftNumber; LeftNumber's is the row.
    const rowOf = (n: ReactTestInstance) => n.parent!.parent!;
    const row = StyleSheet.flatten(rowOf(calories).props.style);
    expect(rowOf(protein) === rowOf(calories)).toBe(true);
    expect(row.flexWrap).toBe('wrap');
    expect(2 * (own.flexBasis as number) + (row.columnGap as number)).toBeLessThanOrEqual(288);
    expect(own.flexGrow).toBe(1);
  });
});

describe('macro bars (R147)', () => {
  beforeEach(() => {
    mockPro = true;
  });

  it('shows protein against its target, and carbs and fat as one muted line when they have no targets', () => {
    setFuelTargets(mockDb, TARGETS);
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 45, carbsG: 50.4, fatG: 20.4 }, TODAY, NOW);
    const tree = mount();
    const text = allText(tree);
    expect(text).toContain('Protein 45 / 180 g');
    // The untargeted line, and the entry's own small line.
    expect(shownText(tree).filter((t) => t === 'Carbs 50 g · Fat 20 g')).toHaveLength(2);
    expect(fill(tree, 'macro-fill-protein')[0].props.style).toMatchObject({ width: '25%' });
    expect(fill(tree, 'macro-fill-carbs')).toHaveLength(0);
  });

  it('draws carbs and fat bars when their targets are set, capped full', () => {
    setFuelTargets(mockDb, { training: TARGETS.training, rest: { kcal: 2400, protein: 180, carbs: 100, fat: 10 } });
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 45, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    const text = allText(tree);
    expect(text).toContain('Carbs 50 / 100 g');
    expect(text).toContain('Fat 20 / 10 g');
    // Only the entry's own small line counts carbs and fat; the muted untargeted line is gone.
    expect(shownText(tree).filter((t) => t === 'Carbs 50 g · Fat 20 g')).toHaveLength(1);
    expect(fill(tree, 'macro-fill-carbs')[0].props.style).toMatchObject({ width: '50%' });
    expect(fill(tree, 'macro-fill-fat')[0].props.style).toMatchObject({ width: '100%' });
  });

  it('lists only the macro without a target on the muted line', () => {
    setFuelTargets(mockDb, { training: TARGETS.training, rest: { kcal: 2400, protein: 180, carbs: 100, fat: null } });
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 45, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    expect(allText(tree)).toContain('Carbs 50 / 100 g');
    expect(shownText(tree)).toContain('Fat 20 g');
  });
});

describe('the entries', () => {
  beforeEach(() => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
  });

  it('says nothing is logged on an empty day', () => {
    const tree = mount();
    expect(shownText(tree)).toContain('Food');
    expect(shownText(tree)).toContain('Nothing logged on this day.');
    expect(allText(tree)).not.toContain('Total ·');
  });

  it('lists each entry with its servings, label and macros, then a total row summed unrounded', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1.5, TODAY, NOW - 60_000);
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    for (let i = 0; i < 3; i++) logQuickAdd(mockDb, 'Bite', { kcal: 33.3, proteinG: 0, carbsG: 0, fatG: 0 }, YESTERDAY, NOW);
    const tree = mount();
    const text = shownText(tree);
    expect(text).toContain('Protein shake');
    expect(text).toContain('1.5 × 1 scoop · 180 kcal · 36 g protein');
    expect(text).toContain('Carbs 5 g · Fat 2 g');
    expect(text).toContain('Lunch');
    expect(text).toContain('600 kcal · 40 g protein');
    expect(text).toContain('Carbs 50 g · Fat 20 g');
    expect(text).toContain('Total · 780 kcal · 76 g protein · 55 g carbs · 22 g fat');
    expect(allText(tree)).not.toContain('Bite');
    // Order: the summary, the bars, the entries, the add buttons, the trends, then Targets ›.
    expect(text.indexOf('Calories left')).toBeLessThan(text.indexOf('Protein shake'));
    expect(text.indexOf('Protein shake')).toBeLessThan(text.indexOf('Add food'));
    expect(text.indexOf('Add food')).toBeLessThan(text.indexOf(`TRENDS ${TODAY}`));
    expect(text.indexOf(`TRENDS ${TODAY}`)).toBeLessThan(text.indexOf('Targets ›'));
    expect(tree.root.findAllByType(Footer)).toHaveLength(1);
    // Three entries of 33.3 kcal total 100, not 99 (R156).
    press(tree, 'Previous day');
    expect(allText(tree)).toContain('Total · 100 kcal · 0 g protein · 0 g carbs · 0 g fat');
  });

  it('shows an entry from before serving labels were copied by its servings alone', () => {
    const id = createCustomFood(mockDb, shake);
    const entryId = logFood(mockDb, id, 2, TODAY, NOW);
    mockDb.update(foodLog).set({ servingLabel: null }).where(eq(foodLog.id, entryId)).run();
    const tree = mount();
    expect(shownText(tree)).toContain('2 servings · 240 kcal · 48 g protein');
  });

  it('gives each row a 44pt target and a full VoiceOver label', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    const row = entryRow(tree, 'Protein shake')[0];
    expect(row.props.accessibilityLabel).toBe('Protein shake, 1 × 1 scoop, 120 calories, 24 grams protein, 3 grams carbs, 2 grams fat');
    const style = typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style;
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('Add food and Quick add open the add screen for the day shown', () => {
    const tree = mount();
    press(tree, 'Add food');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/food/add', params: { date: TODAY } });
    expect(mockFlushAll).toHaveBeenCalled();
    press(tree, 'Previous day');
    press(tree, 'Quick add');
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/food/add', params: { date: YESTERDAY, mode: 'quick' } });
  });

  it('Targets › opens the targets', () => {
    const tree = mount();
    press(tree, 'Targets');
    expect(mockPush).toHaveBeenLastCalledWith('/fuel-targets');
  });
});

describe('the day header (R148)', () => {
  beforeEach(() => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
  });

  it('steps back to earlier days and forward to today, never past it', () => {
    logQuickAdd(mockDb, 'Yesterday lunch', { kcal: 500, proteinG: 30, carbsG: 0, fatG: 0 }, YESTERDAY, NOW);
    const tree = mount();
    const next = () => pressables(tree, 'Next day')[0];
    expect(next().props.disabled).toBe(true);
    press(tree, 'Previous day');
    expect(shownText(tree)).toContain('Yesterday');
    expect(allText(tree)).toContain('Yesterday lunch');
    expect(mockAnnounce).toHaveBeenLastCalledWith('Yesterday');
    expect(next().props.disabled).toBe(false);
    press(tree, 'Previous day');
    expect(shownText(tree)).toContain('Fri, Oct 9');
    press(tree, 'Next day');
    press(tree, 'Next day');
    expect(shownText(tree)).toContain('Today');
    expect(next().props.disabled).toBe(true);
    // A disabled › does nothing even if pressed.
    act(() => next().props.onPress());
    expect(shownText(tree)).toContain('Today');
  });

  it('shows the year on a day of another year', () => {
    const tree = mount();
    for (let i = 0; i < 300; i++) press(tree, 'Previous day');
    expect(shownText(tree)).toContain('Mon, Dec 15, 2025');
  });

  it('after midnight, focus returns a screen left on Today to the new Today (Review Focus 1)', () => {
    logQuickAdd(mockDb, 'Late snack', { kcal: 200, proteinG: 10, carbsG: 0, fatG: 0 }, TODAY, NOW);
    const tree = mount();
    expect(allText(tree)).toContain('Late snack');
    nowSpy.mockReturnValue(new Date(2026, 9, 12, 0, 30).getTime());
    refocus();
    expect(shownText(tree)).toContain('Today');
    expect(allText(tree)).not.toContain('Late snack');
    expect(shownText(tree)).toContain(`TRENDS 2026-10-12`);
    expect(pressables(tree, 'Next day')[0].props.disabled).toBe(true);
    press(tree, 'Previous day');
    expect(shownText(tree)).toContain('Yesterday');
    expect(allText(tree)).toContain('Late snack');
  });

  it('centres the day between the arrows', () => {
    const tree = mount();
    const title = tree.root.findAll((n) => typeof n.type === 'string' && n.children.includes('Today'))[0];
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ flex: 1, textAlign: 'center' });
  });

  it('after midnight, a screen left on an earlier day keeps that day', () => {
    const tree = mount();
    press(tree, 'Previous day');
    nowSpy.mockReturnValue(new Date(2026, 9, 12, 0, 30).getTime());
    refocus();
    expect(shownText(tree)).toContain('Sat, Oct 10');
    expect(pressables(tree, 'Next day')[0].props.disabled).toBe(false);
  });
});

describe('editing an entry (R142)', () => {
  beforeEach(() => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
  });

  function openEntry(tree: ReactTestRenderer, name: string) {
    const row = entryRow(tree, name);
    if (row.length === 0) throw new Error(`No entry ${name}`);
    act(() => row[0].props.onPress());
  }

  it('rescales the entry from its own totals when its servings change', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    expect(mockFlushAll).toHaveBeenCalled();
    expect(field(tree, 'Servings')!.props.value).toBe('1');
    expect(shownText(tree)).toContain('120 kcal · 24 g protein');
    type(tree, 'Servings', '2,5');
    expect(shownText(tree)).toContain('300 kcal · 60 g protein');
    press(tree, 'Save');
    const [entry] = listEntries(mockDb, TODAY);
    expect(entry.servings).toBe(2.5);
    expect(entry.kcal).toBeCloseTo(300, 6);
    expect(entry.proteinG).toBeCloseTo(60, 6);
    expect(allText(tree)).toContain('2.5 × 1 scoop · 300 kcal · 60 g protein');
    expect(field(tree, 'Servings')).toBeUndefined();
  });

  it('sets servings from the chips', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    press(tree, '1.5 servings');
    expect(field(tree, 'Servings')!.props.value).toBe('1.5');
    press(tree, 'Half a serving');
    expect(field(tree, 'Servings')!.props.value).toBe('0.5');
    press(tree, 'Save');
    expect(listEntries(mockDb, TODAY)[0].kcal).toBeCloseTo(60, 6);
  });

  it.each(['', 'abc', '0', '51'])('shows "Check this number" for servings "%s" and saves nothing', (text) => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    type(tree, 'Servings', text);
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    // announce() speaks it; a live region too would make TalkBack read it twice.
    expect(tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none')).toHaveLength(0);
    expect(listEntries(mockDb, TODAY)[0].servings).toBe(1);
  });

  it('reads "1.50" as the 1.5 servings stored: not a change', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1.5, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    type(tree, 'Servings', '1.50');
    press(tree, 'Cancel');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(field(tree, 'Servings')).toBeUndefined();
  });

  it('keeps the entry drawn in the sheet while it closes, so no blank panel fades', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    type(tree, 'Servings', '2');
    press(tree, 'Save');
    const sheet = tree.root.findByType(FoodEntrySheet).findByType(Sheet);
    expect(sheet!.props.visible).toBe(false);
    expect(sheet!.props.children).not.toBeNull();
    // Opening again starts from the entry as saved, not the old draft.
    openEntry(tree, 'Protein shake');
    expect(field(tree, 'Servings')!.props.value).toBe('2');
  });

  it('edits a quick add by its name and macros', () => {
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Lunch');
    expect(field(tree, 'Servings')).toBeUndefined();
    expect(field(tree, 'Name')!.props.value).toBe('Lunch');
    expect(field(tree, 'Calories')!.props.value).toBe('600');
    type(tree, 'Name', 'Big lunch');
    type(tree, 'Protein, grams', '55,5');
    press(tree, 'Save');
    const [entry] = listEntries(mockDb, TODAY);
    expect(entry).toMatchObject({ name: 'Big lunch', kcal: 600, proteinG: 55.5, carbsG: 50, fatG: 20 });
  });

  it('refuses a quick add with neither calories nor protein', () => {
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Lunch');
    type(tree, 'Calories', '');
    type(tree, 'Protein, grams', '0');
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Enter calories or protein.');
    expect(mockAnnounce).toHaveBeenCalledWith('Enter calories or protein.');
    expect(listEntries(mockDb, TODAY)[0].kcal).toBe(600);
  });

  it('asks before deleting; Keep keeps it, Delete deletes it', () => {
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Lunch');
    press(tree, 'Delete');
    expect(shownText(tree)).toContain('Delete this entry?');
    press(tree, 'Keep');
    expect(shownText(tree)).not.toContain('Delete this entry?');
    expect(listEntries(mockDb, TODAY)).toHaveLength(1);
    press(tree, 'Delete');
    press(tree, 'Delete');
    expect(listEntries(mockDb, TODAY)).toHaveLength(0);
    expect(mockAnnounce).toHaveBeenCalledWith('Deleted Lunch.');
    expect(shownText(tree)).toContain('Nothing logged on this day.');
    expect(shownText(tree)).not.toContain('Delete this entry?');
  });

  it('Cancel with changes asks "Discard changes?"; Keep editing stays, Discard leaves the entry as it was', () => {
    const id = createCustomFood(mockDb, shake);
    logFood(mockDb, id, 1, TODAY, NOW);
    const tree = mount();
    openEntry(tree, 'Protein shake');
    // Untouched, Cancel just closes.
    press(tree, 'Cancel');
    expect(field(tree, 'Servings')).toBeUndefined();
    openEntry(tree, 'Protein shake');
    type(tree, 'Servings', '3');
    press(tree, 'Cancel');
    expect(shownText(tree)).toContain('Discard changes?');
    press(tree, 'Keep editing');
    expect(field(tree, 'Servings')!.props.value).toBe('3');
    press(tree, 'Cancel');
    press(tree, 'Discard');
    expect(field(tree, 'Servings')).toBeUndefined();
    expect(listEntries(mockDb, TODAY)[0].servings).toBe(1);
  });
});

describe('colour', () => {
  it('draws nothing in red on Fuel, locked or open, over or not, with a sheet open', () => {
    setFuelTargets(mockDb, { training: TARGETS.training, rest: { kcal: 2400, protein: 180, carbs: 10, fat: 10 } });
    logQuickAdd(mockDb, 'Feast', { kcal: 3000, proteinG: 300, carbsG: 300, fatG: 300 }, TODAY, NOW);
    const tree = mount();
    expect(JSON.stringify(tree.toJSON()).toUpperCase()).not.toContain('#E10600');
    setPro(true);
    expect(allText(tree)).toContain('over');
    act(() => entryRow(tree, 'Feast')[0].props.onPress());
    press(tree, 'Delete');
    expect(JSON.stringify(tree.toJSON()).toUpperCase()).not.toContain('#E10600');
  });

  it('lets every text scale with the phone', () => {
    mockPro = true;
    setFuelTargets(mockDb, TARGETS);
    logQuickAdd(mockDb, 'Lunch', { kcal: 600, proteinG: 40, carbsG: 50, fatG: 20 }, TODAY, NOW);
    const tree = mount();
    expect(tree.root.findAllByType(Text).filter((t) => t.props.allowFontScaling === false)).toHaveLength(0);
  });
});
