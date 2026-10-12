import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Dock } from './Dock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const ROUTES = [
  'index',
  'history/index',
  'stats',
  'fuel',
  'settings',
  'routines/index',
  'saved/[id]',
  'body/[kind]',
  'history/[id]',
  'history/edit/[id]',
  'lifts',
  'lift/[id]',
  'photos',
  'fuel-targets',
].map((name) => ({
  key: `${name}-key`,
  name,
  params: undefined,
}));
const navigation = { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() };

/** The dock with `focused` as the screen showing. */
function mountOn(focused: string): ReactTestRenderer {
  const props = { state: { index: ROUTES.findIndex((r) => r.name === focused), routes: ROUTES }, navigation } as unknown as BottomTabBarProps;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Dock {...props} />);
  });
  return tree;
}

const tabs = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
const selected = (tree: ReactTestRenderer) => tabs(tree).filter((t) => t.props.accessibilityState?.selected).map((t) => t.props.accessibilityLabel);
const tab = (tree: ReactTestRenderer, label: string) => tabs(tree).find((t) => t.props.accessibilityLabel === label)!;

beforeEach(() => jest.clearAllMocks());

describe('the dock', () => {
  it('highlights Stats on a body detail, opened from Stats', () => {
    const tree = mountOn('body/[kind]');
    expect(selected(tree)).toEqual(['Stats']);
    // Its label is red, as the active tab's is.
    const label = tab(tree, 'Stats').findAll((n) => typeof n.type === 'string' && n.props.children === 'Stats')[0];
    expect(JSON.stringify(label.props.style)).toContain('#E10600');
  });

  it('highlights Fuel on its Targets, and Fuel there goes back to Fuel', () => {
    const tree = mountOn('fuel-targets');
    expect(selected(tree)).toEqual(['Fuel']);
    act(() => tab(tree, 'Fuel').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('fuel', undefined);
  });

  it('Stats on a body detail goes back to Stats', () => {
    const tree = mountOn('body/[kind]');
    act(() => tab(tree, 'Stats').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('stats', undefined);
  });

  it('Stats on Stats stays put', () => {
    const tree = mountOn('stats');
    expect(selected(tree)).toEqual(['Stats']);
    act(() => tab(tree, 'Stats').props.onPress());
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  // Phase 6 (R172): a workout and its editor are opened from History; the lifts and the photos from Stats.
  it.each(['history/[id]', 'history/edit/[id]'])('highlights History on %s', (route) => {
    expect(selected(mountOn(route))).toEqual(['History']);
  });

  it.each(['lifts', 'lift/[id]', 'photos'])('highlights Stats on %s', (route) => {
    expect(selected(mountOn(route))).toEqual(['Stats']);
  });

  it('History on a workout goes back to History', () => {
    const tree = mountOn('history/[id]');
    act(() => tab(tree, 'History').props.onPress());
    expect(navigation.navigate).toHaveBeenCalledWith('history/index', undefined);
  });

  it.each(['settings', 'routines/index', 'saved/[id]'])('highlights nothing on %s', (route) => {
    expect(selected(mountOn(route))).toEqual([]);
  });
});
