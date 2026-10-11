import { AccessibilityInfo, Image, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ExerciseDetail } from '../db/repositories/exercisesRepo';
import { getExercise } from '../db/repositories/exercisesRepo';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { Button } from './Button';
import { FormDemo } from './FormDemo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/exercisesRepo', () => ({ getExercise: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const STEPS = ['Lie back on the bench.', 'Lift the bar from the rack.', 'Lower it to your chest.', 'Press it back up.', 'Repeat.'];

const BENCH: ExerciseDetail = {
  id: 'barbell-bench-press',
  name: 'Barbell bench press',
  aliases: ['bench'],
  primaryMuscles: ['chest'],
  secondaryMuscles: ['front_delts', 'triceps'],
  equipment: 'barbell',
  pattern: 'horizontal_push',
  loggingType: 'weighted',
  isCustom: false,
  hasPhotos: true,
  instructions: STEPS,
  sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
};
/** Steps, and no photos (the library has a few like it). */
const HALO: ExerciseDetail = {
  ...BENCH,
  id: 'fedb-kettlebell-halo',
  name: 'Kettlebell halo',
  primaryMuscles: ['front_delts'],
  secondaryMuscles: [],
  equipment: 'kettlebell',
  hasPhotos: false,
  instructions: ['Hold the bell by its horns.', 'Circle it around your head.'],
  sourceId: 'Kettlebell_Halo',
};
/** Neither photos nor steps. */
const WALL_SIT: ExerciseDetail = {
  ...BENCH,
  id: 'wall-sit',
  name: 'Wall sit',
  primaryMuscles: ['quads'],
  secondaryMuscles: ['glutes'],
  equipment: 'bodyweight',
  loggingType: 'timed',
  hasPhotos: false,
  instructions: [],
  sourceId: null,
};
/** Photos, and no steps. */
const SIDE_PLANK: ExerciseDetail = {
  ...BENCH,
  id: 'side-plank',
  name: 'Side plank',
  primaryMuscles: ['obliques'],
  secondaryMuscles: [],
  equipment: 'bodyweight',
  loggingType: 'timed',
  hasPhotos: true,
  instructions: [],
};

const ALL = [BENCH, HALO, WALL_SIT, SIDE_PLANK];

let reduceMotion: boolean;
/** What the phone told the sheet about Reduce Motion changing, so a test can change it. */
let reduceMotionChanged: ((on: boolean) => void) | null;

beforeEach(() => {
  jest.useFakeTimers();
  reduceMotion = false;
  reduceMotionChanged = null;
  jest.mocked(getExercise).mockReset().mockImplementation((_db, id) => ALL.find((e) => e.id === id) ?? null);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (on: boolean) => void) => {
    if (event === 'reduceMotionChanged') reduceMotionChanged = handler;
    return { remove: () => void (reduceMotionChanged = null) };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Opens the demo and lets the Reduce Motion check answer. */
async function open(exerciseId: string | null, onClose: () => void = () => {}): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<FormDemo exerciseId={exerciseId} onClose={onClose} />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Text).map((t) => t.props.children);
const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
/** The drawn photo the screen reader names `label`. */
const photo = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAll((n) => n.type === Image && n.props.accessibilityLabel === label);
  expect(found).toHaveLength(1);
  return found[0];
};
const photos = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Image);
const opacity = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style).opacity;
const START = 'Barbell bench press, start position';
const END = 'Barbell bench press, end position';

describe('the form demo (R86)', () => {
  it('shows the name, the start and end photos, the muscles and the first three steps, numbered', async () => {
    const tree = await open('barbell-bench-press');

    expect(getExercise).toHaveBeenCalledWith('db', 'barbell-bench-press');
    const name = tree.root.findAll((n) => n.type === Text && n.props.children === 'Barbell bench press')[0];
    expect(StyleSheet.flatten(name.props.style)).toMatchObject({ fontFamily: 'BarlowCondensed_700Bold', fontSize: 28 });
    expect(photo(tree, START).props.source).toBe(EXERCISE_PHOTOS['barbell-bench-press'][0]);
    expect(photo(tree, END).props.source).toBe(EXERCISE_PHOTOS['barbell-bench-press'][1]);
    const shown = texts(tree);
    expect(shown).toContain('Chest · Shoulders, Triceps');
    expect(shown).toEqual(expect.arrayContaining(['1', STEPS[0], '2', STEPS[1], '3', STEPS[2]]));
    expect(shown).not.toContain(STEPS[3]);
    expect(shown).not.toContain('4');
    expect(buttons(tree, 'Show all steps')).toHaveLength(1);
    expect(shown.indexOf('Barbell bench press')).toBeLessThan(shown.indexOf('Chest · Shoulders, Triceps'));
    expect(shown.indexOf('Chest · Shoulders, Triceps')).toBeLessThan(shown.indexOf(STEPS[0]));
  });

  it('Show all steps shows every step and then goes away', async () => {
    const tree = await open('barbell-bench-press');

    act(() => buttons(tree, 'Show all steps')[0].props.onPress());

    expect(texts(tree)).toEqual(expect.arrayContaining(['4', STEPS[3], '5', STEPS[4]]));
    expect(buttons(tree, 'Show all steps')).toHaveLength(0);
  });

  it('shows every step, without Show all steps, when there are three or fewer', async () => {
    const tree = await open('fedb-kettlebell-halo');

    expect(texts(tree)).toEqual(expect.arrayContaining(['1', 'Hold the bell by its horns.', '2', 'Circle it around your head.']));
    expect(buttons(tree, 'Show all steps')).toHaveLength(0);
  });

  it('Close closes it', async () => {
    const onClose = jest.fn();
    const tree = await open('barbell-bench-press', onClose);

    const close = buttons(tree, 'Close');
    expect(close).toHaveLength(1);
    act(() => close[0].props.onPress());

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('draws nothing and reads nothing while closed', async () => {
    const tree = await open(null);

    expect(tree.toJSON()).toBeNull();
    expect(getExercise).not.toHaveBeenCalled();
  });

  it('keeps showing the exercise while it closes, so the sheet does not empty as it fades', async () => {
    const tree = await open('barbell-bench-press');
    await act(async () => tree.update(<FormDemo exerciseId={null} onClose={() => {}} />));
    expect(getExercise).toHaveBeenCalledTimes(1);

    await act(async () => tree.update(<FormDemo exerciseId="wall-sit" onClose={() => {}} />));
    expect(texts(tree)).toContain('Wall sit');
  });
});

describe('the form demo: the photos (R86)', () => {
  it('starts on the start photo, then swaps to the end photo and back every 1.2 s, instantly', async () => {
    const tree = await open('barbell-bench-press');
    expect(opacity(photo(tree, END))).toBe(0);

    act(() => void jest.advanceTimersByTime(1199));
    expect(opacity(photo(tree, END))).toBe(0);
    act(() => void jest.advanceTimersByTime(1));
    expect(opacity(photo(tree, END))).toBe(1);

    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(photo(tree, END))).toBe(0);

    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(photo(tree, END))).toBe(1);
    // No fade in between: it is an instant flip, so both photos stay drawn and the start photo is never touched.
    expect(photos(tree)).toHaveLength(2);
    expect(opacity(photo(tree, START))).toBeUndefined();
  });

  it('gives the end photo an opaque background, so nothing of the start photo shows around it', async () => {
    const tree = await open('barbell-bench-press');

    expect(StyleSheet.flatten(photo(tree, END).props.style)).toMatchObject({ backgroundColor: '#232019' });
    act(() => void jest.advanceTimersByTime(1200));
    expect(StyleSheet.flatten(photo(tree, END).props.style)).toMatchObject({ backgroundColor: '#232019', opacity: 1 });
  });

  it('lays the end photo over the start photo in one 3:2 frame', async () => {
    const tree = await open('barbell-bench-press');

    const start = photo(tree, START);
    const end = photo(tree, END);
    const holdingBoth = tree.root.findAll(
      (n) => typeof n.type === 'string' && n.findAll((m) => m === start).length > 0 && n.findAll((m) => m === end).length > 0,
    );
    const frame = holdingBoth[holdingBoth.length - 1];
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ aspectRatio: 3 / 2, overflow: 'hidden' });
    expect(StyleSheet.flatten(end.props.style)).toMatchObject({ position: 'absolute' });
  });

  it('stops when it closes', async () => {
    const tree = await open('barbell-bench-press');
    act(() => void jest.advanceTimersByTime(1200));
    expect(jest.getTimerCount()).toBe(1);
    await act(async () => tree.update(<FormDemo exerciseId={null} onClose={() => {}} />));

    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer when it is unmounted', async () => {
    const tree = await open('barbell-bench-press');
    act(() => void jest.advanceTimersByTime(1200));
    expect(jest.getTimerCount()).toBe(1);

    act(() => tree.unmount());

    expect(jest.getTimerCount()).toBe(0);
    act(() => void jest.advanceTimersByTime(5000));
  });

  it('with Reduce Motion on, shows both photos side by side and never moves them', async () => {
    reduceMotion = true;
    const tree = await open('barbell-bench-press');

    const start = photo(tree, START);
    const end = photo(tree, END);
    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
    expect(opacity(end)).toBeUndefined();
    // Side by side: a row holds both.
    const row = tree.root.findAll((n) => StyleSheet.flatten(n.props.style)?.flexDirection === 'row' && n.findAll((m) => m === start).length > 0 && n.findAll((m) => m === end).length > 0);
    expect(row.length).toBeGreaterThan(0);
  });

  it('when Reduce Motion is turned on while it is open, stops and shows both side by side', async () => {
    const tree = await open('barbell-bench-press');
    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(photo(tree, END))).toBe(1);

    act(() => reduceMotionChanged!(true));
    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
    expect(opacity(photo(tree, END))).toBeUndefined();
    expect(opacity(photo(tree, START))).toBeUndefined();
  });

  it('when Reduce Motion is turned off again, starts over on the start photo', async () => {
    reduceMotion = true;
    const tree = await open('barbell-bench-press');
    act(() => void jest.advanceTimersByTime(5000));
    expect(jest.getTimerCount()).toBe(0);

    act(() => reduceMotionChanged!(false));
    expect(opacity(photo(tree, END))).toBe(0);
    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(photo(tree, END))).toBe(1);

    // Turned on while the end photo shows, then off again: back to the start photo, not the end photo.
    act(() => reduceMotionChanged!(true));
    act(() => reduceMotionChanged!(false));
    expect(opacity(photo(tree, END))).toBe(0);
    act(() => void jest.advanceTimersByTime(1199));
    expect(opacity(photo(tree, END))).toBe(0);
  });

  it('shows the start photo alone, and still, until the phone has said whether Reduce Motion is on', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => new Promise<boolean>(() => {}));
    const tree = await open('barbell-bench-press');

    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
    expect(photos(tree)).toHaveLength(2);
    expect(opacity(photo(tree, END))).toBe(0);
  });

  it('holds still, as with Reduce Motion, when the phone cannot say whether it is on', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => Promise.reject(new Error('unavailable')));
    const tree = await open('barbell-bench-press');

    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
    expect(photos(tree)).toHaveLength(2);
    expect(opacity(photo(tree, END))).toBeUndefined();
  });

  it('an exercise with photos and no steps shows the photos alone', async () => {
    const tree = await open('side-plank');

    expect(photo(tree, 'Side plank, start position')).toBeDefined();
    expect(photo(tree, 'Side plank, end position')).toBeDefined();
    expect(texts(tree)).toEqual(['Side plank', 'Obliques', 'Close']);
  });
});

describe('the form demo without photos (R86)', () => {
  it('shows the steps only', async () => {
    const tree = await open('fedb-kettlebell-halo');

    expect(photos(tree)).toHaveLength(0);
    expect(texts(tree)).toEqual(['Kettlebell halo', 'Shoulders', '1', 'Hold the bell by its horns.', '2', 'Circle it around your head.', 'Close']);
    act(() => void jest.advanceTimersByTime(5000));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('with neither photos nor steps, shows the name and the muscles', async () => {
    const tree = await open('wall-sit');

    expect(photos(tree)).toHaveLength(0);
    expect(texts(tree)).toEqual(['Wall sit', 'Quads · Glutes', 'Close']);
  });
});
