import { Keyboard } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { commitSetField, removeSetFrom } from '../../state/sessionActions';
import { Button } from '../Button';
import { ExerciseBlock } from './ExerciseBlock';
import { SetRow } from './SetRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({
  addSetTo: jest.fn(),
  addWarmupTo: jest.fn(),
  commitSetField: jest.fn(),
  removeSetFrom: jest.fn(),
  saveNote: jest.fn(),
  tick: jest.fn(),
  untick: jest.fn(),
}));
jest.mock('./RestInline', () => ({ RestInline: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** A working set of the bench press: undone and empty unless `extra` says otherwise. */
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

const bench = (sets: SetView[]): WorkoutExerciseView => ({
  id: 'we1',
  exerciseId: 'barbell-bench-press',
  name: 'Bench Press',
  loggingType: 'weighted',
  equipment: 'barbell',
  position: 0,
  supersetGroup: null,
  showRpe: false,
  note: null,
  restSeconds: null,
  rule: null,
  plannedWeight: null,
  plannedUnit: null,
  overrideWeight: null,
  overrideUnit: null,
  sets,
  previous: [],
});

function mount(ex: WorkoutExerciseView): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ExerciseBlock
        workoutId="w1"
        ex={ex}
        unit="lb"
        gear={{ bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } }}
        distanceUnit="mi"
        onOpenMenu={() => {}}
        inSuperset={false}
        joinsNext={false}
        restEndsAt={null}
        restSetId={null}
      />,
    );
  });
  return tree;
}

/** The element with this accessibility label that can be pressed or typed into. */
function byLabel(tree: ReactTestRenderer, label: string) {
  const found = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && (typeof n.props.onPress === 'function' || typeof n.props.onChangeText === 'function'),
  );
  expect(found.length).toBeGreaterThan(0);
  return found[0];
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

function press(tree: ReactTestRenderer, label: string) {
  const buttons = tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  expect(buttons).toHaveLength(1);
  act(() => buttons[0].props.onPress());
}

/** iOS opens the next sheet a moment after the last one closes. */
const afterSheetCloses = () => act(() => void jest.advanceTimersByTime(400));

let dismiss: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(commitSetField).mockClear();
  jest.mocked(removeSetFrom).mockClear();
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  dismiss.mockRestore();
  jest.useRealTimers();
});

describe('ExerciseBlock: a sheet opened over a field being typed in (F1)', () => {
  it('puts the keyboard away, and the blur that follows saves the typed weight', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('140'));
    expect(commitSetField).not.toHaveBeenCalled();
    // What Keyboard.dismiss does on the phone: the field that has focus blurs.
    dismiss.mockImplementation(() => byLabel(tree, 'LB, set 1').props.onBlur());

    act(() => byLabel(tree, 'Set 1').props.onPress());

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(commitSetField).toHaveBeenCalledWith('db', 's0', { weight: 140, weightUnit: 'lb' });
  });
});

/** Set 1 ticked at 135 x 8, set 2 not ticked yet. */
const oneDone = () => bench([set('s0', 0, { done: true, weight: 135, weightUnit: 'lb', reps: 8, completedAt: 1 }), set('s1', 1)]);

describe('ExerciseBlock: Remove set asks first when the set is ticked (F5)', () => {
  it('says the set number opens a sheet that changes the type or removes the set', () => {
    const tree = mount(oneDone());
    expect(byLabel(tree, 'Set 1').props.accessibilityHint).toBe('Changes the set type or removes the set');
  });

  it('asks "Remove set 1?" after the set-type sheet closes, and removes nothing yet', () => {
    const tree = mount(oneDone());
    act(() => byLabel(tree, 'Set 1').props.onPress());

    press(tree, 'Remove set');
    expect(shownText(tree)).not.toContain('Set type');
    afterSheetCloses();

    expect(shownText(tree)).toEqual(expect.arrayContaining(['Remove set 1?', 'Remove', 'Keep']));
    expect(removeSetFrom).not.toHaveBeenCalled();
  });

  it('removes the ticked set once Remove is confirmed', () => {
    const tree = mount(oneDone());
    act(() => byLabel(tree, 'Set 1').props.onPress());
    press(tree, 'Remove set');
    afterSheetCloses();

    press(tree, 'Remove');

    expect(removeSetFrom).toHaveBeenCalledTimes(1);
    expect(removeSetFrom).toHaveBeenCalledWith('db', 's0');
    expect(shownText(tree)).not.toContain('Remove set 1?');
  });

  it('keeps the ticked set on Keep', () => {
    const tree = mount(oneDone());
    act(() => byLabel(tree, 'Set 1').props.onPress());
    press(tree, 'Remove set');
    afterSheetCloses();

    press(tree, 'Keep');
    afterSheetCloses();

    expect(removeSetFrom).not.toHaveBeenCalled();
    expect(shownText(tree)).not.toContain('Remove set 1?');
  });

  it('asks first from the long-press sheet too', () => {
    const tree = mount(oneDone());
    act(() => tree.root.findAllByType(SetRow)[0].props.onLongPress());

    press(tree, 'Remove set');
    afterSheetCloses();

    expect(shownText(tree)).toContain('Remove set 1?');
    expect(removeSetFrom).not.toHaveBeenCalled();
  });

  it('removes a set that is not ticked at once, from either sheet, without asking', () => {
    const tree = mount(oneDone());
    act(() => byLabel(tree, 'Set 2').props.onPress());
    press(tree, 'Remove set');
    expect(removeSetFrom).toHaveBeenCalledWith('db', 's1');

    act(() => tree.root.findAllByType(SetRow)[1].props.onLongPress());
    press(tree, 'Remove set');
    afterSheetCloses();

    expect(removeSetFrom).toHaveBeenCalledTimes(2);
    expect(shownText(tree).join(' ')).not.toContain('Remove set 2?');
  });
});
