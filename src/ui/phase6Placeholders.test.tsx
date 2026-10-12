import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import TabsLayout from '../../app/(tabs)/_layout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase 6 Task 1 (R172, R186, R187): the routes and permissions Task 1 set up. Its stubs and placeholder routes have all
 * been filled by later tasks, which test them.
 */

/** The screens each `Tabs.Screen` registered, by name, with its options. */
const mockTabScreens: { name: string; options?: { href?: unknown } }[] = [];

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
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
