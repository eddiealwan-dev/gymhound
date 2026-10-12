import { router } from 'expo-router';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import { getActiveWorkoutView } from '../../db/repositories/workoutViewsRepo';
import type { MusicAppId } from '../../domain/types';
import { flushAll } from '../../state/draftFlush';
import { finish } from '../../state/sessionActions';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The session header (spec 18.6, Task 5): the progress under the name, the line that fills as sets are ticked, and the
 * Finish pill, which replaces the Finish at the bottom.
 */

type Workout = { id: string; name: string; startedAt: number; restEndsAt: number | null; restSetId: string | null; exercises: unknown[] };

const set = (id: string, position: number, done: boolean) => ({ id, position, setType: 'working', done });

/** Two exercises, each with its first set ticked and its second open: 2 of 4. */
const EXERCISES = [
  { id: 'we1', exerciseId: 'bench', name: 'Barbell bench press', position: 0, supersetGroup: null, sets: [set('s1', 0, true), set('s2', 1, false)] },
  { id: 'we2', exerciseId: 'ohp', name: 'Overhead press', position: 1, supersetGroup: null, sets: [set('s3', 0, true), set('s4', 1, false)] },
];
const mockState: { workout: Workout | null; musicApp: MusicAppId | null } = {
  workout: { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES },
  musicApp: null,
};

/** The props each block was last drawn with. */
const mockBlocks: { nextSetId: string | null }[] = [];

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockState.workout, unit: 'kg', distanceUnit: 'km', musicApp: mockState.musicApp, restSeconds: 120 }),
  bumpData: jest.fn(),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({
  ExerciseBlock: (props: { nextSetId: string | null }) => {
    mockBlocks.push(props);
    return null;
  },
}));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('./FoodOfferBanner', () => ({
  FoodOfferBanner: (props: { workoutId: string }) => {
    const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
    return <MockText testID="food-offer-slot">{`offer for ${props.workoutId}`}</MockText>;
  },
}));
// Phase 7: the Rough sleep offer shares the slot, right under the Short on food offer.
jest.mock('../native/SleepOfferBanner', () => ({ SleepOfferBanner: (_props: { workoutId: string }) => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Session />);
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

const textWith = (tree: ReactTestRenderer, children: string) => tree.root.findAll((n) => n.type === Text && n.props.children === children);

/** The line under the name: one row, read as one by its label. */
const lineRow = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.accessibilityLabel === '2 of 4 sets done. Workout time 0:01')[0];
/** The name column holding the line: the nearest styled view above it (the line is its own component, which has no style). */
const nameColumn = (tree: ReactTestRenderer) => {
  let node = lineRow(tree).parent!;
  while (node.props.style === undefined) node = node.parent!;
  return node;
};

/** The 2pt line along the bottom of the header. */
const progressLine = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === View && n.props.style?.height === 2);

const finishButtons = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).filter((b) => b.props.label === 'Finish');

const pressFinish = (tree: ReactTestRenderer) =>
  act(() => {
    const buttons = finishButtons(tree);
    expect(buttons).toHaveLength(1);
    buttons[0].props.onPress();
  });

type ActiveView = ReturnType<typeof getActiveWorkoutView>;

/** The workout as the database has it when Finish is pressed. */
function viewWith(sets: { done: boolean }[]) {
  jest.mocked(getActiveWorkoutView).mockReturnValue({ id: 'w1', name: 'Push A', exercises: [{ name: 'Barbell bench press', sets }] } as unknown as ActiveView);
}

beforeEach(() => {
  mockState.workout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES };
  mockState.musicApp = null;
  mockBlocks.length = 0;
  jest.mocked(router.replace).mockClear();
  jest.mocked(finish).mockReset();
  jest.mocked(flushAll).mockClear();
  jest.mocked(getActiveWorkoutView).mockReset();
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the session header (spec 18.6)', () => {
  it('shows the progress under the name', () => {
    const tree = mount();

    const name = textWith(tree, 'Push A');
    expect(name).toHaveLength(1);
    expect(name[0].props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 });

    // The line is two parts in a row, read as one: the count, then the time (Round 4, A2).
    const count = textWith(tree, '2/4 sets');
    const time = textWith(tree, '\u00a0· 0:01');
    expect(count).toHaveLength(1);
    expect(time).toHaveLength(1);
    const row = lineRow(tree);
    expect(row.props.accessible).toBe(true);
    expect(row.findAll((n) => n.type === Text).map((n) => n.props.children)).toEqual(['2/4 sets', '\u00a0· 0:01']);
    for (const part of [count[0], time[0]]) expect(part.props).toMatchObject({ numberOfLines: 1, maxFontSizeMultiplier: 1.3 });
  });

  it('the progress line is the share ticked', () => {
    const tree = mount();
    const line = progressLine(tree);
    expect(line).toHaveLength(1);
    expect(line[0].props.style).toMatchObject({ width: '50%', backgroundColor: '#f1ece2' });
    expect(line[0].props.accessibilityElementsHidden).toBe(true);
    expect(line[0].props.importantForAccessibility).toBe('no-hide-descendants');

    mockState.workout = { ...mockState.workout!, exercises: [] };
    const empty = mount();
    expect(progressLine(empty)[0].props.style.width).toBe('0%');
    expect(textWith(empty, '0:01')).toHaveLength(1);
    expect(shownText(empty).some((t) => t.includes('sets'))).toBe(false);
  });

  it('Finish is in the header and not at the bottom', () => {
    const tree = mount();

    const finishes = finishButtons(tree);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].props).toMatchObject({ variant: 'secondary', size: 'compact', maxFontSizeMultiplier: 1.3 });
    expect(
      tree.root
        .findByType(ScrollView)
        .findAllByType(Button)
        .map((b) => b.props.label),
    ).toEqual(['Add exercise', 'Discard workout']);
  });

  it('header Finish runs the same checks', () => {
    viewWith([{ done: false }]);
    const tree = mount();
    pressFinish(tree);
    expect(shownText(tree)).toContain('Nothing is ticked yet.');
    expect(router.replace).not.toHaveBeenCalled();

    viewWith([{ done: true }]);
    jest.mocked(finish).mockReturnValue('finished');
    const ticked = mount();
    pressFinish(ticked);
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
  });

  it('Finish in the header saves first', () => {
    viewWith([{ done: true }]);
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();

    pressFinish(tree);

    expect(flushAll).toHaveBeenCalled();
    expect(jest.mocked(flushAll).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(getActiveWorkoutView).mock.invocationCallOrder[0]);
  });

  it('passes the next set to the block that has it, and null to the others, so a tick redraws only the blocks it changes', () => {
    mount();
    expect(mockBlocks.length).toBeGreaterThanOrEqual(2);
    expect(mockBlocks.slice(-2).map((b) => b.nextSetId)).toEqual(['s2', null]);
  });

  describe('at the largest text, on a 320 or 390 phone with Music (Round 4, A2)', () => {
    const flat = (style: unknown) => StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style) ?? {};
    /** The outermost element labelled `label`: the Pressable itself, whose style is still a function of `pressed`. */
    const pressable = (tree: ReactTestRenderer, label: string) => tree.root.findAll((n) => n.props.accessibilityLabel === label)[0];
    /** The header's one row: the View holding Back. */
    const headerRow = (tree: ReactTestRenderer) => pressable(tree, 'Back to Train').parent!;

    it('the progress line has its own 2pt strip under the row, so it never covers the text', () => {
      const tree = mount();
      // The line sits at bottom 0 of the header, in the 2pt the header keeps below the row.
      expect(progressLine(tree)[0].props.style).toMatchObject({ position: 'absolute', bottom: 0, height: 2 });
      const header = tree.root.findAll((n) => n.type === View && flat(n.props.style).borderBottomWidth === 1);
      expect(header.length).toBeGreaterThan(0);
      expect(flat(header[0].props.style).paddingBottom).toBe(2);
    });

    it('the row keeps space above and below its text, so 1.3× text grows the header instead of touching its edges', () => {
      const tree = mount();
      expect(flat(headerRow(tree).props.style)).toMatchObject({ paddingVertical: 4 });
    });

    it('Back and Music keep 44pt targets and never shrink; the name column takes what is left and truncates', () => {
      const tree = mount();
      for (const label of ['Back to Train', 'Music']) {
        expect(flat(pressable(tree, label).props.style)).toMatchObject({ width: 44, height: 44, flexShrink: 0 });
      }
      expect(flat(nameColumn(tree).props.style)).toMatchObject({ flex: 1, minWidth: 0 });
      expect(textWith(tree, 'Push A')[0].props.numberOfLines).toBe(1);
    });

    it('the header grows taller with its text: no fixed height on it', () => {
      const tree = mount();
      const row = headerRow(tree);
      expect(flat(row.props.style)).toMatchObject({ minHeight: 56, alignItems: 'center' });
      expect(flat(row.props.style).height).toBeUndefined();
      for (const header of tree.root.findAll((n) => n.type === View && flat(n.props.style).borderBottomWidth === 1)) {
        expect(flat(header.props.style).height).toBeUndefined();
      }
      expect(flat(nameColumn(tree).props.style).height).toBeUndefined();
    });

    it('the time is never cut: the count shrinks first', () => {
      const tree = mount();
      expect(flat(textWith(tree, '2/4 sets')[0].props.style)).toMatchObject({ flexShrink: 1 });
      expect(flat(textWith(tree, '\u00a0· 0:01')[0].props.style)).toMatchObject({ flexShrink: 0 });
      expect(flat(lineRow(tree).props.style)).toMatchObject({ flexDirection: 'row', minWidth: 0 });
    });

    it("Music's and Finish's touch areas don't overlap", () => {
      const tree = mount();
      const music = pressable(tree, 'Music');
      const finish = finishButtons(tree)[0].findAll((n) => n.props.hitSlop !== undefined)[0];
      const gap =
        (flat(headerRow(tree).props.style).gap ?? 0) + (flat(music.props.style).marginRight ?? 0) + (flat(finish.props.style).marginLeft ?? 0);
      expect(gap).toBeGreaterThanOrEqual(music.props.hitSlop + finish.props.hitSlop);
    });
  });
});

describe('Back to Train returns to the Train screen already there, without stacking another (R78)', () => {
  beforeEach(() => {
    jest.mocked(router.dismissTo).mockClear();
    jest.mocked(router.back).mockClear();
  });

  it('the header back button leaves the workout running and goes back to Train', () => {
    const tree = mount();
    const back = tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to Train' && typeof n.props.onPress === 'function');
    act(() => back[0].props.onPress());

    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it('with no workout in progress, its Back to Train does the same', () => {
    mockState.workout = null;
    const tree = mount();
    expect(shownText(tree)).toContain('No workout in progress.');
    const button = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Back to Train');
    expect(button).toHaveLength(1);
    act(() => button[0].props.onPress());

    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('the Short on food offer slot (phase 5, §7.10)', () => {
  it('sits directly under the session header, outside the scroll, above the first exercise', () => {
    const tree = mount();
    const slot = tree.root.findAll((n) => n.props.testID === 'food-offer-slot' && n.type === Text);
    expect(slot).toHaveLength(1);
    expect(slot[0].props.children).toBe('offer for w1');
    // Outside the ScrollView that holds the exercises.
    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.findAll((n) => n.props.testID === 'food-offer-slot')).toHaveLength(0);
    // Among the screen's own children: right after the header, right before the scroll.
    const screen = scroll.parent!;
    const kids = screen.children as unknown as { props: Record<string, unknown> }[];
    const at = kids.indexOf(scroll as unknown as (typeof kids)[number]);
    expect(kids[at - 1].props.workoutId).toBe('w1'); // the Rough sleep offer (phase 7)
    expect(kids[at - 2].props.workoutId).toBe('w1');
    expect(kids[at - 3].props).toMatchObject({ name: 'Push A', startedAt: 1_000 });
  });
});
