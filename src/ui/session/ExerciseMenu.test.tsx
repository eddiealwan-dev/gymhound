import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { Button } from '../Button';
import { announce } from '../../platform/announce';
import { markExercise, overrideWeight, setExerciseRest } from '../../state/sessionActions';
import { ExerciseMenu } from './ExerciseMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../platform/announce', () => ({ ...jest.requireActual('../../platform/announce'), announce: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({
  markExercise: jest.fn(),
  overrideWeight: jest.fn(),
  moveBlock: jest.fn(),
  removeFromWorkout: jest.fn(),
  setExerciseRest: jest.fn(),
  setRpeShown: jest.fn(),
  toggleSuperset: jest.fn(),
  restPlus15: jest.fn(),
}));
jest.mock('../../db/repositories/settingsRepo', () => ({
  getSettings: () => ({
    unit: 'lb',
    restSeconds: 120,
    barLb: 45,
    barKg: 20,
    platesLb: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 },
    platesKg: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 },
  }),
  setSetting: jest.fn(),
}));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db'), bumpData: jest.fn() }));
/**
 * What each sheet drew, render by render, open or not: a closed Modal still shows its content while it fades on a phone,
 * though the test renderer draws nothing for it. Each entry is the sheet's titles and button labels.
 */
const mockSheetFrames: { visible: boolean; text: string[] }[] = [];
jest.mock('../Sheet', () => {
  const actual = jest.requireActual('../Sheet');
  const textIn = (node: unknown, out: string[]): string[] => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((n) => textIn(n, out));
    else if (node && typeof node === 'object' && 'props' in node) {
      const props = (node as { props: { label?: unknown; children?: unknown } }).props;
      if (typeof props.label === 'string') out.push(props.label);
      textIn(props.children, out);
    }
    return out;
  };
  return {
    ...actual,
    Sheet: (props: { visible: boolean; children: unknown }) => {
      mockSheetFrames.push({ visible: props.visible, text: textIn(props.children, []) });
      return actual.Sheet(props);
    },
  };
});
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** An exercise with the given sets (`true` is a ticked one). */
const exercise = (...done: boolean[]): WorkoutExerciseView =>
  ({
    id: 'we1',
    name: 'Bench Press',
    supersetGroup: null,
    showRpe: false,
    overrideWeight: null,
    overrideUnit: null,
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
  mockSheetFrames.length = 0;
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

/** A barbell or dumbbell exercise whose next set is planned at `weight` lb. */
const loaded = (equipment: string, weight: number): WorkoutExerciseView =>
  ({
    id: 'we1',
    name: equipment === 'barbell' ? 'Bench Press (Barbell)' : 'Bicep Curl (Dumbbell)',
    equipment,
    supersetGroup: null,
    showRpe: false,
    overrideWeight: null,
    overrideUnit: null,
    plannedWeight: null,
    plannedUnit: null,
    sets: [{ id: 's0', position: 0, setType: 'working', done: false, weight, weightUnit: 'lb' }],
    previous: [],
  }) as unknown as WorkoutExerciseView;

describe('ExerciseMenu: the plate calculator (Task 20)', () => {
  it('offers Plate calculator on a barbell exercise only', () => {
    const barbell = mount(loaded('barbell', 190));
    expect(barbell.root.findAllByType(Button).map((b) => b.props.label)).toContain('Plate calculator');

    const dumbbell = mount(loaded('dumbbell', 40));
    expect(dumbbell.root.findAllByType(Button).map((b) => b.props.label)).not.toContain('Plate calculator');
  });

  it('opens after the menu closes, with the weight to load and the plates per side', () => {
    const tree = mount(loaded('barbell', 190));
    press(tree, 'Plate calculator');
    expect(shownText(tree)).not.toContain('Plate calculator');
    afterSheetCloses();

    const text = shownText(tree);
    expect(tree.root.findByProps({ accessibilityLabel: 'Weight to load, lb' }).props.value).toBe('190');
    expect(text).toEqual(expect.arrayContaining(['Bar 45 lb', 'Per side: 45 · 25 · 2.5']));
    expect(text.join(' ')).not.toContain('Loads');
  });

  it("gives the weight field the Done key and React Native's own toolbar (Task 24, R43)", () => {
    const tree = mount(loaded('barbell', 190));
    press(tree, 'Plate calculator');
    afterSheetCloses();

    const field = tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Weight to load, lb')!;
    expect(field.props.returnKeyType).toBe('done');
    expect(field.props.inputAccessoryViewID).toBeUndefined();
  });

  it("opens at last time's weight on a fresh exercise, the placeholder its first set shows (F8)", () => {
    const fresh = {
      ...loaded('barbell', 0),
      sets: [{ id: 's0', position: 0, setType: 'working', done: false, weight: null, weightUnit: null }],
      previous: [{ position: 0, setType: 'working', weight: 185, weightUnit: 'lb', reps: 5, durationS: null, distance: null, distanceUnit: null }],
    } as unknown as WorkoutExerciseView;
    const tree = mount(fresh);
    press(tree, 'Plate calculator');
    afterSheetCloses();

    expect(tree.root.findByProps({ accessibilityLabel: 'Weight to load, lb' }).props.value).toBe('185');
  });

  it('says what it loads when the plates cannot make the weight, and just the bar below it', () => {
    const tree = mount(loaded('barbell', 190));
    press(tree, 'Plate calculator');
    afterSheetCloses();
    const field = () => tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Weight to load, lb')!;

    act(() => field().props.onChangeText('193,5'));
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Per side: 45 · 25 · 2.5', 'Loads 190 lb']));

    act(() => field().props.onChangeText('30'));
    expect(shownText(tree)).toContain('Below the bar: just the bar.');
  });
});

/** Bench press with its own rest (null: use Settings, which is 2:00 here). */
const withRest = (restSeconds: number | null): WorkoutExerciseView =>
  ({
    id: 'we1',
    exerciseId: 'barbell-bench-press',
    name: 'Bench Press',
    equipment: 'barbell',
    supersetGroup: null,
    showRpe: false,
    restSeconds,
    overrideWeight: null,
    overrideUnit: null,
    sets: [],
  }) as unknown as WorkoutExerciseView;

const labels = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Button).map((b) => b.props.label as string);

/** The buttons whose drawn control reports itself selected to the screen reader. */
const selectedLabels = (tree: ReturnType<typeof create>) =>
  tree.root
    .findAllByType(Button)
    .filter((b) => b.findAll((n) => typeof n.type === 'string' && n.props.accessibilityState?.selected === true).length > 0)
    .map((b) => b.props.label as string);

describe('ExerciseMenu: rest time per exercise (Task 21)', () => {
  beforeEach(() => jest.mocked(setExerciseRest).mockClear());

  it('reads "Rest time · Default (2:00)", "Off" or "1:30"', () => {
    expect(labels(mount(withRest(null)))).toContain('Rest time · Default (2:00)');
    expect(labels(mount(withRest(0)))).toContain('Rest time · Off');
    expect(labels(mount(withRest(90)))).toContain('Rest time · 1:30');
  });

  it('lists Default, then Off and every choice in m:ss, with the current one highlighted', () => {
    const tree = mount(withRest(90));
    press(tree, 'Rest time · 1:30');

    const buttons = tree.root.findAllByType(Button);
    expect(buttons.map((b) => b.props.label)).toEqual([
      'Default (2:00)',
      'Off',
      '0:30',
      '0:45',
      '1:00',
      '1:30',
      '2:00',
      '2:30',
      '3:00',
      '4:00',
      '5:00',
      'Cancel',
    ]);
    expect(buttons.filter((b) => b.props.variant === 'primary').map((b) => b.props.label)).toEqual(['1:30']);
  });

  it('closes on Cancel and saves nothing, so VoiceOver can leave it (F3)', () => {
    const tree = mount(withRest(90));
    press(tree, 'Rest time · 1:30');

    press(tree, 'Cancel');

    expect(setExerciseRest).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('tells VoiceOver which choice is current: it alone is selected (F10)', () => {
    const own = mount(withRest(90));
    press(own, 'Rest time · 1:30');
    expect(selectedLabels(own)).toEqual(['1:30']);

    const fallback = mount(withRest(null));
    press(fallback, 'Rest time · Default (2:00)');
    expect(selectedLabels(fallback)).toEqual(['Default (2:00)']);
  });

  it('highlights Default when the exercise has no rest of its own', () => {
    const tree = mount(withRest(null));
    press(tree, 'Rest time · Default (2:00)');
    expect(
      tree.root
        .findAllByType(Button)
        .filter((b) => b.props.variant === 'primary')
        .map((b) => b.props.label),
    ).toEqual(['Default (2:00)']);
  });

  it('saves the choice on the exercise (not the workout row) and closes', () => {
    const tree = mount(withRest(null));
    press(tree, 'Rest time · Default (2:00)');

    press(tree, 'Off');

    expect(setExerciseRest).toHaveBeenCalledWith('db', 'barbell-bench-press', 0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('goes back to the Settings rest with Default', () => {
    const tree = mount(withRest(90));
    press(tree, 'Rest time · 1:30');

    press(tree, 'Default (2:00)');

    expect(setExerciseRest).toHaveBeenCalledWith('db', 'barbell-bench-press', null);
  });
});

describe('ExerciseMenu: opened from the countdown (spec 18.6)', () => {
  /** Opens the menu as the session screen does: the ⋯ button with no panel, the countdown with 'rest'. */
  let open: (panel?: 'menu' | 'rest') => void = () => {};

  function OpenHost({ ex }: { ex: WorkoutExerciseView }) {
    const [menuFor, setMenuFor] = useState<{ panel?: 'menu' | 'rest' } | null>(null);
    open = (panel) => setMenuFor({ panel });
    return (
      <ExerciseMenu
        exercises={[ex]}
        exerciseId={menuFor === null ? null : ex.id}
        initialPanel={menuFor?.panel}
        onClose={() => {
          onClose();
          setMenuFor(null);
        }}
      />
    );
  }

  it('opens straight on the rest choices', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<OpenHost ex={withRest(90)} />);
    });
    expect(shownText(tree)).toEqual([]);

    act(() => open('rest'));

    const shown = shownText(tree);
    expect(shown).toEqual(expect.arrayContaining(['Rest time', 'Bench Press', 'Default (2:00)', '1:30']));
    expect(shown).not.toContain('Reorder');

    press(tree, 'Cancel');
    act(() => open());

    expect(shownText(tree)).toContain('Reorder');
    expect(shownText(tree)).not.toContain('Rest time');
  });

  /** What the menu's own sheet (the one with Reorder or the rest choices) drew, frame by frame. */
  const menuFrames = () => mockSheetFrames.filter((f) => f.text.includes('Reorder') || f.text.includes('Rest time'));

  it('draws the rest choices from its first frame', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<OpenHost ex={withRest(90)} />);
    });
    mockSheetFrames.length = 0;

    act(() => open('rest'));

    const shown = menuFrames().filter((f) => f.visible);
    expect(shown.length).toBeGreaterThan(0);
    for (const frame of shown) {
      expect(frame.text).toContain('Rest time');
      expect(frame.text).not.toContain('Reorder');
    }
    expect(shownText(tree)).toContain('Rest time');
  });

  it.each(['1:30', 'Cancel'])('closes on %s without switching back to the menu while it fades', (label) => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<OpenHost ex={withRest(90)} />);
    });
    act(() => open('rest'));
    mockSheetFrames.length = 0;

    press(tree, label);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
    const closing = menuFrames();
    expect(closing.length).toBeGreaterThan(0);
    for (const frame of closing) expect(frame.text).not.toContain('Reorder');
  });

  it('opens straight on the Something off reasons from the name row (R81, Round 5)', () => {
    jest.mocked(markExercise).mockClear();
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ExerciseMenu exercises={[{ ...withRest(null), mark: 'pain' }]} exerciseId="we1" initialPanel="mark" onClose={onClose} />);
    });

    const shown = shownText(tree);
    expect(shown).toEqual(expect.arrayContaining(['Something off', 'Bench Press', 'Rough sleep', 'Pain', 'Nothing off', 'Cancel']));
    expect(shown).not.toContain('Reorder');

    press(tree, 'Nothing off');

    expect(markExercise).toHaveBeenCalledWith('db', 'we1', null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens on the rest choices when it mounts open on them', () => {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ExerciseMenu exercises={[withRest(null)]} exerciseId="we1" initialPanel="rest" onClose={onClose} />);
    });

    expect(shownText(tree)).toEqual(expect.arrayContaining(['Rest time', 'Default (2:00)']));
  });
});

/** Bench press planned at 135 lb today, with nothing off and no override unless `over` says otherwise. */
const today = (over: Record<string, unknown> = {}): WorkoutExerciseView =>
  ({
    id: 'we1',
    exerciseId: 'barbell-bench-press',
    name: 'Bench Press',
    loggingType: 'weighted',
    equipment: 'barbell',
    supersetGroup: null,
    showRpe: false,
    restSeconds: null,
    plannedWeight: 135,
    plannedUnit: 'lb',
    overrideWeight: null,
    overrideUnit: null,
    mark: null,
    sets: [],
    previous: [],
    ...over,
  }) as unknown as WorkoutExerciseView;

describe('ExerciseMenu: Something off (spec 18.7, R60)', () => {
  beforeEach(() => jest.mocked(markExercise).mockClear());

  it('reads "Something off", and "Something off · Pain" when the exercise is flagged', () => {
    expect(labels(mount(today()))).toContain('Something off');
    expect(labels(mount(today({ mark: 'pain' })))).toContain('Something off · Pain');
  });

  it('lists the five reasons and Cancel, under the title and the exercise name', () => {
    const tree = mount(today());
    press(tree, 'Something off');

    expect(shownText(tree)).toEqual(expect.arrayContaining(['Something off', 'Bench Press']));
    expect(labels(tree)).toEqual(['Rough sleep', 'Sick', 'Short on food', 'Pain', 'Cutting', 'Cancel']);
    expect(selectedLabels(tree)).toEqual([]);
  });

  it('marks the current reason selected, and offers Nothing off only when flagged', () => {
    const tree = mount(today({ mark: 'pain' }));
    press(tree, 'Something off · Pain');

    expect(labels(tree)).toEqual(['Rough sleep', 'Sick', 'Short on food', 'Pain', 'Cutting', 'Nothing off', 'Cancel']);
    expect(selectedLabels(tree)).toEqual(['Pain']);
  });

  it('flags the exercise with the reason chosen, and closes', () => {
    const tree = mount(today());
    press(tree, 'Something off');

    press(tree, 'Pain');

    expect(markExercise).toHaveBeenCalledTimes(1);
    expect(markExercise).toHaveBeenCalledWith('db', 'we1', 'pain');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('clears the flag with Nothing off', () => {
    const tree = mount(today({ mark: 'rough_sleep' }));
    press(tree, 'Something off · Rough sleep');

    press(tree, 'Nothing off');

    expect(markExercise).toHaveBeenCalledWith('db', 'we1', null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('changes nothing on Cancel', () => {
    const tree = mount(today({ mark: 'sick' }));
    press(tree, 'Something off · Sick');

    press(tree, 'Cancel');

    expect(markExercise).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });
});

describe("ExerciseMenu: Override today's weight (spec 18.7)", () => {
  beforeEach(() => {
    jest.mocked(overrideWeight).mockClear();
    jest.mocked(announce).mockClear();
  });

  const field = (tree: ReturnType<typeof create>) =>
    tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === "Today's weight, lb")!;

  /** Opens the menu on the exercise, then today's weight once the menu has gone. */
  function openOverride(ex: WorkoutExerciseView, menuLabel = "Override today's weight") {
    const tree = mount(ex);
    press(tree, menuLabel);
    expect(shownText(tree)).not.toContain("Today's weight");
    afterSheetCloses();
    return tree;
  }

  it("reads \"Override today's weight\", and \" · 145 lb\" when today's weight is set", () => {
    expect(labels(mount(today()))).toContain("Override today's weight");
    expect(labels(mount(today({ overrideWeight: 145, overrideUnit: 'lb' })))).toContain("Override today's weight · 145 lb");
  });

  it.each(['timed', 'distance_time'])('is not offered on a %s exercise', (loggingType) => {
    const tree = mount(today({ loggingType, plannedWeight: null, plannedUnit: null }));
    expect(labels(tree).filter((l) => l.startsWith('Override'))).toEqual([]);
    expect(labels(tree)).toContain('Something off');
  });

  it.each(['bodyweight_plus', 'assisted', 'weighted_time'])('is offered on a %s exercise', (loggingType) => {
    expect(labels(mount(today({ loggingType })))).toContain("Override today's weight");
  });

  it('opens after the menu closes on one field in the display unit, holding the planned weight', () => {
    const tree = openOverride(today());

    expect(shownText(tree)).toEqual(expect.arrayContaining(["Today's weight", 'Bench Press', 'lb']));
    expect(field(tree).props.value).toBe('135');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(1);
    expect(labels(tree)).toEqual(['Save', 'Cancel']);
  });

  it("holds today's weight when it is set, as the set rows show it in the display unit (R71), and offers Clear", () => {
    const lb = openOverride(today({ overrideWeight: 145, overrideUnit: 'lb' }), "Override today's weight · 145 lb");
    expect(field(lb).props.value).toBe('145');

    // 60 kg is 132.28 lb: a barbell rounds to what the lb plates load, anything else to the nearest 0.5.
    const kg = openOverride(today({ overrideWeight: 60, overrideUnit: 'kg' }), "Override today's weight · 60 kg");
    expect(field(kg).props.value).toBe('130');
    expect(labels(kg)).toEqual(['Save', 'Clear', 'Cancel']);

    const dumbbell = openOverride(
      today({ equipment: 'dumbbell', overrideWeight: 60, overrideUnit: 'kg' }),
      "Override today's weight · 60 kg",
    );
    expect(field(dumbbell).props.value).toBe('132.5');
  });

  it('keeps an override as it is when Save is pressed unedited (R71)', () => {
    const tree = openOverride(today({ overrideWeight: 60, overrideUnit: 'kg' }), "Override today's weight · 60 kg");

    press(tree, 'Save');

    expect(overrideWeight).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('saves an edited number over an override', () => {
    const tree = openOverride(today({ overrideWeight: 60, overrideUnit: 'kg' }), "Override today's weight · 60 kg");
    act(() => field(tree).props.onChangeText('135'));

    press(tree, 'Save');

    expect(overrideWeight).toHaveBeenCalledWith('db', 'we1', 135, 'lb');
  });

  it('saves the target it shows, in the display unit, when Save is pressed unedited with no override (R71)', () => {
    const tree = openOverride(today({ plannedWeight: 60, plannedUnit: 'kg' }));
    expect(field(tree).props.value).toBe('130');

    press(tree, 'Save');

    expect(overrideWeight).toHaveBeenCalledTimes(1);
    expect(overrideWeight).toHaveBeenCalledWith('db', 'we1', 130, 'lb');
  });

  it('holds the target as the rows show it, to 2 decimals: an assisted 264.6 less 10 reads "254.6"', () => {
    const tree = openOverride(today({ loggingType: 'assisted', equipment: 'machine', plannedWeight: 264.6 - 10, plannedUnit: 'lb' }));
    expect(field(tree).props.value).toBe('254.6');
  });

  it('starts empty with no plan and no override', () => {
    const tree = openOverride(today({ plannedWeight: null, plannedUnit: null }));
    expect(field(tree).props.value).toBe('');
  });

  it('gives the field the decimal pad and the Done key (R43)', () => {
    const input = field(openOverride(today()));
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.returnKeyType).toBe('done');
  });

  it('saves the number in the display unit, and closes', () => {
    const tree = openOverride(today());
    act(() => field(tree).props.onChangeText('145'));

    press(tree, 'Save');

    expect(overrideWeight).toHaveBeenCalledTimes(1);
    expect(overrideWeight).toHaveBeenCalledWith('db', 'we1', 145, 'lb');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('says "Check this number" for text that is not a number, and saves nothing', () => {
    const tree = openOverride(today());
    act(() => field(tree).props.onChangeText('abc'));

    press(tree, 'Save');

    expect(shownText(tree)).toContain('Check this number');
    expect(announce).toHaveBeenCalledWith('Check this number');
    // Said once: announce() speaks it on both phones, so no live region reads it again on Android.
    expect(tree.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite')).toHaveLength(0);
    expect(overrideWeight).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => field(tree).props.onChangeText('150'));
    expect(shownText(tree)).not.toContain('Check this number');
  });

  it("clears today's weight with Clear, and closes", () => {
    const tree = openOverride(today({ overrideWeight: 145, overrideUnit: 'lb' }), "Override today's weight · 145 lb");

    press(tree, 'Clear');

    expect(overrideWeight).toHaveBeenCalledWith('db', 'we1', null, null);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });

  it('saves nothing on Cancel', () => {
    const tree = openOverride(today({ overrideWeight: 145, overrideUnit: 'lb' }), "Override today's weight · 145 lb");
    act(() => field(tree).props.onChangeText('150'));

    press(tree, 'Cancel');

    expect(overrideWeight).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toEqual([]);
  });
});

describe('ExerciseMenu: the Rest panel of a superset member that is not last (R100, R101)', () => {
  const member = (id: string, name: string, position: number, restSeconds: number | null = null) =>
    ({ ...exercise(), id, name, position, supersetGroup: 1, restSeconds }) as unknown as WorkoutExerciseView;

  function openRest(exercises: WorkoutExerciseView[], exerciseId: string) {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(<ExerciseMenu exercises={exercises} exerciseId={exerciseId} initialPanel="rest" onClose={() => {}} />);
    });
    return tree;
  }

  it('says the rest comes after the last member, with its rest time, and keeps the choices for when it is not mid-superset', () => {
    const tree = openRest([member('we1', 'Bench Press', 0), member('we2', 'Ab roller', 1)], 'we1');

    expect(shownText(tree)).toEqual(
      expect.arrayContaining(['Rest time', 'Bench Press', 'Rest comes after Ab roller, using its rest time.', 'Default (2:00)', 'Off', '1:30']),
    );
  });

  it("says there is no rest when the last member's rest time is Off", () => {
    const tree = openRest([member('we1', 'Bench Press', 0), member('we2', 'Ab roller', 1, 0)], 'we1');

    expect(shownText(tree)).toContain('No rest after Ab roller: its rest time is Off.');
  });

  it('says nothing more for the last member, or outside a superset', () => {
    const last = openRest([member('we1', 'Bench Press', 0), member('we2', 'Ab roller', 1)], 'we2');
    expect(shownText(last).some((t) => t.startsWith('Rest comes after') || t.startsWith('No rest after'))).toBe(false);

    const alone = openRest([{ ...exercise(), restSeconds: null } as unknown as WorkoutExerciseView], 'we1');
    expect(shownText(alone).some((t) => t.startsWith('Rest comes after') || t.startsWith('No rest after'))).toBe(false);
  });
});

describe('ExerciseMenu: a long name wraps in every sheet', () => {
  const LONG = 'Alternating dumbbell incline bench press with a pause at the bottom';
  /** The texts on screen cut to a number of lines; none should be. */
  const clipped = (tree: ReturnType<typeof create>) =>
    tree.root.findAllByType(Text).filter((t) => t.props.numberOfLines !== undefined).map((t) => t.props.children);

  it.each([
    ['the menu', []],
    ['Reorder', ['Reorder']],
    ['Rest time', ['Rest time · Default (2:00)']],
    ['Something off', ['Something off']],
  ])('%s', (_panel, steps) => {
    const tree = mount(today({ name: LONG }));
    for (const step of steps) press(tree, step);

    expect(shownText(tree)).toContain(LONG);
    expect(clipped(tree)).toEqual([]);
  });

  it.each([
    ['Plate calculator', 'Plate calculator'],
    ["Today's weight", "Override today's weight"],
  ])('%s', (_sheet, menuLabel) => {
    const tree = mount(today({ name: LONG }));
    press(tree, menuLabel);
    afterSheetCloses();

    expect(shownText(tree)).toContain(LONG);
    expect(clipped(tree)).toEqual([]);
  });
});
