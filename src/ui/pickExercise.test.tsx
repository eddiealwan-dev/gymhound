import { router } from 'expo-router';
import { FlatList, Image, Keyboard, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import PickExercise from '../../app/pick-exercise';
import type { ExerciseRow } from '../db/repositories/exercisesRepo';
import { EXERCISE_PHOTOS } from '../seed/exercisePhotos.generated';
import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { usePendingPick } from '../state/pendingPick';
import { addExercise, replaceWith } from '../state/sessionActions';
import { Button } from './Button';
import { FormDemo } from './FormDemo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockParams: { mode?: string; workoutExerciseId?: string };
let mockRows: ExerciseRow[];

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRows }));
jest.mock('../state/sessionActions', () => ({ addExercise: jest.fn(), replaceWith: jest.fn() }));
// Its own tests cover what it shows; here, which exercise it is opened for is what the tests read.
jest.mock('./FormDemo', () => ({ FormDemo: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** The library as `listExercises` lists it on a freshly seeded phone. */
const LIBRARY_ROWS: ExerciseRow[] = LIBRARY_EXERCISES.map(({ instructions: _steps, sourceId: _source, ...e }) => ({
  ...e,
  isCustom: false,
}));

/** The pickers mounted by this test, unmounted after it so the list's batched drawing never outlives it. */
const mounted: ReactTestRenderer[] = [];

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<PickExercise />);
  });
  mounted.push(tree);
  return tree;
}

const list = (tree: ReactTestRenderer) => tree.root.findByType(FlatList);
/** The exercises the list holds right now, in order: what it can scroll through, not just what it has drawn. */
const listed = (tree: ReactTestRenderer) => (list(tree).props.data as ExerciseRow[]).map((r) => r.id);
const listedRows = (tree: ReactTestRenderer) => list(tree).props.data as ExerciseRow[];

function search(tree: ReactTestRenderer, text: string) {
  const field = tree.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === 'Search exercises')[0];
  act(() => field.props.onChangeText(text));
}

const chip = (tree: ReactTestRenderer, label: string) => {
  const found = tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  expect(found).toHaveLength(1);
  return found[0];
};
const tapChip = (tree: ReactTestRenderer, label: string) => act(() => chip(tree, label).props.onPress());

/** A drawn row's choose target, found by what the screen reader says for it. */
function row(tree: ReactTestRenderer, readAs: string): ReactTestInstance {
  const found = tree.root.findAll((n) => n.props.accessibilityLabel === readAs && typeof n.props.onPress === 'function');
  expect(found.length).toBeGreaterThan(0);
  return found[0];
}

/** The drawn rows: each one's choose target. */
const drawnRows = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityHint === 'Chooses this exercise' && typeof n.props.onPress === 'function');

const texts = (node: ReactTestInstance) => node.findAll((n) => n.type === Text).map((t) => t.props.children);

afterEach(() => {
  for (const tree of mounted.splice(0)) act(() => tree.unmount());
  jest.useRealTimers();
});

beforeEach(() => {
  // The list draws later batches on timers; fake ones run only when a test lets them.
  jest.useFakeTimers();
  mockParams = { mode: 'add' };
  mockRows = LIBRARY_ROWS;
  usePendingPick.setState({ exerciseId: null });
  jest.mocked(router.back).mockClear();
  jest.mocked(addExercise).mockClear();
  jest.mocked(replaceWith).mockClear();
});

describe('the exercise picker: every exercise (§18.8)', () => {
  it('holds the whole library in a virtualized list that draws only a screenful', () => {
    const tree = mount();

    expect(listed(tree)).toHaveLength(LIBRARY_EXERCISES.length);
    expect(LIBRARY_EXERCISES.length).toBeGreaterThanOrEqual(876);
    expect(drawnRows(tree).length).toBeGreaterThan(5);
    // Once its later batches have run, it still draws only what is near the screen.
    act(() => void jest.advanceTimersByTime(2000));
    const drawn = drawnRows(tree).length;
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(60);
  });

  it('shows each row with its start photo at 44pt, its name, and "{Equipment} · {Primary muscle}"', () => {
    const tree = mount();
    search(tree, 'barbell bench press');

    const bench = row(tree, 'Barbell bench press, Barbell, Chest');
    const photo = bench.findAllByType(Image);
    expect(photo).toHaveLength(1);
    expect(photo[0].props.source).toBe(EXERCISE_PHOTOS['barbell-bench-press'][0]);
    expect(StyleSheet.flatten(photo[0].props.style)).toMatchObject({ width: 44, height: 44 });
    // Android decodes the photo at 44pt, not at its full size, so a long list does not run the phone out of memory.
    expect(photo[0].props.resizeMethod).toBe('resize');
    expect(texts(bench)).toEqual(['Barbell bench press', 'Barbell · Chest']);
  });

  it('keeps the photo space for an exercise without photos, so the names line up', () => {
    const tree = mount();
    search(tree, 'wall sit');

    const wallSit = row(tree, 'Wall sit, Bodyweight, Quads');
    expect(wallSit.findAllByType(Image)).toHaveLength(0);
    const tile = wallSit.findAll((n) => {
      const style = StyleSheet.flatten(n.props.style);
      return typeof n.type === 'string' && style?.width === 44 && style?.height === 44;
    });
    expect(tile).toHaveLength(1);
  });

  it('names each of several primary muscles on its row', () => {
    const tree = mount();
    search(tree, 'barbell row');

    expect(texts(row(tree, 'Barbell row, Barbell, Lats, Upper back'))).toEqual(['Barbell row', 'Barbell · Lats, Upper back']);
  });
});

describe('the exercise picker: search (§8.7)', () => {
  it('"chest" finds the bench press by its muscle', () => {
    const tree = mount();
    search(tree, 'chest');
    expect(listed(tree)).toContain('barbell-bench-press');
  });

  it('"band" finds band exercises by their equipment', () => {
    const tree = mount();
    search(tree, 'band');
    const bands = LIBRARY_ROWS.filter((r) => r.equipment === 'band').map((r) => r.id);
    expect(listed(tree)).toEqual(expect.arrayContaining(bands));
  });

  it('"rdl" finds the Romanian deadlifts by their alias', () => {
    const tree = mount();
    search(tree, 'rdl');
    expect(listed(tree)).toEqual(['dumbbell-romanian-deadlift', 'barbell-romanian-deadlift']);
  });

  it('says so when nothing matches', () => {
    const tree = mount();
    search(tree, 'zzzz');
    expect(listed(tree)).toEqual([]);
    expect(tree.root.findAll((n) => n.type === Text && n.props.children === 'No exercises match.')).toHaveLength(1);
  });
});

describe('the exercise picker: filter chips (§8.7)', () => {
  it('has a chip for each muscle, the delts as one Shoulders, and one for each kind of equipment', () => {
    const tree = mount();
    const labels = tree.root.findAllByType(Button).map((b) => b.props.label);
    expect(labels).toEqual([
      'Chest',
      'Shoulders',
      'Lats',
      'Upper back',
      'Traps',
      'Biceps',
      'Triceps',
      'Forearms',
      'Abs',
      'Obliques',
      'Lower back',
      'Glutes',
      'Quads',
      'Hamstrings',
      'Adductors',
      'Calves',
      'Barbell',
      'Dumbbell',
      'Cable',
      'Machine',
      'Kettlebell',
      'Bodyweight',
      'EZ bar',
      'Band',
      'Medicine ball',
      'Exercise ball',
      'Foam roller',
      'Other',
    ]);
    for (const b of tree.root.findAllByType(Button)) {
      expect(b.props).toMatchObject({ size: 'compact', variant: 'secondary', selected: false });
    }
  });

  it('the chip rows keep their height: only the list gives way to the screen, and it takes what is left', () => {
    const tree = mount();
    // A ScrollView grows and shrinks by default; beside a long list the rows were squeezed to a sliver.
    const rows = tree.root.findAllByType(ScrollView).filter((s) => s.props.horizontal === true);
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(StyleSheet.flatten(r.props.style)).toMatchObject({ flexGrow: 0, flexShrink: 0 });
    expect(StyleSheet.flatten(list(tree).props.style)).toMatchObject({ flex: 1 });
  });

  it('a chip filters by primary muscle and fills with ink when chosen', () => {
    const tree = mount();
    tapChip(tree, 'Chest');

    expect(chip(tree, 'Chest').props).toMatchObject({ variant: 'primary', selected: true });
    expect(listedRows(tree).length).toBeGreaterThan(10);
    expect(listedRows(tree).every((r) => r.primaryMuscles.includes('chest'))).toBe(true);
  });

  it('a muscle chip and an equipment chip combine, and both combine with the search', () => {
    const tree = mount();
    tapChip(tree, 'Chest');
    tapChip(tree, 'Dumbbell');

    const both = listedRows(tree);
    expect(both.map((r) => r.id)).toContain('dumbbell-bench-press');
    expect(both.every((r) => r.primaryMuscles.includes('chest') && r.equipment === 'dumbbell')).toBe(true);

    search(tree, 'incline');
    expect(listedRows(tree).length).toBeGreaterThan(0);
    expect(listedRows(tree).every((r) => r.equipment === 'dumbbell' && /incline/i.test(`${r.name} ${r.aliases.join(' ')}`))).toBe(true);
  });

  it('one chip per row: choosing another muscle replaces the first; tapping a chosen chip clears it', () => {
    const tree = mount();
    tapChip(tree, 'Chest');
    tapChip(tree, 'Shoulders');

    expect(chip(tree, 'Chest').props.selected).toBe(false);
    expect(chip(tree, 'Shoulders').props.selected).toBe(true);
    const shoulders = listedRows(tree);
    expect(shoulders.some((r) => r.primaryMuscles.includes('side_delts'))).toBe(true);
    expect(shoulders.some((r) => r.primaryMuscles.includes('rear_delts'))).toBe(true);

    tapChip(tree, 'Shoulders');
    expect(chip(tree, 'Shoulders').props.selected).toBe(false);
    expect(listed(tree)).toHaveLength(LIBRARY_EXERCISES.length);
  });
});

describe('the exercise picker: what a tap does', () => {
  const BENCH_ROW = 'Barbell bench press, Barbell, Chest';

  it('add: adds the exercise to the workout and closes', () => {
    const tree = mount();
    search(tree, 'barbell bench press');

    act(() => row(tree, BENCH_ROW).props.onPress());

    expect(addExercise).toHaveBeenCalledWith('db', 'barbell-bench-press');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(usePendingPick.getState().exerciseId).toBeNull();
  });

  it('replace: swaps it in for the exercise being replaced, under its own title', () => {
    mockParams = { mode: 'replace', workoutExerciseId: 'we1' };
    const tree = mount();
    expect(tree.root.findAll((n) => n.type === Text && n.props.children === 'Replace exercise')).toHaveLength(1);
    search(tree, 'barbell bench press');

    act(() => row(tree, BENCH_ROW).props.onPress());

    expect(replaceWith).toHaveBeenCalledWith('db', 'we1', 'barbell-bench-press');
    expect(addExercise).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('routine: hands the exercise to the routine editor and closes, touching no workout', () => {
    mockParams = { mode: 'routine' };
    const tree = mount();
    expect(tree.root.findAll((n) => n.type === Text && n.props.children === 'Add exercise')).toHaveLength(1);
    search(tree, 'barbell bench press');

    act(() => row(tree, BENCH_ROW).props.onPress());

    expect(usePendingPick.getState().exerciseId).toBe('barbell-bench-press');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(addExercise).not.toHaveBeenCalled();
    expect(replaceWith).not.toHaveBeenCalled();
    // The editor takes it once.
    expect(usePendingPick.getState().take()).toBe('barbell-bench-press');
    expect(usePendingPick.getState().take()).toBeNull();
  });
});

describe('the exercise picker: the info button (R86)', () => {
  const SHOW_BENCH = 'Show form for Barbell bench press';
  const demo = (tree: ReactTestRenderer) => tree.root.findByType(FormDemo);

  it('each row has an info button, a 44pt target after the name', () => {
    const tree = mount();
    search(tree, 'barbell bench press');

    const info = row(tree, SHOW_BENCH);
    expect(info.props.accessibilityRole).toBe('button');
    const style = StyleSheet.flatten(typeof info.props.style === 'function' ? info.props.style({ pressed: false }) : info.props.style);
    expect(style).toMatchObject({ width: 44, height: 44 });
    // Its own target, beside the row's, so the screen reader reaches both.
    expect(row(tree, 'Barbell bench press, Barbell, Chest').findAll((n) => n === info)).toHaveLength(0);
    expect(demo(tree).props.exerciseId).toBeNull();
  });

  it('opens the form demo for that exercise, after putting the keyboard away, and chooses nothing', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    try {
      const tree = mount();
      search(tree, 'barbell bench press');
      const openAtDismiss: (string | null)[] = [];
      dismiss.mockImplementation(() => void openAtDismiss.push(demo(tree).props.exerciseId));

      act(() => row(tree, SHOW_BENCH).props.onPress());

      expect(openAtDismiss).toEqual([null]);
      expect(demo(tree).props.exerciseId).toBe('barbell-bench-press');
      expect(addExercise).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();

      act(() => demo(tree).props.onClose());
      expect(demo(tree).props.exerciseId).toBeNull();
    } finally {
      dismiss.mockRestore();
    }
  });
});
