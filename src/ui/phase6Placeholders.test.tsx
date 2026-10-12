import { router } from 'expo-router';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import TabsLayout from '../../app/(tabs)/_layout';
import WorkoutDetailRoute from '../../app/(tabs)/history/[id]';
import WorkoutEditRoute from '../../app/(tabs)/history/edit/[id]';
import LiftRoute from '../../app/(tabs)/lift/[id]';
import LiftsRoute from '../../app/(tabs)/lifts';
import PhotosRoute from '../../app/(tabs)/photos';
import PhotoRoute from '../../app/photo/[id]';
import { Footer } from './Footer';
import { ConsistencyCalendar } from './history/ConsistencyCalendar';
import { LiftsSection } from './stats/LiftsSection';
import { PhotosRow } from './stats/PhotosRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase 6 Task 1 (R172, R187): the stubs and placeholder routes later tasks fill. The stubs draw nothing; each route
 * says "Not built yet." and can be left. None of these routes has a footer (§18.4).
 */

/** The screens each `Tabs.Screen` registered, by name, with its options. */
const mockTabScreens: { name: string; options?: { href?: unknown } }[] = [];
/** Whether the router has somewhere to go back to; a link opened cold has not. */
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), canGoBack: () => mockCanGoBack },
  useLocalSearchParams: () => ({ id: 'x' }),
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
  jest.mocked(router.navigate).mockClear();
  mockCanGoBack = true;
});

/** Each route, the label of its way out, and where that goes when there is no history to go back to. */
const ROUTES = [
  ['/history/[id]', WorkoutDetailRoute, 'Back to History', '/history'],
  ['/history/edit/[id]', WorkoutEditRoute, 'Cancel', '/history'],
  ['/lifts', LiftsRoute, 'Back to Stats', '/stats'],
  ['/lift/[id]', LiftRoute, 'Back', '/lifts'],
  ['/photos', PhotosRoute, 'Back to Stats', '/stats'],
  ['/photo/[id]', PhotoRoute, 'Close', '/photos'],
] as const;

/** The control labelled `label` that does something when pressed. */
const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => (n.props.accessibilityLabel === label || n.props.label === label) && typeof n.props.onPress === 'function')[0];

describe('the placeholder routes', () => {
  it.each(ROUTES)('%s says "Not built yet." and has no footer', (_route, Route) => {
    const tree = render(<Route />);
    expect(text(tree)).toContain('Not built yet.');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it.each(ROUTES)('%s goes back', (_route, Route, label) => {
    const tree = render(<Route />);
    act(() => control(tree, label).props.onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it.each(ROUTES)('%s, opened with nothing to go back to, goes to its fallback', (_route, Route, label, fallback) => {
    mockCanGoBack = false;
    const tree = render(<Route />);
    act(() => control(tree, label).props.onPress());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(fallback);
  });
});

describe('the stubs draw nothing until their task fills them', () => {
  it.each([
    ['LiftsSection', <LiftsSection key="l" today="2026-10-11" />],
    ['PhotosRow', <PhotosRow key="p" today="2026-10-11" />],
    ['ConsistencyCalendar', <ConsistencyCalendar key="k" month="2026-10" today="2026-10-11" onMonthChange={() => {}} />],
  ])('%s', (_name, element) => {
    expect(render(element).toJSON()).toBeNull();
  });
});

describe('the tabs layout', () => {
  it.each(['history/[id]', 'history/edit/[id]', 'lifts', 'lift/[id]', 'photos'])(
    'registers %s as a hidden tab route, so the header and dock stay (R172)',
    (name) => {
      mockTabScreens.length = 0;
      render(<TabsLayout />);
      expect(mockTabScreens.find((s) => s.name === name)?.options).toEqual({ href: null });
    },
  );
});

describe('app.json (R186)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the config file itself
  const { expo } = require('../../app.json') as { expo: { android: Record<string, unknown>; plugins: unknown[] } };

  it('blocks the activity recognition permission expo-sensors adds on Android: Android steps wait for Health Connect', () => {
    expect(expo.android.blockedPermissions).toEqual(['android.permission.ACTIVITY_RECOGNITION']);
    expect(expo.android.predictiveBackGestureEnabled).toBe(false);
  });

  it('names the motion, photo and camera uses', () => {
    expect(expo.plugins).toContainEqual(['expo-sensors', { motionPermission: 'GymHound reads your step count only to show your steps on Stats.' }]);
    expect(expo.plugins).toContainEqual([
      'expo-image-picker',
      {
        photosPermission: 'GymHound uses your photos only for exercise and progress pictures you choose.',
        cameraPermission: 'GymHound uses the camera only to take exercise and progress pictures.',
        microphonePermission: false,
      },
    ]);
  });
});
