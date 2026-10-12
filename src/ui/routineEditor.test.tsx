import { router } from 'expo-router';
import { BackHandler, Platform, StyleSheet, Switch, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import EditRoutine from '../../app/(tabs)/routines/edit/[id]';
import { getRoutineDetail, routineToDraft, saveRoutine, userRoutineCount } from '../db/repositories/routinesRepo';
import type { RoutineDetail } from '../db/repositories/routinesRepo';
import { getSavedWorkout } from '../db/repositories/savedWorkoutsRepo';
import type { SavedWorkoutDetail, SavedWorkoutSummary } from '../db/repositories/savedWorkoutsRepo';
import type { RoutineDraft } from '../domain/routineDraft';
import { bumpData } from '../state/dataVersion';
import { leaveGuarded } from '../state/leaveGuard';
import { usePendingPick } from '../state/pendingPick';
import { announce } from '../platform/announce';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 11, 9, 0).getTime();

let mockId: string;
let mockPro: boolean;
/** The editor's latest focus effect and what it returned: the test plays the picker closing by focusing it again. */
const mockFocus: { effect: (() => void | (() => void)) | null; cleanup: void | (() => void) } = { effect: null, cleanup: undefined };

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
    useLocalSearchParams: () => ({ id: mockId }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => {
        mockFocus.effect = effect;
        mockFocus.cleanup = effect();
        return () => {
          if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
          mockFocus.cleanup = undefined;
        };
      }, [effect]);
    },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ unit: 'kg', defaultIncrementLb: 5, defaultIncrementKg: 2.5 }),
}));
/** The exercise library as the editor reads it; a test may delete or retype one while the editor is away. */
let mockLibrary: Record<string, { id: string; name: string; loggingType: string }>;
const LIBRARY = () => ({
  bench: { id: 'bench', name: 'Barbell bench press', loggingType: 'weighted' },
  row: { id: 'row', name: 'Barbell row', loggingType: 'weighted' },
  plank: { id: 'plank', name: 'Plank', loggingType: 'timed' },
});
jest.mock('../db/repositories/exercisesRepo', () => ({ getExercise: (_db: unknown, id: string) => mockLibrary[id] ?? null }));
let mockSaved: SavedWorkoutSummary[];
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({ listSavedWorkouts: () => mockSaved, getSavedWorkout: jest.fn() }));
jest.mock('../db/repositories/routinesRepo', () => ({
  getRoutineDetail: jest.fn(),
  routineToDraft: jest.fn(),
  saveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
}));
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** "My split": Day A with a bench press (5 lb increment, a next weight saved) and a row, Day B with a plank. */
const MINE: RoutineDraft = {
  id: 'mine',
  name: 'My split',
  nextKey: 1,
  days: [
    {
      key: 'day-a',
      id: 'day-a',
      name: 'Day A',
      exercises: [
        { key: 're-bench', id: 're-bench', exerciseId: 'bench', name: 'Barbell bench press', loggingType: 'weighted', setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb', supersetWithNext: false },
        { key: 're-row', id: 're-row', exerciseId: 'row', name: 'Barbell row', loggingType: 'weighted', setCount: 3, repMin: 8, repMax: 12, increment: 5, incrementUnit: 'lb', supersetWithNext: false },
      ],
    },
    {
      key: 'day-b',
      id: 'day-b',
      name: 'Day B',
      exercises: [{ key: 're-plank', id: 're-plank', exerciseId: 'plank', name: 'Plank', loggingType: 'timed', setCount: 3, repMin: 30, repMax: 60, increment: 0, incrementUnit: 'lb', supersetWithNext: false }],
    },
  ],
};

const LIMIT = 'Free holds one routine of your own. GymHound Pro holds as many as you like.';

function mount(id: string): ReactTestRenderer {
  mockId = id;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<EditRoutine />);
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
  const found = buttons(tree, label);
  if (found.length > 0) {
    act(() => found[index].props.onPress());
    return;
  }
  // An icon button: the pressable the screen reader hears as `label`.
  const icon = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[index];
  if (!icon) throw new Error(`No button "${label}"`);
  act(() => icon.props.onPress());
}

const field = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAllByType(TextInput).filter((t) => t.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`No field "${label}"`);
  return found[0];
};
const hasField = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).some((t) => t.props.accessibilityLabel === label);

/** Types into a field without leaving it. */
function type(tree: ReactTestRenderer, label: string, text: string) {
  act(() => field(tree, label).props.onChangeText(text));
}

/** Types into a field and leaves it, as tapping elsewhere does. */
function enter(tree: ReactTestRenderer, label: string, text: string) {
  type(tree, label, text);
  act(() => field(tree, label).props.onBlur());
}

/** The picker in routine mode: it hands the exercise over and closes, and the editor is focused again. */
function pick(exerciseId: string) {
  act(() => {
    usePendingPick.getState().set(exerciseId);
    if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
    mockFocus.cleanup = mockFocus.effect?.();
  });
}

/** The editor is left (another screen takes the focus) and later shown again, as New routine or Edit does. */
function leaveAndReturn() {
  act(() => {
    if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
    mockFocus.cleanup = undefined;
  });
  act(() => {
    mockFocus.cleanup = mockFocus.effect?.();
  });
}

/** Android's back button while the editor is focused: true when the editor took it over. */
type BackPress = Parameters<typeof BackHandler.addEventListener>[1];
const mockBack: { handler: BackPress | null } = { handler: null };
const androidBack = () => {
  let handled: boolean | null | undefined = false;
  act(() => {
    handled = mockBack.handler?.({} as Parameters<BackPress>[0]);
  });
  return handled;
};

/** The draft the last Save wrote. */
const saved = (): RoutineDraft => jest.mocked(saveRoutine).mock.calls.at(-1)![1];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockPro = false;
  mockLibrary = LIBRARY();
  mockSaved = [];
  usePendingPick.setState({ exerciseId: null });
  jest.mocked(routineToDraft).mockReturnValue(MINE);
  jest.mocked(saveRoutine).mockReturnValue('saved-id');
  jest.mocked(userRoutineCount).mockReturnValue(0);
  jest.mocked(getRoutineDetail).mockReturnValue({ isPremade: false } as RoutineDetail);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    mockBack.handler = handler;
    return {
      remove: () => {
        if (mockBack.handler === handler) mockBack.handler = null;
      },
    };
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the routine editor: a new routine (R89)', () => {
  it('starts empty under "New routine", and Save says what is missing and saves nothing', () => {
    const tree = mount('new');

    expect(shownText(tree)).toContain('New routine');
    expect(field(tree, 'Routine name').props.value).toBe('');
    expect(shownText(tree)).not.toContain('Give the routine a name.');

    press(tree, 'Save');

    expect(saveRoutine).not.toHaveBeenCalled();
    const shown = shownText(tree);
    expect(shown).toContain('Give the routine a name.');
    expect(shown).toContain('Add at least one day.');
    // Red is reserved: a problem is said in muted text.
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });

  it('builds a routine: a name, a day, an exercise from the picker at 3 × 8–12 and the default increment in the display unit', () => {
    const tree = mount('new');

    type(tree, 'Routine name', 'Push day');
    press(tree, '+ Add day');
    expect(field(tree, 'Day 1 name').props.value).toBe('Day 1');
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Day 1 has no exercises.');

    press(tree, 'Add exercise to Day 1');
    expect(router.push).toHaveBeenCalledWith('/pick-exercise?mode=routine');
    pick('bench');

    expect(shownText(tree)).toContain('Barbell bench press');
    expect(shownText(tree)).not.toContain('Day 1 has no exercises.');
    expect(field(tree, 'Barbell bench press reps from').props.value).toBe('8');
    expect(field(tree, 'Barbell bench press reps to').props.value).toBe('12');
    expect(field(tree, 'Barbell bench press increment in kg').props.value).toBe('2.5');
    expect(usePendingPick.getState().exerciseId).toBeNull();

    press(tree, 'Save');

    expect(saveRoutine).toHaveBeenCalledTimes(1);
    expect(jest.mocked(saveRoutine).mock.calls[0][0]).toBe('db');
    expect(jest.mocked(saveRoutine).mock.calls[0][2]).toBe(NOW);
    expect(saved()).toMatchObject({
      id: null,
      name: 'Push day',
      days: [
        {
          id: null,
          name: 'Day 1',
          exercises: [{ id: null, exerciseId: 'bench', setCount: 3, repMin: 8, repMax: 12, increment: 2.5, incrementUnit: 'kg', supersetWithNext: false }],
        },
      ],
    });
    expect(bumpData).toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('a timed exercise counts seconds and has no increment', () => {
    const tree = mount('new');
    press(tree, '+ Add day');
    press(tree, 'Add exercise to Day 1');
    pick('plank');

    expect(field(tree, 'Plank seconds from').props.value).toBe('30');
    expect(field(tree, 'Plank seconds to').props.value).toBe('60');
    expect(shownText(tree)).toContain('Seconds');
    expect(hasField(tree, 'Plank increment in kg')).toBe(false);
  });

  it('drops a pick it did not ask for', () => {
    const tree = mount('new');
    press(tree, '+ Add day');

    pick('bench');

    expect(shownText(tree)).not.toContain('Barbell bench press');
    expect(usePendingPick.getState().exerciseId).toBeNull();
  });

  it('a new routine over the free limit shows the limit sheet on Save and saves nothing', () => {
    jest.mocked(userRoutineCount).mockReturnValue(1);
    const tree = mount('new');
    type(tree, 'Routine name', 'Second');
    press(tree, '+ Add day');
    press(tree, 'Add exercise to Day 1');
    pick('bench');

    press(tree, 'Save');

    expect(saveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain(LIMIT);
  });

  it('with Pro on, a new routine saves however many you have', () => {
    jest.mocked(userRoutineCount).mockReturnValue(5);
    mockPro = true;
    const tree = mount('new');
    type(tree, 'Routine name', 'Sixth');
    press(tree, '+ Add day');
    press(tree, 'Add exercise to Day 1');
    pick('bench');

    press(tree, 'Save');

    expect(saveRoutine).toHaveBeenCalledTimes(1);
  });
});

describe('the routine editor: your own routine', () => {
  it('loads the routine under "Edit routine", with Back naming it', () => {
    const tree = mount('mine');

    expect(routineToDraft).toHaveBeenCalledWith('db', 'mine');
    const shown = shownText(tree);
    expect(shown).toContain('Edit routine');
    expect(field(tree, 'Routine name').props.value).toBe('My split');
    expect(field(tree, 'Day 1 name').props.value).toBe('Day A');
    expect(field(tree, 'Day 2 name').props.value).toBe('Day B');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to My split').length).toBeGreaterThan(0);
  });

  it('reads the routine again when shown again with nothing unsaved: a hidden tab stays mounted', () => {
    const tree = mount('mine');
    jest.mocked(routineToDraft).mockReturnValue({ ...MINE, name: 'Renamed elsewhere' });

    leaveAndReturn();

    expect(field(tree, 'Routine name').props.value).toBe('Renamed elsewhere');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to Renamed elsewhere').length).toBeGreaterThan(0);
    // What it read is now what Discard goes back to: nothing to lose.
    const toTrain = jest.fn();
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
  });

  it('keeps unsaved changes when shown again, and still adds what the picker chose', () => {
    const tree = mount('mine');
    type(tree, 'Routine name', 'Mine now');
    jest.mocked(routineToDraft).mockReturnValue({ ...MINE, name: 'Renamed elsewhere' });

    leaveAndReturn();
    expect(field(tree, 'Routine name').props.value).toBe('Mine now');

    press(tree, 'Add exercise to Day B');
    pick('bench');
    expect(field(tree, 'Routine name').props.value).toBe('Mine now');
    expect(shownText(tree).filter((t) => t === 'Barbell bench press')).toHaveLength(2);
  });

  it('a pick lands on the routine as read again, when nothing was unsaved', () => {
    const tree = mount('mine');
    jest.mocked(routineToDraft).mockReturnValue({ ...MINE, name: 'Renamed elsewhere' });

    press(tree, 'Add exercise to Day B');
    pick('bench');

    expect(field(tree, 'Routine name').props.value).toBe('Renamed elsewhere');
    expect(shownText(tree).filter((t) => t === 'Barbell bench press')).toHaveLength(2);
  });

  it("says \"Couldn't save. Try again.\" when the save fails, stays open with the changes, and saves on a retry", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(saveRoutine).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount('mine');
    type(tree, 'Routine name', 'Renamed');

    expect(() => press(tree, 'Save')).not.toThrow();

    expect(shownText(tree)).toContain("Couldn't save. Try again.");
    expect(router.back).not.toHaveBeenCalled();
    expect(bumpData).not.toHaveBeenCalled();
    expect(field(tree, 'Routine name').props.value).toBe('Renamed');

    press(tree, 'Save');
    expect(saved().name).toBe('Renamed');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain("Couldn't save. Try again.");
    warn.mockRestore();
  });

  it('a failed Save, then Back and Discard: opened again, it shows no error', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(saveRoutine).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount('mine');
    type(tree, 'Routine name', 'Renamed');
    press(tree, 'Save');
    expect(shownText(tree)).toContain("Couldn't save. Try again.");

    press(tree, 'Back to My split');
    press(tree, 'Discard');
    act(() => void jest.advanceTimersByTime(400));
    leaveAndReturn();

    expect(shownText(tree)).not.toContain("Couldn't save. Try again.");
    warn.mockRestore();
  });

  it('a failed Save with nothing changed: shown again, the routine is read again and the error is gone', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(saveRoutine).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount('mine');
    press(tree, 'Save');
    expect(shownText(tree)).toContain("Couldn't save. Try again.");

    act(() => {
      if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
      mockFocus.cleanup = undefined;
    });
    jest.mocked(routineToDraft).mockReturnValue({ ...MINE, name: 'Renamed elsewhere' });
    act(() => {
      mockFocus.cleanup = mockFocus.effect?.();
    });

    expect(field(tree, 'Routine name').props.value).toBe('Renamed elsewhere');
    expect(shownText(tree)).not.toContain("Couldn't save. Try again.");
    const toTrain = jest.fn();
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('says so when the routine is not there', () => {
    jest.mocked(routineToDraft).mockReturnValue(null);
    const tree = mount('gone');

    expect(shownText(tree)).toContain("That routine isn't here.");
    expect(buttons(tree, 'Save')).toHaveLength(0);
  });

  it('shows increments in the display unit; an untouched one keeps its stored unit, an edited one saves in the display unit', () => {
    const tree = mount('mine');

    expect(field(tree, 'Barbell bench press increment in kg').props.value).toBe('2.5');
    expect(field(tree, 'Barbell row increment in kg').props.value).toBe('2.5');
    enter(tree, 'Barbell row increment in kg', '2');
    // Leaving a field at the same value changes nothing.
    enter(tree, 'Barbell bench press increment in kg', '2.5');
    press(tree, 'Save');

    const [bench, row] = saved().days[0].exercises;
    expect([bench.increment, bench.incrementUnit]).toEqual([5, 'lb']);
    expect([row.increment, row.incrementUnit]).toEqual([2, 'kg']);
  });

  it('an increment of 0 means reps only, and says so after the field in place of the unit', () => {
    const tree = mount('mine');
    expect(shownText(tree).filter((t) => t === 'kg')).toHaveLength(2);

    enter(tree, 'Barbell row increment in kg', '0');

    expect(shownText(tree)).toContain('reps only');
    expect(shownText(tree)).not.toContain('Reps only');
    expect(shownText(tree).filter((t) => t === 'kg')).toHaveLength(1);
    press(tree, 'Save');
    expect(saved().days[0].exercises[1]).toMatchObject({ increment: 0, incrementUnit: 'kg' });
  });

  it('steps the set count from 1 to 10', () => {
    const tree = mount('mine');
    const sets = () => tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.accessibilityLabel === 'string' && /^\d+ sets?$/.test(n.props.accessibilityLabel))[0].props.accessibilityLabel;

    expect(sets()).toBe('3 sets');
    for (let i = 0; i < 9; i++) press(tree, 'More sets for Barbell bench press');
    expect(sets()).toBe('10 sets');
    expect(buttons(tree, 'More sets for Barbell bench press')[0].props.disabled).toBe(true);
    for (let i = 0; i < 12; i++) press(tree, 'Fewer sets for Barbell bench press');
    expect(sets()).toBe('1 set');
    expect(buttons(tree, 'Fewer sets for Barbell bench press')[0].props.disabled).toBe(true);
  });

  it('the rep range saves when the field is left, keeping the low end at or under the high end', () => {
    const tree = mount('mine');

    type(tree, 'Barbell bench press reps from', '10');
    expect(field(tree, 'Barbell bench press reps to').props.value).toBe('8');
    act(() => field(tree, 'Barbell bench press reps from').props.onBlur());

    expect(field(tree, 'Barbell bench press reps from').props.value).toBe('10');
    expect(field(tree, 'Barbell bench press reps to').props.value).toBe('10');
  });

  it('a field left blank goes back to its number', () => {
    const tree = mount('mine');

    enter(tree, 'Barbell bench press reps to', '');

    expect(field(tree, 'Barbell bench press reps to').props.value).toBe('8');
  });

  it('Save keeps a number still being typed', () => {
    const tree = mount('mine');

    type(tree, 'Barbell bench press reps from', '6');
    press(tree, 'Save');

    expect(saved().days[0].exercises[0]).toMatchObject({ repMin: 6, repMax: 8 });
  });

  it('Superset with next links an exercise with the one after it; a day’s last exercise has no switch', () => {
    const tree = mount('mine');
    const switches = () => tree.root.findAllByType(Switch);

    expect(switches().map((s) => s.props.accessibilityLabel)).toEqual(['Superset Barbell bench press with next']);
    act(() => switches()[0].props.onValueChange(true));

    const bars = tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderLeftWidth === 3);
    expect(bars).toHaveLength(1);
    press(tree, 'Save');
    expect(saved().days[0].exercises.map((e) => e.supersetWithNext)).toEqual([true, false]);
  });

  it('moves and removes exercises and days', () => {
    const tree = mount('mine');

    press(tree, 'Move Barbell bench press down');
    press(tree, 'Move Day B up');
    press(tree, 'Remove Barbell row');
    press(tree, 'Save');

    expect(saved().days.map((d) => d.name)).toEqual(['Day B', 'Day A']);
    expect(saved().days[1].exercises.map((e) => e.exerciseId)).toEqual(['bench']);

    press(tree, 'Delete Day B');
    press(tree, 'Save');
    expect(saved().days.map((d) => d.name)).toEqual(['Day A']);
  });

  it('renames days and adds one after the last', () => {
    const tree = mount('mine');

    type(tree, 'Day 1 name', 'Upper');
    press(tree, '+ Add day');

    // A blank day is named for its place.
    expect(field(tree, 'Day 3 name').props.value).toBe('Day 3');
    expect(shownText(tree)).not.toContain('Day 3 has no exercises.');
    press(tree, 'Save');
    expect(saveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Day 3 has no exercises.');
  });

  it('number fields grow with the text rather than clipping it', () => {
    const tree = mount('mine');

    for (const label of ['Barbell bench press reps from', 'Barbell bench press increment in kg', 'Plank seconds to']) {
      const style = StyleSheet.flatten(field(tree, label).props.style);
      expect(style.minWidth).toBe(64);
      expect(style.width).toBeUndefined();
    }
  });

  it("name fields may shrink below the width a web text field asks for, so a day's buttons stay on its card", () => {
    const tree = mount('mine');

    for (const label of ['Routine name', 'Day 1 name']) {
      expect(StyleSheet.flatten(field(tree, label).props.style)).toMatchObject({ flex: 1, minWidth: 0 });
    }
  });

  it('on the web, where a text field is 20 characters wide whatever it holds, a number field is sized to its number', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const tree = mount('mine');

    const width = (label: string) => StyleSheet.flatten(field(tree, label).props.style).width as number;
    // Two short numbers, the dash and the gaps fit a card on a 320 phone, beside Sets or on a line of their own.
    expect(width('Barbell bench press reps from')).toBe(64);
    expect(width('Barbell bench press reps to')).toBe(64);
    expect(width('Barbell bench press increment in kg')).toBe(64);
    type(tree, 'Barbell bench press increment in kg', '12.375');
    expect(width('Barbell bench press increment in kg')).toBeGreaterThan(64);
    expect(width('Barbell bench press increment in kg')).toBeLessThan(120);
  });

  it('a time takes seconds or minutes and seconds, as the session does', () => {
    const tree = mount('mine');

    expect(field(tree, 'Plank seconds to').props.keyboardType).toBe('numbers-and-punctuation');
    enter(tree, 'Plank seconds to', '1:30');
    expect(field(tree, 'Plank seconds to').props.value).toBe('90');
    enter(tree, 'Plank seconds from', '45');
    press(tree, 'Save');

    expect(saved().days[1].exercises[0]).toMatchObject({ repMin: 45, repMax: 90 });
  });

  it('a premade is read-only: its editor address shows the detail instead', () => {
    jest.mocked(getRoutineDetail).mockReturnValue({ isPremade: true } as RoutineDetail);
    const tree = mount('premade-ppl-6');

    expect(getRoutineDetail).toHaveBeenCalledWith('db', 'premade-ppl-6');
    expect(router.navigate).toHaveBeenCalledWith('/routines/premade-ppl-6');
    expect(shownText(tree)).toContain('Premade routines are read-only.');
    expect(buttons(tree, 'Save')).toHaveLength(0);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});

describe('the routine editor: leaving with unsaved changes (R89)', () => {
  it('problems from a Save are gone once the editor is left with nothing to lose', () => {
    const tree = mount('new');
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Give the routine a name.');

    press(tree, 'Back to Routines');
    expect(router.back).toHaveBeenCalled();
    leaveAndReturn();

    expect(shownText(tree)).not.toContain('Give the routine a name.');
    expect(shownText(tree)).not.toContain('Add at least one day.');
  });

  it("Android's back leaves at once when nothing changed, and asks first when something did", () => {
    const tree = mount('mine');

    expect(androidBack()).toBe(false);
    expect(shownText(tree)).not.toContain('Discard changes?');

    type(tree, 'Routine name', 'Renamed');
    expect(androidBack()).toBe(true);
    expect(shownText(tree)).toContain('Discard changes?');
    press(tree, 'Discard');
    act(() => void jest.advanceTimersByTime(400));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("stops listening to Android's back once it is left", () => {
    mount('mine');
    expect(mockBack.handler).not.toBeNull();

    leaveAndReturn();
    expect(mockBack.handler).not.toBeNull();
    act(() => {
      if (typeof mockFocus.cleanup === 'function') mockFocus.cleanup();
      mockFocus.cleanup = undefined;
    });
    expect(mockBack.handler).toBeNull();
  });

  it('Back leaves at once when nothing changed', () => {
    const tree = mount('mine');

    press(tree, 'Back to My split');

    expect(router.back).toHaveBeenCalled();
    expect(shownText(tree)).not.toContain('Discard changes?');
  });

  it('Back with changes asks "Discard changes?": Keep editing stays, Discard leaves once the sheet has gone', () => {
    const tree = mount('mine');
    type(tree, 'Routine name', 'My new split');

    press(tree, 'Back to My split');
    expect(shownText(tree)).toContain('Discard changes?');
    expect(buttons(tree, 'Keep editing').map((b) => b.props.variant ?? 'primary')).toEqual(['primary']);
    expect(buttons(tree, 'Discard').map((b) => b.props.variant)).toEqual(['secondary']);

    press(tree, 'Keep editing');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(field(tree, 'Routine name').props.value).toBe('My new split');
    act(() => void jest.advanceTimersByTime(400));
    expect(router.back).not.toHaveBeenCalled();

    press(tree, 'Back to My split');
    press(tree, 'Discard');
    expect(router.back).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(400));
    expect(router.back).toHaveBeenCalledTimes(1);
    // The editor stays behind in the tabs: it no longer holds the changes it discarded.
    expect(field(tree, 'Routine name').props.value).toBe('My split');
    expect(saveRoutine).not.toHaveBeenCalled();
  });

  it('a number typed but not yet left counts as a change', () => {
    const tree = mount('mine');
    type(tree, 'Barbell row reps to', '15');

    press(tree, 'Back to My split');

    expect(shownText(tree)).toContain('Discard changes?');
  });

  it('the dock and the header ask too while the editor holds changes', () => {
    const tree = mount('mine');
    const toTrain = jest.fn();

    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);

    type(tree, 'Routine name', 'Renamed');
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toContain('Discard changes?');

    press(tree, 'Discard');
    act(() => void jest.advanceTimersByTime(400));
    expect(toTrain).toHaveBeenCalledTimes(2);
  });

  it('stops guarding once it is left', () => {
    const tree = mount('mine');
    type(tree, 'Routine name', 'Renamed');
    act(() => tree.unmount());

    const toTrain = jest.fn();
    leaveGuarded(toTrain);
    expect(toTrain).toHaveBeenCalledTimes(1);
  });

  it('after Save there is nothing to discard', () => {
    jest.mocked(routineToDraft).mockReturnValueOnce(MINE).mockReturnValue({ ...MINE, name: 'Renamed' });
    const tree = mount('mine');
    type(tree, 'Routine name', 'Renamed');

    press(tree, 'Save');
    expect(router.back).toHaveBeenCalledTimes(1);

    const toTrain = jest.fn();
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain('Discard changes?');
  });
});

/** Push A as saved: a bench press last done at 80, 80, 75 kg for 5, 6, 8, and a plank held 45 and 60 seconds. */
const PUSH_A: SavedWorkoutDetail = {
  id: 'push-a',
  name: 'Push A',
  exercises: [
    {
      id: 'swe-bench',
      exerciseId: 'bench',
      name: 'Barbell bench press',
      loggingType: 'weighted',
      equipment: 'barbell',
      supersetGroup: null,
      sets: [80, 80, 75].map((weight, i) => ({ setType: 'working' as const, weight, weightUnit: 'kg' as const, reps: [5, 6, 8][i], durationS: null, distance: null, distanceUnit: null })),
    },
    {
      id: 'swe-plank',
      exerciseId: 'plank',
      name: 'Plank',
      loggingType: 'timed',
      equipment: 'bodyweight',
      supersetGroup: null,
      sets: [45, 60].map((durationS) => ({ setType: 'working' as const, weight: null, weightUnit: null, reps: null, durationS, distance: null, distanceUnit: null })),
    },
  ],
};

describe('the routine editor: Add a saved workout (R121)', () => {
  beforeEach(() => {
    mockSaved = [{ id: 'push-a', name: 'Push A', exerciseCount: 2, updatedAt: NOW }];
    jest.mocked(getSavedWorkout).mockImplementation((_db, id) => (id === 'push-a' ? PUSH_A : null));
  });

  it('is hidden when there are no saved workouts', () => {
    mockSaved = [];
    expect(buttons(mount('new'), 'Add a saved workout')).toEqual([]);
  });

  it('sits under + Add day as a secondary button, and lists the saved workouts in a sheet', () => {
    const tree = mount('new');
    const [add] = buttons(tree, 'Add a saved workout');
    expect(add.props.variant).toBe('secondary');
    const text = shownText(tree);
    expect(text.indexOf('Add a saved workout')).toBeGreaterThan(text.indexOf('+ Add day'));

    press(tree, 'Add a saved workout');
    const shown = shownText(tree);
    expect(shown).toContain('Push A');
    expect(shown).toContain('2 exercises');
    expect(tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Push A, 2 exercises' && n.props.accessibilityRole === 'button')).not.toHaveLength(0);

    press(tree, 'Cancel');
    expect(shownText(tree)).not.toContain('2 exercises');
  });

  it('adds the saved workout as a day, which Save writes with its start weights', () => {
    const tree = mount('new');
    type(tree, 'Routine name', 'Mine');
    press(tree, 'Add a saved workout');
    press(tree, 'Push A, 2 exercises');

    expect(shownText(tree)).not.toContain('2 exercises');
    expect(field(tree, 'Day 1 name').props.value).toBe('Push A');
    expect(field(tree, 'Barbell bench press reps from').props.value).toBe('5');
    expect(field(tree, 'Barbell bench press reps to').props.value).toBe('8');
    expect(field(tree, 'Plank seconds from').props.value).toBe('45');

    press(tree, 'Save');
    const day = saved().days[0];
    expect(day.name).toBe('Push A');
    expect(day.exercises.map((e) => [e.exerciseId, e.setCount, e.repMin, e.repMax, e.increment, e.incrementUnit, e.startWeight])).toEqual([
      ['bench', 3, 5, 8, 2.5, 'kg', { weight: 75, unit: 'kg' }],
      ['plank', 2, 45, 60, 0, 'kg', null],
    ]);
  });

  it('a new routine made from a saved workout still keeps to the free limit', () => {
    jest.mocked(userRoutineCount).mockReturnValue(1);
    const tree = mount('new');
    type(tree, 'Routine name', 'Mine');
    press(tree, 'Add a saved workout');
    press(tree, 'Push A, 2 exercises');
    press(tree, 'Save');

    expect(saveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain(LIMIT);
  });
});

describe('the routine editor: exercises changed while it was away (R108, R109)', () => {
  it('drops a deleted exercise from its day and says so', () => {
    const tree = mount('mine');
    delete mockLibrary.row;
    leaveAndReturn();

    expect(hasField(tree, 'Barbell row reps from')).toBe(false);
    expect(hasField(tree, 'Barbell bench press reps from')).toBe(true);
    expect(shownText(tree)).toContain("Barbell row was deleted, so it's gone from Day A.");
    press(tree, 'Save');
    expect(saved().days[0].exercises.map((e) => e.exerciseId)).toEqual(['bench']);
  });

  it('starts a retyped exercise’s rule over for its new type, and says so', () => {
    const tree = mount('mine');
    mockLibrary.plank = { id: 'plank', name: 'Plank', loggingType: 'weighted' };
    leaveAndReturn();

    expect(hasField(tree, 'Plank seconds from')).toBe(false);
    expect(field(tree, 'Plank reps from').props.value).toBe('8');
    expect(field(tree, 'Plank increment in kg').props.value).toBe('2.5');
    expect(shownText(tree)).toContain("Plank changed how it's logged, so its sets and reps start over.");
  });

  it('says nothing when nothing changed', () => {
    const tree = mount('mine');
    leaveAndReturn();
    expect(shownText(tree).some((t) => /deleted|changed how/.test(t))).toBe(false);
  });
});

describe('the routine editor: re-reading on focus (review round 1)', () => {
  /** "My split" as the database now has it, the bench press renamed "Bench" elsewhere. */
  const renamedMine = (): RoutineDraft => ({
    ...MINE,
    days: MINE.days.map((d, i) => (i === 0 ? { ...d, exercises: d.exercises.map((e, j) => (j === 0 ? { ...e, name: 'Bench' } : e)) } : d)),
  });

  it('a rename made elsewhere, with nothing changed here, is no change: Back leaves without asking', () => {
    const tree = mount('mine');
    mockLibrary.bench = { ...mockLibrary.bench, name: 'Bench' };
    jest.mocked(routineToDraft).mockReturnValue(renamedMine());
    leaveAndReturn();

    expect(hasField(tree, 'Bench reps from')).toBe(true);
    press(tree, 'Back to My split');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(router.back).toHaveBeenCalled();
  });

  it('with a change made here, a rename elsewhere still is not one: Discard keeps the new name, and asks no more', () => {
    const tree = mount('mine');
    enter(tree, 'Barbell bench press reps from', '6');
    mockLibrary.bench = { ...mockLibrary.bench, name: 'Bench' };
    jest.mocked(routineToDraft).mockReturnValue(renamedMine());
    leaveAndReturn();

    expect(field(tree, 'Bench reps from').props.value).toBe('6');
    press(tree, 'Back to My split');
    expect(shownText(tree)).toContain('Discard changes?');
    press(tree, 'Discard');
    act(() => void jest.advanceTimersByTime(400));
    expect(field(tree, 'Bench reps from').props.value).toBe('5');

    jest.mocked(router.back).mockClear();
    press(tree, 'Back to My split');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(router.back).toHaveBeenCalled();
  });

  it('re-reads the routine when nothing changed here, so an edit saved elsewhere shows', () => {
    const tree = mount('mine');
    jest.mocked(routineToDraft).mockReturnValue({ ...MINE, name: 'My split v2' });
    leaveAndReturn();
    expect(field(tree, 'Routine name').props.value).toBe('My split v2');
  });

  it('tells the screen reader what changed, and the line goes on the next focus with nothing new', () => {
    const tree = mount('mine');
    delete mockLibrary.row;
    leaveAndReturn();
    expect(announce).toHaveBeenCalledWith("Barbell row was deleted, so it's gone from Day A.");

    leaveAndReturn();
    expect(shownText(tree).some((t) => /deleted/.test(t))).toBe(false);
  });
});
