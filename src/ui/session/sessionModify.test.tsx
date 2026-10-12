import { router } from 'expo-router';
import { act, create } from 'react-test-renderer';
import Session from '../../../app/session';
import { replaceWith } from '../../state/sessionActions';
import { ConfirmSheet } from '../Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const squat = { id: 'we1', exerciseId: 'barbell-back-squat', name: 'Barbell back squat', sets: [{ done: false }], supersetGroup: null };
const bench = { id: 'we2', exerciseId: 'barbell-bench-press', name: 'Barbell bench press', sets: [{ done: true }], supersetGroup: null };
const mockWorkout = { id: 'w1', name: 'Full body A', startedAt: 1_000, restEndsAt: null, exercises: [squat, bench] };

/** What each block and the Modify sheet were last drawn with. */
const mockBlocks = new Map<string, Record<string, unknown>>();
let mockModify: Record<string, unknown> = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockWorkout, unit: 'kg', distanceUnit: 'km', restSeconds: 120 }),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn(), replaceWith: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({
  ExerciseBlock: (props: { ex: { id: string } }) => {
    mockBlocks.set(props.ex.id, props);
    return null;
  },
}));
jest.mock('../ModifySheet', () => ({
  ModifySheet: (props: Record<string, unknown>) => {
    mockModify = props;
    return null;
  },
}));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('./FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

const call = (fn: unknown, ...args: unknown[]) => act(() => (fn as (...a: unknown[]) => void)(...args));

beforeEach(() => {
  jest.useFakeTimers();
  mockBlocks.clear();
  jest.mocked(replaceWith).mockClear();
  jest.mocked(router.push).mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Modify and Stats in a workout (R553, R554)', () => {
  it('Stats opens the exercise’s chart and history over the workout', () => {
    mount();
    call(mockBlocks.get('we1')!.onOpenStats);
    expect(router.push).toHaveBeenCalledWith('/lift-stats/barbell-back-squat');
  });

  it('Modify opens the list for that exercise, leaving out what is already in the workout; a pick swaps it today', () => {
    mount();
    call(mockBlocks.get('we1')!.onOpenModify);
    expect(mockModify.target).toEqual({ exerciseId: 'barbell-back-squat', name: 'Barbell back squat', programExerciseId: null, inUse: ['barbell-back-squat', 'barbell-bench-press'] });
    expect(mockModify.note).toBe("Just for this workout. To swap it for good, use Modify on the routine's page.");
    call(mockModify.onChoose, 'front-squat');
    expect(replaceWith).toHaveBeenCalledWith('db', 'we1', 'front-squat');
    expect(mockModify.target).toBeNull();
  });

  it('with completed sets it asks first, as Replace does', () => {
    const tree = mount();
    call(mockBlocks.get('we2')!.onOpenModify);
    call(mockModify.onChoose, 'dumbbell-bench-press');
    expect(replaceWith).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1000));
    const ask = tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Replace Barbell bench press?')!;
    expect(ask.props.visible).toBe(true);
    call(ask.props.onConfirm);
    expect(replaceWith).toHaveBeenCalledWith('db', 'we2', 'dumbbell-bench-press');
  });

  it('keeps the same opener functions from draw to draw, so blocks do not redraw for them', () => {
    const tree = mount();
    const first = mockBlocks.get('we1')!;
    act(() => tree.update(<Session />));
    expect(mockBlocks.get('we1')!.onOpenModify).toBe(first.onOpenModify);
    expect(mockBlocks.get('we1')!.onOpenStats).toBe(first.onOpenStats);
  });
});
