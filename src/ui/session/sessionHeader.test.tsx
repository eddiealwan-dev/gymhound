import { router } from 'expo-router';
import { Keyboard, ScrollView, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import { getActiveWorkoutView } from '../../db/repositories/workoutViewsRepo';
import type { MusicAppId } from '../../domain/types';
import { flushAll } from '../../state/draftFlush';
import { finish } from '../../state/sessionActions';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The session header (spec 18.6, Task 5): the progress under the name, the line that fills as sets are ticked, and the
 * Finish pill, which replaces the Finish at the bottom.
 */

type Workout = { id: string; name: string; startedAt: number; restEndsAt: number | null; restSetId: string | null; exercises: unknown[] };

const set = (id: string, position: number, done: boolean) => ({ id, position, setType: 'working', done });

/** Two exercises, each with its first set ticked and its second open: 2 of 4. */
const EXERCISES = [
  { id: 'we1', exerciseId: 'bench', name: 'Barbell bench press', position: 0, supersetGroup: null, sets: [set('s1', 0, true), set('s2', 1, false)] },
  { id: 'we2', exerciseId: 'ohp', name: 'Overhead press', position: 1, supersetGroup: null, sets: [set('s3', 0, true), set('s4', 1, false)] },
];
const mockState: { workout: Workout; musicApp: MusicAppId | null } = {
  workout: { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES },
  musicApp: null,
};

/** The props each block was last drawn with. */
const mockBlocks: { nextSetId: string | null }[] = [];

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockState.workout, unit: 'kg', distanceUnit: 'km', musicApp: mockState.musicApp, restSeconds: 120 }),
  bumpData: jest.fn(),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({
  ExerciseBlock: (props: { nextSetId: string | null }) => {
    mockBlocks.push(props);
    return null;
  },
}));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Session />);
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

const textWith = (tree: ReactTestRenderer, children: string) => tree.root.findAll((n) => n.type === Text && n.props.children === children);

/** The 2pt line along the bottom of the header. */
const progressLine = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === View && n.props.style?.height === 2);

const finishButtons = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).filter((b) => b.props.label === 'Finish');

const pressFinish = (tree: ReactTestRenderer) =>
  act(() => {
    const buttons = finishButtons(tree);
    expect(buttons).toHaveLength(1);
    buttons[0].props.onPress();
  });

type ActiveView = ReturnType<typeof getActiveWorkoutView>;

/** The workout as the database has it when Finish is pressed. */
function viewWith(sets: { done: boolean }[]) {
  jest.mocked(getActiveWorkoutView).mockReturnValue({ id: 'w1', name: 'Push A', exercises: [{ name: 'Barbell bench press', sets }] } as unknown as ActiveView);
}

beforeEach(() => {
  mockState.workout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES };
  mockState.musicApp = null;
  mockBlocks.length = 0;
  jest.mocked(router.replace).mockClear();
  jest.mocked(finish).mockReset();
  jest.mocked(flushAll).mockClear();
  jest.mocked(getActiveWorkoutView).mockReset();
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the session header (spec 18.6)', () => {
  it('shows the progress under the name', () => {
    const tree = mount();

    const name = textWith(tree, 'Push A');
    expect(name).toHaveLength(1);
    expect(name[0].props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 });

    const line = textWith(tree, '2/4 sets · 0:01');
    expect(line).toHaveLength(1);
    expect(line[0].props).toMatchObject({
      numberOfLines: 1,
      maxFontSizeMultiplier: 1.3,
      accessibilityLabel: '2 of 4 sets done. Workout time 0:01',
    });
  });

  it('the progress line is the share ticked', () => {
    const tree = mount();
    const line = progressLine(tree);
    expect(line).toHaveLength(1);
    expect(line[0].props.style).toMatchObject({ width: '50%', backgroundColor: '#f1ece2' });
    expect(line[0].props.accessibilityElementsHidden).toBe(true);
    expect(line[0].props.importantForAccessibility).toBe('no-hide-descendants');

    mockState.workout = { ...mockState.workout, exercises: [] };
    const empty = mount();
    expect(progressLine(empty)[0].props.style.width).toBe('0%');
    expect(textWith(empty, '0:01')).toHaveLength(1);
    expect(shownText(empty).some((t) => t.includes('sets'))).toBe(false);
  });

  it('Finish is in the header and not at the bottom', () => {
    const tree = mount();

    const finishes = finishButtons(tree);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].props).toMatchObject({ variant: 'secondary', size: 'compact', maxFontSizeMultiplier: 1.3 });
    expect(
      tree.root
        .findByType(ScrollView)
        .findAllByType(Button)
        .map((b) => b.props.label),
    ).toEqual(['Add exercise', 'Discard workout']);
  });

  it('header Finish runs the same checks', () => {
    viewWith([{ done: false }]);
    const tree = mount();
    pressFinish(tree);
    expect(shownText(tree)).toContain('Nothing is ticked yet.');
    expect(router.replace).not.toHaveBeenCalled();

    viewWith([{ done: true }]);
    jest.mocked(finish).mockReturnValue('finished');
    const ticked = mount();
    pressFinish(ticked);
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
  });

  it('Finish in the header saves first', () => {
    viewWith([{ done: true }]);
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();

    pressFinish(tree);

    expect(flushAll).toHaveBeenCalled();
    expect(jest.mocked(flushAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(getActiveWorkoutView).mock.invocationCallOrder[0]);
  });

  it('passes each block the next set', () => {
    mount();
    expect(mockBlocks.length).toBeGreaterThanOrEqual(2);
    expect(mockBlocks.map((b) => b.nextSetId)).toEqual(mockBlocks.map(() => 's2'));
  });
});
