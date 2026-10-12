import { router } from 'expo-router';
import { AccessibilityInfo, Image, Platform, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import type { ExerciseDetail } from '../db/repositories/exercisesRepo';
import { getExercise } from '../db/repositories/exercisesRepo';
import { getOwnPhotos } from '../db/repositories/exercisePhotosRepo';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { Button } from './Button';
import { FormDemo } from './FormDemo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/exercisesRepo', () => ({ getExercise: jest.fn() }));
jest.mock('../db/repositories/exercisePhotosRepo', () => ({ getOwnPhotos: jest.fn(), setOwnPhoto: jest.fn() }));
jest.mock('../platform/exercisePhotoFiles', () => ({
  pickPhoto: jest.fn(),
  saveExercisePhoto: jest.fn(),
  deleteExercisePhotoFile: jest.fn(),
  photoFileExists: () => true,
  photoUri: (name: string) => `file:///documents/exercise-photos/${name}`,
}));
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
  instructions: [],
};

/** One of your own: no photos, no steps. */
const MINE: ExerciseDetail = {
  ...BENCH,
  id: 'c0ffee00-0000-4000-8000-000000000001',
  name: 'Landmine press',
  aliases: [],
  primaryMuscles: ['front_delts'],
  secondaryMuscles: ['triceps'],
  isCustom: true,
  instructions: [],
  sourceId: null,
};

const ALL = [BENCH, HALO, WALL_SIT, SIDE_PLANK, MINE];

const originalOS = Platform.OS;

let reduceMotion: boolean;
/** What the phone told the sheet about Reduce Motion changing, so a test can change it. */
let reduceMotionChanged: ((on: boolean) => void) | null;

/**
 * Renders the demo once under real timers before any test, so the first test doesn't absorb the cold start (loading
 * the sheet, the photos and the animation modules), which can pass its 5 s timeout when the whole suite runs at once.
 */
beforeAll(async () => {
  jest.mocked(getExercise).mockImplementation(() => BENCH);
  jest.mocked(getOwnPhotos).mockReturnValue({ start: null, end: null });
  const reduceMotionSpy = jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<FormDemo exerciseId={BENCH.id} onClose={() => {}} />);
  });
  act(() => tree.unmount());
  reduceMotionSpy.mockRestore();
  jest.mocked(getExercise).mockReset();
  jest.mocked(getOwnPhotos).mockReset();
}, 60_000);

beforeEach(() => {
  jest.useFakeTimers();
  reduceMotion = false;
  reduceMotionChanged = null;
  jest.mocked(getExercise).mockReset().mockImplementation((_db, id) => ALL.find((e) => e.id === id) ?? null);
  jest.mocked(getOwnPhotos).mockReset().mockReturnValue({ start: null, end: null });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockImplementation(() => Promise.resolve(reduceMotion));
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (on: boolean) => void) => {
    if (event === 'reduceMotionChanged') reduceMotionChanged = handler;
    return { remove: () => void (reduceMotionChanged = null) };
  }) as unknown as typeof AccessibilityInfo.addEventListener);
});

afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

/** Tells every photo drawn that it has loaded, as the phone does once it has decoded it. */
function loadPhotos(tree: ReactTestRenderer, which: 'start' | 'end' | 'both' = 'both') {
  const ids = which === 'both' ? ['form-demo-start', 'form-demo-end'] : [`form-demo-${which}`];
  const drawn = tree.root.findAll((n) => n.type === Image && ids.includes(n.props.testID));
  act(() => {
    for (const image of drawn) image.props.onLoad?.({ nativeEvent: { source: { width: 360, height: 240 } } });
  });
}

/**
 * Opens the demo and lets the Reduce Motion check answer. Its photos then load at once (the swap waits for them, R403),
 * unless `loaded` is false.
 */
async function open(exerciseId: string | null, onClose: () => void = () => {}, loaded = true): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<FormDemo exerciseId={exerciseId} onClose={onClose} />);
  });
  if (loaded) loadPhotos(tree);
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Text).map((t) => t.props.children);
const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
/** The drawn start or end photo. The screen reader never lands on either: their frame is one element (review of R86). */
const photo = (tree: ReactTestRenderer, which: 'start' | 'end'): ReactTestInstance => {
  const found = tree.root.findAll((n) => n.type === Image && n.props.testID === `form-demo-${which}`);
  expect(found).toHaveLength(1);
  return found[0];
};
const photos = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === Image);
/** The opaque view the end photo sits in: it fills the frame and flips between hidden and shown (Round 7). */
const cover = (tree: ReactTestRenderer): ReactTestInstance => {
  const found = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.testID === 'form-demo-end-cover');
  expect(found.length).toBeGreaterThan(0);
  return found[0];
};
const opacity = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style).opacity;
/** The labels of the photo frames the screen reader lands on. */
const stopsIn = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessible === true && n.props.accessibilityRole === 'image' && n.findAll((m) => m.type === Image && m.props.testID?.startsWith('form-demo')).length > 0).map((n) => n.props.accessibilityLabel);
const START = 'start';
const END = 'end';

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
    expect(opacity(cover(tree))).toBe(0);

    act(() => void jest.advanceTimersByTime(1199));
    expect(opacity(cover(tree))).toBe(0);
    act(() => void jest.advanceTimersByTime(1));
    expect(opacity(cover(tree))).toBe(1);

    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(cover(tree))).toBe(0);

    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(cover(tree))).toBe(1);
    // No fade in between: it is an instant flip, so both photos stay drawn and the start photo is never touched.
    expect(photos(tree)).toHaveLength(2);
    expect(opacity(photo(tree, START))).toBeUndefined();
  });

  it('waits for both photos to load before it swaps, so the first swap never shows an empty frame (R403)', async () => {
    const tree = await open(BENCH.id, () => {}, false);
    act(() => void jest.advanceTimersByTime(5000));
    expect(opacity(cover(tree))).toBe(0);

    loadPhotos(tree, 'start');
    act(() => void jest.advanceTimersByTime(5000));
    expect(opacity(cover(tree))).toBe(0);

    loadPhotos(tree, 'end');
    act(() => void jest.advanceTimersByTime(1199));
    expect(opacity(cover(tree))).toBe(0);
    act(() => void jest.advanceTimersByTime(1));
    expect(opacity(cover(tree))).toBe(1);
  });

  it('stays on the start photo when the end photo never loads', async () => {
    const tree = await open(BENCH.id, () => {}, false);
    loadPhotos(tree, 'start');
    act(() => {
      photo(tree, END).props.onError?.({ nativeEvent: { error: 'gone' } });
    });
    act(() => void jest.advanceTimersByTime(5000));
    expect(opacity(cover(tree))).toBe(0);
  });

  it('hands each photo the same style on every flip, so nothing about the photos changes as they swap', async () => {
    const tree = await open(BENCH.id);
    const before = [photo(tree, START).props.style, photo(tree, END).props.style];
    act(() => void jest.advanceTimersByTime(1200));
    expect([photo(tree, START).props.style, photo(tree, END).props.style]).toEqual(before);
    expect(photo(tree, START).props.style).toBe(before[0]);
  });

  it('gives the end photo an opaque background, so nothing of the start photo shows around it', async () => {
    const tree = await open('barbell-bench-press');

    expect(StyleSheet.flatten(cover(tree).props.style)).toMatchObject({ backgroundColor: '#232019' });
    act(() => void jest.advanceTimersByTime(1200));
    expect(StyleSheet.flatten(cover(tree).props.style)).toMatchObject({ backgroundColor: '#232019', opacity: 1 });
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
    // The cover fills the whole frame and the end photo fills the cover, so none of the start photo shows (Round 7).
    expect(StyleSheet.flatten(cover(tree).props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
    expect(StyleSheet.flatten(end.props.style)).toMatchObject({ width: '100%', height: '100%' });
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
    expect(opacity(cover(tree))).toBe(1);

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
    expect(opacity(cover(tree))).toBe(0);
    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(cover(tree))).toBe(1);

    // Turned on while the end photo shows, then off again: back to the start photo, not the end photo.
    act(() => reduceMotionChanged!(true));
    act(() => reduceMotionChanged!(false));
    expect(opacity(cover(tree))).toBe(0);
    act(() => void jest.advanceTimersByTime(1199));
    expect(opacity(cover(tree))).toBe(0);
  });

  it('shows the start photo alone, and still, until the phone has said whether Reduce Motion is on', async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockImplementation(() => new Promise<boolean>(() => {}));
    const tree = await open('barbell-bench-press');

    act(() => void jest.advanceTimersByTime(5000));

    expect(jest.getTimerCount()).toBe(0);
    expect(photos(tree)).toHaveLength(2);
    expect(opacity(cover(tree))).toBe(0);
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

    expect(photo(tree, START)).toBeDefined();
    expect(photo(tree, END)).toBeDefined();
    expect(texts(tree)).toEqual(['Side plank', 'Obliques', 'Close']);
  });
});

describe('the form demo without photos (R86)', () => {
  it('shows the steps only', async () => {
    const tree = await open('fedb-kettlebell-halo');

    expect(photos(tree)).toHaveLength(0);
    expect(texts(tree)).toEqual(['Kettlebell halo', 'Shoulders', '1', 'Hold the bell by its horns.', '2', 'Circle it around your head.', 'Start photo', 'Add', 'End photo', 'Add', 'Close']);
    act(() => void jest.advanceTimersByTime(5000));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('with neither photos nor steps, shows the name and the muscles', async () => {
    const tree = await open('wall-sit');

    expect(photos(tree)).toHaveLength(0);
    expect(texts(tree)).toEqual(['Wall sit', 'Quads · Glutes', 'Start photo', 'Add', 'End photo', 'Add', 'Close']);
  });
});

describe('the form demo: the photos and the screen reader (review of R86)', () => {
  /** What the screen reader can land on in the photo frame: elements marked accessible, with their labels. */
  const stops = (tree: ReactTestRenderer) =>
    tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessible === true && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes('position'));

  it.each([
    { motion: 'swapping', reduced: false },
    { motion: 'side by side (Reduce Motion)', reduced: true },
  ])('$motion, the photos are one element, "{name}, start and end positions", and neither photo is a stop', async ({ reduced }) => {
    reduceMotion = reduced;
    const tree = await open('barbell-bench-press');

    const frames = stops(tree);
    expect(frames).toHaveLength(1);
    expect(frames[0].props.accessibilityLabel).toBe('Barbell bench press, start and end positions');
    expect(frames[0].props.accessibilityRole).toBe('image');
    for (const image of photos(tree)) {
      expect(image.props.accessible).toBe(false);
      expect(image.props.accessibilityLabel).toBeUndefined();
    }
    expect(photos(tree)).toHaveLength(2);
    // Both photos sit inside it.
    expect(frames[0].findAll((n) => n.type === Image)).toHaveLength(2);
  });
});

describe('the form demo of your own exercise', () => {
  it('says there are no steps and offers Edit exercise', async () => {
    const tree = await open(MINE.id);
    expect(texts(tree)).toEqual(['Landmine press', 'Shoulders · Triceps', 'No steps for your own exercise.', 'Edit exercise', 'Start photo', 'Add', 'End photo', 'Add', 'Close']);
    expect(buttons(tree, 'Edit exercise')[0].props.variant).toBe('secondary');
  });

  it('Edit exercise closes the demo, then opens the editor once the sheet has gone', async () => {
    const onClose = jest.fn();
    jest.mocked(router.push).mockClear();
    const tree = await open(MINE.id, onClose);
    act(() => buttons(tree, 'Edit exercise')[0].props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(400));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/exercise/[id]', params: { id: MINE.id } });
  });

  it('offers no Edit exercise when it may not be edited from here (the picker for a routine)', async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(<FormDemo exerciseId={MINE.id} onClose={() => {}} canEdit={false} />);
    });
    expect(buttons(tree, 'Edit exercise')).toHaveLength(0);
    expect(texts(tree)).toContain('No steps for your own exercise.');
  });

  it('a library exercise offers no Edit exercise', async () => {
    for (const id of ['wall-sit', 'barbell-bench-press']) {
      const tree = await open(id);
      expect(buttons(tree, 'Edit exercise')).toHaveLength(0);
      expect(texts(tree)).not.toContain('No steps for your own exercise.');
    }
  });
});

describe('the form demo: your own photos (R111)', () => {
  const ownStart = { uri: 'file:///documents/exercise-photos/wall-sit-start-1.jpg' };
  const ownEnd = { uri: 'file:///documents/exercise-photos/wall-sit-end-1.jpg' };

  it('shows your own start and end photos, swapping as the bundled ones do (R98)', async () => {
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-1.jpg' });
    const tree = await open('wall-sit');

    expect(photo(tree, START).props.source).toEqual(ownStart);
    expect(photo(tree, END).props.source).toEqual(ownEnd);
    expect(opacity(cover(tree))).toBe(0);
    act(() => void jest.advanceTimersByTime(1200));
    expect(opacity(cover(tree))).toBe(1);
    expect(stopsIn(tree)).toEqual(['Wall sit, start and end positions']);
  });

  it('shows a single photo still, in the same frame', async () => {
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: null });
    const tree = await open('wall-sit');

    expect(photos(tree).filter((p) => p.props.testID?.startsWith('form-demo'))).toHaveLength(1);
    expect(photo(tree, START).props.source).toEqual(ownStart);
    act(() => void jest.advanceTimersByTime(5000));
    expect(jest.getTimerCount()).toBe(0);
    expect(stopsIn(tree)).toEqual(['Wall sit, photo']);
  });

  it('offers Add for each photo where none are bundled, and Replace and Remove for one that is set', async () => {
    let tree = await open('wall-sit');
    expect(buttons(tree, 'Add')).toHaveLength(2);

    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: null });
    tree = await open(MINE.id);
    expect(buttons(tree, 'Replace')).toHaveLength(1);
    expect(buttons(tree, 'Remove')).toHaveLength(1);
    expect(buttons(tree, 'Add')).toHaveLength(1);
  });

  it('offers no photo controls where photos are bundled: they are never replaced', async () => {
    const tree = await open('barbell-bench-press');
    for (const label of ['Add', 'Replace', 'Remove']) expect(buttons(tree, label)).toHaveLength(0);
    expect(getOwnPhotos).not.toHaveBeenCalled();
  });

  it('offers no photo controls, and shows no own photos, on web', async () => {
    Platform.OS = 'web';
    jest.mocked(getOwnPhotos).mockReturnValue({ start: 'wall-sit-start-1.jpg', end: 'wall-sit-end-1.jpg' });
    const tree = await open('wall-sit');
    expect(photos(tree)).toHaveLength(0);
    for (const label of ['Add', 'Replace', 'Remove']) expect(buttons(tree, label)).toHaveLength(0);
  });
});
