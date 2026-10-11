import * as Haptics from 'expo-haptics';
import { Keyboard, StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { flushAll } from '../../state/draftFlush';
import { addSetTo, addWarmupTo, commitSetField, removeSetFrom, saveNote, tick, untick } from '../../state/sessionActions';
import { Button } from '../Button';
import { ExerciseBlock } from './ExerciseBlock';
import { RestInline } from './RestInline';
import { SetRow, SUGGESTED_HINT } from './SetRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));
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
  restPlus15: jest.fn(),
}));
// It draws nothing here: where it sits, and its props, are what the tests read.
jest.mock('./RestInline', () => ({ RestInline: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
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

type Rest = { restEndsAt: number | null; restSetId: string | null; restUp?: { setId: string; endsAt: number } | null };

function mount(ex: WorkoutExerciseView, rest: Rest = { restEndsAt: null, restSetId: null }, nextSetId: string | null = null): ReactTestRenderer {
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
        restEndsAt={rest.restEndsAt}
        restSetId={rest.restSetId}
        restUp={rest.restUp ?? null}
        upText="Rest's up · Set 3 next"
        settingsRestSeconds={120}
        onOpenRest={() => {}}
        nextSetId={nextSetId}
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
  jest.mocked(tick).mockReset();
  jest.mocked(untick).mockClear();
  jest.mocked(saveNote).mockClear();
  jest.mocked(addSetTo).mockClear();
  jest.mocked(addWarmupTo).mockClear();
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  dismiss.mockRestore();
  jest.useRealTimers();
});

describe('ExerciseBlock: a sheet opened over a field being typed in (F1)', () => {
  it('puts the keyboard away before the sheet opens, and the blur that follows saves the typed weight', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('140'));
    expect(commitSetField).not.toHaveBeenCalled();
    /** Whether the set-type sheet was showing at each Keyboard.dismiss. The opener and the Sheet's own effect may both call it. */
    const sheetShowing: boolean[] = [];
    // What Keyboard.dismiss does on the phone: the field that has focus blurs.
    dismiss.mockImplementation(() => {
      sheetShowing.push(shownText(tree).includes('Set type'));
      byLabel(tree, 'LB, set 1').props.onBlur();
    });

    act(() => byLabel(tree, 'Set 1').props.onPress());

    expect(sheetShowing[0]).toBe(false);
    expect(shownText(tree)).toContain('Set type');
    expect(commitSetField).toHaveBeenCalledTimes(1);
    expect(commitSetField).toHaveBeenCalledWith('db', 's0', { weight: 140, weightUnit: 'lb' });
  });
});

/** Every TextInput a number is typed into, with its accessibility label. */
const numberInputs = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((t) => t.props.keyboardType !== undefined);

describe('ExerciseBlock: closing the keyboard (Task 24, R43)', () => {
  it("gives every number field the Done key: weight, reps, RPE, time and distance, with React Native's own toolbar", () => {
    const loads = mount({ ...bench([set('s0', 0)]), showRpe: true });
    const timed = mount({ ...bench([set('s0', 0)]), loggingType: 'distance_time' });
    const fields = [...numberInputs(loads), ...numberInputs(timed)];

    expect(fields.map((f) => f.props.accessibilityLabel)).toEqual([
      'LB, set 1',
      'REPS, set 1',
      'RPE, set 1',
      expect.stringMatching(/, set 1$/),
      expect.stringMatching(/, set 1$/),
    ]);
    for (const field of fields) {
      expect(field.props.returnKeyType).toBe('done');
      // A shared accessory view attaches to only the first field with its id; without one each gets the built-in Done bar.
      expect(field.props.inputAccessoryViewID).toBeUndefined();
    }
  });

  it('ticking a set stores the weight typed in the focused field, then closes the keyboard', () => {
    jest.mocked(tick).mockReturnValue(true);
    const ex = bench([set('s0', 0)]);
    const tree = mount(ex);
    act(() => byLabel(tree, 'REPS, set 1').props.onChangeText('8'));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('140'));
    // The weight field still has focus: closing the keyboard blurs it.
    dismiss.mockImplementation(() => byLabel(tree, 'LB, set 1').props.onBlur());

    act(() => byLabel(tree, 'Set 1 done').props.onPress());

    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledWith('db', ex, ex.sets[0], expect.objectContaining({ weight: 140, reps: 8 }), 'lb');
    expect(dismiss).toHaveBeenCalled();
    expect(jest.mocked(tick).mock.invocationCallOrder[0]).toBeLessThan(dismiss.mock.invocationCallOrder[0]);
  });

  it('unticking a set closes the keyboard too', () => {
    const tree = mount(oneDone());
    act(() => byLabel(tree, 'Set 1 done').props.onPress());
    expect(untick).toHaveBeenCalledWith('db', 's0');
    expect(dismiss).toHaveBeenCalled();
  });

  it('pressing and holding a set closes the keyboard before its sheet opens', () => {
    const tree = mount(bench([set('s0', 0)]));
    const sheetShowing: boolean[] = [];
    dismiss.mockImplementation(() => void sheetShowing.push(shownText(tree).includes('Remove set')));
    const row = tree.root.findAllByType(SetRow)[0];

    act(() => row.props.onLongPress());

    expect(shownText(tree)).toContain('Remove set');
    expect(sheetShowing[0]).toBe(false);
  });
});

/** Set 1 ticked at 135 x 8, set 2 not ticked yet. */
const oneDone = () => bench([set('s0', 0, { done: true, weight: 135, weightUnit: 'lb', reps: 8, completedAt: 1 }), set('s1', 1)]);

describe('ExerciseBlock: a tick that is not ready says why (spec 18.6)', () => {
  beforeEach(() => {
    jest.mocked(Haptics.impactAsync).mockClear();
    jest.mocked(Haptics.notificationAsync).mockClear();
  });

  it('stays pressable at full strength, with a hint', () => {
    const tree = mount(bench([set('s0', 0)]));
    const tickButton = byLabel(tree, 'Set 1 done');

    expect(tickButton.props.disabled).toBeFalsy();
    expect(tickButton.props.accessibilityHint).toBe('Enter a weight first');
    expect(tickButton.props.style({ pressed: false })).toMatchObject({ opacity: 1, borderStyle: 'dashed' });
  });

  it('tapping it focuses the weight field, says "Add a weight to tick", gives a warning haptic, and ticks nothing', () => {
    const tree = mount(bench([set('s0', 0)]));
    const focus = jest.spyOn(byLabel(tree, 'LB, set 1').instance, 'focus');

    act(() => byLabel(tree, 'Set 1 done').props.onPress());

    expect(focus).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
    // A not-ready tap keeps the keyboard up, so the focused field can be typed in.
    expect(dismiss).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Add a weight to tick');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('the line goes once a weight is typed', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'Set 1 done').props.onPress());
    expect(shownText(tree)).toContain('Add a weight to tick');

    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('135'));

    expect(shownText(tree)).not.toContain('Add a weight to tick');
  });

  it('Check this number wins over the nudge', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('abc'));

    act(() => byLabel(tree, 'Set 1 done').props.onPress());

    expect(shownText(tree)).toContain('Check this number');
    expect(shownText(tree)).not.toContain('Add a weight to tick');
    expect(tick).not.toHaveBeenCalled();
  });

  it("set 2 shows set 1's weight as a ghost and ticks in one tap", () => {
    jest.mocked(tick).mockReturnValue(true);
    const tree = mount(oneDone());

    expect(byLabel(tree, 'LB, set 2').props.placeholder).toBe('135');
    expect(byLabel(tree, 'REPS, set 2').props.placeholder).toBe('8');

    act(() => byLabel(tree, 'Set 2 done').props.onPress());

    expect(tick).toHaveBeenCalledTimes(1);
  });
});

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

describe('ExerciseBlock: the countdown under its set (Task 26, R41)', () => {
  const threeSets = () => bench([set('s0', 0), set('s1', 1), set('s2', 2)]);

  /** The set rows (by id) and the countdowns ('rest'), top to bottom. */
  const rowsAndRests = (tree: ReactTestRenderer) =>
    tree.root
      .findAll((n) => n.type === SetRow || n.type === RestInline)
      .map((n) => (n.type === SetRow ? (n.props.row as { set: SetView }).set.id : 'rest'));

  it('shows exactly one countdown, directly under the set that started the rest, with this workout and that end', () => {
    const endsAt = Date.now() + 90_000;
    const tree = mount(threeSets(), { restEndsAt: endsAt, restSetId: 's1' });

    const rests = tree.root.findAllByType(RestInline);
    expect(rests).toHaveLength(1);
    expect(rests[0].props).toMatchObject({
      workoutId: 'w1',
      endsAt,
      lengthSeconds: 120,
      upText: expect.any(String),
      onOpenRest: expect.any(Function),
    });
    expect(rowsAndRests(tree)).toEqual(['s0', 's1', 'rest', 's2']);
  });

  it("shows none when the rest was started by another exercise's set", () => {
    const tree = mount(threeSets(), { restEndsAt: Date.now() + 90_000, restSetId: 'other-exercise-s1' });

    expect(tree.root.findAllByType(RestInline)).toHaveLength(0);
  });

  it('shows none when no rest is running', () => {
    const tree = mount(threeSets(), { restEndsAt: null, restSetId: 's1' });

    expect(tree.root.findAllByType(RestInline)).toHaveLength(0);
  });

  it("holds Rest's up under the set whose rest just ran out", () => {
    const endsAt = Date.now() - 1_000;
    const tree = mount(threeSets(), { restEndsAt: null, restSetId: null, restUp: { setId: 's1', endsAt } });

    const rests = tree.root.findAllByType(RestInline);
    expect(rests).toHaveLength(1);
    expect(rests[0].props).toMatchObject({ workoutId: 'w1', endsAt, lengthSeconds: 120, upText: "Rest's up · Set 3 next" });
    expect(rowsAndRests(tree)).toEqual(['s0', 's1', 'rest', 's2']);
  });

  it("holds none for another exercise's set", () => {
    const tree = mount(threeSets(), { restEndsAt: null, restSetId: null, restUp: { setId: 'other-exercise-s1', endsAt: Date.now() } });

    expect(tree.root.findAllByType(RestInline)).toHaveLength(0);
  });

  it("times the track by the exercise's own rest", () => {
    const tree = mount({ ...threeSets(), restSeconds: 90 }, { restEndsAt: Date.now() + 60_000, restSetId: 's1' });

    expect(tree.root.findByType(RestInline).props.lengthSeconds).toBe(90);
  });
});

describe('ExerciseBlock: the set count and the next set (spec 18.6)', () => {
  const NO_REST: Rest = { restEndsAt: null, restSetId: null };
  const ticked = { done: true, weight: 135, weightUnit: 'lb' as const, reps: 8, completedAt: 1 };
  /** Set 1 ticked, sets 2 to 4 open. */
  const fourSets = () => bench([set('a', 0, ticked), set('b', 1), set('c', 2), set('d', 3)]);

  it('shows how many sets are ticked before ⋯', () => {
    const tree = mount(fourSets());

    const count = tree.root.findAll((n) => n.type === Text && n.props.children === '1/4');
    expect(count).toHaveLength(1);
    expect(count[0].props.accessibilityLabel).toBe('1 of 4 sets done');
    expect(count[0].props.maxFontSizeMultiplier).toBeUndefined();
    // It comes before the ⋯ button in the name row.
    const order = shownText(tree).indexOf('1/4');
    expect(order).toBeGreaterThan(shownText(tree).indexOf('Bench Press'));

    expect(shownText(mount(bench([])))).not.toContain('0/0');
  });

  it('the name row wraps at large text: the count, + Note and ⋯ drop to a second line together, right-aligned', () => {
    const tree = mount(fourSets());
    const name = tree.root.findAll((n) => n.type === Text && n.props.children === 'Bench Press')[0];
    const count = tree.root.findAll((n) => n.type === Text && n.props.children === '1/4')[0];
    const addNote = byLabel(tree, 'Add a note for Bench Press');
    const options = byLabel(tree, 'Options for Bench Press');

    // The row is the nearest ancestor of the name that also holds the controls.
    let row = name.parent!;
    while (!row.findAll((n) => n === options).length) row = row.parent!;
    expect(StyleSheet.flatten(row.props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }),
    );
    // flex: 1 would give the name a flex basis of 0, so the row would never wrap and the name would be squeezed.
    const nameStyle = StyleSheet.flatten(name.props.style);
    expect(nameStyle).toEqual(expect.objectContaining({ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }));
    expect(nameStyle.flex).toBeUndefined();

    // The three controls share one parent inside the row, pushed right and never squeezed.
    const group = row.findAll(
      (n) => n !== row && n.findAll((m) => m === count).length > 0 && n.findAll((m) => m === addNote).length > 0 && n.findAll((m) => m === options).length > 0,
    );
    const controls = group[group.length - 1];
    expect(controls).toBeDefined();
    expect(StyleSheet.flatten(controls.props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', flexShrink: 0 }),
    );
    expect(controls.findAll((n) => n === name)).toHaveLength(0);
    // Order stays [name][count][+ Note][⋯], with 44pt targets.
    const shown = shownText(tree);
    expect(shown.indexOf('Bench Press')).toBeLessThan(shown.indexOf('1/4'));
    expect(shown.indexOf('1/4')).toBeLessThan(shown.indexOf('+ Note'));
    expect(StyleSheet.flatten(addNote.props.style({ pressed: false }))).toMatchObject({ minHeight: 44 });
    expect(StyleSheet.flatten(options.props.style({ pressed: false }))).toMatchObject({ width: 44, height: 44 });
  });

  it("the next set's tick has the bolder ring", () => {
    const tree = mount(fourSets(), NO_REST, 'b');

    expect(tree.root.findAllByType(SetRow).map((r) => r.props.isNext)).toEqual([false, true, false, false]);
    expect(byLabel(tree, 'Set 2 done').props.style({ pressed: false })).toMatchObject({ borderWidth: 2.5, borderColor: '#f1ece2' });
    expect(byLabel(tree, 'Set 3 done').props.style({ pressed: false })).toMatchObject({ borderWidth: 1.5, borderColor: '#a39d90' });

    const doneNext = mount(fourSets(), NO_REST, 'a');
    expect(byLabel(doneNext, 'Set 1 done').props.style({ pressed: false })).toMatchObject({ borderWidth: 1.5 });
  });

  it('the next set keeps the bold ring while not ready', () => {
    const tree = mount(bench([set('s0', 0)]), NO_REST, 's0');

    expect(byLabel(tree, 'Set 1 done').props.style({ pressed: false })).toMatchObject({ borderWidth: 2.5, borderStyle: 'dashed' });
  });
});

describe('ExerciseBlock: suggested values look like suggestions (spec 18.6)', () => {
  const look = (tree: ReactTestRenderer, label: string) => StyleSheet.flatten(byLabel(tree, label).props.style);
  const suggested = {
    borderStyle: 'dashed',
    borderColor: '#736c60',
    backgroundColor: 'transparent',
    color: '#6d675c',
    fontFamily: 'BarlowCondensed_600SemiBold',
  };
  const entered = {
    borderStyle: 'solid',
    borderColor: '#736c60',
    backgroundColor: '#1a1814',
    color: '#f1ece2',
    fontFamily: 'BarlowCondensed_800ExtraBold',
  };
  const planned = (): WorkoutExerciseView => ({
    ...bench([set('s0', 0)]),
    plannedWeight: 135,
    plannedUnit: 'lb',
    rule: { setCount: 3, repMin: 6, repMax: 8, increment: 5, incrementUnit: 'lb' },
  });

  it("draws today's target as a suggestion until it is typed over", () => {
    const tree = mount(planned());
    expect(look(tree, 'LB, set 1')).toMatchObject(suggested);
    expect(byLabel(tree, 'LB, set 1').props.value).toBe('135');
    expect(byLabel(tree, 'LB, set 1').props.accessibilityHint).toBe(SUGGESTED_HINT);

    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('140'));

    expect(look(tree, 'LB, set 1')).toMatchObject(entered);
    expect(byLabel(tree, 'LB, set 1').props.accessibilityHint).toBeUndefined();
  });

  it('a ghost from last time is drawn as a suggestion', () => {
    const ex: WorkoutExerciseView = {
      ...bench([set('s0', 0)]),
      previous: [{ position: 0, setType: 'working', weight: 135, weightUnit: 'lb', reps: 8, durationS: null, distance: null, distanceUnit: null }],
    };
    const tree = mount(ex);
    const field = byLabel(tree, 'LB, set 1');
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBe('135');
    expect(field.props.placeholderTextColor).toBe('#6d675c');
    expect(look(tree, 'LB, set 1')).toMatchObject({ borderStyle: 'dashed' });
    expect(field.props.accessibilityHint).toBe(SUGGESTED_HINT);
  });

  it("a ticked set's values are solid", () => {
    const tree = mount(oneDone());
    for (const label of ['LB, set 1', 'REPS, set 1']) {
      expect(look(tree, label)).toMatchObject(entered);
      expect(byLabel(tree, label).props.accessibilityHint).toBeUndefined();
    }
  });

  it('clearing a typed value brings the suggestion back', () => {
    const tree = mount(planned());
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('140'));
    expect(look(tree, 'LB, set 1')).toMatchObject(entered);

    act(() => byLabel(tree, 'LB, set 1').props.onChangeText(''));

    expect(look(tree, 'LB, set 1')).toMatchObject(suggested);
    // R49: the cleared field's ghost is the target, which is what a tick logs.
    expect(byLabel(tree, 'LB, set 1').props.placeholder).toBe('135');
    expect(byLabel(tree, 'LB, set 1').props.accessibilityHint).toBe(SUGGESTED_HINT);
  });
});

/** The note field, which shows only while the note is being edited. */
const noteFields = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((t) => t.props.accessibilityLabel === 'Note for Bench Press');

/** A Pressable's style when not pressed, flattened. */
const restingStyle = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

/** The drawn Text whose child is exactly `text`. */
const textNode = (tree: ReactTestRenderer, text: string) => {
  const found = tree.root.findAll((n) => n.type === Text && n.props.children === text);
  expect(found).toHaveLength(1);
  return found[0];
};

const ADD_NOTE = 'Add a note for Bench Press';
const SAVED = 'Pause on the chest, 2s';
const withNote = (): WorkoutExerciseView => ({ ...bench([set('s0', 0)]), note: SAVED });

describe('ExerciseBlock: the note (UX item 6, R29)', () => {
  it('an empty note shows "+ Note" in the header and no field', () => {
    const tree = mount(bench([set('s0', 0)]));

    expect(byLabel(tree, ADD_NOTE).props.accessibilityRole).toBe('button');
    expect(shownText(tree)).toContain('+ Note');
    expect(noteFields(tree)).toHaveLength(0);
  });

  it('+ Note opens the field empty and focused', () => {
    const tree = mount(bench([set('s0', 0)]));

    act(() => byLabel(tree, ADD_NOTE).props.onPress());

    const fields = noteFields(tree);
    expect(fields).toHaveLength(1);
    expect(fields[0].props.value).toBe('');
    expect(fields[0].props.autoFocus).toBe(true);
    expect(fields[0].props.placeholder).toBe('Add a note for next time');
    expect(shownText(tree)).not.toContain('+ Note');
    // Opening the field never puts the keyboard away.
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('typing then leaving the field saves the trimmed note once', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, ADD_NOTE).props.onPress());

    act(() => noteFields(tree)[0].props.onChangeText('  Pause on the chest '));
    act(() => noteFields(tree)[0].props.onBlur());

    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(saveNote).toHaveBeenCalledWith('db', 'barbell-bench-press', 'Pause on the chest');
    expect(noteFields(tree)).toHaveLength(0);
  });

  it('leaving an empty field saves nothing and shows + Note again', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, ADD_NOTE).props.onPress());

    act(() => noteFields(tree)[0].props.onBlur());

    expect(saveNote).not.toHaveBeenCalled();
    expect(noteFields(tree)).toHaveLength(0);
    expect(shownText(tree)).toContain('+ Note');
  });

  it('a saved note shows in full under the name, muted, with no + Note', () => {
    const tree = mount(withNote());

    const line = byLabel(tree, `Note for Bench Press: ${SAVED}`);
    expect(line.props.accessibilityRole).toBe('button');
    expect(line.props.accessibilityHint).toBe('Edits the note');
    expect(restingStyle(line)).toMatchObject({ minHeight: 44 });
    const text = textNode(tree, SAVED);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ color: '#a39d90', fontSize: 14 });
    expect(shownText(tree).indexOf(SAVED)).toBeGreaterThan(shownText(tree).indexOf('Bench Press'));
    expect(shownText(tree)).not.toContain('+ Note');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === ADD_NOTE)).toHaveLength(0);
    expect(noteFields(tree)).toHaveLength(0);
  });

  it('tapping the saved note opens it for editing; clearing it saves blank', () => {
    const tree = mount(withNote());

    act(() => byLabel(tree, `Note for Bench Press: ${SAVED}`).props.onPress());

    expect(noteFields(tree)).toHaveLength(1);
    expect(noteFields(tree)[0].props.value).toBe(SAVED);
    expect(noteFields(tree)[0].props.autoFocus).toBe(true);
    // The field takes the line's place.
    expect(shownText(tree)).not.toContain(SAVED);

    act(() => noteFields(tree)[0].props.onChangeText(''));
    act(() => noteFields(tree)[0].props.onBlur());

    expect(saveNote).toHaveBeenCalledTimes(1);
    expect(saveNote).toHaveBeenCalledWith('db', 'barbell-bench-press', '');
  });

  it('an edited note left unchanged saves nothing', () => {
    const tree = mount(withNote());
    act(() => byLabel(tree, `Note for Bench Press: ${SAVED}`).props.onPress());

    act(() => noteFields(tree)[0].props.onBlur());

    expect(saveNote).not.toHaveBeenCalled();
    expect(noteFields(tree)).toHaveLength(0);
    expect(shownText(tree)).toContain(SAVED);
  });

  it('a note typed but not left is saved by flushAll (R29)', () => {
    const tree = mount(bench([set('s0', 0)]));
    try {
      act(() => byLabel(tree, ADD_NOTE).props.onPress());
      act(() => noteFields(tree)[0].props.onChangeText('Slow eccentric'));

      act(() => flushAll());

      expect(saveNote).toHaveBeenCalledTimes(1);
      expect(saveNote).toHaveBeenCalledWith('db', 'barbell-bench-press', 'Slow eccentric');
      expect(noteFields(tree)).toHaveLength(0);

      act(() => flushAll());
      expect(saveNote).toHaveBeenCalledTimes(1);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('the field blurs and submits on Return', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, ADD_NOTE).props.onPress());

    const field = noteFields(tree)[0];
    expect(field.props.multiline).toBe(true);
    expect(field.props.submitBehavior).toBe('blurAndSubmit');
  });
});

describe('ExerciseBlock: + Set and + Warmup (UX item 6)', () => {
  /** The add buttons, in the order they are drawn. */
  const addButtons = (tree: ReactTestRenderer) =>
    tree.root.findAllByType(Button).filter((b) => (b.props.label as string).startsWith('+ '));

  it('shows + Set then + Warmup as compact quiet buttons, left-aligned in one row', () => {
    const tree = mount(bench([set('s0', 0)]));

    const buttons = addButtons(tree);
    expect(buttons.map((b) => b.props.label)).toEqual(['+ Set', '+ Warmup']);
    for (const b of buttons) {
      expect(b.props.variant).toBe('quiet');
      expect(b.props.size).toBe('compact');
    }
    const row = buttons[0].parent;
    expect(row).not.toBeNull();
    expect(buttons[1].parent).toBe(row);
    expect(StyleSheet.flatten(row!.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-start' });
    expect(shownText(tree)).not.toContain('+ Add set');
    expect(shownText(tree)).not.toContain('+ Add warmup');
  });

  it('+ Set adds a working set and + Warmup adds a warmup', () => {
    const tree = mount(bench([set('s0', 0)]));

    press(tree, '+ Set');
    expect(addSetTo).toHaveBeenCalledWith('db', 'we1');
    expect(addWarmupTo).not.toHaveBeenCalled();

    press(tree, '+ Warmup');
    expect(addWarmupTo).toHaveBeenCalledWith('db', 'we1');
    expect(addSetTo).toHaveBeenCalledTimes(1);
  });

  it('the add buttons are named for the exercise', () => {
    const tree = mount(bench([set('s0', 0)]));

    expect(byLabel(tree, 'Add a set to Bench Press').props.label).toBe('+ Set');
    expect(byLabel(tree, 'Add a warmup to Bench Press').props.label).toBe('+ Warmup');
  });

  it('the header keeps ⋯ at 44pt beside the count and + Note', () => {
    const tree = mount(oneDone());

    expect(restingStyle(byLabel(tree, 'Options for Bench Press'))).toMatchObject({ width: 44, height: 44 });
    expect(restingStyle(byLabel(tree, ADD_NOTE))).toMatchObject({ flexShrink: 0, minHeight: 44 });
    expect(StyleSheet.flatten(textNode(tree, 'Bench Press').props.style)).toMatchObject({ minWidth: 0 });
    // [name][count][+ Note][⋯], in the order they are drawn.
    const labels = [
      ...new Set(tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string)),
    ];
    const order = ['1 of 2 sets done', ADD_NOTE, 'Options for Bench Press'].map((l) => labels.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const shown = shownText(tree);
    expect(shown.indexOf('1/2')).toBeGreaterThan(shown.indexOf('Bench Press'));
    expect(shown.indexOf('+ Note')).toBeGreaterThan(shown.indexOf('1/2'));
  });
});
