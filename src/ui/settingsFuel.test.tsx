import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { setFuelTargets } from '../db/repositories/foodLogRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import type { EntitlementsState } from '../platform/entitlements/useIsPro';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockState: EntitlementsState;

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/entitlements', () => ({
  debugUnlockAllowed: () => false,
  useEntitlementsState: () => mockState,
  entitlementsFor: () => ({ restore: jest.fn(), purchase: jest.fn(), manageSubscription: jest.fn() }),
}));
jest.mock('../state/backup', () => ({
  snapshotListing: () => ({ path: null, names: [], error: null }),
  snapshotFolderReport: () => null,
  shareFile: jest.fn(),
}));
jest.mock('../state/dataVersion', () => ({
  useDbQuery: (query: (db: unknown) => unknown) => query(mockDb),
  useDataVersion: (select: (state: { version: number }) => unknown) => select({ version: 0 }),
  bumpData: jest.fn(),
}));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const LOCKED = 'Fuel targets are part of GymHound Pro.';

function state(over: Partial<EntitlementsState> = {}): EntitlementsState {
  return { isPro: false, isDebugPro: false, canPurchase: false, canRestore: false, plans: [], subscribed: false, kind: 'free', ...over };
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Settings />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

/** Every line of text in the Fuel group, from its heading to the next group (Backups). */
const fuelLines = (tree: ReactTestRenderer) => {
  const all = texts(tree);
  return all.slice(all.indexOf('Fuel') + 1, all.indexOf('Backups'));
};

/** The buttons in the Fuel group, in order. */
const fuelButtons = (tree: ReactTestRenderer) => {
  const group = tree.root.find((n) => n.props.testID === 'settings-fuel');
  return group.findAllByType(Button);
};

const textNode = (tree: ReactTestRenderer, line: string) => tree.root.findAllByType(Text).find((t) => [t.props.children].flat().join('') === line)!;

beforeEach(() => {
  mockDb = seededDb();
  mockState = state();
  jest.mocked(router.push).mockClear();
});

describe('Settings: Fuel (§8.11, R145)', () => {
  it('is a group after Rest timer and before Backups', () => {
    const all = texts(mount());

    expect(all.indexOf('Fuel')).toBeGreaterThan(all.indexOf('Rest timer'));
    expect(all.indexOf('Fuel')).toBeLessThan(all.indexOf('Backups'));
  });

  it('heads the group with the shared heading, read as a heading', () => {
    const heading = textNode(mount(), 'Fuel');

    expect(heading.props.accessibilityRole).toBe('header');
  });

  describe('not Pro', () => {
    it('says targets are part of Pro, with See Pro, which opens the paywall', () => {
      const tree = mount();

      expect(fuelLines(tree)).toEqual([LOCKED, 'See Pro']);
      const [seePro] = fuelButtons(tree);
      expect(seePro.props.label).toBe('See Pro');
      act(() => seePro.props.onPress());
      expect(router.push).toHaveBeenCalledWith('/paywall');
    });

    it('a double tap on See Pro opens one paywall', () => {
      const [seePro] = fuelButtons(mount());

      act(() => {
        seePro.props.onPress();
        seePro.props.onPress();
      });

      expect(router.push).toHaveBeenCalledTimes(1);
    });

    it('a lapsed user with targets stored sees the pitch, and the targets are kept', () => {
      setFuelTargets(mockDb, { training: { kcal: 2400, protein: 180, carbs: null, fat: null }, rest: { kcal: 2000, protein: 160, carbs: null, fat: null } });

      const tree = mount();

      expect(fuelLines(tree)).toEqual([LOCKED, 'See Pro']);
      mockState = state({ isPro: true, isDebugPro: true, kind: 'debug' });
      expect(fuelLines(mount())[0]).toBe('Training day: 2,400 kcal · 180 g protein');
    });
  });

  describe('Pro without targets', () => {
    it('says there are none yet, with Set targets, which opens Targets', () => {
      mockState = state({ isPro: true, isDebugPro: true, kind: 'debug' });
      const tree = mount();

      expect(fuelLines(tree)).toEqual(['No targets yet.', 'Set targets']);
      const [set] = fuelButtons(tree);
      expect(set.props.label).toBe('Set targets');
      // The only action in the group, so it is filled.
      expect(set.props.variant ?? 'primary').toBe('primary');
      act(() => set.props.onPress());
      expect(router.push).toHaveBeenCalledWith('/fuel-targets');
    });
  });

  describe('Pro with targets', () => {
    beforeEach(() => {
      mockState = state({ isPro: true, kind: 'revenuecat', canRestore: true, canPurchase: true });
      setFuelTargets(mockDb, {
        training: { kcal: 2450.4, protein: 180, carbs: 250, fat: 70 },
        rest: { kcal: 2100, protein: 165.6, carbs: null, fat: null },
      });
    });

    it('shows both days as calories and protein, with a secondary Edit targets', () => {
      const tree = mount();

      expect(fuelLines(tree)).toEqual(['Training day: 2,450 kcal · 180 g protein', 'Rest day: 2,100 kcal · 166 g protein', 'Edit targets']);
      const [edit] = fuelButtons(tree);
      expect(edit.props.label).toBe('Edit targets');
      expect(edit.props.variant).toBe('secondary');
    });

    it('reads the units in words to the screen reader', () => {
      const tree = mount();

      expect(textNode(tree, 'Training day: 2,450 kcal · 180 g protein').props.accessibilityLabel).toBe(
        'Training day: 2,450 calories, 180 grams of protein',
      );
      expect(textNode(tree, 'Rest day: 2,100 kcal · 166 g protein').props.accessibilityLabel).toBe(
        'Rest day: 2,100 calories, 166 grams of protein',
      );
    });

    it('says "1 gram", not "1 grams", to the screen reader', () => {
      setFuelTargets(mockDb, { training: { kcal: 1, protein: 1, carbs: null, fat: null }, rest: { kcal: 1000, protein: 0.6, carbs: null, fat: null } });
      const tree = mount();

      expect(textNode(tree, 'Training day: 1 kcal · 1 g protein').props.accessibilityLabel).toBe('Training day: 1 calorie, 1 gram of protein');
      expect(textNode(tree, 'Rest day: 1,000 kcal · 1 g protein').props.accessibilityLabel).toBe('Rest day: 1,000 calories, 1 gram of protein');
    });

    it('Edit targets opens Targets, once for a double tap', () => {
      const [edit] = fuelButtons(mount());

      act(() => {
        edit.props.onPress();
        edit.props.onPress();
      });

      expect(router.push).toHaveBeenCalledTimes(1);
      expect(router.push).toHaveBeenCalledWith('/fuel-targets');
    });

    it('never colours the lines red', () => {
      const tree = mount();
      const reds = tree.root
        .find((n) => n.props.testID === 'settings-fuel')
        .findAllByType(Text)
        .filter((t) => JSON.stringify(t.props.style ?? null).includes('#E10600'));

      expect(reds).toHaveLength(0);
    });
  });
});
