import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import RoutineDetailScreen from '../../app/(tabs)/routines/[id]';
import type { RoutineDetail, RoutineDetailExercise } from '../db/repositories/routinesRepo';
import {
  deleteRoutine,
  duplicateRoutine,
  getRoutineDetail,
  setActiveRoutine,
  userRoutineCount,
} from '../db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 11, 9, 0).getTime();

let mockId: string;
let mockPro: boolean;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../db/repositories/routinesRepo', () => ({
  getRoutineDetail: jest.fn(),
  setActiveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
  duplicateRoutine: jest.fn(),
  deleteRoutine: jest.fn(),
}));
jest.mock('../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const exercise = (id: string, name: string, over: Partial<RoutineDetailExercise> = {}): RoutineDetailExercise => ({
  id,
  exerciseId: id,
  name,
  loggingType: 'weighted',
  equipment: 'barbell',
  setCount: 3,
  repMin: 8,
  repMax: 12,
  increment: 5,
  incrementUnit: 'lb',
  supersetGroup: null,
  nextWeight: null,
  nextWeightUnit: null,
  ...over,
});

const PREMADE: RoutineDetail = {
  id: 'premade-ppl-6',
  name: 'Push/pull/legs',
  isPremade: true,
  isActive: false,
  days: [
    {
      id: 'push-a',
      name: 'Push A',
      exercises: [
        exercise('bench', 'Barbell bench press', { setCount: 4, repMin: 5, repMax: 8 }),
        exercise('fly', 'Cable fly', { supersetGroup: 1 }),
        exercise('pushdown', 'Cable triceps pushdown', { supersetGroup: 1 }),
      ],
    },
    { id: 'pull-a', name: 'Pull A', exercises: [exercise('plank', 'Plank', { loggingType: 'timed', repMin: 30, repMax: 60 })] },
  ],
};

const MINE: RoutineDetail = { ...PREMADE, id: 'mine', name: 'My split', isPremade: false };

const LIMIT = 'Free holds one routine of your own. GymHound Pro holds as many as you like.';

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<RoutineDetailScreen />);
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

/** The strings drawn inside one element. */
const textIn = (node: ReactTestInstance): string[] => node.children.flatMap((c) => (typeof c === 'string' ? [c] : textIn(c)));

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
const labels = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).map((b) => b.props.label);

function press(tree: ReactTestRenderer, label: string, index = 0) {
  act(() => buttons(tree, label)[index].props.onPress());
}

function show(detail: RoutineDetail | null) {
  mockId = detail?.id ?? 'gone';
  jest.mocked(getRoutineDetail).mockReturnValue(detail);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockPro = false;
  show(PREMADE);
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(userRoutineCount).mockReturnValue(0);
  jest.mocked(duplicateRoutine).mockReturnValue('copy-1');
});

afterEach(() => jest.useRealTimers());

describe('Routine detail (§8.6)', () => {
  it("shows the routine's days in order, each with its exercises and their sets and reps", () => {
    const tree = mount();

    expect(getRoutineDetail).toHaveBeenCalledWith('db', 'premade-ppl-6');
    const shown = shownText(tree);
    expect(shown).toContain('Push/pull/legs');
    expect(shown).toContain('2 days');
    const order = ['Push A', 'Barbell bench press', '4×5–8', 'Cable fly', 'Cable triceps pushdown', 'Pull A', 'Plank', '3×30–60s'];
    expect(order.map((s) => shown.indexOf(s))).toEqual([...order.map((s) => shown.indexOf(s))].sort((a, b) => a - b));
    expect(order.every((s) => shown.includes(s))).toBe(true);
  });

  it('draws the superset bar in the text colour beside the exercises of a superset only', () => {
    const tree = mount();

    const bars = tree.root.findAll(
      (n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderLeftWidth === 3,
    );
    expect(bars).toHaveLength(1);
    expect(StyleSheet.flatten(bars[0].props.style).borderLeftColor).toBe('#f1ece2');
    const inBar = textIn(bars[0]);
    expect(inBar).toEqual(expect.arrayContaining(['Cable fly', 'Cable triceps pushdown']));
    expect(inBar).not.toContain('Barbell bench press');
  });

  it('a premade has Set active and Duplicate, and no Edit or Delete', () => {
    const tree = mount();

    expect(labels(tree)).toEqual(['Set active', 'Duplicate']);
    expect(buttons(tree, 'Set active')[0].props.variant ?? 'primary').toBe('primary');
  });

  it('your own routine also has Edit and Delete', () => {
    show(MINE);
    const tree = mount();

    expect(labels(tree)).toEqual(['Set active', 'Duplicate', 'Edit', 'Delete']);
  });

  it('the active routine shows the Active mark instead of Set active', () => {
    show({ ...MINE, isActive: true });
    const tree = mount();

    expect(buttons(tree, 'Set active')).toHaveLength(0);
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Active' && n.props.accessible === true)).toHaveLength(1);
  });

  it('says so when the routine is not there', () => {
    show(null);
    const tree = mount();

    expect(shownText(tree)).toContain('Routine not found.');
    expect(labels(tree)).toEqual([]);
  });

  it('Back returns to Routines', () => {
    const tree = mount();

    act(() => tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to Routines' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Routine detail: Set active (R80)', () => {
  it('makes it the active routine when no workout is running', () => {
    const tree = mount();

    press(tree, 'Set active');

    expect(setActiveRoutine).toHaveBeenCalledWith('db', 'premade-ppl-6');
    expect(bumpData).toHaveBeenCalled();
  });

  it('while a workout runs, changes nothing and shows "Workout in progress"', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('w1');
    const tree = mount();

    press(tree, 'Set active');

    expect(setActiveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Workout in progress');
  });
});

describe('Routine detail: Duplicate and the free limit (R88)', () => {
  it('copies the routine now and opens the copy', () => {
    const tree = mount();

    press(tree, 'Duplicate');

    expect(duplicateRoutine).toHaveBeenCalledWith('db', 'premade-ppl-6', NOW);
    expect(bumpData).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/routines/copy-1');
  });

  it('with one routine of your own, shows the limit sheet and copies nothing', () => {
    jest.mocked(userRoutineCount).mockReturnValue(1);
    const tree = mount();

    press(tree, 'Duplicate');

    expect(duplicateRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain(LIMIT);
    press(tree, 'See Pro');
    act(() => void jest.advanceTimersByTime(400));
    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(shownText(tree)).not.toContain('GymHound Pro is coming.');
  });

  it('with Pro on, copies however many you have', () => {
    jest.mocked(userRoutineCount).mockReturnValue(4);
    mockPro = true;
    const tree = mount();

    press(tree, 'Duplicate');

    expect(duplicateRoutine).toHaveBeenCalledWith('db', 'premade-ppl-6', NOW);
    expect(shownText(tree)).not.toContain(LIMIT);
  });
});

describe('Routine detail: Edit and Delete (R89, R90)', () => {
  it('Edit opens the editor for this routine', () => {
    show(MINE);
    const tree = mount();

    press(tree, 'Edit');

    expect(router.push).toHaveBeenCalledWith('/routines/edit/mine');
  });

  it('Delete asks first; Keep changes nothing', () => {
    show(MINE);
    const tree = mount();

    press(tree, 'Delete');
    const shown = shownText(tree);
    expect(shown).toContain('Delete this routine?');
    expect(shown).toContain('Workouts you finished with it stay in History.');

    press(tree, 'Keep');
    expect(deleteRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).not.toContain('Delete this routine?');
  });

  it('confirming deletes the routine and goes back to Routines', () => {
    show(MINE);
    const tree = mount();

    press(tree, 'Delete');
    press(tree, 'Delete', 1);

    expect(deleteRoutine).toHaveBeenCalledWith('db', 'mine');
    expect(bumpData).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });
});
