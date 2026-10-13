import { router, Stack } from 'expo-router';
import { BackHandler, Platform, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import ExerciseEditorScreen from '../../app/exercise/[id]';
import { createCustomExercise, deleteCustomExercise, isExerciseArchived, isExerciseUsed, updateCustomExercise } from '../db/repositories/customExercisesRepo';
import type { ExerciseDetail } from '../db/repositories/exercisesRepo';
import { CustomExerciseRefused } from '../domain/customExercise';
import { deleteExercisePhotoFile } from '../platform/exercisePhotoFiles';
import { bumpData } from '../state/dataVersion';
import { useCreatedExercise } from '../state/createdExercise';
import { Button } from './Button';
import { OwnPhotos } from './OwnPhotos';
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
jest.mock('../platform/exercisePhotoFiles', () => ({ deleteExercisePhotoFile: jest.fn() }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: (text: string) => mockAnnounce(text) }));
// Its own tests cover the photo slots; here, which exercise they are shown for is what the tests read.
jest.mock('./OwnPhotos', () => ({ OwnPhotos: jest.fn(() => null) }));
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

const originalOS = Platform.OS;

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
  mockAnnounce.mockClear();
});
afterEach(() => {
  Platform.OS = originalOS;
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

  it('tells VoiceOver which equipment is selected and which logging type is checked', () => {
    const tree = mount();
    /** The drawn view VoiceOver reads for a control, by its label. */
    const drawn = (label: string) =>
      tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onClick === 'function' && (n.props.accessibilityLabel === label || n.findAll((c) => c.props.children === label).length > 0))[0];
    expect(drawn('Dumbbell').props.accessibilityState).toMatchObject({ selected: false });
    tap(tree, 'Dumbbell');
    expect(drawn('Dumbbell').props.accessibilityState).toMatchObject({ selected: true });
    expect(drawn('Barbell').props.accessibilityState).toMatchObject({ selected: false });

    expect(drawn('Time').props.accessibilityRole).toBe('radio');
    expect(drawn('Time').props.accessibilityState).toMatchObject({ checked: false });
    act(() => radio(tree, 'Time').props.onPress());
    expect(drawn('Time').props.accessibilityState).toMatchObject({ checked: true });
    expect(drawn('Weight and reps').props.accessibilityState).toMatchObject({ checked: false });
  });

  it('chooses no equipment for you (R128)', () => {
    const tree = mount();
    for (const label of ['Barbell', 'Dumbbell', 'Other']) expect(button(tree, label).props.selected).toBe(false);
  });

  it('lists what stops it above Save once Save is tapped, says it to the screen reader once, and saves nothing', () => {
    const tree = mount();
    expect(shows(tree, 'Give the exercise a name.')).toBe(false);
    tap(tree, 'Save');
    expect(shows(tree, 'Give the exercise a name.')).toBe(true);
    expect(shows(tree, 'Pick at least one primary muscle.')).toBe(true);
    expect(shows(tree, 'Pick the equipment.')).toBe(true);
    expect(mockAnnounce).toHaveBeenCalledTimes(1);
    expect(mockAnnounce).toHaveBeenCalledWith('Give the exercise a name. Pick at least one primary muscle. Pick the equipment.');
    // Said once: no live region over the lines as well, which TalkBack would read a second time.
    expect(tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none')).toHaveLength(0);
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
    expect(deleteCustomExercise).toHaveBeenCalledWith('db', 'mine', expect.any(Function));
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

describe('Delete exercise that fails', () => {
  it("says Couldn't delete. Try again. in a muted line, tells the screen reader, and stays", () => {
    mockParams = { id: 'mine' };
    jest.mocked(deleteCustomExercise).mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    const tree = mount();
    tap(tree, 'Delete exercise');
    act(() => sheet(tree, 'Delete Landmine press?').props.onConfirm());
    act(() => void jest.runAllTimers());

    expect(sheet(tree, 'Delete Landmine press?').props.visible).toBe(false);
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === "Couldn't delete. Try again.");
    expect(line).toHaveLength(1);
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't delete. Try again.");
    expect(bumpData).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('Save that fails', () => {
  it("says Couldn't save. Try again. for a database error, logs it, and shows no raw error", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(createCustomExercise).mockImplementationOnce(() => {
      throw new Error("Failed to run the query 'insert into \"exercises\"': database or disk is full");
    });
    const tree = mount();
    typeName(tree, 'Landmine row');
    tap(tree, 'Chest, primary muscle');
    tap(tree, 'Machine');
    tap(tree, 'Save');

    expect(shows(tree, "Couldn't save. Try again.")).toBe(true);
    expect(tree.root.findAll((n) => n.type === Text && /Failed to run/.test(String(n.props.children)))).toHaveLength(0);
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't save. Try again.");
    expect(warn).toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shows what stopped it when the save is refused in plain words', () => {
    jest.mocked(createCustomExercise).mockImplementationOnce(() => {
      throw new CustomExerciseRefused('You already have an exercise called Landmine row.');
    });
    const tree = mount();
    typeName(tree, 'Landmine row');
    tap(tree, 'Chest, primary muscle');
    tap(tree, 'Machine');
    tap(tree, 'Save');

    expect(shows(tree, 'You already have an exercise called Landmine row.')).toBe(true);
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('Delete exercise: your own photos (R109, R111)', () => {
  it('hands the repository the function that deletes each photo file', () => {
    mockParams = { id: 'mine' };
    jest.mocked(deleteExercisePhotoFile).mockClear();
    const tree = mount();
    tap(tree, 'Delete exercise');
    act(() => sheet(tree, 'Delete Landmine press?').props.onConfirm());

    const removeFiles = jest.mocked(deleteCustomExercise).mock.calls[0][2]!;
    expect(deleteExercisePhotoFile).not.toHaveBeenCalled();
    removeFiles(['mine-start-1.jpg', 'mine-end-1.jpg']);
    expect(jest.mocked(deleteExercisePhotoFile).mock.calls.map((c) => c[0])).toEqual(['mine-start-1.jpg', 'mine-end-1.jpg']);
  });
});

describe('Photos (R111)', () => {
  const photosShownFor = () => jest.mocked(OwnPhotos).mock.calls.map((c) => c[0].exerciseId);
  const photosHeading = (tree: ReactTestRenderer) => shows(tree, 'Photos');

  beforeEach(() => jest.mocked(OwnPhotos).mockClear());

  it('shows your own photos for an exercise of yours', () => {
    mockParams = { id: 'mine' };
    const tree = mount();
    expect(photosHeading(tree)).toBe(true);
    expect(new Set(photosShownFor())).toEqual(new Set(['mine']));
  });

  it('has none while the exercise is new: there is nothing to keep them with yet', () => {
    mockParams = { id: 'new' };
    const tree = mount();
    expect(photosHeading(tree)).toBe(false);
    expect(OwnPhotos).not.toHaveBeenCalled();
  });

  it('has none on web: photos are a phone feature', () => {
    Platform.OS = 'web';
    mockParams = { id: 'mine' };
    const tree = mount();
    expect(photosHeading(tree)).toBe(false);
    expect(OwnPhotos).not.toHaveBeenCalled();
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
