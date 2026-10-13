import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../app/session';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** An empty workout (R406) and the first-run tip's place in the session (R408). */

type Workout = { id: string; name: string; startedAt: number; restEndsAt: number | null; restSetId: string | null; exercises: unknown[] };

const set = (id: string, position: number, done: boolean) => ({ id, position, setType: 'working', done });
const BENCH = { id: 'we1', exerciseId: 'bench', name: 'Barbell bench press', position: 0, supersetGroup: null, sets: [set('s1', 0, false)] };

const mockState: { workout: Workout } = {
  workout: { id: 'w1', name: 'Workout', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: [] },
};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
jest.mock('../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => null) }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockState.workout, unit: 'kg', distanceUnit: 'km', musicApp: null, restSeconds: 120 }),
  bumpData: jest.fn(),
}));
jest.mock('../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./session/ExerciseBlock', () => ({ ExerciseBlock: () => null }));
jest.mock('./session/ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./session/RestBar', () => ({ RestBar: () => null }));
jest.mock('./session/FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
jest.mock('./native/SleepOfferBanner', () => ({ SleepOfferBanner: () => null }));
jest.mock('./SessionTip', () => ({
  SessionTip: () => {
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <MockText testID="session-tip-slot">tip</MockText>;
  },
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const NO_EXERCISES = 'No exercises yet. Add one and it shows here, ready to log.';

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => ([] as unknown[]).concat(t.props.children).join(''));
const addExercise = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).filter((b) => b.props.label === 'Add exercise');
const tipSlot = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.testID === 'session-tip-slot' && typeof n.type === 'string');

describe('the session with no exercises (R406)', () => {
  beforeEach(() => {
    mockState.workout = { ...mockState.workout, exercises: [] };
  });

  it('says what fills it, over Add exercise, which is its one filled button', () => {
    const tree = mount();
    const all = texts(tree);
    expect(all).toContain(NO_EXERCISES);
    expect(all.indexOf(NO_EXERCISES)).toBeLessThan(all.indexOf('Add exercise'));
    expect(addExercise(tree)).toHaveLength(1);
    expect(addExercise(tree)[0].props.variant).toBe('primary');
  });

  it('shows no first-run tip: there is nothing yet for it to point at', () => {
    expect(tipSlot(mount())).toHaveLength(0);
  });
});

describe('the session with exercises', () => {
  beforeEach(() => {
    mockState.workout = { ...mockState.workout, exercises: [BENCH] };
  });

  it('drops the line, and Add exercise goes back to outlined', () => {
    const tree = mount();
    expect(texts(tree)).not.toContain(NO_EXERCISES);
    expect(addExercise(tree)[0].props.variant).toBe('secondary');
  });

  it('gives the first-run tip its place over the first exercise (R408)', () => {
    expect(tipSlot(mount())).toHaveLength(1);
  });
});
