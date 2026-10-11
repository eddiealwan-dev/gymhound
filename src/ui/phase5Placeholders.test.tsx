import { router } from 'expo-router';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import TabsLayout from '../../app/(tabs)/_layout';
import FoodRoute from '../../app/food/[id]';
import AddFoodRoute from '../../app/food/add';
import { FuelTrends } from './fuel/FuelTrends';
import { Footer } from './Footer';
import { FoodOfferBanner } from './session/FoodOfferBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase 5 Task 1 (R155): the stubs and placeholder routes later tasks fill. The stubs draw nothing; each route says
 * "Not built yet." and can be left. The food screens have no footer (§18.4). The paywall and ProPitch are tested in
 * paywall.test.tsx.
 */

/** The screens each `Tabs.Screen` registered, by name, with its options. */
const mockTabScreens: { name: string; options?: { href?: unknown } }[] = [];

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));
jest.mock('expo-router/js-tabs', () => {
  const Tabs = ({ children }: { children: React.ReactNode }) => children;
  Tabs.Screen = (props: { name: string; options?: { href?: unknown } }) => {
    mockTabScreens.push(props);
    return null;
  };
  return { Tabs };
});
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./Dock', () => ({ Dock: () => null }));
jest.mock('./Header', () => ({ Header: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());

beforeEach(() => {
  jest.mocked(router.back).mockClear();
});

describe('the placeholder routes', () => {
  it.each([
    ['/food/add', AddFoodRoute],
    ['/food/[id]', FoodRoute],
  ])('%s says "Not built yet." and has no footer', (_route, Route) => {
    const tree = render(<Route />);
    expect(text(tree)).toContain('Not built yet.');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it.each([
    ['/food/add', AddFoodRoute, 'Close'],
    ['/food/[id]', FoodRoute, 'Close'],
  ])('%s goes back', (_route, Route, label) => {
    const tree = render(<Route />);
    const [control] = tree.root.findAll(
      (n) => (n.props.accessibilityLabel === label || n.props.label === label) && typeof n.props.onPress === 'function',
    );
    act(() => control.props.onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('the stubs draw nothing until their task fills them', () => {
  it.each([
    ['FuelTrends', <FuelTrends key="r" today="2026-10-11" />],
    ['FoodOfferBanner', <FoodOfferBanner key="b" workoutId="w1" />],
  ])('%s', (_name, element) => {
    expect(render(element).toJSON()).toBeNull();
  });
});

describe('the tabs layout', () => {
  it('registers /fuel-targets as a hidden tab route, so the header and dock stay (R154)', () => {
    mockTabScreens.length = 0;
    render(<TabsLayout />);
    expect(mockTabScreens.find((s) => s.name === 'fuel-targets')?.options).toEqual({ href: null });
  });
});
