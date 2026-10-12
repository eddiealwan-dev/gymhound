import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import { getActiveWorkoutView } from '../../db/repositories/workoutViewsRepo';
import { seededDb } from '../../db/testing/fixtures';
import type { Db } from '../../db/types';
import { addExercise, addSetTo, commitSetField, startEmpty, tick } from '../../state/sessionActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * How much of the session draws again for a write (R400, R406), with a real database and the real screen: each exercise
 * block counts its draws.
 */

let mockDb: Db;
const mockDraws: string[] = [];
jest.mock('../../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('./ExerciseBlock', () => {
  const actual = jest.requireActual<typeof import('./ExerciseBlock')>('./ExerciseBlock');
  return {
    ...actual,
    ExerciseBlock: (props: Parameters<typeof actual.ExerciseBlock>[0]) => {
      mockDraws.push(props.ex.name);
      return actual.ExerciseBlock(props);
    },
  };
});
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: jest.fn(() => true) },
    useNavigation: () => ({ addListener: () => () => {} }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), [effect]);
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning', Success: 'success' },
}));
jest.mock('../../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
jest.mock('../../platform/restTimer', () => ({
  getRestTimerSurface: () => new Proxy({}, { get: () => () => Promise.resolve() }),
}));
jest.mock('../../state/backup', () => ({ takeSnapshotSafely: jest.fn() }));
jest.mock('./FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
jest.mock('./MusicBar', () => ({ MusicBar: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const EXERCISES = ['barbell-bench-press', 'barbell-back-squat', 'barbell-deadlift', 'barbell-curl'];
let tree: ReactTestRenderer;

beforeEach(() => {
  jest.useFakeTimers();
  mockDb = seededDb();
  act(() => {
    startEmpty(mockDb);
    for (const id of EXERCISES) addExercise(mockDb, id);
  });
  act(() => void (tree = create(<Session />)));
  mockDraws.length = 0;
});
afterEach(() => {
  act(() => tree.unmount());
  jest.useRealTimers();
});

const view = () => getActiveWorkoutView(mockDb)!;

describe('the session draws again only what a write changed (R400, R406)', () => {
  it('draws all four blocks at the start', () => {
    act(() => tree.update(<Session />));
    expect(view().exercises).toHaveLength(4);
  });

  it('a weight saved on one set draws only its block', () => {
    const squat = view().exercises[1];
    act(() => commitSetField(mockDb, squat.sets[0].id, { weight: 225, weightUnit: 'lb' }));
    expect(mockDraws).toEqual(['Barbell back squat']);
  });

  it('a set added to one exercise draws only its block', () => {
    const curl = view().exercises[3];
    act(() => addSetTo(mockDb, curl.id));
    expect(mockDraws).toEqual(['Barbell curl']);
  });

  it("a tick draws the ticked block and the one the next set's ring moves to, not the others", () => {
    const [bench, squat] = view().exercises;
    expect(bench.sets).toHaveLength(1);
    act(() => void tick(mockDb, bench, bench.sets[0], { weight: 135, reps: 5, durationS: null, distance: null }));
    expect(view().restSetId).toBe(bench.sets[0].id);
    expect(squat.sets[0].done).toBe(false);
    expect(new Set(mockDraws)).toEqual(new Set(['Barbell bench press', 'Barbell back squat']));
  });

  it('a second of the rest draws no block: the countdown draws itself', () => {
    const bench = view().exercises[0];
    act(() => void tick(mockDb, bench, bench.sets[0], { weight: 135, reps: 5, durationS: null, distance: null }));
    mockDraws.length = 0;
    for (let i = 0; i < 20; i++) act(() => void jest.advanceTimersByTime(250));
    expect(mockDraws).toEqual([]);
  });
});
