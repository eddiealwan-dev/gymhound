import { router } from 'expo-router';
import { StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import SavedWorkoutScreen from '../../app/(tabs)/saved/[id]';
import Routines from '../../app/(tabs)/routines/index';
import type { RoutineSummary } from '../db/repositories/routinesRepo';
import { ActiveWorkoutExistsError } from '../db/repositories/activeWorkout';
import { deleteSavedWorkout, getSavedWorkout, renameSavedWorkout, startSavedWorkout } from '../db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutDetail, SavedWorkoutSummary } from '../db/repositories/savedWorkoutsRepo';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';
import { SupersetBar } from './SupersetBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRoutines: RoutineSummary[];
let mockSaved: SavedWorkoutSummary[];
let mockId: string;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../db/repositories/routinesRepo', () => ({ listRoutines: () => mockRoutines, setActiveRoutine: jest.fn(), userRoutineCount: () => 0 }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: () => ({ unit: 'lb' }) }));
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({
  listSavedWorkouts: () => mockSaved,
  getSavedWorkout: jest.fn(),
  startSavedWorkout: jest.fn(),
  renameSavedWorkout: jest.fn(),
  deleteSavedWorkout: jest.fn(),
}));
/** Saved workouts are Pro (§18.21, R522): Pro by default here; the free gate has its own test. */
let mockPro = true;
afterEach(() => {
  mockPro = true;
});
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: (text: string) => mockAnnounce(text) }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Push A as saved: bench press 185 × 5, 185 × 5, 175 × 8 after a warmup, then a cable fly and triceps pushdown superset. */
const PUSH_A: SavedWorkoutDetail = {
  id: 'push-a',
  name: 'Push A',
  exercises: [
    {
      id: 'swe-1',
      exerciseId: 'barbell-bench-press',
      name: 'Barbell bench press',
      loggingType: 'weighted',
      equipment: 'barbell',
      supersetGroup: null,
      sets: [
        { setType: 'warmup', weight: 95, weightUnit: 'lb', reps: 10, durationS: null, distance: null, distanceUnit: null },
        ...[185, 185, 175].map((weight, i) => ({ setType: 'working' as const, weight, weightUnit: 'lb' as const, reps: [5, 5, 8][i], durationS: null, distance: null, distanceUnit: null })),
      ],
    },
    {
      id: 'swe-2',
      exerciseId: 'cable-fly',
      name: 'Cable fly',
      loggingType: 'weighted',
      equipment: 'cable',
      supersetGroup: 1,
      sets: [{ setType: 'working', weight: 30, weightUnit: 'lb', reps: 12, durationS: null, distance: null, distanceUnit: null }],
    },
    {
      id: 'swe-3',
      exerciseId: 'triceps-pushdown',
      name: 'Triceps pushdown',
      loggingType: 'weighted',
      equipment: 'cable',
      supersetGroup: 1,
      sets: [{ setType: 'working', weight: 50, weightUnit: 'lb', reps: 10, durationS: null, distance: null, distanceUnit: null }],
    },
  ],
};

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Every string drawn on screen right now (a closed sheet draws nothing). */
function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

const buttons = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(Button).filter((b) => b.props.label === label || b.props.accessibilityLabel === label);

function press(tree: ReactTestRenderer, label: string, index = 0) {
  act(() => buttons(tree, label)[index].props.onPress());
}

const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === label);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRoutines = [{ id: 'fb', name: 'Full body', isPremade: true, dayCount: 3, isActive: true }];
  mockSaved = [
    { id: 'legs', name: 'Legs', exerciseCount: 1, updatedAt: 0 },
    { id: 'push-a', name: 'Push A', exerciseCount: 3, updatedAt: 0 },
  ];
  mockId = 'push-a';
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(getSavedWorkout).mockImplementation((_db, id) => (id === 'push-a' ? PUSH_A : null));
  jest.mocked(startSavedWorkout).mockReturnValue('w1');
});

afterEach(() => jest.useRealTimers());

describe('Routines: Saved workouts (R122)', () => {
  it('lists them under "Saved workouts", after Yours, each with how many exercises it has', () => {
    const tree = mount(<Routines />);

    const shown = shownText(tree);
    expect(shown.indexOf('Saved workouts')).toBeGreaterThan(shown.indexOf('New routine'));
    // Earlier programs (the retired premade the mock has in use, R598) come after them.
    expect(shown.slice(shown.indexOf('Saved workouts') + 1, shown.indexOf('Earlier programs'))).toEqual(['Legs', '1 exercise', 'Start', 'Push A', '3 exercises', 'Start']);
    const heading = tree.root.findAll((n) => n.type === Text && n.props.children === 'Saved workouts')[0];
    expect(heading.props.accessibilityRole).toBe('header');
  });

  it('with none, says how to keep one', () => {
    mockSaved = [];
    const shown = shownText(mount(<Routines />));

    expect(shown.slice(shown.indexOf('Saved workouts') + 1, shown.indexOf('Earlier programs'))).toEqual(['Finish a workout and tap Save as a workout to keep it here.']);
  });

  it('a row opens the saved workout', () => {
    const tree = mount(<Routines />);

    const row = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === 'Push A, 3 exercises' && typeof n.props.onPress === 'function')[0];
    act(() => row.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/saved/push-a');
  });

  it('Start is a compact pill that starts the workout and opens the session', () => {
    const tree = mount(<Routines />);
    const [start] = buttons(tree, 'Start Push A');
    expect(start.props).toMatchObject({ label: 'Start', variant: 'secondary', size: 'compact' });

    press(tree, 'Start Push A');

    expect(startSavedWorkout).toHaveBeenCalledWith('db', 'push-a', expect.any(Number));
    expect(bumpData).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('free: the pill says Pro, and tapping it says saved workouts are Pro and starts nothing (§18.21, R522, Round 10)', () => {
    mockPro = false;
    const tree = mount(<Routines />);
    const pills = tree.root.findAllByType(Button).filter((b) => /^(Legs|Push A) is part of GymHound Pro$/.test(b.props.accessibilityLabel ?? ''));
    expect(pills.map((b) => b.props.label)).toEqual(['Pro', 'Pro']);
    expect(buttons(tree, 'Start')).toHaveLength(0);
    press(tree, 'Push A is part of GymHound Pro');
    expect(startSavedWorkout).not.toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain('Saved workouts are part of GymHound Pro.');
    mockPro = true;
  });

  it('while a workout is active, Start opens "Workout in progress" and starts nothing', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('w0');
    const tree = mount(<Routines />);

    press(tree, 'Start Push A');

    expect(startSavedWorkout).not.toHaveBeenCalled();
    const shown = shownText(tree);
    expect(shown).toContain('Workout in progress');
    expect(shown).toContain('Finish or discard the workout in progress before starting another.');
    press(tree, 'Resume');
    act(() => void jest.advanceTimersByTime(1000));
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('a workout started elsewhere at the same moment still opens the sheet', () => {
    jest.mocked(startSavedWorkout).mockImplementation(() => {
      throw new ActiveWorkoutExistsError();
    });
    const tree = mount(<Routines />);

    press(tree, 'Start Push A');

    expect(shownText(tree)).toContain('Workout in progress');
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('a saved workout (R122)', () => {
  it('shows its name, then each exercise with the sets it remembers, a superset marked', () => {
    const tree = mount(<SavedWorkoutScreen />);

    const shown = shownText(tree);
    expect(shown[0]).toBe('Routines');
    expect(shown).toContain('Push A');
    expect(shown.slice(shown.indexOf('Barbell bench press'))).toEqual([
      'Barbell bench press',
      'W 95 × 10, 185 × 5, 185 × 5, 175 × 8',
      'Cable fly',
      '30 × 12',
      'Triceps pushdown',
      '50 × 10',
    ]);
    const bars = tree.root.findAllByType(SupersetBar);
    expect(bars).toHaveLength(1);
    expect(bars[0].findAll((n) => n.type === Text).map((t) => t.props.children)).toEqual(['Cable fly', '30 × 12', 'Triceps pushdown', '50 × 10']);
  });

  it('Back goes to Routines', () => {
    const tree = mount(<SavedWorkoutScreen />);
    act(() => tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to Routines' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(router.back).toHaveBeenCalled();
  });

  it('Start is the filled button; it starts the workout and opens the session', () => {
    const tree = mount(<SavedWorkoutScreen />);
    expect(buttons(tree, 'Start')[0].props.variant ?? 'primary').toBe('primary');

    press(tree, 'Start');

    expect(startSavedWorkout).toHaveBeenCalledWith('db', 'push-a', expect.any(Number));
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('while a workout is active, Start opens "Workout in progress"', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('w0');
    const tree = mount(<SavedWorkoutScreen />);

    press(tree, 'Start');

    expect(startSavedWorkout).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Workout in progress');
  });

  it('Rename opens a sheet with the name; Save renames it', () => {
    const tree = mount(<SavedWorkoutScreen />);
    expect(buttons(tree, 'Rename')[0].props.variant).toBe('secondary');

    press(tree, 'Rename');
    expect(field(tree, 'Workout name')!.props.value).toBe('Push A');
    act(() => field(tree, 'Workout name')!.props.onChangeText('Chest day'));
    press(tree, 'Save');

    expect(renameSavedWorkout).toHaveBeenCalledWith('db', 'push-a', 'Chest day', expect.any(Number));
    expect(bumpData).toHaveBeenCalled();
    expect(field(tree, 'Workout name')).toBeUndefined();
  });

  it('Rename with an invalid name says why and changes nothing', () => {
    const tree = mount(<SavedWorkoutScreen />);
    press(tree, 'Rename');
    act(() => field(tree, 'Workout name')!.props.onChangeText(' '));
    press(tree, 'Save');

    expect(renameSavedWorkout).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Give the workout a name.');
  });

  it('Delete asks first; Keep keeps it, Delete deletes it and goes back to Routines', () => {
    const tree = mount(<SavedWorkoutScreen />);
    expect(buttons(tree, 'Delete')[0].props.variant).toBe('secondary');

    press(tree, 'Delete');
    expect(shownText(tree)).toContain('Delete Push A?');
    expect(shownText(tree)).toContain("Workouts you've finished keep their history.");
    press(tree, 'Keep');
    expect(deleteSavedWorkout).not.toHaveBeenCalled();

    press(tree, 'Delete');
    // The sheet's Delete is the second button so labelled.
    press(tree, 'Delete', 1);
    expect(deleteSavedWorkout).toHaveBeenCalledWith('db', 'push-a');
    expect(bumpData).toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(1000));
    expect(router.back).toHaveBeenCalled();
  });

  it('says so when it is not there', () => {
    mockId = 'gone';
    const shown = shownText(mount(<SavedWorkoutScreen />));
    expect(shown).toContain("That saved workout isn't here.");
    expect(shown).not.toContain('Start');
  });

  it('wraps rather than truncating, and uses no red', () => {
    const tree = mount(<SavedWorkoutScreen />);
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === 'W 95 × 10, 185 × 5, 185 × 5, 175 × 8')[0];
    expect(line.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ color: '#a39d90' });
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });
});

describe('a saved workout: review round 1', () => {
  it('Delete goes back once the sheet has gone, still showing the workout meanwhile', () => {
    jest.mocked(deleteSavedWorkout).mockImplementation(() => {
      jest.mocked(getSavedWorkout).mockReturnValue(null);
    });
    const tree = mount(<SavedWorkoutScreen />);
    press(tree, 'Delete');
    press(tree, 'Delete', 1);

    expect(deleteSavedWorkout).toHaveBeenCalledWith('db', 'push-a');
    expect(router.back).not.toHaveBeenCalled();
    const shown = shownText(tree);
    expect(shown).not.toContain("That saved workout isn't here.");
    expect(shown).toContain('Push A');
    act(() => void jest.advanceTimersByTime(1000));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("Delete with an unexpected error says Couldn't delete. Try again. in a muted line, tells the screen reader and stays", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(deleteSavedWorkout).mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    const tree = mount(<SavedWorkoutScreen />);
    press(tree, 'Delete');
    press(tree, 'Delete', 1);
    act(() => void jest.advanceTimersByTime(1000));

    expect(shownText(tree)).not.toContain('Delete Push A?');
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === "Couldn't delete. Try again.");
    expect(line).toHaveLength(1);
    expect(StyleSheet.flatten(line[0].props.style)).toMatchObject({ color: '#a39d90' });
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't delete. Try again.");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(bumpData).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Push A');
  });

  it('Rename with an unexpected error says "Couldn\'t save. Try again."', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(renameSavedWorkout).mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    const tree = mount(<SavedWorkoutScreen />);
    press(tree, 'Rename');
    press(tree, 'Save');
    expect(shownText(tree)).toContain("Couldn't save. Try again.");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Start with an unexpected error says "Couldn\'t start. Try again." and opens nothing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(startSavedWorkout).mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    const tree = mount(<SavedWorkoutScreen />);
    expect(() => press(tree, 'Start')).not.toThrow();
    expect(shownText(tree)).toContain("Couldn't start. Try again.");
    expect(router.push).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    press(tree, 'OK');
    expect(shownText(tree)).not.toContain("Couldn't start. Try again.");
  });
});
