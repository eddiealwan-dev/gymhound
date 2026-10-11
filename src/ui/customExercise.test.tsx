import { router, Stack } from 'expo-router';
import { AccessibilityInfo, BackHandler, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import ExerciseEditorScreen from '../../app/exercise/[id]';
import { createCustomExercise, deleteCustomExercise, isExerciseArchived, isExerciseUsed, updateCustomExercise } from '../db/repositories/customExercisesRepo';
import type { ExerciseDetail } from '../db/repositories/exercisesRepo';
import { bumpData } from '../state/dataVersion';
import { useCreatedExercise } from '../state/createdExercise';
import { Button } from './Button';
import { ConfirmSheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { id: string; name?: string; from?: string };

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: jest.fn(() => null) },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('../db/repositories/exercisesRepo', () => ({
  getExercise: (_db: unknown, id: string) => mockExercises.find((e) => e.id === id) ?? null,
  listExercises: () => mockExercises,
}));
jest.mock('../db/repositories/customExercisesRepo', () => ({
  createCustomExercise: jest.fn(() => 'new-id'),
  updateCustomExercise: jest.fn(),
  deleteCustomExercise: jest.fn(() => 'deleted'),
  isExerciseUsed: jest.fn(() => false),
  isExerciseArchived: jest.fn(() => false),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const MINE: ExerciseDetail = {
  id: 'mine',
  name: 'Landmine press',
  aliases: [],
  primaryMuscles: ['front_delts'],
  secondaryMuscles: ['triceps'],
  equipment: 'barbell',
  pattern: 'isolation',
  loggingType: 'weighted',
  isCustom: true,
  instructions: [],
  sourceId: null,
};
const BENCH: ExerciseDetail = { ...MINE, id: 'barbell-bench-press', name: 'Barbell bench press', primaryMuscles: ['chest'], isCustom: false };
const mockExercises: ExerciseDetail[] = [BENCH, MINE];

const mounted: ReactTestRenderer[] = [];
function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ExerciseEditorScreen />);
  });
  mounted.push(tree);
  return tree;
}

const shows = (tree: ReactTestRenderer, words: string) => tree.root.findAll((n) => n.type === Text && n.props.children === words).length > 0;
const button = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAllByType(Button).filter((b) => (b.props.accessibilityLabel ?? b.props.label) === label);
  expect(found).toHaveLength(1);
  return found[0];
};
const tap = (tree: ReactTestRenderer, label: string) => act(() => button(tree, label).props.onPress());
const radio = (tree: ReactTestRenderer, label: string) => {
  const found = tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  expect(found).toHaveLength(1);
  return found[0];
};
const nameField = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === 'Exercise name')[0];
const typeName = (tree: ReactTestRenderer, text: string) => act(() => nameField(tree).props.onChangeText(text));
const sheet = (tree: ReactTestRenderer, title: string) => tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === title)!;
const lastGesture = () => {
  const calls = jest.mocked(Stack.Screen).mock.calls;
  return (calls[calls.length - 1][0] as { options: { gestureEnabled: boolean } }).options.gestureEnabled;
};

beforeEach(() => {
  jest.useFakeTimers();
  mockParams = { id: 'new' };
  useCreatedExercise.setState({ id: null });
  jest.mocked(router.back).mockClear();
  jest.mocked(createCustomExercise).mockClear();
  jest.mocked(updateCustomExercise).mockClear();
  jest.mocked(deleteCustomExercise).mockClear();
  jest.mocked(isExerciseUsed).mockReturnValue(false);
  jest.mocked(isExerciseArchived).mockReturnValue(false);
  jest.mocked(bumpData).mockClear();
  jest.mocked(Stack.Screen).mockClear();
});
afterEach(() => {
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  jest.useRealTimers();
});

describe('a new exercise (R108)', () => {
  it('is titled New exercise and starts from the search text, with no Delete', () => {
    mockParams = { id: 'new', name: 'Landmine', from: 'picker' };
    const tree = mount();
    expect(shows(tree, 'New exercise')).toBe(true);
    expect(nameField(tree).props.value).toBe('Landmine');
    expect(tree.root.findAllByType(Button).some((b) => b.props.label === 'Delete exercise')).toBe(false);
  });

  it('offers the three delts apart, every equipment, and every logging type as a choice', () => {
    const tree = mount();
    const labels = tree.root.findAllByType(Button).map((b) => b.props.accessibilityLabel ?? b.props.label);
    expect(labels).toEqual(expect.arrayContaining(['Front delts, primary muscle', 'Side delts, primary muscle', 'Rear delts, secondary muscle', 'EZ bar', 'Other']));
    for (const label of ['Weight and reps', 'Bodyweight plus weight', 'Assisted', 'Time', 'Weight and time', 'Distance and time']) {
      expect(radio(tree, label)).toBeTruthy();
    }
    expect(radio(tree, 'Weight and reps').props.accessibilityState).toEqual({ checked: true });
  });

  it('chooses no equipment for you (R128)', () => {
    const tree = mount();
    for (const label of ['Barbell', 'Dumbbell', 'Other']) expect(button(tree, label).props.selected).toBe(false);
  });

  it('lists what stops it above Save once Save is tapped, says it to the screen reader, and saves nothing', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const tree = mount();
    expect(shows(tree, 'Give the exercise a name.')).toBe(false);
    tap(tree, 'Save');
    expect(shows(tree, 'Give the exercise a name.')).toBe(true);
    expect(shows(tree, 'Pick at least one primary muscle.')).toBe(true);
    expect(shows(tree, 'Pick the equipment.')).toBe(true);
    expect(announce).toHaveBeenCalledWith('Give the exercise a name. Pick at least one primary muscle. Pick the equipment.');
    announce.mockRestore();
    expect(createCustomExercise).not.toHaveBeenCalled();

    typeName(tree, 'barbell bench press');
    expect(shows(tree, 'You already have an exercise called Barbell bench press.')).toBe(true);
    expect(shows(tree, 'Give the exercise a name.')).toBe(false);
  });

  it('drops from secondary a muscle chosen as primary, and the other way round', () => {
    const tree = mount();
    tap(tree, 'Triceps, secondary muscle');
    expect(button(tree, 'Triceps, secondary muscle').props.selected).toBe(true);
    tap(tree, 'Triceps, primary muscle');
    expect(button(tree, 'Triceps, primary muscle').props.selected).toBe(true);
    expect(button(tree, 'Triceps, secondary muscle').props.selected).toBe(false);
    tap(tree, 'Triceps, secondary muscle');
    expect(button(tree, 'Triceps, primary muscle').props.selected).toBe(false);
  });

  it('saves, hands the new exercise to the picker, and goes back', () => {
    mockParams = { id: 'new', name: 'Landmine', from: 'picker' };
    const tree = mount();
    typeName(tree, 'Landmine row ');
    tap(tree, 'Front delts, primary muscle');
    tap(tree, 'Triceps, secondary muscle');
    tap(tree, 'Dumbbell');
    act(() => radio(tree, 'Time').props.onPress());
    tap(tree, 'Save');

    expect(createCustomExercise).toHaveBeenCalledWith(
      'db',
      { name: 'Landmine row', primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps'], equipment: 'dumbbell', loggingType: 'timed' },
      expect.any(Number),
    );
    expect(bumpData).toHaveBeenCalled();
    expect(useCreatedExercise.getState().id).toBe('new-id');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('hands nothing to the picker when it was not opened from one', () => {
    const tree = mount();
    typeName(tree, 'Landmine row');
    tap(tree, 'Chest, primary muscle');
    tap(tree, 'Machine');
    tap(tree, 'Save');
    expect(createCustomExercise).toHaveBeenCalled();
    expect(useCreatedExercise.getState().id).toBeNull();
  });
});

describe('editing an exercise of your own', () => {
  it('is titled Edit exercise, starts from the exercise, and saves the change', () => {
    mockParams = { id: 'mine' };
    const tree = mount();
    expect(shows(tree, 'Edit exercise')).toBe(true);
    expect(nameField(tree).props.value).toBe('Landmine press');
    expect(button(tree, 'Front delts, primary muscle').props.selected).toBe(true);
    typeName(tree, 'Landmine press, one arm');
    tap(tree, 'Save');
    expect(updateCustomExercise).toHaveBeenCalledWith('db', 'mine', {
      name: 'Landmine press, one arm',
      primaryMuscles: ['front_delts'],
      secondaryMuscles: ['triceps'],
      equipment: 'barbell',
      loggingType: 'weighted',
    });
    expect(createCustomExercise).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('a used exercise shows its logging type as text that stays', () => {
    mockParams = { id: 'mine' };
    jest.mocked(isExerciseUsed).mockReturnValue(true);
    const tree = mount();
    expect(tree.root.findAll((n) => n.props.accessibilityRole === 'radio')).toHaveLength(0);
    expect(shows(tree, 'Weight and reps')).toBe(true);
    expect(shows(tree, "It's in use, so this stays.")).toBe(true);
  });

  it('a library exercise is not here to edit', () => {
    mockParams = { id: 'barbell-bench-press' };
    const tree = mount();
    expect(shows(tree, "That isn't here.")).toBe(true);
    expect(tree.root.findAllByType(Button).some((b) => b.props.label === 'Save')).toBe(false);
  });
});

describe('Delete exercise (R109)', () => {
  it('asks first, saying a used exercise stays in history, then deletes and goes back', () => {
    mockParams = { id: 'mine' };
    jest.mocked(isExerciseUsed).mockReturnValue(true);
    jest.mocked(deleteCustomExercise).mockReturnValue('archived');
    const tree = mount();
    expect(sheet(tree, 'Delete Landmine press?').props.visible).toBe(false);
    tap(tree, 'Delete exercise');

    const ask = sheet(tree, 'Delete Landmine press?');
    expect(ask.props).toMatchObject({
      visible: true,
      body: 'It stays in your history and routines but leaves the exercise list.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
    });
    act(() => ask.props.onConfirm());
    expect(deleteCustomExercise).toHaveBeenCalledWith('db', 'mine');
    expect(bumpData).toHaveBeenCalled();
    act(() => void jest.runAllTimers());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('is not offered for an exercise already archived', () => {
    mockParams = { id: 'mine' };
    jest.mocked(isExerciseUsed).mockReturnValue(true);
    jest.mocked(isExerciseArchived).mockReturnValue(true);
    const tree = mount();
    expect(tree.root.findAllByType(Button).some((b) => b.props.label === 'Delete exercise')).toBe(false);
    expect(tree.root.findAllByType(ConfirmSheet).some((s) => s.props.title === 'Delete Landmine press?')).toBe(false);
  });

  it('says an unused one can not be brought back, and Keep deletes nothing', () => {
    mockParams = { id: 'mine' };
    const tree = mount();
    tap(tree, 'Delete exercise');
    const ask = sheet(tree, 'Delete Landmine press?');
    expect(ask.props.body).toBe("This can't be undone.");
    act(() => ask.props.onCancel());
    expect(sheet(tree, 'Delete Landmine press?').props.visible).toBe(false);
    expect(deleteCustomExercise).not.toHaveBeenCalled();
  });
});

describe('unsaved changes', () => {
  const close = (tree: ReactTestRenderer) => {
    const x = tree.root.findAll((n) => n.props.accessibilityLabel === 'Close' && typeof n.props.onPress === 'function')[0];
    act(() => x.props.onPress());
  };

  it('Close leaves at once when nothing changed, and the swipe down is allowed', () => {
    mockParams = { id: 'mine' };
    const tree = mount();
    expect(lastGesture()).toBe(true);
    close(tree);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('asks Discard changes? when something changed, and the swipe down is held', () => {
    mockParams = { id: 'mine' };
    const tree = mount();
    typeName(tree, 'Something else');
    expect(lastGesture()).toBe(false);
    close(tree);
    const ask = sheet(tree, 'Discard changes?');
    expect(ask.props).toMatchObject({ visible: true, confirmLabel: 'Discard', cancelLabel: 'Keep editing', primary: 'cancel' });
    expect(router.back).not.toHaveBeenCalled();

    act(() => ask.props.onCancel());
    expect(sheet(tree, 'Discard changes?').props.visible).toBe(false);
    expect(nameField(tree).props.value).toBe('Something else');

    close(tree);
    act(() => sheet(tree, 'Discard changes?').props.onConfirm());
    act(() => void jest.runAllTimers());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('the Android back button asks too', () => {
    const listeners: (() => boolean)[] = [];
    const add = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, fn) => {
      listeners.push(fn as () => boolean);
      return { remove: () => {} };
    });
    try {
      const tree = mount();
      typeName(tree, 'Landmine');
      let handled = false;
      act(() => {
        handled = listeners[listeners.length - 1]();
      });
      expect(handled).toBe(true);
      expect(sheet(tree, 'Discard changes?').props.visible).toBe(true);
    } finally {
      add.mockRestore();
    }
  });
});
