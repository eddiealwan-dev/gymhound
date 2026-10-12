import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import WorkoutDetailRoute from '../../app/(tabs)/history/[id]';
import { ActiveWorkoutExistsError, getActiveWorkoutId } from '../db/repositories/activeWorkout';
import { getWorkoutDetail, startRepeatWorkout } from '../db/repositories/historyRepo';
import type { WorkoutDetail, WorkoutDetailSet } from '../db/repositories/historyRepo';
import { hasDoneSets, savedWorkoutOf, saveWorkoutAs } from '../db/repositories/savedWorkoutsRepo';
import { deleteHistoryWorkout } from '../state/historyActions';
import { bumpData } from '../state/dataVersion';
import { flushAll } from '../state/draftFlush';
import { Button } from './Button';
import { Footer } from './Footer';
import { nextLinesFor } from './history/DetailExercise';
import { SupersetBar } from './SupersetBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Phase 6 Task 8 (R165, R171): a finished workout's detail, with Repeat, Edit, Save as a workout and Delete workout.
 */

let mockId: string;
let mockCanGoBack: boolean;
/** Blurs the screen, as leaving it for another does: the focus effect's cleanup. */
let mockBlur: (() => void) | undefined;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => mockCanGoBack) },
  // Focus on mount, blur on unmount, as a screen the navigator shows and then removes.
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- inside a mock factory
    const { useEffect } = require('react') as typeof import('react');
    useEffect(() => {
      const cleanup = effect();
      mockBlur = cleanup;
      return cleanup;
    }, [effect]);
  },
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: function Ionicons() { return null; } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useFocusedDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../state/historyActions', () => ({ deleteHistoryWorkout: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: () => ({ unit: 'lb' }) }));
jest.mock('../db/repositories/historyRepo', () => ({ getWorkoutDetail: jest.fn(), startRepeatWorkout: jest.fn() }));
jest.mock('../db/repositories/activeWorkout', () => ({
  ...jest.requireActual('../db/repositories/activeWorkout'),
  getActiveWorkoutId: jest.fn(),
}));
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({ savedWorkoutOf: jest.fn(), saveWorkoutAs: jest.fn(), hasDoneSets: jest.fn() }));
jest.mock('../platform/sharePb', () => ({ canSharePb: jest.fn(async () => false), sharePbImage: jest.fn() }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text), focusOn: jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const RED = '#E10600';

function set(partial: Partial<WorkoutDetailSet> & { id: string }): WorkoutDetailSet {
  return { setType: 'working', weight: null, weightUnit: null, reps: null, rpe: null, durationS: null, distance: null, distanceUnit: null, prFlags: 0, ...partial };
}

/** Push A, finished on Friday 9 October at 6:05 PM, 48 minutes long, from Upper/Lower's Upper A. */
function pushA(): WorkoutDetail {
  return {
    summary: {
      id: 'w1',
      name: 'Push A',
      durationMs: 48 * 60_000,
      volume: 12340,
      setCount: 6,
      next: [
        { workoutExerciseId: 'we1', name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 190, nextUnit: 'lb', mark: null },
        { workoutExerciseId: 'we3', name: 'Triceps pushdown', loggingType: 'weighted', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
      ],
      prs: [
        { exerciseId: 'bench', name: 'Barbell bench press', loggingType: 'weighted', kind: 'heaviest', weight: 185, weightUnit: 'lb', reps: 5, durationS: null, localDate: '2026-10-09' },
      ],
    },
    localDate: '2026-10-09',
    startedAt: new Date(2026, 9, 9, 18, 5).getTime(),
    routineName: 'Upper/Lower',
    dayName: 'Upper A',
    exercises: [
      {
        workoutExerciseId: 'we1',
        exerciseId: 'bench',
        name: 'Barbell bench press',
        loggingType: 'weighted',
        supersetGroup: null,
        mark: null,
        note: 'Elbows in, feet planted.',
        showRpe: true,
        sets: [
          set({ id: 's1', setType: 'warmup', weight: 95, weightUnit: 'lb', reps: 10 }),
          set({ id: 's2', weight: 185, weightUnit: 'lb', reps: 5, prFlags: 1 }),
          set({ id: 's3', weight: 185, weightUnit: 'lb', reps: 5, rpe: 8 }),
        ],
      },
      {
        workoutExerciseId: 'we2',
        exerciseId: 'fly',
        name: 'Cable fly',
        loggingType: 'weighted',
        supersetGroup: 1,
        mark: 'rough_sleep',
        note: null,
        showRpe: false,
        sets: [set({ id: 's4', weight: 30, weightUnit: 'lb', reps: 12 })],
      },
      {
        workoutExerciseId: 'we3',
        exerciseId: 'pushdown',
        name: 'Triceps pushdown',
        loggingType: 'weighted',
        supersetGroup: 1,
        mark: null,
        note: null,
        showRpe: false,
        sets: [set({ id: 's5', weight: 50, weightUnit: 'lb', reps: 10 }), set({ id: 's6', setType: 'drop', weight: 30, weightUnit: 'lb', reps: 12 })],
      },
    ],
  };
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<WorkoutDetailRoute />);
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

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);

function press(tree: ReactTestRenderer, label: string, index = 0) {
  const found = buttons(tree, label);
  if (found.length <= index) throw new Error(`No button "${label}" (${shownText(tree).join(' | ')})`);
  act(() => found[index].props.onPress());
}

/** The element the screen reader hears with this label. */
const spoken = (tree: ReactTestRenderer, label: string) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label);

/** The Text nodes whose own string is exactly `s`. */
const textNodes = (tree: ReactTestRenderer, s: string) => tree.root.findAll((n) => n.type === Text && n.props.children === s);

/** The control the screen reader hears as `label`, that does something when pressed. */
const control = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

const flatColor = (n: ReactTestInstance) => StyleSheet.flatten(n.props.style)?.color;

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 11, 12, 0));
  jest.clearAllMocks();
  mockId = 'w1';
  mockCanGoBack = true;
  jest.mocked(getWorkoutDetail).mockImplementation((_db, id) => (id === 'w1' ? pushA() : null));
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(startRepeatWorkout).mockReturnValue('w2');
  jest.mocked(savedWorkoutOf).mockReturnValue(null);
  jest.mocked(hasDoneSets).mockReturnValue(true);
});

afterEach(() => jest.useRealTimers());

describe('History detail (R165)', () => {
  it('shows the name, when it was, how long it took, the routine day, the volume and set count, with no footer', () => {
    const tree = mount();
    const shown = shownText(tree);
    expect(shown).toContain('Push A');
    expect(shown.some((s) => /^Fri, Oct 9 · 6:05\sPM · 48 min$/u.test(s))).toBe(true);
    expect(shown).toContain('Upper/Lower · Upper A');
    expect(shown).toContain('12,340 lb · 6 sets');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
    expect(jest.mocked(getWorkoutDetail)).toHaveBeenCalledWith('db', 'w1', 'lb');
  });

  it('leaves out the routine line for a workout not started from a routine, and says "1 set"', () => {
    jest.mocked(getWorkoutDetail).mockReturnValue({ ...pushA(), routineName: null, dayName: null, summary: { ...pushA().summary, setCount: 1, volume: 0 } });
    const shown = shownText(mount());
    expect(shown.some((s) => s.includes('Upper/Lower'))).toBe(false);
    expect(shown).toContain('1 set');
  });

  it('labels the sets W, 1, 2 and D, writes each as Previous does with its RPE, and marks only the flagged set PR in red', () => {
    const tree = mount();
    const shown = shownText(tree);
    expect(shown).toEqual(expect.arrayContaining(['W', '1', '2', 'D', '95 × 10', '185 × 5', '185 × 5 @ 8', '30 × 12']));
    const marks = textNodes(tree, 'PR');
    // One in the set rows, one in Personal bests.
    expect(marks).toHaveLength(2);
    for (const m of marks) expect(flatColor(m)).toBe(RED);
    expect(spoken(tree, 'Set 1, 185 by 5, personal best')).toHaveLength(1);
    expect(spoken(tree, 'Set 2, 185 by 5, RPE 8')).toHaveLength(1);
    expect(spoken(tree, 'Warmup, 95 by 10')).toHaveLength(1);
    expect(spoken(tree, 'Drop set, 30 by 12')).toHaveLength(1);
  });

  it('nothing else is red', () => {
    const tree = mount();
    const red = tree.root.findAll((n) => typeof n.type === 'string' && JSON.stringify(StyleSheet.flatten(n.props.style) ?? {}).includes(RED));
    expect(red.every((n) => n.props.children === 'PR')).toBe(true);
  });

  it('shows the note saved with the workout, read-only, led by the pencil', () => {
    const tree = mount();
    expect(shownText(tree)).toContain('Elbows in, feet planted.');
    const pencils = tree.root.findAll((n) => typeof n.type === 'function' && n.props.name === 'pencil');
    expect(pencils).toHaveLength(1);
    expect(pencils[0].props).toMatchObject({ size: 14, color: '#a39d90' });
    expect(spoken(tree, 'Note: Elbows in, feet planted.')).toHaveLength(1);
    // Read-only: nothing to press on the note.
    expect(spoken(tree, 'Note: Elbows in, feet planted.')[0].props.onPress).toBeUndefined();
  });

  it('says what was off for a marked exercise', () => {
    expect(shownText(mount())).toContain('Something off: Rough sleep');
  });

  it("puts each exercise's next-time line under it, and the superset under one bar", () => {
    const tree = mount();
    const shown = shownText(tree);
    expect(shown).toContain('Barbell bench press — next time 190 lb ↑');
    expect(shown).toContain('Triceps pushdown — holds at 50 lb');
    expect(shown.indexOf('Barbell bench press — next time 190 lb ↑')).toBeLessThan(shown.indexOf('Cable fly'));
    expect(shown.indexOf('Triceps pushdown — holds at 50 lb')).toBeGreaterThan(shown.indexOf('Triceps pushdown'));
    const bars = tree.root.findAllByType(SupersetBar);
    expect(bars).toHaveLength(1);
    const inBar = bars[0].findAll((n) => n.type === Text).map((n) => n.props.children);
    expect(inBar).toEqual(expect.arrayContaining(['Cable fly', 'Triceps pushdown']));
  });

  it('shows the personal bests', () => {
    const shown = shownText(mount());
    expect(shown).toContain('Personal bests');
    expect(shown).toContain('Barbell bench press — heaviest: 185 lb × 5');
  });

  it('has Repeat, Edit, Save as a workout and Delete workout, in that order', () => {
    const shown = shownText(mount());
    const order = ['Repeat', 'Edit', 'Save as a workout', 'Delete workout'].map((l) => shown.indexOf(l));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('Save as a workout offers the button even for a workout started from a saved one, with no "remembers today\'s sets" line', () => {
    jest.mocked(savedWorkoutOf).mockReturnValue({ id: 's1', name: 'Push day' });
    const tree = mount();
    const shown = shownText(tree);
    expect(shown.some((s) => s.includes('remembers'))).toBe(false);
    press(tree, 'Save as a workout');
    press(tree, 'Save');
    expect(saveWorkoutAs).toHaveBeenCalledWith('db', 'w1', 'Push A', expect.any(Number));
    expect(shownText(tree)).toContain('Saved as Push A.');
  });

  it('Edit opens the editor', () => {
    const tree = mount();
    press(tree, 'Edit');
    expect(flushAll).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({ pathname: '/history/edit/[id]', params: { id: 'w1' } });
  });

  it('Back goes back, or to History when opened with nothing to go back to', () => {
    let tree = mount();
    act(() => control(tree, 'Back to History').props.onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    tree = mount();
    act(() => control(tree, 'Back to History').props.onPress());
    expect(router.navigate).toHaveBeenCalledWith('/history');
  });
});

describe('Repeat (R171)', () => {
  it('starts a copy and opens the session', () => {
    const tree = mount();
    press(tree, 'Repeat');
    expect(flushAll).toHaveBeenCalled();
    expect(startRepeatWorkout).toHaveBeenCalledWith('db', 'w1', expect.any(Number));
    expect(bumpData).toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('with a workout in progress opens "Workout in progress" and starts nothing; Resume opens the session', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('active');
    const tree = mount();
    press(tree, 'Repeat');
    expect(startRepeatWorkout).not.toHaveBeenCalled();
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Workout in progress', 'Finish or discard the workout in progress before starting another.']));
    press(tree, 'Resume');
    act(() => jest.runAllTimers());
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('a workout started meanwhile (the repository refuses) also opens "Workout in progress"', () => {
    jest.mocked(startRepeatWorkout).mockImplementation(() => {
      throw new ActiveWorkoutExistsError();
    });
    const tree = mount();
    press(tree, 'Repeat');
    expect(shownText(tree)).toContain('Workout in progress');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('any other failure says "Couldn\'t start. Try again." and announces it', () => {
    jest.mocked(startRepeatWorkout).mockImplementation(() => {
      throw new Error('disk');
    });
    const tree = mount();
    press(tree, 'Repeat');
    expect(shownText(tree)).toContain("Couldn't start. Try again.");
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't start. Try again.");
    expect(router.push).not.toHaveBeenCalled();
    expect(bumpData).not.toHaveBeenCalled();
  });
});

describe('Delete workout', () => {
  it('asks first; Keep changes nothing', () => {
    const tree = mount();
    press(tree, 'Delete workout');
    expect(shownText(tree)).toEqual(
      expect.arrayContaining([
        'Delete this workout?',
        'Its sets leave your history and stats. Next time\'s weights are worked out again from the workouts left.',
      ]),
    );
    press(tree, 'Keep');
    act(() => jest.runAllTimers());
    expect(deleteHistoryWorkout).not.toHaveBeenCalled();
    expect(shownText(tree)).not.toContain('Delete this workout?');
  });

  it('Delete, once the sheet has closed, deletes, announces and goes back, still showing the workout on its way out', () => {
    const tree = mount();
    press(tree, 'Delete workout');
    press(tree, 'Delete');
    expect(shownText(tree)).not.toContain('Delete this workout?');
    expect(deleteHistoryWorkout).not.toHaveBeenCalled();
    jest.mocked(getWorkoutDetail).mockReturnValue(null);
    act(() => jest.runAllTimers());
    expect(deleteHistoryWorkout).toHaveBeenCalledWith('db', 'w1');
    expect(mockAnnounce).toHaveBeenCalledWith('Workout deleted.');
    expect(router.back).toHaveBeenCalledTimes(1);
    // A re-read after the delete finds nothing; the screen keeps the workout rather than flash "isn't in your history".
    act(() => tree.update(<WorkoutDetailRoute />));
    expect(shownText(tree)).toContain('Push A');
  });

  it('a failed delete says "Couldn\'t delete. Try again.", announces it and stays', () => {
    jest.mocked(deleteHistoryWorkout).mockImplementation(() => {
      throw new Error('disk');
    });
    const tree = mount();
    press(tree, 'Delete workout');
    press(tree, 'Delete');
    act(() => jest.runAllTimers());
    expect(shownText(tree)).toContain("Couldn't delete. Try again.");
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't delete. Try again.");
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('a workout that is not in the history', () => {
  it('says so, with the way back and no actions', () => {
    mockId = 'gone';
    const tree = mount();
    expect(shownText(tree)).toContain("This workout isn't in your history.");
    expect(spoken(tree, 'Back to History')).toHaveLength(1);
    expect(buttons(tree, 'Repeat')).toHaveLength(0);
    expect(buttons(tree, 'Delete workout')).toHaveLength(0);
  });
});

describe('nextLinesFor', () => {
  const line = (workoutExerciseId: string, name: string) => ({ workoutExerciseId, name, loggingType: 'weighted' as const, outcome: 'held' as const, nextWeight: 100, nextUnit: 'lb' as const, mark: null });

  it("puts each of the summary's lines under its own block, leaving out those without one", () => {
    expect(nextLinesFor([{ workoutExerciseId: 'a' }, { workoutExerciseId: 'b' }], [line('b', 'Plank')])).toEqual([null, 'Plank — holds at 100 lb']);
    expect(nextLinesFor([{ workoutExerciseId: 'a' }], [])).toEqual([null]);
  });

  it('with the same exercise twice, a line only the second block has goes under the second', () => {
    expect(nextLinesFor([{ workoutExerciseId: 'a' }, { workoutExerciseId: 'b' }], [line('b', 'Squat')])).toEqual([null, 'Squat — holds at 100 lb']);
  });
});

describe('the same exercise twice in one workout', () => {
  it('shows the next-time line under the block it belongs to', () => {
    const detail = pushA();
    const second = { ...detail.exercises[0], workoutExerciseId: 'we4', note: null, sets: [set({ id: 's7', weight: 135, weightUnit: 'lb', reps: 12 })] };
    detail.exercises = [detail.exercises[0], detail.exercises[1], second];
    detail.summary.next = [{ workoutExerciseId: 'we4', name: 'Barbell bench press', loggingType: 'weighted', outcome: 'held', nextWeight: 135, nextUnit: 'lb', mark: null }];
    jest.mocked(getWorkoutDetail).mockReturnValue(detail);
    const shown = shownText(mount());
    const at = shown.indexOf('Barbell bench press — holds at 135 lb');
    expect(at).toBeGreaterThan(shown.indexOf('135 × 12'));
    expect(at).toBeGreaterThan(shown.indexOf('Cable fly'));
  });
});

describe('VoiceOver', () => {
  it('says a timed set in words, and each exercise name is a heading', () => {
    const detail = pushA();
    detail.exercises = [
      {
        workoutExerciseId: 'we9',
        exerciseId: 'plank',
        name: 'Plank',
        loggingType: 'timed',
        supersetGroup: null,
        mark: null,
        note: null,
        showRpe: false,
        sets: [set({ id: 't1', durationS: 40 }), set({ id: 't2', durationS: 90, rpe: 9 })],
      },
      {
        workoutExerciseId: 'we10',
        exerciseId: 'carry',
        name: 'Farmer carry',
        loggingType: 'weighted_time',
        supersetGroup: null,
        mark: null,
        note: null,
        showRpe: false,
        sets: [set({ id: 't3', weight: 70, weightUnit: 'lb', durationS: 60 })],
      },
    ];
    jest.mocked(getWorkoutDetail).mockReturnValue(detail);
    const tree = mount();
    expect(spoken(tree, 'Set 1, 40 seconds')).toHaveLength(1);
    expect(spoken(tree, 'Set 2, 1 minute 30 seconds, RPE 9')).toHaveLength(1);
    expect(spoken(tree, 'Set 1, 70 lb by 1 minute')).toHaveLength(1);
    for (const name of ['Plank', 'Farmer carry']) {
      expect(textNodes(tree, name)[0].props.accessibilityRole).toBe('header');
    }
  });
});

describe('the screen stays mounted across workouts', () => {
  beforeEach(() => {
    jest.mocked(getWorkoutDetail).mockImplementation((_db, id) => (id === 'w1' || id === 'w9' ? pushA() : null));
  });

  it('a new id after a save shows the button again, with no "Saved as" line', () => {
    const tree = mount();
    press(tree, 'Save as a workout');
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Saved as Push A.');
    mockId = 'w9';
    act(() => tree.update(<WorkoutDetailRoute />));
    expect(shownText(tree)).not.toContain('Saved as Push A.');
    expect(buttons(tree, 'Save as a workout')).toHaveLength(1);
  });

  it('a failed delete holds nothing, and a new id shows no failure line', () => {
    jest.mocked(deleteHistoryWorkout).mockImplementation(() => {
      throw new Error('disk');
    });
    const tree = mount();
    press(tree, 'Delete workout');
    press(tree, 'Delete');
    act(() => jest.runAllTimers());
    expect(shownText(tree)).toContain("Couldn't delete. Try again.");
    // Nothing was deleted, so nothing is held: a read that finds no workout says so.
    jest.mocked(getWorkoutDetail).mockImplementation((_db, id) => (id === 'w9' ? pushA() : null));
    act(() => tree.update(<WorkoutDetailRoute />));
    expect(shownText(tree)).toContain("This workout isn't in your history.");
    mockId = 'w9';
    act(() => tree.update(<WorkoutDetailRoute />));
    expect(shownText(tree)).toContain('Push A');
    expect(shownText(tree)).not.toContain("Couldn't delete. Try again.");
  });

  it('an open sheet does not follow to a new id', () => {
    const tree = mount();
    press(tree, 'Delete workout');
    expect(shownText(tree)).toContain('Delete this workout?');
    mockId = 'w9';
    act(() => tree.update(<WorkoutDetailRoute />));
    expect(shownText(tree)).not.toContain('Delete this workout?');
  });
});

describe('leaving during the wait for the sheet to close', () => {
  it('unmounted: the workout is still deleted, but nothing navigates', () => {
    const tree = mount();
    press(tree, 'Delete workout');
    press(tree, 'Delete');
    act(() => tree.unmount());
    act(() => jest.runAllTimers());
    expect(deleteHistoryWorkout).toHaveBeenCalledWith('db', 'w1');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('out of focus: the workout is still deleted, but nothing navigates', () => {
    const tree = mount();
    press(tree, 'Delete workout');
    press(tree, 'Delete');
    act(() => mockBlur?.());
    act(() => jest.runAllTimers());
    expect(deleteHistoryWorkout).toHaveBeenCalledWith('db', 'w1');
    expect(router.back).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

describe('Repeat starts once', () => {
  it('a second tap while it starts does nothing', () => {
    const tree = mount();
    const repeatButton = buttons(tree, 'Repeat')[0];
    act(() => {
      repeatButton.props.onPress();
      repeatButton.props.onPress();
    });
    expect(startRepeatWorkout).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain('Workout in progress');
  });

  it('after a failure it can be tried again', () => {
    jest.mocked(startRepeatWorkout).mockImplementationOnce(() => {
      throw new Error('disk');
    });
    const tree = mount();
    press(tree, 'Repeat');
    press(tree, 'Repeat');
    expect(startRepeatWorkout).toHaveBeenCalledTimes(2);
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('after the in-progress sheet it can be tried again', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValueOnce('active');
    const tree = mount();
    press(tree, 'Repeat');
    press(tree, 'Not now');
    press(tree, 'Repeat');
    expect(startRepeatWorkout).toHaveBeenCalledTimes(1);
  });
});
