import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import TabsLayout from '../../app/(tabs)/_layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase 5 Task 1 (R155): every stub and placeholder route is filled now; each is tested in its own file. What is
 * left here is the tabs layout registering the hidden route.
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

describe('the tabs layout', () => {
  it('registers /fuel-targets as a hidden tab route, so the header and dock stay (R154)', () => {
    mockTabScreens.length = 0;
    render(<TabsLayout />);
    expect(mockTabScreens.find((s) => s.name === 'fuel-targets')?.options).toEqual({ href: null });
  });
});
