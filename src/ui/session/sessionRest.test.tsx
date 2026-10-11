import { Keyboard } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { ExerciseBlock } from './ExerciseBlock';
import { RestBar } from './RestBar';
import { RestInline } from './RestInline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Where a running rest is counted down (Task 26, R41), with the real `ExerciseBlock`: under the set that started it, or,
 * when no set row can show it, in the rest bar. Never both, and never neither.
 */

const set = (id: string, position: number): SetView => ({
  id,
  position,
  setType: 'working',
  weight: null,
  weightUnit: null,
  reps: null,
  rpe: null,
  durationS: null,
  distance: null,
  distanceUnit: null,
  done: false,
  completedAt: null,
});

const mockBench: WorkoutExerciseView = {
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
  sets: [set('s1', 0), set('s2', 1)],
  previous: [],
};

const mockState: { restEndsAt: number | null; restSetId: string | null; exercises?: WorkoutExerciseView[] } = {
  restEndsAt: null,
  restSetId: null,
};
/** What happened, in order: saves, the keyboard closing, and the panel the ⋯ menu was drawn with. */
const mockOrder: string[] = [];

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({
    workout: {
      id: 'w1',
      name: 'Push A',
      startedAt: 1_000,
      restEndsAt: mockState.restEndsAt,
      restSetId: mockState.restSetId,
      exercises: mockState.exercises ?? [mockBench],
    },
    unit: 'lb',
    gear: { bar: 45, plates: { '45': 4, '25': 1, '10': 2, '5': 1, '2.5': 1 } },
    distanceUnit: 'mi',
    musicApp: null,
    restSeconds: 120,
  }),
  bumpData: jest.fn(),
}));
jest.mock('../../state/draftFlush', () => ({
  ...jest.requireActual('../../state/draftFlush'),
  flushAll: jest.fn(() => void mockOrder.push('flushAll')),
}));
jest.mock('../../state/sessionActions', () => ({
  addSetTo: jest.fn(),
  addWarmupTo: jest.fn(),
  commitSetField: jest.fn(),
  removeSetFrom: jest.fn(),
  saveNote: jest.fn(),
  tick: jest.fn(),
  untick: jest.fn(),
  finish: jest.fn(),
  discard: jest.fn(),
  restMinus15: jest.fn(),
  restPlus15: jest.fn(),
  restSkip: jest.fn(),
}));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseMenu', () => ({
  ExerciseMenu: ({ exerciseId, initialPanel }: { exerciseId: string | null; initialPanel?: string }) => {
    mockOrder.push(`menu ${exerciseId ?? 'closed'} ${initialPanel ?? '-'}`);
    return null;
  },
}));
// Both countdowns draw nothing here: which one is placed, and with what, is what the tests read.
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('./RestInline', () => ({ RestInline: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  mockOrder.length = 0;
  mockState.exercises = undefined;
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => void mockOrder.push('dismiss'));
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

const ENDS_AT = 60_000;

describe('a running rest shows exactly one countdown (Task 26, R41)', () => {
  it.each([
    { anchor: 'is a set of the workout', restSetId: 's1', shown: 'under its set' },
    { anchor: 'is no longer in the workout', restSetId: 'gone', shown: 'in the rest bar' },
    { anchor: 'is null', restSetId: null, shown: 'in the rest bar' },
  ])('when the set that started it $anchor, it is $shown', ({ restSetId, shown }) => {
    mockState.restEndsAt = ENDS_AT;
    mockState.restSetId = restSetId;

    act(() => {
      tree = create(<Session />);
    });

    const inline = tree!.root.findAllByType(RestInline);
    const bars = tree!.root.findAllByType(RestBar);
    expect(inline.length + bars.length).toBe(1);
    const [countdown] = shown === 'under its set' ? inline : bars;
    expect(countdown).toBeDefined();
    expect(countdown.props).toMatchObject({ workoutId: 'w1', endsAt: ENDS_AT });
  });
});

describe("Rest's up under its set once the rest runs out (spec 18.6)", () => {
  it('passes the held rest and its words to the block holding the set, which draws its row under that set', () => {
    const benchOneTicked: WorkoutExerciseView = {
      ...mockBench,
      sets: [{ ...set('s1', 0), done: true, weight: 135, weightUnit: 'lb', reps: 5, completedAt: 1 }, set('s2', 1)],
    };
    const squat: WorkoutExerciseView = { ...mockBench, id: 'we2', exerciseId: 'barbell-squat', name: 'Squat', position: 1, sets: [set('q1', 0)] };
    mockState.exercises = [benchOneTicked, squat];
    mockState.restEndsAt = ENDS_AT;
    mockState.restSetId = 's1';
    act(() => {
      tree = create(<Session />);
    });
    expect(tree!.root.findByType(RestInline).props.endsAt).toBe(ENDS_AT);

    // The rest watcher clears the rest at zero (ENDS_AT is long past).
    mockState.restEndsAt = null;
    mockState.restSetId = null;
    act(() => tree!.update(<Session />));

    const [benchBlock, squatBlock] = tree!.root.findAllByType(ExerciseBlock);
    expect(benchBlock.props).toMatchObject({ restUp: { setId: 's1', endsAt: ENDS_AT }, upText: "Rest's up · Set 2 next" });
    const rows = tree!.root.findAllByType(RestInline);
    expect(rows).toHaveLength(1);
    expect(rows[0].props).toMatchObject({ endsAt: ENDS_AT, upText: "Rest's up · Set 2 next" });
    expect(benchBlock.findAllByType(RestInline)).toHaveLength(1);
    expect(squatBlock.findAllByType(RestInline)).toHaveLength(0);
    expect(tree!.root.findAllByType(RestBar)).toHaveLength(0);
  });
});

describe('the countdown opens the rest choices (spec 18.6)', () => {
  it('tapping the countdown saves and closes the keyboard first', () => {
    mockState.restEndsAt = ENDS_AT;
    mockState.restSetId = 's1';
    act(() => {
      tree = create(<Session />);
    });
    const countdown = tree!.root.findByType(RestInline);
    mockOrder.length = 0;

    act(() => countdown.props.onOpenRest());

    expect(mockOrder).toEqual(['flushAll', 'dismiss', 'menu we1 rest']);
  });
});
