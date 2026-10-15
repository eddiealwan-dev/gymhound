import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { Header } from './Header';
import { HoundMark } from './HoundMark';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockWidth = 390;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: 844, scale: 3, fontScale: 1 }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => '/',
  useFocusEffect: () => undefined,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../platform/profilePhotoFile', () => ({ profilePhotoExists: () => true, profilePhotoUri: (name: string) => `file:///docs/profile/${name}` }));
jest.mock('./HoundMark', () => ({ HoundMark: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(width: number): ReactTestRenderer {
  mockWidth = width;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Header />);
  });
  return tree;
}

const restingStyle = (node: ReactTestInstance) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
const roundButtons = (tree: ReactTestRenderer) =>
  tree.root.findAll((p) => typeof p.type !== 'string' && typeof p.props.onPress === 'function' && p.props.hitSlop !== undefined && ['Profile', 'Settings'].includes(p.props.accessibilityLabel));
const wordmark = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Text && n.props.children === 'GYMHOUND')[0];
/** A target's reach across: its width and its hit slop either side. */
const reach = (p: ReactTestInstance) => {
  const slop = typeof p.props.hitSlop === 'number' ? { left: p.props.hitSlop, right: p.props.hitSlop, top: p.props.hitSlop, bottom: p.props.hitSlop } : p.props.hitSlop;
  const s = restingStyle(p);
  return { across: s.width + slop.left + slop.right, down: s.height + slop.top + slop.bottom };
};

beforeEach(() => {
  mockDb = seededDb();
});

describe('the header keeps the wordmark whole at every width (design gate #13, ruling R-g2)', () => {
  it('never ellipsizes or shrinks the wordmark', () => {
    for (const width of [320, 390]) {
      const mark = wordmark(mount(width));
      expect(mark.props.numberOfLines).toBeUndefined();
      expect(mark.props.adjustsFontSizeToFit).toBeFalsy();
      expect(StyleSheet.flatten(mark.props.style)).toMatchObject({ fontSize: 38, flexShrink: 0 });
    }
  });

  it('below 360pt: a 40pt hound and 36pt round buttons, each still a 44pt target, with room for the wordmark', () => {
    const tree = mount(320);
    expect(tree.root.findByType(HoundMark).props.size).toBe(40);
    const buttons = roundButtons(tree);
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(restingStyle(b)).toMatchObject({ width: 36, height: 36 });
      expect(reach(b).across).toBeGreaterThanOrEqual(44);
      expect(reach(b).down).toBeGreaterThanOrEqual(44);
    }
    // 288pt between the gutters: hound 40 + 10 + wordmark 146, the gap before the buttons, and the buttons.
    const group = buttons[0].parent!;
    let row = group;
    while (row && StyleSheet.flatten(row.props.style)?.gap === undefined) row = row.parent!;
    const gap = StyleSheet.flatten(row.props.style).gap as number;
    const leftGroup = tree.root.findAll((n) => n.props.testID === 'header-lockup')[0];
    const before = StyleSheet.flatten(leftGroup.props.style).marginRight as number;
    expect(40 + 10 + 146 + before + 36 + gap + 36).toBeLessThanOrEqual(288);
    // Their slops meet in the gap between them and never overlap.
    expect(buttons[0].props.hitSlop.right + buttons[1].props.hitSlop.left).toBeLessThanOrEqual(gap);
  });

  it('at 360pt and wider: the 48pt hound and 40pt buttons, as before', () => {
    const tree = mount(390);
    expect(tree.root.findByType(HoundMark).props.size).toBe(48);
    for (const b of roundButtons(tree)) expect(restingStyle(b)).toMatchObject({ width: 40, height: 40 });
  });
});
