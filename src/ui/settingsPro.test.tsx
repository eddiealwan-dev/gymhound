import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { announce } from '../platform/announce';
import type { RestoreResult } from '../platform/entitlements';
import type { EntitlementsState } from '../platform/entitlements/useIsPro';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockState: EntitlementsState;
const mockRestore = jest.fn<Promise<RestoreResult>, []>();
const mockManage = jest.fn<Promise<boolean>, []>();

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/entitlements', () => ({
  debugUnlockAllowed: () => false,
  useEntitlementsState: () => mockState,
  entitlementsFor: () => ({ restore: mockRestore, purchase: jest.fn(), manageSubscription: mockManage }),
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

const FREE_LINE = 'Free includes four programs, Stats and logging. Pro adds every program, your own routines, saved workouts and Fuel.';
const UNAVAILABLE = "Purchases aren't available in this build.";

function state(over: Partial<EntitlementsState> = {}): EntitlementsState {
  return { isPro: false, isDebugPro: false, canPurchase: true, canRestore: true, plans: [], subscribed: false, kind: 'revenuecat', ...over };
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Settings />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);

beforeEach(() => {
  mockDb = seededDb();
  mockState = state();
  mockRestore.mockReset();
  mockManage.mockReset();
  mockManage.mockResolvedValue(true);
  jest.mocked(announce).mockClear();
  jest.mocked(router.push).mockClear();
});

describe('Settings: GymHound Pro (§8.11, R138)', () => {
  describe('Import (R565)', () => {
    it('sits after Export; free, it says Import data is part of Pro (its page offers See Pro)', () => {
      const tree = mount();
      const shown = texts(tree);
      expect(shown.indexOf('Import')).toBeGreaterThan(shown.indexOf('Export'));
      expect(shown).toContain('Part of GymHound Pro.');
      act(() => buttons(tree, 'Import data')[0].props.onPress());
      expect(router.push).toHaveBeenCalledWith('/import');
    });

    it('with Pro, Import data opens its page', () => {
      mockState = state({ isPro: true });
      const tree = mount();
      expect(texts(tree)).not.toContain('Part of GymHound Pro.');
      act(() => buttons(tree, 'Import data')[0].props.onPress());
      expect(router.push).toHaveBeenCalledWith('/import');
    });
  });

  it('is a group after Export', () => {
    const shown = texts(mount());
    expect(shown).toContain('GymHound Pro');
    expect(shown.indexOf('GymHound Pro')).toBeGreaterThan(shown.indexOf('Export'));
  });

  it('free: says what Pro adds, with See Pro, which opens the paywall', () => {
    const tree = mount();

    expect(texts(tree)).toContain(FREE_LINE);
    expect(texts(tree)).not.toContain('Pro is on.');
    act(() => buttons(tree, 'See Pro')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });

  it('a double tap on See Pro opens one paywall', () => {
    const tree = mount();
    const [seePro] = buttons(tree, 'See Pro');
    act(() => {
      seePro.props.onPress();
      seePro.props.onPress();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('Pro from the store: "Pro is on.", no See Pro', () => {
    mockState = state({ isPro: true });
    const tree = mount();

    expect(texts(tree)).toContain('Pro is on.');
    expect(texts(tree)).not.toContain(FREE_LINE);
    expect(buttons(tree, 'See Pro')).toHaveLength(0);
  });

  it('Pro from the debug unlock: "Pro is on for testing."', () => {
    mockState = state({ isPro: true, isDebugPro: true, kind: 'debug', canPurchase: false });
    const tree = mount();

    expect(texts(tree)).toContain('Pro is on for testing.');
    expect(texts(tree)).not.toContain('Pro is on.');
    expect(buttons(tree, 'See Pro')).toHaveLength(0);
  });

  it('Restore purchases is always there, secondary; disabled with one line when there is no store', () => {
    mockState = state({ kind: 'debug', canPurchase: false, canRestore: false });
    const tree = mount();

    const [restore] = buttons(tree, 'Restore purchases');
    expect(restore.props.variant).toBe('secondary');
    expect(restore.props.disabled).toBe(true);
    expect(texts(tree).filter((line) => line === UNAVAILABLE)).toHaveLength(1);
  });

  it('with a store that has nothing to sell yet, Restore purchases still works', () => {
    mockState = state({ canPurchase: false, canRestore: true });
    const tree = mount();
    expect(buttons(tree, 'Restore purchases')[0].props.disabled).toBeFalsy();
    expect(texts(tree)).not.toContain(UNAVAILABLE);
  });

  it('with a store, Restore purchases is enabled and says what happened, announced', async () => {
    const tree = mount();
    expect(texts(tree)).not.toContain(UNAVAILABLE);
    const press = async () => {
      await act(async () => buttons(tree, 'Restore purchases')[0].props.onPress());
    };

    mockRestore.mockResolvedValueOnce('none');
    await press();
    expect(texts(tree)).toContain('No earlier purchase found.');
    expect(announce).toHaveBeenLastCalledWith('No earlier purchase found.');

    mockRestore.mockResolvedValueOnce('failed');
    await press();
    expect(texts(tree)).toContain("Couldn't reach the store. Try again.");
    expect(texts(tree)).not.toContain('No earlier purchase found.');

    mockRestore.mockResolvedValueOnce('restored');
    await press();
    expect(announce).toHaveBeenLastCalledWith('Pro is on.');
    expect(texts(tree)).not.toContain("Couldn't reach the store. Try again.");
  });

  it('Restore purchases is disabled while it runs', async () => {
    let finish!: (result: RestoreResult) => void;
    mockRestore.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const tree = mount();

    await act(async () => buttons(tree, 'Restore purchases')[0].props.onPress());
    expect(buttons(tree, 'Restore purchases')[0].props.disabled).toBe(true);
    expect(texts(tree)).toContain('Working…');
    expect(announce).toHaveBeenCalledWith('Working…');
    await act(async () => finish('none'));
    expect(buttons(tree, 'Restore purchases')[0].props.disabled).toBeFalsy();
  });

  describe('Manage subscription', () => {
    it('shows a quiet Manage subscription when Pro comes from a store subscription; it opens the store page', async () => {
      mockState = state({ isPro: true, subscribed: true });
      const tree = mount();
      const [manage] = buttons(tree, 'Manage subscription');
      expect(manage.props.variant).toBe('quiet');
      await act(async () => manage.props.onPress());
      expect(mockManage).toHaveBeenCalledTimes(1);
    });

    it('a store page that cannot open changes nothing and throws nothing', async () => {
      mockState = state({ isPro: true, subscribed: true });
      mockManage.mockResolvedValue(false);
      const tree = mount();
      await act(async () => buttons(tree, 'Manage subscription')[0].props.onPress());
      expect(texts(tree)).toContain('Pro is on.');
    });

    it.each([
      ['a one-time unlock', { isPro: true, subscribed: false }],
      ['the debug unlock', { isPro: true, isDebugPro: true, kind: 'debug' as const, canRestore: false, canPurchase: false, subscribed: false }],
      ['free', { subscribed: false }],
      ['no store', { isPro: true, canRestore: false, canPurchase: false, subscribed: true }],
    ])('is hidden for %s', (_name, over) => {
      mockState = state(over);
      expect(buttons(mount(), 'Manage subscription')).toHaveLength(0);
    });
  });
});
