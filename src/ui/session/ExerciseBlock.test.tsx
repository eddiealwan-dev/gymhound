import * as Haptics from 'expo-haptics';
import { Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { SetView, WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { flushAll } from '../../state/draftFlush';
import { addSetTo, addWarmupTo, commitSetField, removeSetFrom, saveNote, tick, untick } from '../../state/sessionActions';
import { Button } from '../Button';
import { FormDemo } from '../FormDemo';
import { ExerciseBlock } from './ExerciseBlock';
import { RestInline } from './RestInline';
import { cellStyle, COLUMN_GAP, SetRow, SUGGESTED_HINT } from './SetRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Heavy: 'heavy' },
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Warning: 'warning' },
}));
const mockAnnounce = jest.fn();
jest.mock('../../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));
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
// Its own tests cover what it shows; here, which exercise it is opened for is what the tests read.
jest.mock('../FormDemo', () => ({ FormDemo: () => null }));
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
  mark: null,
  sets,
  previous: [],
});

type Rest = { restEndsAt: number | null; restSetId: string | null; restUp?: { setId: string; endsAt: number } | null };

function mount(ex: WorkoutExerciseView, rest: Rest = { restEndsAt: null, restSetId: null }, nextSetId: string | null = null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(block(ex, rest, nextSetId));
  });
  return tree;
}

/** The block as the session screen draws it. */
function block(ex: WorkoutExerciseView, rest: Rest = { restEndsAt: null, restSetId: null }, nextSetId: string | null = null) {
  return (
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
      onOpenMark={() => {}}
      nextSetId={nextSetId}
    />
  );
}

/** The element with this accessibility label that can be pressed or typed into. */
function byLabel(tree: ReactTestRenderer, label: string) {
  const found = tree.root.findAll(
    (n) => n.props.accessibilityLabel === label && (typeof n.props.onPress === 'function' || typeof n.props.onChangeText === 'function'),
  );
  expect(found.length).toBeGreaterThan(0);
  return found[0];
}

/**
 * Gives the field its own focus mock. React Native's jest TextInput shares one `focus` mock on its prototype, so a
 * spy on it would count every field's focus, in every test.
 */
function focusOf(tree: ReactTestRenderer, label: string): jest.Mock {
  const own = jest.fn();
  (byLabel(tree, label).instance as { focus: () => void }).focus = own;
  return own;
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

/** Taps a tick and lets the tap settle: a tick that is not ready focuses its field once its haptic has played (R82). */
async function tapTick(tree: ReactTestRenderer, label: string) {
  await act(async () => byLabel(tree, label).props.onPress());
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
    expect(tick).toHaveBeenCalledWith('db', ex, ex.sets[0], expect.objectContaining({ weight: 140, reps: 8 }), 'lb', 'mi');
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
    mockAnnounce.mockClear();
  });

  it('stays pressable at full strength, with a hint', () => {
    const tree = mount(bench([set('s0', 0)]));
    const tickButton = byLabel(tree, 'Set 1 done');

    expect(tickButton.props.disabled).toBeFalsy();
    expect(tickButton.props.accessibilityHint).toBe('Enter a weight first');
    expect(tickButton.props.style({ pressed: false })).toMatchObject({ opacity: 1, borderStyle: 'dashed' });
  });

  it('tapping it focuses the weight field, says "Add a weight to tick", gives a warning haptic, and ticks nothing', async () => {
    const tree = mount(bench([set('s0', 0)]));
    const focus = focusOf(tree, 'LB, set 1');

    await tapTick(tree, 'Set 1 done');

    expect(focus).toHaveBeenCalledTimes(1);
    expect(tick).not.toHaveBeenCalled();
    // A not-ready tap keeps the keyboard up, so the focused field can be typed in.
    expect(dismiss).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Add a weight to tick');
    // A heavy tap, distinct from the tick's light one (Round 4, A3).
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  describe('on the phone (Round 4, A3)', () => {
    /** Each field's own focus mock, by its label. */
    const focusSpies = (tree: ReactTestRenderer, labels: string[]) => Object.fromEntries(labels.map((label) => [label, focusOf(tree, label)]));

    it('buzzes before it focuses: the keyboard coming up can swallow a haptic', async () => {
      const tree = mount(bench([set('s0', 0)]));
      const { 'LB, set 1': focus } = focusSpies(tree, ['LB, set 1']);

      await tapTick(tree, 'Set 1 done');

      expect(focus).toHaveBeenCalledTimes(1);
      expect(jest.mocked(Haptics.impactAsync).mock.invocationCallOrder[0]).toBeLessThan(focus.mock.invocationCallOrder[0]);
    });

    it('focuses the weight and never the reps when the reps have a suggestion (a routine set with no weight)', async () => {
      const ex = { ...bench([set('s0', 0)]), rule: { setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' } } as WorkoutExerciseView;
      const tree = mount(ex);
      expect(byLabel(tree, 'REPS, set 1').props.placeholder).toBe('8');
      const focus = focusSpies(tree, ['LB, set 1', 'REPS, set 1']);

      await tapTick(tree, 'Set 1 done');

      expect(focus['LB, set 1']).toHaveBeenCalledTimes(1);
      expect(focus['REPS, set 1']).not.toHaveBeenCalled();
      expect(shownText(tree)).toContain('Add a weight to tick');
    });

    it('focuses once the line has drawn, so nothing the tap re-renders can move the focus on', async () => {
      const tree = mount(bench([set('s0', 0)]));
      const lineShownAtFocus: boolean[] = [];
      focusOf(tree, 'LB, set 1').mockImplementation(() => void lineShownAtFocus.push(shownText(tree).includes('Add a weight to tick')));

      await tapTick(tree, 'Set 1 done');

      expect(lineShownAtFocus).toEqual([true]);
    });

    it('with the reps typed and still focused, the tap still lands on the weight, after the reps are saved', async () => {
      const tree = mount(bench([set('s0', 0)]));
      act(() => byLabel(tree, 'REPS, set 1').props.onChangeText('5'));
      const focus = focusSpies(tree, ['LB, set 1', 'REPS, set 1']);
      // What the phone does when another field takes focus: the reps field blurs, and its blur saves.
      focus['LB, set 1'].mockImplementation(() => byLabel(tree, 'REPS, set 1').props.onBlur());

      await tapTick(tree, 'Set 1 done');

      expect(focus['LB, set 1']).toHaveBeenCalledTimes(1);
      expect(focus['REPS, set 1']).not.toHaveBeenCalled();
      expect(commitSetField).toHaveBeenCalledWith('db', 's0', { reps: 5 });
      expect(shownText(tree)).toContain('Add a weight to tick');
    });

    it('the buzz comes first, before the tap changes anything on screen (Round 5, R82)', async () => {
      const tree = mount(bench([set('s0', 0)]));
      const focus = focusOf(tree, 'LB, set 1');
      const shownAtBuzz: string[][] = [];
      jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => {
        shownAtBuzz.push(shownText(tree));
        return Promise.resolve();
      });

      await tapTick(tree, 'Set 1 done');

      expect(shownAtBuzz).toHaveLength(1);
      expect(shownAtBuzz[0]).not.toContain('Add a weight to tick');
      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('the keyboard waits for the buzz: the field is focused only once the haptic has played (Round 5, R82)', async () => {
      const tree = mount(bench([set('s0', 0)]));
      const focus = focusOf(tree, 'LB, set 1');
      let played!: () => void;
      jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => new Promise<void>((resolve) => (played = resolve)));

      await tapTick(tree, 'Set 1 done');

      // The line and the announcement don't wait; the keyboard does.
      expect(shownText(tree)).toContain('Add a weight to tick');
      expect(mockAnnounce).toHaveBeenCalledWith('Add a weight to tick');
      expect(focus).not.toHaveBeenCalled();

      await act(async () => played());

      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('a phone with no haptics still focuses the field', async () => {
      const tree = mount(bench([set('s0', 0)]));
      const focus = focusOf(tree, 'LB, set 1');
      jest.mocked(Haptics.impactAsync).mockImplementationOnce(() => Promise.reject(new Error('no haptics')));

      await tapTick(tree, 'Set 1 done');

      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('the line stays through what the phone does next: the field takes focus and the row draws again (Round 5)', async () => {
      const ex = bench([set('s0', 0)]);
      const tree = mount(ex);
      // The field's own focus handler, if it has one, then a fresh render of the block, as the keyboard coming up does.
      focusOf(tree, 'LB, set 1').mockImplementation(() => {
        byLabel(tree, 'LB, set 1').props.onFocus?.({ nativeEvent: {} });
        tree.update(block(ex));
      });

      await tapTick(tree, 'Set 1 done');

      expect(shownText(tree)).toContain('Add a weight to tick');
    });

    it.each([
      { what: 'the missing field', type: null, line: 'Add a weight to tick' },
      { what: 'a number to check', type: 'abc', line: 'Check this number' },
    ])("draws the line for $what above the row's inputs, where the keyboard can't cover it (Round 5, R82)", async ({ type, line }) => {
      const tree = mount(bench([set('s0', 0)]));
      if (type !== null) act(() => byLabel(tree, 'LB, set 1').props.onChangeText(type));

      await tapTick(tree, 'Set 1 done');

      // Every node in drawing order (a parent before its children): the line comes before the row's first input.
      const drawn = tree.root.findAll(() => true);
      const text = textNode(tree, line);
      expect(drawn.indexOf(text)).toBeGreaterThan(-1);
      expect(drawn.indexOf(text)).toBeLessThan(drawn.indexOf(byLabel(tree, 'LB, set 1')));
      expect(drawn.indexOf(text)).toBeLessThan(drawn.indexOf(byLabel(tree, 'Set 1')));
      expect(StyleSheet.flatten(text.props.style)).toMatchObject({ color: '#a39d90', fontSize: 12 });
    });

    it('says the line to VoiceOver, which does not read a live region on iOS', async () => {
      const tree = mount(bench([set('s0', 0)]));

      await tapTick(tree, 'Set 1 done');

      expect(mockAnnounce).toHaveBeenCalledWith('Add a weight to tick');
    });

    it('says "Check this number" to VoiceOver when that is the line', async () => {
      const tree = mount(bench([set('s0', 0)]));
      act(() => byLabel(tree, 'LB, set 1').props.onChangeText('abc'));

      await tapTick(tree, 'Set 1 done');

      expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    });
  });

  it('the line goes once a weight is typed', async () => {
    const tree = mount(bench([set('s0', 0)]));
    await tapTick(tree, 'Set 1 done');
    expect(shownText(tree)).toContain('Add a weight to tick');

    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('135'));

    // The reps are still missing, but typing clears the line until the tick is tapped again.
    expect(shownText(tree).filter((text) => text.endsWith(' to tick'))).toEqual([]);
  });

  it('the line names the field that is missing now, not the one the tap found (B10)', async () => {
    const tree = mount(bench([set('s0', 0), set('s1', 1)]));
    await tapTick(tree, 'Set 2 done');
    expect(shownText(tree)).toContain('Add a weight to tick');

    // A weight typed in set 1 and left carries down to set 2: now only its reps are missing.
    act(() => tree.update(block(bench([set('s0', 0, { weight: 135, weightUnit: 'lb' }), set('s1', 1)]))));

    expect(byLabel(tree, 'LB, set 2').props.placeholder).toBe('135');
    expect(shownText(tree)).toContain('Add reps to tick');
    expect(shownText(tree)).not.toContain('Add a weight to tick');
  });

  it.each([
    {
      what: 'reps',
      ex: () => bench([set('s0', 0, { weight: 135, weightUnit: 'lb' })]),
      field: 'REPS, set 1',
      line: 'Add reps to tick',
      hint: 'Enter reps first',
    },
    {
      what: 'a time',
      ex: (): WorkoutExerciseView => ({ ...bench([set('s0', 0)]), loggingType: 'timed' }),
      field: 'TIME, set 1',
      line: 'Add a time to tick',
      hint: 'Enter a time first',
    },
    {
      what: 'a distance',
      ex: (): WorkoutExerciseView => ({ ...bench([set('s0', 0)]), loggingType: 'distance_time' }),
      field: 'DIST, set 1',
      line: 'Add a distance to tick',
      hint: 'Enter a distance first',
    },
  ])('with $what missing, it says "$line", focuses that field and announces the line', async ({ ex, field, line, hint }) => {
    const tree = mount(ex());
    expect(byLabel(tree, 'Set 1 done').props.accessibilityHint).toBe(hint);
    const focus = focusOf(tree, field);

    await tapTick(tree, 'Set 1 done');

    expect(shownText(tree)).toContain(line);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(mockAnnounce).toHaveBeenCalledWith(line);
    expect(tick).not.toHaveBeenCalled();
  });

  it('"Check this number" focuses the field to check, even with another field missing', async () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'REPS, set 1').props.onChangeText('x'));
    const weight = focusOf(tree, 'LB, set 1');
    const reps = focusOf(tree, 'REPS, set 1');

    await tapTick(tree, 'Set 1 done');

    expect(shownText(tree)).toContain('Check this number');
    expect(reps).toHaveBeenCalledTimes(1);
    expect(weight).not.toHaveBeenCalled();
  });

  it('Check this number wins over the nudge', async () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('abc'));

    await tapTick(tree, 'Set 1 done');

    expect(shownText(tree)).toContain('Check this number');
    expect(shownText(tree)).not.toContain('Add a weight to tick');
    expect(tick).not.toHaveBeenCalled();
  });

  it("set 2 shows set 1's weight as a ghost and ticks in one tap", async () => {
    jest.mocked(tick).mockReturnValue(true);
    const tree = mount(oneDone());

    expect(byLabel(tree, 'LB, set 2').props.placeholder).toBe('135');
    expect(byLabel(tree, 'REPS, set 2').props.placeholder).toBe('8');

    await tapTick(tree, 'Set 2 done');

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

  it('keeps the countdown through +15s, and starts a new one (with the length chosen since) when its set is ticked again', () => {
    const tickedAt = (completedAt: number) =>
      bench([set('s0', 0), set('s1', 1, { done: true, weight: 135, weightUnit: 'lb', reps: 8, completedAt }), set('s2', 2)]);
    const endsAt = Date.now() + 90_000;
    const tree = mount(tickedAt(1), { restEndsAt: endsAt, restSetId: 's1' });
    const first = tree.root.findByType(RestInline);

    act(() => tree.update(block(tickedAt(1), { restEndsAt: endsAt + 15_000, restSetId: 's1' })));
    // Compared by identity: a test instance does not print.
    expect(tree.root.findByType(RestInline) === first).toBe(true);

    act(() => tree.update(block(tickedAt(2), { restEndsAt: endsAt + 30_000, restSetId: 's1' })));
    expect(tree.root.findByType(RestInline) === first).toBe(false);
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

  it('the name row keeps the name beside ⋯, and the count, + Note and Something off drop under it as one quiet line (design pass)', () => {
    const tree = mount(fourSets());
    const name = tree.root.findAll((n) => n.type === Text && n.props.children === 'Bench Press')[0];
    const count = tree.root.findAll((n) => n.type === Text && n.props.children === '1/4')[0];
    const addNote = byLabel(tree, 'Add a note for Bench Press');
    const somethingOff = byLabel(tree, 'Something off for Bench Press');
    const options = byLabel(tree, 'Options for Bench Press');
    const holds = (n: ReactTestInstance, m: ReactTestInstance) => n.findAll((x) => x === m).length > 0;
    /** The innermost node under `root` that holds every one of `parts`. */
    const innermost = (root: ReactTestInstance, parts: ReactTestInstance[]) => {
      const all = root.findAll((n) => n !== root && parts.every((m) => holds(n, m)));
      return all[all.length - 1];
    };

    // The row is the nearest ancestor of the name that also holds ⋯: [name and its group][⋯], ⋯ never squeezed and
    // centred on the name's first line.
    let row = name.parent!;
    while (!row.findAll((n) => n === options).length) row = row.parent!;
    expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({ flexDirection: 'row', alignItems: 'flex-start' }));
    expect(restingStyle(options)).toMatchObject({ width: 44, height: 44, marginVertical: -9, flexShrink: 0 });

    // The name and the group share a wrapping column beside ⋯: on one line when both fit, else the group drops under
    // the name. flex: 1 on the name would give it a flex basis of 0, so the group would never drop and the name would
    // be squeezed.
    const column = innermost(row, [name, count, addNote, somethingOff]);
    expect(StyleSheet.flatten(column.props.style)).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }),
    );
    expect(holds(column, options)).toBe(false);
    const nameStyle = StyleSheet.flatten(name.props.style);
    expect(nameStyle).toEqual(expect.objectContaining({ flexShrink: 1, flexBasis: 'auto', minWidth: 0 }));
    // It takes its own width and does not grow, so the group follows the name on one line as it does when it drops under it.
    expect(nameStyle.flexGrow).toBeUndefined();
    expect(nameStyle.flex).toBeUndefined();

    // The count, + Note and Something off share one group, left-aligned with the name when it drops, never squeezed.
    // Wider than the column (the largest text), it wraps among itself rather than run off the edge.
    const group = innermost(column, [count, addNote, somethingOff]);
    const groupStyle = StyleSheet.flatten(group.props.style);
    expect(groupStyle).toEqual(expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 0, maxWidth: '100%' }));
    expect(groupStyle.justifyContent).toBeUndefined();
    expect(groupStyle.marginLeft).toBeUndefined();
    expect(holds(group, name)).toBe(false);
    // Stacked at large text, the controls' reaches meet and never overlap.
    expect(groupStyle.rowGap).toBe(20);

    // Order stays [name][count][+ Note][Something off][⋯] (R81).
    const shown = shownText(tree);
    expect(shown.indexOf('Bench Press')).toBeLessThan(shown.indexOf('1/4'));
    expect(shown.indexOf('1/4')).toBeLessThan(shown.indexOf('+ Note'));
    expect(shown.indexOf('+ Note')).toBeLessThan(shown.indexOf('Something off'));
    const drawn = tree.root.findAll(() => true);
    expect(drawn.indexOf(somethingOff)).toBeLessThan(drawn.indexOf(options));

    // 44pt targets: + Note and Something off draw a 24pt line and reach 10pt above and below it, and 6pt to each
    // side, half the group's 12pt gap, so neighbours meet without overlapping.
    for (const control of [addNote, somethingOff]) {
      expect(restingStyle(control)).toMatchObject({ minHeight: 24, minWidth: 44 });
      expect(control.props.hitSlop).toEqual({ top: 10, bottom: 10, left: 6, right: 6 });
      expect(targetHeight(control)).toBe(44);
    }
    expect(groupStyle.columnGap).toBe(12);
    expect(targetHeight(options)).toBeGreaterThanOrEqual(44);
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

  it("a ticked set's field cleared mid-edit shows the target as its ghost, and never says to tick the set (B2)", () => {
    const ex: WorkoutExerciseView = {
      ...planned(),
      sets: [set('s0', 0, { done: true, weight: 135, weightUnit: 'lb', reps: 8, completedAt: 1 })],
      previous: [{ position: 0, setType: 'working', weight: 130, weightUnit: 'lb', reps: 6, durationS: null, distance: null, distanceUnit: null }],
    };
    const tree = mount(ex);

    act(() => byLabel(tree, 'LB, set 1').props.onChangeText(''));
    act(() => byLabel(tree, 'REPS, set 1').props.onChangeText(''));

    // Left blank, the weight takes the tick off and the open row shows the target: the ghost is that, not last time's 130.
    expect(byLabel(tree, 'LB, set 1').props.placeholder).toBe('135');
    expect(byLabel(tree, 'REPS, set 1').props.placeholder).toBe('6');
    for (const label of ['LB, set 1', 'REPS, set 1']) {
      expect(look(tree, label)).toMatchObject(suggested);
      // A tap on the tick would untick the set.
      expect(byLabel(tree, label).props.accessibilityHint).toBeUndefined();
    }
  });

  it('an empty field with nothing to suggest is drawn solid, with no ghost and no hint', () => {
    const tree = mount(bench([set('s0', 0)]));

    for (const label of ['LB, set 1', 'REPS, set 1']) {
      const field = byLabel(tree, label);
      expect(field.props.value).toBe('');
      expect(field.props.placeholder).toBe('');
      expect(look(tree, label)).toMatchObject(entered);
      expect(field.props.accessibilityHint).toBeUndefined();
    }
  });

  it('a number to check gets the heavier muted underline on its solid edge, once it is left', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, 'LB, set 1').props.onChangeText('abc'));
    expect(look(tree, 'LB, set 1')).toMatchObject(entered);
    expect(look(tree, 'LB, set 1').borderBottomWidth).toBeUndefined();

    act(() => byLabel(tree, 'LB, set 1').props.onBlur());

    expect(look(tree, 'LB, set 1')).toMatchObject({ ...entered, borderBottomWidth: 2, borderBottomColor: '#a39d90' });
    expect(look(tree, 'REPS, set 1').borderBottomWidth).toBeUndefined();
    expect(shownText(tree)).toContain('Check this number');
    expect(commitSetField).not.toHaveBeenCalled();
  });
});

/** The note field, which shows only while the note is being edited. */
const noteFields = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TextInput).filter((t) => t.props.accessibilityLabel === 'Note for Bench Press');

/** A Pressable's style when not pressed, flattened. */
const restingStyle = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

/** How tall a Pressable's target is: what it draws (its minHeight, else its height) and its hitSlop above and below. */
function targetHeight(node: ReactTestInstance): number {
  const style = restingStyle(node);
  const slop = node.props.hitSlop as number | { top?: number; bottom?: number } | undefined;
  const reach = typeof slop === 'number' ? 2 * slop : (slop?.top ?? 0) + (slop?.bottom ?? 0);
  return Number(style.minHeight ?? style.height) + reach;
}

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
  it("the saved note line and the note field start below the name row's 10pt reach, so no two targets overlap (design pass)", () => {
    const saved = mount(withNote());
    const line = byLabel(saved, `Note for Bench Press: ${SAVED}`);
    expect(restingStyle(line)).toMatchObject({ minHeight: 44, marginTop: 10 });

    const empty = mount(bench([set('s0', 0)]));
    act(() => byLabel(empty, ADD_NOTE).props.onPress());
    expect(StyleSheet.flatten(noteFields(empty)[0].props.style)).toMatchObject({ marginTop: 10 });
  });

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

  it("with a saved note there is no + Note, so the note line carries + Note's pencil: it reads as the note, not as the rule under it (Round 5)", () => {
    const tree = mount({
      ...withNote(),
      rule: { setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' },
      plannedWeight: 185,
      plannedUnit: 'lb',
    });
    const line = byLabel(tree, `Note for Bench Press: ${SAVED}`);
    const icon = (n: ReactTestInstance) => n.props.name !== undefined && n.props.size !== undefined;

    // The same 14pt muted pencil as + Note, before the note's text.
    const pencils = line.findAll((n) => icon(n) && n.props.name === 'pencil');
    expect(pencils).toHaveLength(1);
    expect(pencils[0].props).toMatchObject({ size: 14, color: '#a39d90' });
    const drawn = tree.root.findAll(() => true);
    expect(drawn.indexOf(pencils[0])).toBeLessThan(drawn.indexOf(textNode(tree, SAVED)));
    expect(StyleSheet.flatten(restingStyle(line))).toMatchObject({ flexDirection: 'row', alignItems: 'center' });
    // The rule paragraph is its own line, outside the note.
    const rule = tree.root.findAll((n) => n.type === Text && typeof n.props.children === 'string' && n.props.children.startsWith('If every working set'));
    expect(rule).toHaveLength(1);
    expect(line.findAll((n) => n === rule[0])).toHaveLength(0);
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

describe("ExerciseBlock: the rule line and today's read (spec 7.4, 18.7)", () => {
  /** 3 sets of 5–8 at 185 lb planned, add 5 lb. */
  const ruled = (over: Partial<WorkoutExerciseView> = {}): WorkoutExerciseView => ({
    ...bench([set('s0', 0)]),
    rule: { setCount: 3, repMin: 5, repMax: 8, increment: 5, incrementUnit: 'lb' },
    plannedWeight: 185,
    plannedUnit: 'lb',
    ...over,
  });
  const RULE = 'If every working set hits 8 on a normal day, add 5 lb. A marked day holds the weight.';
  const prev = (over: Partial<SetView>) => {
    const { id: _id, rpe: _rpe, done: _done, completedAt: _completedAt, ...p } = set('p', over.position ?? 0, over);
    return p;
  };
  /** Last time: 3 sets of 8 at 135 lb. */
  const LAST_135 = [0, 1, 2].map((position) => prev({ position, weight: 135, weightUnit: 'lb', reps: 8 }));

  it('shows the rule then the read as one muted 14pt paragraph, under the name and the note, above the set table', () => {
    const tree = mount(ruled({ note: SAVED }));
    const line = `${RULE} Hit 8s on a normal day and next time is 190 lb.`;

    const text = textNode(tree, line);
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ color: '#a39d90', fontSize: 14 });
    // No caps: it wraps at any text size.
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
    const shown = shownText(tree);
    expect(shown.indexOf('Bench Press')).toBeLessThan(shown.indexOf(SAVED));
    expect(shown.indexOf(SAVED)).toBeLessThan(shown.indexOf(line));
    expect(shown.indexOf(line)).toBeLessThan(shown.indexOf('SET'));
    expect(shown.filter((s) => s.startsWith('Something off:'))).toEqual([]);
  });

  describe('Something off in the name row (R81, Round 5)', () => {
    /** The control's 14pt icon and its words, as drawn. */
    const control = (tree: ReactTestRenderer, label: string) => {
      const node = byLabel(tree, label);
      const icons = node.findAll((n) => n.props.name !== undefined && n.props.size !== undefined);
      const words = node.findAll((n) => n.type === Text).map((n) => n.props.children);
      return { node, icons, words };
    };

    it('reads "Something off" beside + Note, quiet and compact like it', () => {
      const tree = mount(ruled());
      const { node, icons, words } = control(tree, 'Something off for Bench Press');

      expect(node.props.accessibilityRole).toBe('button');
      expect(icons.map((i) => i.props)).toEqual([expect.objectContaining({ name: 'alert-circle-outline', size: 14, color: '#a39d90' })]);
      expect(words).toEqual(['Something off']);
      expect(StyleSheet.flatten(textNode(tree, 'Something off').props.style)).toMatchObject({ color: '#a39d90', fontSize: 14 });
      // The same quiet, compact look as + Note.
      const addNote = byLabel(tree, ADD_NOTE);
      expect(restingStyle(node)).toEqual(restingStyle(addNote));
    });

    it('flagged, it shows the reason instead, muted and never red; the read holds the plan; no line of its own (R61)', () => {
      const tree = mount(ruled({ mark: 'rough_sleep' }));
      const { words, icons } = control(tree, 'Something off for Bench Press: Rough sleep');

      expect(words).toEqual(['Rough sleep']);
      expect(icons.map((i) => i.props.color)).toEqual(['#a39d90']);
      const reason = StyleSheet.flatten(textNode(tree, 'Rough sleep').props.style);
      expect(reason).toMatchObject({ color: '#a39d90', fontSize: 14 });
      expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
      textNode(tree, `${RULE} Hit 8s on a normal day and next time is 190 lb. Rough sleep today, so 185 lb holds.`);
      expect(shownText(tree).filter((s) => s.startsWith('Something off'))).toEqual([]);
      expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Something off for Bench Press')).toHaveLength(0);
    });

    it.each([
      { what: 'Something off', mark: null, label: 'Something off for Bench Press', words: 'Something off' },
      { what: 'a long reason', mark: 'short_on_food' as const, label: 'Something off for Bench Press: Short on food', words: 'Short on food' },
    ])('$what wraps at the largest text instead of cutting off with "…", keeping its 44pt target (Round 5 review)', ({ mark, label, words }) => {
      const tree = mount(ruled({ mark }));
      const { node } = control(tree, label);
      const text = textNode(tree, words);

      expect(text.props.numberOfLines).toBeUndefined();
      expect(StyleSheet.flatten(text.props.style)).toMatchObject({ flexShrink: 1 });
      // It may shrink within the controls group, so its words wrap there.
      expect(restingStyle(node)).toMatchObject({ flexShrink: 1 });
      // A 24pt line that reaches 10pt above and below it (design pass).
      expect(targetHeight(node)).toBe(44);
    });

    it('tapping it opens the Something off reasons for this exercise', () => {
      const onOpenMark = jest.fn();
      let tree!: ReactTestRenderer;
      act(() => {
        tree = create(<ExerciseBlock {...block(ruled({ mark: 'pain' })).props} onOpenMark={onOpenMark} />);
      });

      act(() => byLabel(tree, 'Something off for Bench Press: Pain').props.onPress());

      expect(onOpenMark).toHaveBeenCalledTimes(1);
    });

    it('sits on the name row with the note line, not on a row of its own, also with a note saved', () => {
      const tree = mount(ruled({ note: SAVED, mark: 'sick' }));
      const drawn = tree.root.findAll(() => true);
      const flag = byLabel(tree, 'Something off for Bench Press: Sick');

      expect(drawn.indexOf(textNode(tree, 'Bench Press'))).toBeLessThan(drawn.indexOf(flag));
      expect(drawn.indexOf(flag)).toBeLessThan(drawn.indexOf(byLabel(tree, 'Options for Bench Press')));
      expect(drawn.indexOf(flag)).toBeLessThan(drawn.indexOf(byLabel(tree, `Note for Bench Press: ${SAVED}`)));
    });
  });

  it('an override reads as set by you, and a flag still holds the plan, not the override', () => {
    textNode(mount(ruled({ overrideWeight: 175, overrideUnit: 'lb' })), `${RULE} Today is set to 175 lb by you. The rule still says 185 lb.`);
    textNode(
      mount(ruled({ overrideWeight: 175, overrideUnit: 'lb', mark: 'pain' })),
      `${RULE} Today is set to 175 lb by you. Pain today, so 185 lb holds.`,
    );
  });

  it('with no plan yet, says to pick a starting weight', () => {
    textNode(mount(ruled({ plannedWeight: null, plannedUnit: null })), `${RULE} Pick a starting weight. Next time builds from it.`);
  });

  it("reads a plan in the other unit as the set table's target does, in the unit shown", () => {
    // 80 kg is 176.4 lb, which the lb plates load as 175; 2.5 kg is 5 lb.
    const tree = mount(ruled({ rule: { setCount: 3, repMin: 5, repMax: 8, increment: 2.5, incrementUnit: 'kg' }, plannedWeight: 80, plannedUnit: 'kg' }));
    textNode(tree, `${RULE} Hit 8s on a normal day and next time is 180 lb.`);
  });

  it('shows no read for a timed hold, a distance or an increment of 0', () => {
    const plank = mount(
      ruled({
        loggingType: 'timed',
        equipment: 'bodyweight',
        rule: { setCount: 3, repMin: 30, repMax: 60, increment: 0, incrementUnit: 'lb' },
        plannedWeight: null,
        plannedUnit: null,
        previous: [0, 1, 2].map((position) => prev({ position, durationS: 60 })),
      }),
    );
    textNode(plank, "Last time: 3 × 60 s. Timed holds don't go up automatically.");

    const run = mount(
      ruled({
        loggingType: 'distance_time',
        equipment: 'bodyweight',
        rule: null,
        plannedWeight: null,
        plannedUnit: null,
        previous: [prev({ distance: 5, distanceUnit: 'km', durationS: 1530 })],
      }),
    );
    textNode(run, 'Last time: 5 km in 25:30.');

    const flat = mount(ruled({ rule: { setCount: 3, repMin: 5, repMax: 8, increment: 0, incrementUnit: 'lb' }, mark: 'sick' }));
    textNode(flat, "No weight to add. Beat last time's reps.");
    byLabel(flat, 'Something off for Bench Press: Sick');
    textNode(flat, 'Sick');
  });

  it("an exercise with no rule shows last time, or that it's the first time", () => {
    textNode(mount({ ...bench([set('s0', 0)]), previous: LAST_135 }), 'No rule here. Last time: 3 × 8 at 135 lb.');
    textNode(mount(bench([set('s0', 0)])), 'First time logging this.');
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
    // The row steps back by a quiet button's 12pt padding, so "+ Set" lines up with the set column (design pass).
    expect(StyleSheet.flatten(row!.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-start', marginLeft: -12 });
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
    // + Note shares Something off's control: it keeps its 44pt target, and shrinks (its words wrap) only when it alone is
    // wider than the controls group, which wraps first (Round 5 review).
    expect(restingStyle(byLabel(tree, ADD_NOTE))).toMatchObject({ flexShrink: 1 });
    expect(targetHeight(byLabel(tree, ADD_NOTE))).toBe(44);
    expect(StyleSheet.flatten(textNode(tree, 'Bench Press').props.style)).toMatchObject({ minWidth: 0 });
    // [name][count][+ Note][⋯], in the order they are drawn: every node, in drawing order (a parent before its children).
    const drawn = tree.root.findAll(() => true);
    const order = [
      textNode(tree, 'Bench Press'),
      textNode(tree, '1/2'),
      byLabel(tree, ADD_NOTE),
      byLabel(tree, 'Options for Bench Press'),
    ].map((node) => drawn.indexOf(node));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(order[2]).toBeLessThan(order[3]);
  });
});

describe("ExerciseBlock: the tick's tap area stays clear of the reps field (R67)", () => {
  /** The width of the column cell `node` is drawn in: its nearest ancestor view with a width. */
  const cellWidth = (node: ReactTestInstance) => {
    let at = node.parent;
    while (at !== null && !(at.type === View && StyleSheet.flatten(at.props.style)?.width !== undefined)) at = at.parent;
    return at === null ? undefined : StyleSheet.flatten(at.props.style).width;
  };

  it('is a 44pt column, in the header and in every row, so the two still line up', () => {
    expect(cellStyle('tick')).toMatchObject({ width: 44, alignItems: 'center' });
    const tree = mount(bench([set('s0', 0)]));

    expect(cellWidth(textNode(tree, '✓'))).toBe(44);
    expect(cellWidth(byLabel(tree, 'Set 1 done'))).toBe(44);
  });

  it('keeps the 40pt ring, centred in the column', () => {
    const tree = mount(bench([set('s0', 0)]));

    expect(restingStyle(byLabel(tree, 'Set 1 done'))).toMatchObject({ width: 40, height: 40, borderRadius: 20 });
  });

  it('reaches out on the top, bottom and right only, so a tap just left of the ring never lands on reps', () => {
    const tree = mount(bench([set('s0', 0)]));
    const hitSlop = byLabel(tree, 'Set 1 done').props.hitSlop;

    expect(hitSlop).toEqual({ top: 4, bottom: 4, right: 4, left: 0 });
    // What lies between the reps field and the tick's target: the column gap and half the space round the ring.
    expect(COLUMN_GAP + (44 - 40) / 2 - hitSlop.left).toBeGreaterThan(0);
  });
});

describe('ExerciseBlock: a distance keeps its unit when ticked', () => {
  /** A run whose first set has 5 km saved, drawn while the distance unit in Settings is mi. */
  const run = (): WorkoutExerciseView => ({
    ...bench([set('s0', 0, { distance: 5, distanceUnit: 'km', durationS: 1500 })]),
    loggingType: 'distance_time',
  });

  it('ticks a distance saved in km, shown as saved, in km', () => {
    jest.mocked(tick).mockReturnValue(true);
    const ex = run();
    const tree = mount(ex);

    act(() => byLabel(tree, 'Set 1 done').props.onPress());

    expect(tick).toHaveBeenCalledWith('db', ex, ex.sets[0], expect.objectContaining({ distance: 5, durationS: 1500 }), 'lb', 'km');
  });

  it('ticks a distance typed now in the distance unit in Settings', () => {
    jest.mocked(tick).mockReturnValue(true);
    const ex = run();
    const tree = mount(ex);
    act(() => byLabel(tree, 'DIST, set 1').props.onChangeText('3'));

    act(() => byLabel(tree, 'Set 1 done').props.onPress());

    expect(tick).toHaveBeenCalledWith('db', ex, ex.sets[0], expect.objectContaining({ distance: 3, durationS: 1500 }), 'lb', 'mi');
  });

  it('shows a distance saved in km as "5 km" while the distance unit in Settings is mi, as a weight shows "135 lb"', () => {
    const tree = mount(run());

    expect(byLabel(tree, 'DIST, set 1').props.value).toBe('5 km');
  });

  it('replaces "5 km" with what is typed over it, saved in mi', () => {
    const tree = mount(run());
    const field = byLabel(tree, 'DIST, set 1');
    // The field selects its text on focus, as the weight's does, so typing replaces "5 km" whole.
    expect(field.props.selectTextOnFocus).toBe(true);

    act(() => field.props.onChangeText('3'));
    expect(byLabel(tree, 'DIST, set 1').props.value).toBe('3');
    act(() => byLabel(tree, 'DIST, set 1').props.onBlur());

    expect(commitSetField).toHaveBeenCalledWith('db', 's0', { distance: 3, distanceUnit: 'mi' });
  });
});

describe('ExerciseBlock: the form demo (R86)', () => {
  const demo = (tree: ReactTestRenderer) => tree.root.findByType(FormDemo);
  const SHOW_FORM = 'Show form for Bench Press';

  it('the name is a button, "Show form for {name}", with a 44pt target, and the demo starts closed', () => {
    const tree = mount(bench([set('s0', 0)]));

    const name = byLabel(tree, SHOW_FORM);
    expect(name.props.accessibilityRole).toBe('button');
    expect(targetHeight(name)).toBe(44);
    expect(name.findAll((n) => n.type === Text && n.props.children === 'Bench Press')).toHaveLength(1);
    expect(demo(tree).props.exerciseId).toBeNull();
  });

  it('tapping the name saves what is typed, puts the keyboard away, then opens the demo for its exercise (R29)', () => {
    const tree = mount(bench([set('s0', 0)]));
    try {
      act(() => byLabel(tree, ADD_NOTE).props.onPress());
      act(() => noteFields(tree)[0].props.onChangeText('Elbows in'));
      /** Which demo was open at each Keyboard.dismiss. */
      const openAtDismiss: (string | null)[] = [];
      dismiss.mockImplementation(() => void openAtDismiss.push(demo(tree).props.exerciseId));

      act(() => byLabel(tree, SHOW_FORM).props.onPress());

      expect(saveNote).toHaveBeenCalledWith('db', 'barbell-bench-press', 'Elbows in');
      expect(jest.mocked(saveNote).mock.invocationCallOrder[0]).toBeLessThan(dismiss.mock.invocationCallOrder[0]);
      expect(openAtDismiss[0]).toBeNull();
      expect(demo(tree).props.exerciseId).toBe('barbell-bench-press');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('closing the demo closes it', () => {
    const tree = mount(bench([set('s0', 0)]));
    act(() => byLabel(tree, SHOW_FORM).props.onPress());

    act(() => demo(tree).props.onClose());

    expect(demo(tree).props.exerciseId).toBeNull();
  });

  it('keeps the name row as it was: the name still shrinks and wraps beside ⋯ (design pass)', () => {
    const tree = mount(bench([set('s0', 0)]));

    expect(restingStyle(byLabel(tree, SHOW_FORM))).toEqual(expect.objectContaining({ flexShrink: 1, flexBasis: 'auto', minWidth: 0 }));
    expect(restingStyle(byLabel(tree, SHOW_FORM)).flexGrow).toBeUndefined();
    expect(restingStyle(byLabel(tree, SHOW_FORM)).flex).toBeUndefined();
  });
});
