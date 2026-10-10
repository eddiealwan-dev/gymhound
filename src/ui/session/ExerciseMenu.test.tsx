import { router } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { WorkoutExerciseView } from '../../db/repositories/workoutViewsRepo';
import { Button } from '../Button';
import { setExerciseRest } from '../../state/sessionActions';
import { ExerciseMenu } from './ExerciseMenu';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/sessionActions', () => ({
  moveBlock: jest.fn(),
  removeFromWorkout: jest.fn(),
  setExerciseRest: jest.fn(),
  setRpeShown: jest.fn(),
  toggleSuperset: jest.fn(),
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
