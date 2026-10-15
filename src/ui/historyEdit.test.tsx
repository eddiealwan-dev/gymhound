/** @jest-environment node */
import { asc, eq } from 'drizzle-orm';
import { router } from 'expo-router';
import { BackHandler, StyleSheet, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import EditWorkout from '../../app/(tabs)/history/edit/[id]';
import { exercises, sets, workoutExercises, workouts } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { setSetting } from '../db/repositories/settingsRepo';
import { addExerciseToWorkout, addSet } from '../db/repositories/workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { PR_BIT } from '../domain/prs';
import type { WeightUnit } from '../domain/types';
import { takeSnapshotSafely } from '../state/backup';
import { leaveGuarded } from '../state/leaveGuard';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the editor reads the draft and saves through the history repository, which re-runs the rule and the
// PR check, as on the phone.
let mockDb: Db;
let mockId: string;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
    useLocalSearchParams: () => ({ id: mockId }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), [effect]);
    },
  };
});
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../state/backup', () => ({ takeSnapshotSafely: jest.fn() }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({
  ...jest.requireActual('../platform/announce'),
  announce: (text: string) => mockAnnounce(text),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Thursday 1 October 2026, 9:00 local. */
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();
const NOW = new Date(2026, 9, 11, 12, 0).getTime();
const BENCH = 'barbell-bench-press';
const PLANK = 'plank';
const BENCH_NAME = 'Barbell bench press';

type Lift = { weight?: number | null; reps?: number | null; durationS?: number | null; unit?: WeightUnit };

/** An empty workout at `start` with one block per entry, every set ticked; finished an hour later. */
function workout(db: Db, start: number, blocks: [exerciseId: string, lifts: Lift[]][]): string {
  const id = startEmptyWorkout(db, start);
  let at = start;
  for (const [exerciseId, lifts] of blocks) {
    const weId = addExerciseToWorkout(db, id, exerciseId);
    for (let i = 1; i < lifts.length; i++) addSet(db, weId);
    const ids = getActiveWorkoutView(db)!.exercises.find((e) => e.id === weId)!.sets.map((s) => s.id);
    lifts.forEach((l, i) =>
      tickSet(db, ids[i], { weight: l.weight ?? null, reps: l.reps ?? null, durationS: l.durationS ?? null, distance: null }, l.unit ?? 'lb', (at += MINUTE), 'mi'),
    );
  }
  finishWorkout(db, id, start + HOUR);
  return id;
}

function setsOf(db: Db, workoutId: string, exerciseId: string) {
  const block = db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).all().find((b) => b.exerciseId === exerciseId);
  if (!block) return [];
  return db.select().from(sets).where(eq(sets.workoutExerciseId, block.id)).orderBy(asc(sets.position)).all();
}

const blockOf = (db: Db, workoutId: string, exerciseId: string) =>
  db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, workoutId)).all().find((b) => b.exerciseId === exerciseId);

type BackPress = Parameters<typeof BackHandler.addEventListener>[1];
let backPress: BackPress | null;

beforeEach(() => {
  mockDb = seededDb('us');
  setSetting(mockDb, 'unit', 'lb');
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.mocked(router.back).mockClear();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(router.canGoBack).mockReturnValue(true);
  mockAnnounce.mockClear();
  backPress = null;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backPress = handler;
    return { remove: () => (backPress === handler ? (backPress = null) : undefined) } as ReturnType<typeof BackHandler.addEventListener>;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function mount(id: string): ReactTestRenderer {
  mockId = id;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<EditWorkout />);
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
const shown = (tree: ReactTestRenderer) => shownText(tree).join('');

function press(tree: ReactTestRenderer, label: string, index = 0) {
  const found = tree.root.findAllByType(Button).filter((b) => b.props.label === label || b.props.accessibilityLabel === label);
  if (found.length > 0) {
    act(() => found[index].props.onPress());
    return;
  }
  const other = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[index];
  if (!other) throw new Error(`No button "${label}"`);
  act(() => other.props.onPress());
}

const field = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAllByType(TextInput).filter((t) => t.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`No field "${label}"`);
  return found[0];
};

/** Types `text` into a field, then leaves it. */
function typeInto(tree: ReactTestRenderer, label: string, text: string) {
  const f = field(tree, label);
  act(() => f.props.onChangeText(text));
  act(() => field(tree, label).props.onBlur?.());
}

/** Lets a sheet close and what waits for it run. */
function afterSheet() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
}

describe('the history editor', () => {
  it('shows the workout name and date, each exercise, and a header with no Previous column', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]], [PLANK, [{ durationS: 60 }]]]);
    const tree = mount(id);
    const text = shownText(tree);
    expect(text).toContain('Edit workout');
    expect(shown(tree)).toContain('Workout · Thu, Oct 1');
    expect(text).toContain(BENCH_NAME);
    expect(text).toContain('Plank');
    expect(text).toContain('LB');
    expect(text).toContain('REPS');
    expect(text).toContain('TIME');
    expect(text).not.toContain('PREVIOUS');
    expect(field(tree, `${BENCH_NAME}, set 1, weight in lb`).props.value).toBe('135');
    expect(field(tree, `${BENCH_NAME}, set 1, reps`).props.value).toBe('5');
    expect(field(tree, 'Plank, set 1, time').props.value).toBe('1:00');
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Cancel' && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
  });

  it('a missing or unfinished id says it is not in your history', () => {
    const tree = mount('nope');
    expect(shownText(tree)).toContain("That workout isn't here.");
    jest.mocked(router.canGoBack).mockReturnValue(false);
    press(tree, 'Cancel');
    expect(router.navigate).toHaveBeenCalledWith('/history');
    const active = startEmptyWorkout(mockDb, NOW);
    const tree2 = mount(active);
    expect(shownText(tree2)).toContain("That workout isn't here.");
  });

  it('changing reps and saving writes them, re-runs the PR check, announces Saved. and goes back', () => {
    workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const later = workout(mockDb, OCT_1 + DAY, [[BENCH, [{ weight: 140, reps: 5 }]]]);
    expect(setsOf(mockDb, later, BENCH)[0].prFlags & PR_BIT.heaviest).toBeTruthy();
    const tree = mount(later);
    typeInto(tree, `${BENCH_NAME}, set 1, weight in lb`, '130');
    typeInto(tree, `${BENCH_NAME}, set 1, reps`, '3');
    press(tree, 'Save');
    const [s] = setsOf(mockDb, later, BENCH);
    expect([s.weight, s.weightUnit, s.reps]).toEqual([130, 'lb', 3]);
    expect(s.prFlags).toBe(0);
    expect(mockAnnounce).toHaveBeenCalledWith('Saved.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('"82,5" saves 82.5', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 80, reps: 5 }]]]);
    const tree = mount(id);
    typeInto(tree, `${BENCH_NAME}, set 1, weight in lb`, '82,5');
    expect(shownText(tree)).not.toContain('Check this number');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, BENCH)[0].weight).toBe(82.5);
  });

  it('a set logged in kg stays kg while the display unit is lb, its unit shown', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 60, reps: 5, unit: 'kg' }]]]);
    const tree = mount(id);
    const label = `${BENCH_NAME}, set 1, weight in kg`;
    expect(field(tree, label).props.value).toBe('60 kg');
    typeInto(tree, label, '62,5 kg');
    expect(shownText(tree)).not.toContain('Check this number');
    press(tree, 'Save');
    const [s] = setsOf(mockDb, id, BENCH);
    expect([s.weight, s.weightUnit]).toEqual([62.5, 'kg']);
  });

  it('a new set takes the display unit', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 60, reps: 5, unit: 'kg' }]]]);
    const tree = mount(id);
    press(tree, `Add a set to ${BENCH_NAME}`);
    typeInto(tree, `${BENCH_NAME}, set 2, weight in lb`, '135');
    typeInto(tree, `${BENCH_NAME}, set 2, reps`, '5');
    press(tree, `${BENCH_NAME}, set 2 done`);
    press(tree, 'Save');
    const rows = setsOf(mockDb, id, BENCH);
    expect(rows.map((s) => [s.weight, s.weightUnit, s.reps])).toEqual([
      [60, 'kg', 5],
      [135, 'lb', 5],
    ]);
  });

  it('an invalid number shows "Check this number" once left, and blocks Save', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    const label = `${BENCH_NAME}, set 1, reps`;
    act(() => field(tree, label).props.onChangeText('5x'));
    expect(shownText(tree)).not.toContain('Check this number');
    act(() => field(tree, label).props.onBlur());
    expect(shown(tree)).toContain('Check this number');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, BENCH)[0].reps).toBe(5);
    expect(router.back).not.toHaveBeenCalled();
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
  });

  it('a ticked set without reps shows "Add reps to complete set" and the muted line, announced, and saves nothing', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    typeInto(tree, `${BENCH_NAME}, set 1, reps`, '');
    expect(shownText(tree)).not.toContain('Add reps to complete set');
    press(tree, 'Save');
    expect(shown(tree)).toContain('Add reps to complete set');
    expect(shownText(tree)).toContain('Some completed sets need a value.');
    expect(mockAnnounce).toHaveBeenCalledWith('Some completed sets need a value.');
    expect(setsOf(mockDb, id, BENCH)[0].reps).toBe(5);
    // Filling it in clears the line.
    typeInto(tree, `${BENCH_NAME}, set 1, reps`, '6');
    expect(shown(tree)).not.toContain('Add reps to complete set');
    expect(shownText(tree)).not.toContain('Some completed sets need a value.');
  });

  it('unticking every set opens "Nothing would be left"; Delete workout deletes it and goes to History', () => {
    jest.useFakeTimers();
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 1 done`);
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Nothing would be left');
    expect(shownText(tree)).toContain('Keep at least one set complete, or delete the workout.');
    expect(mockDb.select().from(workouts).where(eq(workouts.id, id)).get()).toBeDefined();
    press(tree, 'Delete workout');
    afterSheet();
    expect(mockDb.select().from(workouts).where(eq(workouts.id, id)).get()).toBeUndefined();
    expect(mockAnnounce).toHaveBeenCalledWith('Workout deleted.');
    expect(router.navigate).toHaveBeenCalledWith('/history');
  });

  it('Keep editing on "Nothing would be left" keeps the workout and the draft', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 1 done`);
    press(tree, 'Save');
    press(tree, 'Keep editing');
    expect(shownText(tree)).not.toContain('Nothing would be left');
    expect(mockDb.select().from(workouts).where(eq(workouts.id, id)).get()).toBeDefined();
    expect(setsOf(mockDb, id, BENCH)[0].done).toBe(true);
  });

  it('Remove set from the set sheet removes it on Save', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }, { weight: 135, reps: 4 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 1`);
    expect(shownText(tree)).toContain('Set type');
    press(tree, 'Remove set');
    expect(() => field(tree, `${BENCH_NAME}, set 2, reps`)).toThrow();
    expect(field(tree, `${BENCH_NAME}, set 1, reps`).props.value).toBe('4');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, BENCH).map((s) => s.reps)).toEqual([4]);
  });

  it('changing a set to a warmup saves its type, and the PR flag leaves it', () => {
    workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const id = workout(mockDb, OCT_1 + DAY, [[BENCH, [{ weight: 95, reps: 5 }, { weight: 140, reps: 5 }]]]);
    expect(setsOf(mockDb, id, BENCH)[1].prFlags).not.toBe(0);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 2`);
    press(tree, 'Warmup');
    expect(field(tree, `${BENCH_NAME}, set W, reps`).props.value).toBe('5');
    press(tree, 'Save');
    const rows = setsOf(mockDb, id, BENCH);
    expect(rows[1].setType).toBe('warmup');
    expect(rows[1].prFlags).toBe(0);
  });

  it('Something off: Pain saves the mark; Pain then Nothing off leaves nothing to save', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `Something off for ${BENCH_NAME}`);
    press(tree, 'Pain');
    expect(shownText(tree)).toContain('Pain');
    press(tree, `Something off for ${BENCH_NAME}: Pain`);
    press(tree, 'Nothing off');
    // Back to as saved: Cancel leaves at once.
    press(tree, 'Cancel');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(router.back).toHaveBeenCalledTimes(1);

    const tree2 = mount(id);
    press(tree2, `Something off for ${BENCH_NAME}`);
    press(tree2, 'Pain');
    press(tree2, 'Save');
    expect(blockOf(mockDb, id, BENCH)!.mark).toBe('pain');
  });

  it('Back with changes asks "Discard changes?": Keep editing stays, Discard leaves', () => {
    jest.useFakeTimers();
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    typeInto(tree, `${BENCH_NAME}, set 1, reps`, '6');
    press(tree, 'Cancel');
    expect(shownText(tree)).toContain('Discard changes?');
    expect(router.back).not.toHaveBeenCalled();
    press(tree, 'Keep editing');
    expect(shownText(tree)).not.toContain('Discard changes?');
    // The Cancel above the title asks too.
    const backLink = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === 'Cancel' && n.type !== Button && typeof n.props.onPress === 'function')[0];
    act(() => backLink.props.onPress());
    expect(shownText(tree)).toContain('Discard changes?');
    press(tree, 'Discard');
    afterSheet();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(setsOf(mockDb, id, BENCH)[0].reps).toBe(5);
    expect(field(tree, `${BENCH_NAME}, set 1, reps`).props.value).toBe('5');
  });

  it('the Android back button and the dock ask too when there are changes, and not when there are none', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    const toTrain = jest.fn();
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
    expect(backPress).not.toBeNull();
    let handled: boolean | null | undefined;
    act(() => {
      handled = (backPress as unknown as () => boolean)();
    });
    expect(handled).toBe(false);

    typeInto(tree, `${BENCH_NAME}, set 1, reps`, '6');
    act(() => {
      handled = (backPress as unknown as () => boolean)();
    });
    expect(handled).toBe(true);
    expect(shownText(tree)).toContain('Discard changes?');
    press(tree, 'Keep editing');
    act(() => leaveGuarded(toTrain));
    expect(toTrain).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).toContain('Discard changes?');
  });

  it('a clean Back leaves at once, to the detail when there is no history to go back to', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    jest.mocked(router.canGoBack).mockReturnValue(false);
    const tree = mount(id);
    press(tree, 'Cancel');
    expect(shownText(tree)).not.toContain('Discard changes?');
    expect(router.navigate).toHaveBeenCalledWith(`/history/${id}`);
  });

  it('"Nothing would be left" makes Keep editing the primary answer (R194)', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 1 done`);
    press(tree, 'Save');
    const variant = (label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.variant;
    expect(variant('Keep editing')).toBe('primary');
    expect(variant('Delete workout')).toBe('secondary');
  });

  it('Save warns before dropping an unticked set that holds a value (R195): Keep editing writes nothing, Save anyway drops it', () => {
    jest.useFakeTimers();
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }, { weight: 135, reps: 4 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 2 done`);
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Some sets will be dropped');
    expect(shownText(tree)).toContain(`${BENCH_NAME} set 2 isn't complete.`);
    expect(tree.root.findAllByType(Button).find((b) => b.props.label === 'Keep editing')!.props.variant).toBe('primary');
    press(tree, 'Keep editing');
    expect(shownText(tree)).not.toContain('Some sets will be dropped');
    expect(setsOf(mockDb, id, BENCH)).toHaveLength(2);
    expect(router.back).not.toHaveBeenCalled();
    press(tree, 'Save');
    press(tree, 'Save anyway');
    afterSheet();
    expect(setsOf(mockDb, id, BENCH).map((s) => s.reps)).toEqual([5]);
    expect(mockAnnounce).toHaveBeenCalledWith('Saved.');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('an unticked set with no value is dropped without a warning', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `Add a set to ${BENCH_NAME}`);
    press(tree, 'Save');
    expect(shownText(tree)).not.toContain('Some sets will be dropped');
    expect(setsOf(mockDb, id, BENCH)).toHaveLength(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('Save warns when an exercise would leave the workout because none of its sets is ticked (R195)', () => {
    jest.useFakeTimers();
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]], [PLANK, [{ durationS: 60 }]]]);
    const tree = mount(id);
    press(tree, 'Plank, set 1 done');
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Plank has no completed sets, so it leaves this workout.');
    press(tree, 'Save anyway');
    afterSheet();
    expect(blockOf(mockDb, id, PLANK)).toBeUndefined();
    expect(setsOf(mockDb, id, BENCH)).toHaveLength(1);
  });

  it('a Save with nothing changed goes back without writing', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    jest.mocked(takeSnapshotSafely).mockClear();
    const tree = mount(id);
    press(tree, 'Save');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(takeSnapshotSafely).not.toHaveBeenCalled();
    expect(mockAnnounce).not.toHaveBeenCalledWith('Saved.');
  });

  it('clearing a kg weight under lb clears its unit: what is typed next is in lb', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 60, reps: 5, unit: 'kg' }]]]);
    const tree = mount(id);
    act(() => field(tree, `${BENCH_NAME}, set 1, weight in kg`).props.onChangeText(''));
    act(() => field(tree, `${BENCH_NAME}, set 1, weight in lb`).props.onChangeText('135'));
    act(() => field(tree, `${BENCH_NAME}, set 1, weight in lb`).props.onBlur());
    press(tree, 'Save');
    const [s] = setsOf(mockDb, id, BENCH);
    expect([s.weight, s.weightUnit]).toEqual([135, 'lb']);
  });

  it('"Check this number" on leaving a field is a polite live region; after Save it is not', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    const label = `${BENCH_NAME}, set 1, reps`;
    act(() => field(tree, label).props.onChangeText('5x'));
    act(() => field(tree, label).props.onBlur());
    const live = () => tree.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite' && n.props.accessibilityLabel === 'Check this number');
    expect(live().length).toBeGreaterThan(0);
    press(tree, 'Save');
    expect(live()).toHaveLength(0);
  });

  it('the Set type sheet has a quiet Cancel that closes it', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `${BENCH_NAME}, set 1`);
    const cancels = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Cancel' && b.props.variant === 'quiet');
    expect(cancels).toHaveLength(1);
    act(() => cancels[0].props.onPress());
    expect(shownText(tree)).not.toContain('Set type');
  });

  it('draws nothing red', () => {
    const id = workout(mockDb, OCT_1, [[BENCH, [{ weight: 135, reps: 5 }]]]);
    const tree = mount(id);
    press(tree, `Something off for ${BENCH_NAME}`);
    const red = tree.root.findAll((n) => {
      const style = StyleSheet.flatten(n.props.style) as Record<string, unknown> | undefined;
      return !!style && Object.values(style).some((v) => typeof v === 'string' && v.toUpperCase() === '#E10600');
    });
    expect(red).toHaveLength(0);
  });
});

describe('the history editor and the three program logging types (R607)', () => {
  /** An exercise of a program type, added the way the seed will add the new exercises (Task 9). */
  /** Adds a program-only exercise for the test; seed 9 already ships some of them (yoke-carry), so an existing row stays. */
  function addProgramExercise(id: string, name: string, loggingType: 'weighted_distance' | 'rounds' | 'for_time'): void {
    mockDb
      .insert(exercises)
      .values({ id, name, aliases: [], primaryMuscles: ['quads'], secondaryMuscles: [], equipment: 'other', pattern: 'carry', loggingType, isCustom: false, createdAt: NOW })
      .onConflictDoNothing()
      .run();
  }

  /** A finished workout with one set of `exerciseId`, ticked with `values`. */
  function oneSet(exerciseId: string, values: { weight?: number; reps?: number; durationS?: number; distance?: number; extraReps?: number }, distanceUnit: 'ft' | 'mi' = 'mi'): string {
    const id = startEmptyWorkout(mockDb, OCT_1);
    const weId = addExerciseToWorkout(mockDb, id, exerciseId);
    const [s] = getActiveWorkoutView(mockDb)!.exercises.find((e) => e.id === weId)!.sets;
    tickSet(
      mockDb,
      s.id,
      { weight: values.weight ?? null, reps: values.reps ?? null, durationS: values.durationS ?? null, distance: values.distance ?? null, extraReps: values.extraReps ?? null },
      'lb',
      OCT_1 + MINUTE,
      distanceUnit,
    );
    finishWorkout(mockDb, id, OCT_1 + HOUR);
    return id;
  }

  it("edits a carry's weight, distance in its own feet (said in full) and optional time; a carry with no distance can't save", () => {
    addProgramExercise('yoke-carry', 'Yoke carry', 'weighted_distance');
    const id = oneSet('yoke-carry', { weight: 315, distance: 50 }, 'ft');
    const tree = mount(id);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['LB', 'FT', 'TIME']));
    expect(field(tree, 'Yoke carry, set 1, weight in lb').props.value).toBe('315');
    expect(field(tree, 'Yoke carry, set 1, distance in feet').props.value).toBe('50 ft');
    expect(field(tree, 'Yoke carry, set 1, time').props.value).toBe('');

    typeInto(tree, 'Yoke carry, set 1, distance in feet', '');
    press(tree, 'Save');
    expect(shown(tree)).toContain('Add distance to complete set');
    expect(setsOf(mockDb, id, 'yoke-carry')[0].distance).toBe(50);

    typeInto(tree, 'Yoke carry, set 1, distance in feet', '60');
    typeInto(tree, 'Yoke carry, set 1, time', '0:45');
    press(tree, 'Save');
    const [s] = setsOf(mockDb, id, 'yoke-carry');
    expect([s.weight, s.distance, s.distanceUnit, s.durationS]).toEqual([315, 60, 'ft', 45]);
  });

  it("edits an AMRAP score's rounds and extra reps, and asks for the rounds in its own words", () => {
    addProgramExercise('metcon-amrap-10', 'AMRAP 10', 'rounds');
    const id = oneSet('metcon-amrap-10', { reps: 6, extraReps: 4 });
    const tree = mount(id);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['ROUNDS', '+REPS']));
    expect(field(tree, 'AMRAP 10, set 1, rounds').props.value).toBe('6');
    expect(field(tree, 'AMRAP 10, set 1, extra reps').props.value).toBe('4');

    typeInto(tree, 'AMRAP 10, set 1, extra reps', '5');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, 'metcon-amrap-10')[0]).toMatchObject({ reps: 6, extraReps: 5 });

    const again = mount(id);
    typeInto(again, 'AMRAP 10, set 1, rounds', '');
    press(again, 'Save');
    expect(shown(again)).toContain('Add rounds to complete set');
  });

  it("gives a score with a load a weight column, so a mistyped load can be fixed (ruling R-g3, W3 review)", () => {
    addProgramExercise('metcon-fran', '21-15-9', 'for_time');
    const id = oneSet('metcon-fran', { durationS: 462, weight: 59 });
    const tree = mount(id);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['LB', 'TIME']));
    expect(field(tree, '21-15-9, set 1, weight in lb').props.value).toBe('59');
    typeInto(tree, '21-15-9, set 1, weight in lb', '95');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, 'metcon-fran')[0]).toMatchObject({ weight: 95, weightUnit: 'lb', durationS: 462 });
  });

  it('gives a score with no load, from a metcon of your own, no weight column', () => {
    addProgramExercise('metcon-amrap-10', 'AMRAP 10', 'rounds');
    const tree = mount(oneSet('metcon-amrap-10', { reps: 6 }));
    expect(shownText(tree)).not.toContain('LB');
  });

  it('edits a For Time score as m:ss', () => {
    addProgramExercise('metcon-fran', '21-15-9', 'for_time');
    const id = oneSet('metcon-fran', { durationS: 462 });
    const tree = mount(id);
    expect(field(tree, '21-15-9, set 1, time').props.value).toBe('7:42');
    typeInto(tree, '21-15-9, set 1, time', '7:30');
    press(tree, 'Save');
    expect(setsOf(mockDb, id, 'metcon-fran')[0].durationS).toBe(450);
  });
});
