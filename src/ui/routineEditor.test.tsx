import { router } from 'expo-router';
import { StyleSheet, Switch, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import EditRoutine from '../../app/(tabs)/routines/edit/[id]';
import { PremadeRoutineError, routineToDraft, saveRoutine, userRoutineCount } from '../db/repositories/routinesRepo';
import type { RoutineDraft } from '../domain/routineDraft';
import { bumpData } from '../state/dataVersion';
import { leaveGuarded } from '../state/leaveGuard';
import { usePendingPick } from '../state/pendingPick';
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
jest.mock('../db/repositories/exercisesRepo', () => {
  const library: Record<string, { id: string; name: string; loggingType: string }> = {
    bench: { id: 'bench', name: 'Barbell bench press', loggingType: 'weighted' },
    row: { id: 'row', name: 'Barbell row', loggingType: 'weighted' },
    plank: { id: 'plank', name: 'Plank', loggingType: 'timed' },
  };
  return { getExercise: (_db: unknown, id: string) => library[id] ?? null };
});
jest.mock('../db/repositories/routinesRepo', () => ({
  PremadeRoutineError: class PremadeRoutineError extends Error {
    constructor() {
      super('Premade routines are read-only.');
    }
  },
  routineToDraft: jest.fn(),
  saveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
}));
jest.mock('../platform/entitlements', () => ({ createEntitlements: () => ({ isPro: () => mockPro }) }));
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

/** The draft the last Save wrote. */
const saved = (): RoutineDraft => jest.mocked(saveRoutine).mock.calls.at(-1)![1];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  mockPro = false;
  usePendingPick.setState({ exerciseId: null });
  jest.mocked(routineToDraft).mockReturnValue(MINE);
  jest.mocked(saveRoutine).mockReturnValue('saved-id');
  jest.mocked(userRoutineCount).mockReturnValue(0);
});

afterEach(() => jest.useRealTimers());

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

  it('says so when the routine is not there', () => {
    jest.mocked(routineToDraft).mockReturnValue(null);
    const tree = mount('gone');

    expect(shownText(tree)).toContain('Routine not found.');
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

  it('an increment of 0 means reps only, and says so', () => {
    const tree = mount('mine');

    enter(tree, 'Barbell row increment in kg', '0');

    expect(shownText(tree)).toContain('Reps only');
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

    expect(field(tree, 'Day 3 name').props.value).toBe('Day 1');
    expect(shownText(tree)).not.toContain('Day 1 has no exercises.');
    press(tree, 'Save');
    expect(saveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Day 1 has no exercises.');
  });

  it('a premade cannot be saved', () => {
    jest.mocked(saveRoutine).mockImplementation(() => {
      throw new PremadeRoutineError();
    });
    const tree = mount('mine');

    press(tree, 'Save');

    expect(shownText(tree)).toContain('Premade routines are read-only.');
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('the routine editor: leaving with unsaved changes (R89)', () => {
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
