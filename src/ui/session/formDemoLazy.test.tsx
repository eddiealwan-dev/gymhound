import { Keyboard } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { ExerciseBlock } from './ExerciseBlock';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The form demo reads the photo index (about 1,746 requires), so the session screen loads it only once a demo is
 * opened (review of R86). What its module records: how often it was loaded, and what it was drawn with. It lives on the
 * global object, since a module factory can run before this file's own variables are set.
 */
type DemoLog = { loads: number; props: { exerciseId: string | null }[] };
const demoLog = (): DemoLog => {
  const g = globalThis as { mockDemoLog?: DemoLog };
  g.mockDemoLog ??= { loads: 0, props: [] };
  return g.mockDemoLog;
};
jest.mock('../FormDemo', () => {
  const g = globalThis as { mockDemoLog?: { loads: number; props: unknown[] } };
  g.mockDemoLog ??= { loads: 0, props: [] };
  g.mockDemoLog.loads += 1;
  return {
    FormDemo: (props: { exerciseId: string | null }) => {
      g.mockDemoLog!.props.push(props);
      return null;
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({
  addSetTo: jest.fn(),
  addWarmupTo: jest.fn(),
  commitSetField: jest.fn(),
  removeSetFrom: jest.fn(),
  saveNote: jest.fn(),
  tick: jest.fn(),
  untick: jest.fn(),
  restPlus15: jest.fn(),
}));
jest.mock('./RestInline', () => ({ RestInline: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const bench: WorkoutExerciseView = {
  id: 'we1',
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press',
  loggingType: 'weighted',
  equipment: 'barbell',
  position: 0,
  supersetGroup: null,
  showRpe: false,
  note: null,
  restSeconds: null,
  rule: null,
  plannedWeight: null,
  plannedUnit: null,
  overrideWeight: null,
  overrideUnit: null,
  mark: null,
  sets: [],
  previous: [],
};

it('loads the form demo only once its name is tapped, then keeps it', () => {
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ExerciseBlock
        workoutId="w1"
        ex={bench}
        unit="lb"
        gear={{ bar: 45, plates: { '45': 4 } }}
        distanceUnit="mi"
        onOpenMenu={() => {}}
        inSuperset={false}
        joinsNext={false}
        supersetLabel={null}
        restWaitsFor={null}
        latestTickedSetId={null}
        restEndsAt={null}
        restSetId={null}
        restUp={null}
        upText=""
        settingsRestSeconds={120}
        onOpenRest={() => {}}
        onOpenMark={() => {}}
        nextSetId={null}
      />,
    );
  });
  expect(demoLog().loads).toBe(0);
  expect(demoLog().props).toHaveLength(0);

  const name = tree.root.find((n) => n.props.accessibilityLabel === 'Show form for Bench Press' && typeof n.props.onPress === 'function');
  act(() => name.props.onPress());

  expect(demoLog().loads).toBe(1);
  expect(demoLog().props[demoLog().props.length - 1].exerciseId).toBe('barbell-bench-press');
  act(() => tree.unmount());
});
