import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { setLeaveGuard } from '../state/leaveGuard';
import { Dock } from './Dock';
import { Header } from './Header';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  usePathname: () => '/routines/edit/new',
  useFocusEffect: () => undefined,
}));
// The header's Profile button reads the profile (R566).
jest.mock('../db/DbProvider', () => {
  const { seededDb } = jest.requireActual('../db/testing/fixtures');
  const db = seededDb();
  return { useDb: () => db };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./HoundMark', () => ({ HoundMark: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Guards set by a test, removed after it even when an assertion fails, so none leaks into the next test. */
const guards: (() => void)[] = [];

/** A guard like the routine editor's while it holds changes: it keeps the move to make after "Discard". */
function guardHoldingChanges() {
  const held: (() => void)[] = [];
  guards.push(
    setLeaveGuard((leave) => {
      held.push(leave);
      return true;
    }),
  );
  return { held };
}

function pressLabelled(tree: ReactTestRenderer, label: string) {
  const target = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  act(() => target.props.onPress());
}

beforeEach(() => jest.clearAllMocks());

afterEach(() => {
  while (guards.length > 0) guards.pop()!();
});

describe('the dock asks the screen it leaves (R89)', () => {
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };
  const props = {
    state: {
      index: 2,
      routes: [
        { key: 'train-key', name: 'index', params: undefined },
        { key: 'history-key', name: 'history/index', params: undefined },
        { key: 'editor-key', name: 'routines/edit/[id]', params: { id: 'new' } },
      ],
    },
    navigation,
  } as unknown as BottomTabBarProps;

  function mountDock(): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Dock {...props} />);
    });
    return tree;
  }

  it('switches tab at once when no screen guards', () => {
    const tree = mountDock();

    pressLabelled(tree, 'Train');

    expect(navigation.navigate).toHaveBeenCalledWith('index', undefined);
  });

  it('while a screen holds changes, the tab waits for its answer', () => {
    const { held } = guardHoldingChanges();
    const tree = mountDock();

    pressLabelled(tree, 'History');
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(held).toHaveLength(1);

    act(() => held[0]());
    expect(navigation.navigate).toHaveBeenCalledWith('history/index', undefined);
  });
});

describe("the header's Settings button asks the screen it leaves (R89)", () => {
  function mountHeader(): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Header />);
    });
    return tree;
  }

  it('opens Settings at once when no screen guards', () => {
    const tree = mountHeader();

    pressLabelled(tree, 'Settings');

    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('while a screen holds changes, Settings waits for its answer', () => {
    const { held } = guardHoldingChanges();
    const tree = mountHeader();

    pressLabelled(tree, 'Settings');
    expect(router.push).not.toHaveBeenCalled();
    expect(held).toHaveLength(1);

    act(() => held[0]());
    expect(router.push).toHaveBeenCalledWith('/settings');
  });
});
