import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { exerciseProgress } from '../../domain/sessionProgress';
import { readRow } from '../../domain/setTable';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * What draws again in the session (performance pass). Every write reads the whole workout again as new objects; only
 * the exercise blocks and set rows whose content changed should draw, and the clocks (the header's time, the rest
 * countdown) should never redraw the list. A block draw is counted by `exerciseProgress` (one call per block draw), a
 * set row draw by `readRow` (one call per row draw).
 */

const set = (id: string, position: number, extra: Partial<SetView> = {}): SetView => ({
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
  ...extra,
});

const exercise = (id: string, exerciseId: string, name: string, position: number, sets: SetView[]): WorkoutExerciseView => ({
  id,
  exerciseId,
  name,
  loggingType: 'weighted',
  equipment: 'barbell',
  position,
  supersetGroup: null,
  showRpe: false,
  note: null,
  restSeconds: null,
  rule: { setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb' },
  plannedWeight: 135,
  plannedUnit: 'lb',
  overrideWeight: null,
  overrideUnit: null,
  mark: null,
  sets,
  previous: [],
});

type Data = {
  workout: { id: string; name: string; startedAt: number; restEndsAt: number | null; restSetId: string | null; exercises: WorkoutExerciseView[] };
  unit: 'lb';
  gear: { bar: number; plates: Record<string, number> };
  distanceUnit: 'mi';
  musicApp: null;
  restSeconds: number;
};

function initial(): Data {
  return {
    workout: {
      id: 'w1',
      name: 'Push A',
      startedAt: 1_000,
      restEndsAt: null,
      restSetId: null,
      exercises: [
        exercise('we1', 'barbell-bench-press', 'Bench Press', 0, [set('b1', 0), set('b2', 1), set('b3', 2)]),
        exercise('we2', 'barbell-squat', 'Squat', 1, [set('q1', 0), set('q2', 1), set('q3', 2)]),
        exercise('we3', 'barbell-row', 'Row', 2, [set('r1', 0), set('r2', 1)]),
      ],
    },
    unit: 'lb',
    gear: { bar: 45, plates: { '45': 4, '25': 1, '10': 2, '5': 1, '2.5': 1 } },
    distanceUnit: 'mi',
    musicApp: null,
    restSeconds: 120,
  };
}

/** What the database holds now. Each read hands out a deep copy, as a real read makes new objects every time. */
const mockDb: { data: Data } = { data: initial() };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
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
  useDbQuery: () => JSON.parse(JSON.stringify(mockDb.data)),
  bumpData: jest.fn(),
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
// The header's clock, ticking for real (without expo-router's focus events).
jest.mock('../../state/useNow', () => ({
  useNow: (everyMs: number) => {
    const { useEffect, useState } = jest.requireActual<typeof import('react')>('react');
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      const timer = setInterval(() => setNow(Date.now()), everyMs);
      return () => clearInterval(timer);
    }, [everyMs]);
    return now;
  },
}));
jest.mock('../../domain/sessionProgress', () => {
  const actual = jest.requireActual('../../domain/sessionProgress');
  return { ...actual, exerciseProgress: jest.fn(actual.exerciseProgress) };
});
jest.mock('../../domain/setTable', () => {
  const actual = jest.requireActual('../../domain/setTable');
  return { ...actual, readRow: jest.fn(actual.readRow) };
});
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
/** How often the header drew, counted by its music sheet. */
const mockHeaderDraws = { count: 0 };
jest.mock('./MusicSheet', () => ({
  MusicSheet: () => {
    mockHeaderDraws.count += 1;
    return null;
  },
}));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('./FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
jest.mock('../native/SleepOfferBanner', () => ({ SleepOfferBanner: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** The exercises whose blocks drew since the counts were last cleared. */
const blocksDrawn = () => jest.mocked(exerciseProgress).mock.calls.map(([ex]) => (ex as WorkoutExerciseView).id);
/** The sets whose rows drew since the counts were last cleared. */
const rowsDrawn = () => jest.mocked(readRow).mock.calls.map(([row]) => row.set.id);
const clearCounts = () => {
  jest.mocked(exerciseProgress).mockClear();
  jest.mocked(readRow).mockClear();
};

/** A write: changes what the database holds, then the session reads again, as a bump of the data version makes it. */
function write(tree: ReactTestRenderer, change: (data: Data) => void) {
  const next = JSON.parse(JSON.stringify(mockDb.data)) as Data;
  change(next);
  mockDb.data = next;
  act(() => tree.update(<Session />));
}

let tree: ReactTestRenderer | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(10_000);
  mockDb.data = initial();
  act(() => {
    tree = create(<Session />);
  });
  clearCounts();
});

afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = undefined;
  jest.useRealTimers();
});

describe('what a write redraws in the session (performance pass)', () => {
  it('draws every block and row once when it opens', () => {
    clearCounts();
    act(() => tree!.unmount());
    act(() => {
      tree = create(<Session />);
    });
    expect(blocksDrawn().sort()).toEqual(['we1', 'we2', 'we3']);
    expect(rowsDrawn().sort()).toEqual(['b1', 'b2', 'b3', 'q1', 'q2', 'q3', 'r1', 'r2']);
  });

  it('a read that finds nothing changed redraws no block and no row', () => {
    write(tree!, () => {});
    expect(blocksDrawn()).toEqual([]);
    expect(rowsDrawn()).toEqual([]);
  });

  it('a value saved in one set redraws only its block and its row', () => {
    write(tree!, (data) => {
      data.workout.exercises[1].sets[1] = { ...data.workout.exercises[1].sets[1], weight: 185, weightUnit: 'lb' };
    });
    expect(blocksDrawn()).toEqual(['we2']);
    // q3 would take q2's weight as its suggestion, but today's target wins over a carried weight (spec 18.6).
    expect(rowsDrawn()).toEqual(['q2']);
  });

  it('a tick that starts a rest redraws the ticked block and the block the next set moves into, not the others', () => {
    write(tree!, (data) => {
      const [bench] = data.workout.exercises;
      bench.sets = bench.sets.map((s) => ({ ...s, weight: 135, weightUnit: 'lb', reps: 10, done: true, completedAt: 9_000 }));
      data.workout.restEndsAt = 10_000 + 120_000;
      data.workout.restSetId = 'b3';
    });
    // The bench block changed and holds the rest; the next set moved from b1 to q1, into the squat block.
    expect(blocksDrawn().sort()).toEqual(['we1', 'we2']);
    expect(rowsDrawn()).not.toContain('r1');
    expect(rowsDrawn()).not.toContain('r2');
  });

  it('+15s on the running rest redraws only the block that shows the countdown', () => {
    write(tree!, (data) => {
      const [bench] = data.workout.exercises;
      bench.sets[0] = { ...bench.sets[0], weight: 135, weightUnit: 'lb', reps: 10, done: true, completedAt: 9_000 };
      data.workout.restEndsAt = 10_000 + 120_000;
      data.workout.restSetId = 'b1';
    });
    clearCounts();
    write(tree!, (data) => {
      data.workout.restEndsAt = 10_000 + 135_000;
    });
    expect(blocksDrawn()).toEqual(['we1']);
    expect(rowsDrawn()).toEqual([]);
  });
});

describe('the clocks never redraw the list (performance pass)', () => {
  it('the header time and a running rest count down for a while without drawing a block or a row', () => {
    write(tree!, (data) => {
      const [bench] = data.workout.exercises;
      bench.sets[0] = { ...bench.sets[0], weight: 135, weightUnit: 'lb', reps: 10, done: true, completedAt: 9_000 };
      data.workout.restEndsAt = 10_000 + 120_000;
      data.workout.restSetId = 'b1';
    });
    clearCounts();
    mockHeaderDraws.count = 0;
    for (let i = 0; i < 5; i++) act(() => void jest.advanceTimersByTime(1_000));
    expect(blocksDrawn()).toEqual([]);
    expect(rowsDrawn()).toEqual([]);
    // Only the line with the time redraws, not the header with its buttons and music sheet.
    expect(mockHeaderDraws.count).toBe(0);
    expect(tree!.root.findAll((n) => n.props.accessibilityLabel === 'Rest, 1 minute 55 seconds left' && n.props.accessibilityRole === 'button').length).toBeGreaterThan(0);
  });
});
