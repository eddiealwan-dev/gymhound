import { router } from 'expo-router';
import { useState } from 'react';
import { act, create } from 'react-test-renderer';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { Button } from '../Button';
import { ExerciseMenu } from './ExerciseMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({
  moveBlock: jest.fn(),
  removeFromWorkout: jest.fn(),
  setRpeShown: jest.fn(),
  toggleSuperset: jest.fn(),
}));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** An exercise with the given sets (`true` is a ticked one). */
const exercise = (...done: boolean[]): WorkoutExerciseView =>
  ({
    id: 'we1',
    name: 'Bench Press',
    supersetGroup: null,
    showRpe: false,
    sets: done.map((d, i) => ({ id: `s${i}`, done: d })),
  }) as unknown as WorkoutExerciseView;

const onClose = jest.fn();

/** The menu open on the exercise, closing itself the way the session screen does when it is told to. */
function Host({ ex }: { ex: WorkoutExerciseView }) {
  const [id, setId] = useState<string | null>(ex.id);
  return (
    <ExerciseMenu
      exercises={[ex]}
      exerciseId={id}
      onClose={() => {
        onClose();
        setId(null);
      }}
    />
  );
}

function mount(ex: WorkoutExerciseView) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Host ex={ex} />);
  });
  return tree;
}

/** Every string drawn on screen right now (a closed sheet draws nothing). */
function shownText(tree: ReturnType<typeof create>): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

function press(tree: ReturnType<typeof create>, label: string) {
  const buttons = tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  expect(buttons).toHaveLength(1);
  act(() => buttons[0].props.onPress());
}

/** iOS opens the next sheet or screen a moment after the last one closes. */
const afterSheetCloses = () => act(() => void jest.advanceTimersByTime(400));

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(router.push).mockClear();
  onClose.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ExerciseMenu: Replace asks first when the exercise has ticked sets (R32)', () => {
  it('opens the picker in replace mode at once when nothing is ticked', () => {
    const tree = mount(exercise(false, false));

    press(tree, 'Replace');
    afterSheetCloses();

    expect(shownText(tree).join(' ')).not.toContain('Replace Bench Press?');
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pick-exercise', params: { mode: 'replace', workoutExerciseId: 'we1' } });
  });

  it('asks "Replace Bench Press?" with a ticked set, and does not open the picker yet', () => {
    const tree = mount(exercise(true, false));

    press(tree, 'Replace');
    afterSheetCloses();

    const text = shownText(tree);
    expect(text).toEqual(expect.arrayContaining(['Replace Bench Press?', 'Its ticked sets will be cleared.', 'Replace', 'Keep']));
    expect(router.push).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the picker in replace mode once Replace is confirmed', () => {
    const tree = mount(exercise(true, false));
    press(tree, 'Replace');
    afterSheetCloses();

    press(tree, 'Replace');
    expect(onClose).toHaveBeenCalledTimes(1);
    afterSheetCloses();

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/pick-exercise', params: { mode: 'replace', workoutExerciseId: 'we1' } });
  });

  it('opens nothing and changes nothing on Keep', () => {
    const tree = mount(exercise(true, false));
    press(tree, 'Replace');
    afterSheetCloses();

    press(tree, 'Keep');
    afterSheetCloses();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(shownText(tree)).toEqual([]);
  });
});
