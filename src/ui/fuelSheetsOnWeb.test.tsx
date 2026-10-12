/** @jest-environment node */
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { FoodEntry } from '../db/repositories/foodLogRepo';
import type { FoodPerServing } from '../domain/fuel';
import { FoodEntrySheet } from './fuel/FoodEntrySheet';
import { ServingsSheet } from './fuel/ServingsSheet';
import { WaterSheet, type WaterSheetMode } from './fuel/WaterSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The sheets' titles move VoiceOver to themselves through `focusOn`, which is not mocked here: it is what is tested.
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** React Native's own sendAccessibilityEvent, put back after a test takes it away as React Native Web does. */
const realSendAccessibilityEvent = AccessibilityInfo.sendAccessibilityEvent;
function setSendAccessibilityEvent(fn: unknown): void {
  (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent = fn;
}

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  setSendAccessibilityEvent(realSendAccessibilityEvent);
  jest.restoreAllMocks();
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  mounted.push(tree);
  return tree;
}

const headers = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).filter((n) => n.props.accessibilityRole === 'header');

const EGG: FoodPerServing = { id: 'fdc-171287', name: 'Egg, large', servingLabel: '1 large', servingGrams: 50, kcal: 72, proteinG: 6, carbsG: 0.4, fatG: 5, source: 'bundled' };
const ENTRY: FoodEntry = { ...EGG, id: 'e1', localDate: '2026-10-11', loggedAt: 0, foodId: EGG.id, servings: 1, servingLabel: '1 large' };
const QUICK: FoodEntry = { ...ENTRY, id: 'e2', foodId: null, name: 'Quick add', servingLabel: null };

const sheets: [string, () => React.ReactElement][] = [
  ...(['other', 'goal', 'entries'] as WaterSheetMode[]).map(
    (mode): [string, () => React.ReactElement] => [
      `the water sheet (${mode})`,
      () => (
        <WaterSheet
          mode={mode}
          localDate="2026-10-11"
          today="2026-10-11"
          unit="ml"
          locale="en-US"
          goalMl={2000}
          entries={[{ id: 'w1', amountMl: 250, loggedAt: 0 }]}
          onClose={() => undefined}
        />
      ),
    ],
  ),
  ['the servings sheet', () => <ServingsSheet food={EGG} localDate="2026-10-11" onClose={() => undefined} onAdded={() => undefined} onEdit={() => undefined} />],
  ['the food entry sheet', () => <FoodEntrySheet entry={ENTRY} locale="en-US" onClose={() => undefined} />],
  ['the quick add entry sheet', () => <FoodEntrySheet entry={QUICK} locale="en-US" onClose={() => undefined} />],
];

describe('the Fuel sheets on the web, where React Native Web has no sendAccessibilityEvent', () => {
  it.each(sheets)('%s opens without crashing', (_name, element) => {
    jest.replaceProperty(Platform, 'OS', 'web');
    setSendAccessibilityEvent(undefined);
    const tree = mount(element());
    expect(headers(tree).length).toBeGreaterThan(0);
  });
});

describe('the Fuel sheets on a phone', () => {
  it.each(sheets)('%s moves VoiceOver to its title', (_name, element) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const send = jest.fn();
    setSendAccessibilityEvent(send);
    const tree = mount(element());
    const [title] = headers(tree);
    expect(send).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(title).toBeTruthy();
  });
});
