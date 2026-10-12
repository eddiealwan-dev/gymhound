/** @jest-environment node */
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput } from 'react-native';
import { Circle } from 'react-native-svg';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import LiftRoute from '../../app/(tabs)/lift/[id]';
import LiftsRoute from '../../app/(tabs)/lifts';
import { exercises } from '../db/schema';
import { addExerciseToWorkout, addSet, setExerciseMark, updateSet } from '../db/repositories/workoutEditRepo';
import { getLift } from '../db/repositories/liftsRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import { finishWorkout, startEmptyWorkout, startWorkoutFromDay, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import type { ExerciseMark, SetType } from '../domain/types';
import { Footer } from './Footer';
import { LiftsSection } from './stats/LiftsSection';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Phase 6 Task 10 (R172–R175, R190, R191): Stats → Lifts, every lift, and a lift's chart, records and sessions. */

let mockDb: Db;
let mockId = 'barbell-bench-press';
let mockCanGoBack = true;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => mockCanGoBack },
  useLocalSearchParams: () => ({ id: mockId }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const BENCH = 'barbell-bench-press';
const SQUAT = 'barbell-back-squat';
const PLANK = 'plank';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Noon on Sunday 11 October 2026, local time: "today" for every test. */
const NOW = new Date(2026, 9, 11, 12, 0).getTime();
const OCT_1 = new Date(2026, 9, 1, 9, 0).getTime();

type Lift = { weight?: number; reps?: number; durationS?: number; distance?: number; type?: SetType };
const lb = (weight: number, reps: number, type: SetType = 'working'): Lift => ({ weight, reps, type });
type Block = [exerciseId: string, lifts: Lift[], mark?: ExerciseMark];

/** An empty workout started at `start` with each block's sets ticked, finished an hour later unless `finish` is false. */
function workout(start: number, blocks: Block[], finish = true): string {
  const id = startEmptyWorkout(mockDb, start);
  let at = start;
  for (const [exerciseId, lifts, mark] of blocks) {
    const weId = addExerciseToWorkout(mockDb, id, exerciseId);
    if (mark) setExerciseMark(mockDb, weId, mark);
    for (let i = 1; i < lifts.length; i++) addSet(mockDb, weId);
    const setIds = getActiveWorkoutView(mockDb)!.exercises.find((e) => e.id === weId)!.sets.map((s) => s.id);
    lifts.forEach((lift, i) => {
      if (lift.type && lift.type !== 'working') updateSet(mockDb, setIds[i], { setType: lift.type });
      tickSet(
        mockDb,
        setIds[i],
        { weight: lift.weight ?? null, reps: lift.reps ?? null, durationS: lift.durationS ?? null, distance: lift.distance ?? null },
        'lb',
        (at += MINUTE),
        'km',
      );
    });
  }
  if (finish) finishWorkout(mockDb, id, start + 60 * MINUTE);
  return id;
}

/** A routine day's bench press at 135 × 3 on every set: the rule holds the weight. */
function heldBench(start: number): string {
  const id = startWorkoutFromDay(mockDb, 'premade-ppl-6:push-a', start);
  const bench = getActiveWorkoutView(mockDb)!.exercises.find((e) => e.exerciseId === BENCH)!;
  bench.sets.forEach((s, i) => tickSet(mockDb, s.id, { weight: 135, reps: 3, durationS: null, distance: null }, 'lb', start + (i + 1) * MINUTE, 'mi'));
  finishWorkout(mockDb, id, start + 60 * MINUTE);
  return id;
}

/** A custom exercise with an id, a name and a logging type. */
function addCustom(id: string, name: string, loggingType: 'assisted' | 'bodyweight_plus'): string {
  mockDb
    .insert(exercises)
    .values({ id, name, aliases: [], primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'bodyweight', pattern: 'core', loggingType, isCustom: true, createdAt: NOW })
    .run();
  return id;
}

/** A custom exercise logged as distance and time. */
function addRun(): string {
  mockDb
    .insert(exercises)
    .values({ id: 'custom-run', name: 'Run', aliases: [], primaryMuscles: ['quads'], secondaryMuscles: [], equipment: 'bodyweight', pattern: 'core', loggingType: 'distance_time', isCustom: true, createdAt: NOW })
    .run();
  return 'custom-run';
}

beforeEach(() => {
  mockDb = seededDb();
  mockId = BENCH;
  mockCanGoBack = true;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(router.navigate).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Every string drawn on screen, in order. */
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

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) {
    const byText = tree.root.findAll(
      (n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && n.findAll((c) => c.children.includes(label)).length > 0,
    );
    if (byText.length === 0) throw new Error(`Nothing to press called ${label}`);
    return byText[byText.length - 1];
  }
  return found[0];
};
const press = (tree: ReactTestRenderer, label: string) => act(() => pressable(tree, label).props.onPress());
const buttonLabels = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function').map((n) => n.props.accessibilityLabel as string);

/** Lays the chart's plot out at a width, as the phone would, so it draws its dots; then measures each mark label. */
function layOut(tree: ReactTestRenderer) {
  const plot = tree.root.findAll((n) => typeof n.props.onLayout === 'function' && typeof n.type === 'string');
  act(() => {
    for (const m of plot) m.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 180 } } });
  });
  const measure = tree.root.findAll((n) => n.type === Text && typeof n.props.onLayout === 'function');
  act(() => {
    for (const m of measure) m.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 16 } } });
  });
}

const chart = (tree: ReactTestRenderer): ReactTestInstance | undefined =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image')[0];

/** Every string in every prop below the root, so a colour anywhere is found. */
function allPropValues(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !('$$typeof' in (v as object)) && !seen.has(v as object)) {
      // A ref points back into the tree, so each object is walked once.
      seen.add(v as object);
      Object.values(v as object).forEach(walk);
    }
  };
  for (const n of [node, ...node.findAll(() => true)]) {
    const { children: _children, ref: _ref, ...rest } = n.props;
    walk(rest);
  }
  return out;
}

const benchName = () => getLift(mockDb, BENCH)!.name;
const squatName = () => getLift(mockDb, SQUAT)!.name;

describe('Stats → Lifts (R172)', () => {
  it('says how lifts appear when there are none', () => {
    const tree = mount(<LiftsSection today="2026-10-11" />);
    expect(shownText(tree)).toEqual(['Lifts', 'Finish a workout and each lift you log shows here, with its chart and records.']);
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header')).toHaveLength(1);
  });

  it('lists each lift with its last day and session count, and opens it', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    workout(OCT_1 + 9 * DAY, [[BENCH, [lb(140, 5)]], [SQUAT, [lb(225, 5)]]]); // Oct 10: yesterday
    const tree = mount(<LiftsSection today="2026-10-11" />);
    const t = shownText(tree);
    // The same last day: by name.
    expect(t).toEqual(['Lifts', squatName(), 'Yesterday · 1 session', benchName(), 'Yesterday · 2 sessions']);
    expect(t).not.toContain('All lifts ›');
    press(tree, `${benchName()}, Yesterday, 2 sessions`);
    expect(router.push).toHaveBeenCalledWith(`/lift/${BENCH}`);
  });

  it('shows the five latest and All lifts › when there are more', () => {
    const ids = ['barbell-bench-press', 'barbell-back-squat', 'barbell-row', 'plank', 'barbell-overhead-press', 'dumbbell-lateral-raise'];
    const known = ids.filter((id) => getLift(mockDb, id) !== null);
    expect(known.length).toBeGreaterThanOrEqual(6);
    known.forEach((id, i) => workout(OCT_1 + i * DAY, [[id, id === PLANK ? [{ durationS: 60 }] : [lb(95, 5)]]]));
    const tree = mount(<LiftsSection today="2026-10-11" />);
    const rows = tree.root.findAll((n) => typeof n.props.onPress === 'function' && /session/.test(n.props.accessibilityLabel ?? ''));
    expect(rows).toHaveLength(5);
    // The newest first: the sixth (oldest) is left for All lifts.
    expect(shownText(tree)).not.toContain(getLift(mockDb, known[0])!.name);
    press(tree, 'All lifts');
    expect(router.push).toHaveBeenCalledWith('/lifts');
  });

  it('uses no red', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    const tree = mount(<LiftsSection today="2026-10-11" />);
    expect(allPropValues(tree.root).map((v) => v.toUpperCase())).not.toContain('#E10600');
  });
});

describe('/lifts', () => {
  it('lists every lift, finds one by the start of a word in its name, and says when none matches', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]], [SQUAT, [lb(225, 5)]]]);
    const tree = mount(<LiftsRoute />);
    expect(shownText(tree).slice(0, 2)).toEqual(['Stats', 'Lifts']);
    expect(shownText(tree)).toEqual(expect.arrayContaining([benchName(), squatName()]));
    const search = tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Search your lifts')!;
    expect(search.props.placeholder).toBe('Search your lifts');

    const word = squatName().split(' ').pop()!.slice(0, 3).toLowerCase();
    act(() => search.props.onChangeText(word));
    expect(shownText(tree)).toContain(squatName());
    expect(shownText(tree)).not.toContain(benchName());

    act(() => search.props.onChangeText('zzz'));
    expect(shownText(tree)).toContain('No lift called zzz.');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('goes back to Stats, or to Stats by address with nothing to go back to', () => {
    const tree = mount(<LiftsRoute />);
    press(tree, 'Back to Stats');
    expect(router.back).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    press(tree, 'Back to Stats');
    expect(router.navigate).toHaveBeenCalledWith('/stats');
  });
});

describe('/lift/[id] (R173–R175)', () => {
  it("says an unknown id isn't in the history, and names a lift never done with what fills its page (R554)", () => {
    mockId = 'nope';
    expect(shownText(mount(<LiftRoute />))).toContain("This lift isn't in your history.");
    mockId = SQUAT;
    const shown = shownText(mount(<LiftRoute />));
    expect(shown).toContain('No sessions yet. Its chart and history fill in once you log it.');
    expect(shown.some((t) => /squat/i.test(t))).toBe(true);
  });

  it('goes back, or to Lifts with nothing to go back to; no footer', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    const tree = mount(<LiftRoute />);
    press(tree, 'Back');
    expect(router.back).toHaveBeenCalledTimes(1);
    mockCanGoBack = false;
    press(tree, 'Back');
    expect(router.navigate).toHaveBeenCalledWith('/lifts');
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
  });

  it('charts the working weight with a hollow point for a marked session and its reason over it', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    workout(OCT_1 + 2 * DAY, [[BENCH, [lb(130, 5)], 'rough_sleep']]);
    workout(OCT_1 + 4 * DAY, [[BENCH, [lb(140, 5)]]]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    const t = shownText(tree);
    expect(t.slice(0, 3)).toEqual(['Back', benchName(), 'Working weight per session']);
    const rings = tree.root.findAllByType(Circle).filter((c) => c.props.stroke !== undefined);
    expect(rings).toHaveLength(1);
    // The ring is filled with the screen's colour, never the text's.
    expect(rings[0].props.fill).toBe('#100f0c');
    expect(t).toContain('Rough sleep');
    expect(t).toContain('Hollow points are sessions with something off.');
    expect(t).toContain('Up 5 lb since Oct 1.');
    expect(chart(tree)!.props.accessibilityLabel).toBe(
      'Working weight per session. Oct 1 to Oct 5: 135 lb to 140 lb. Lowest 130 lb, highest 140 lb. 1 session marked.',
    );
  });

  it('labels a third held session at the same weight "Stall", on the chart and in the sessions', () => {
    heldBench(OCT_1);
    heldBench(OCT_1 + 2 * DAY);
    heldBench(OCT_1 + 4 * DAY);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    const t = shownText(tree);
    expect(t.filter((s) => s === 'Stall')).toHaveLength(1);
    expect(t).toContain('No change since Oct 1.');
    expect(t).not.toContain('Hollow points are sessions with something off.');
    expect(chart(tree)!.props.accessibilityLabel).toContain('Stall from Oct 5.');
    // The newest session first, its sets and " · Stall".
    const sessionsAt = t.indexOf('Sessions');
    expect(t[sessionsAt + 1]).toBe('Mon, Oct 5');
    expect(t[sessionsAt + 2]).toMatch(/^135 × 3(, 135 × 3)* · Stall$/);
    expect(t[sessionsAt + 4]).not.toMatch(/Stall/);
  });

  it('shows a marked session\'s reason in its row and opens the workout', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    const marked = workout(OCT_1 + 2 * DAY, [[BENCH, [lb(130, 5), lb(130, 4)], 'pain']]);
    const tree = mount(<LiftRoute />);
    expect(shownText(tree)).toContain('130 × 5, 130 × 4 · Pain');
    press(tree, 'Sat, Oct 3, 130 by 5, 130 by 4, Pain');
    expect(router.push).toHaveBeenCalledWith(`/history/${marked}`);
  });

  it('switches the range: 3M by default, All shows older sessions', () => {
    workout(OCT_1 - 200 * DAY, [[BENCH, [lb(115, 5)]]]);
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    expect(pressable(tree, '3M, last 3 months').props.accessibilityState).toEqual({ checked: true });
    expect(tree.root.findAllByType(Circle)).toHaveLength(1);
    expect(shownText(tree)).not.toContain('Up 20 lb since Mar 15.');
    press(tree, 'All, all time');
    layOut(tree);
    expect(tree.root.findAllByType(Circle)).toHaveLength(2);
    expect(shownText(tree).find((s) => s.startsWith('Up 20 lb since'))).toBeDefined();
  });

  it('says so when no session is in the range', () => {
    workout(OCT_1 - 200 * DAY, [[BENCH, [lb(115, 5)]]]);
    const tree = mount(<LiftRoute />);
    expect(shownText(tree)).toContain('No sessions in this range.');
    expect(chart(tree)).toBeUndefined();
  });

  it('lists the records with their dates, each opening its workout', () => {
    const first = workout(OCT_1, [[BENCH, [lb(185, 5)]]]);
    workout(OCT_1 + 2 * DAY, [[BENCH, [lb(175, 8)]]]);
    const tree = mount(<LiftRoute />);
    const t = shownText(tree);
    const at = t.indexOf('Records');
    expect(t.slice(at, at + 7)).toEqual(['Records', 'Heaviest', '185 lb × 5', 'Thu, Oct 1', 'Best estimated 1RM', expect.stringMatching(/ lb$/), expect.any(String)]);
    press(tree, 'Heaviest, 185 lb by 5, Thu, Oct 1');
    expect(router.push).toHaveBeenCalledWith(`/history/${first}`);
  });

  it('charts the longest hold for a timed lift, with Longest hold as its record', () => {
    mockId = PLANK;
    workout(OCT_1, [[PLANK, [{ durationS: 45 }, { durationS: 60 }]]]);
    workout(OCT_1 + 2 * DAY, [[PLANK, [{ durationS: 90 }]]]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    const t = shownText(tree);
    expect(t).toContain('Longest hold per session');
    expect(t).toContain('Longest hold');
    expect(t).toContain('1:30');
    expect(chart(tree)!.props.accessibilityLabel).toMatch(/^Longest hold per session\. Oct 1 to Oct 3: 1:00 to 1:30\./);
  });

  it('shows distance and time as records only', () => {
    mockId = addRun();
    workout(OCT_1, [['custom-run', [{ distance: 5, durationS: 1500 }]]]);
    const tree = mount(<LiftRoute />);
    const t = shownText(tree);
    expect(t).toContain('Distance and time show records only.');
    expect(chart(tree)).toBeUndefined();
    expect(t).toEqual(expect.arrayContaining(['Longest distance', '5 km', 'Longest time', '25:00']));
    expect(buttonLabels(tree)).not.toContain('3M, last 3 months');
  });

  it('shows ten sessions, then all of them on Show all', () => {
    for (let i = 0; i < 12; i++) workout(OCT_1 - 20 * DAY + i * DAY, [[BENCH, [lb(100 + i, 5)]]]);
    const tree = mount(<LiftRoute />);
    const sessionRows = () => tree.root.findAll((n) => typeof n.props.onPress === 'function' && / by 5$/.test(n.props.accessibilityLabel ?? ''));
    expect(sessionRows()).toHaveLength(10);
    press(tree, 'Show all');
    expect(sessionRows()).toHaveLength(12);
    expect(shownText(tree)).not.toContain('Show all');
  });

  it('charts the assistance for an assisted lift, and says "minus" for it', () => {
    mockId = addCustom('custom-assist', 'Assisted dip', 'assisted');
    workout(OCT_1, [['custom-assist', [lb(40, 8)]]]);
    workout(OCT_1 + 2 * DAY, [['custom-assist', [lb(30, 8)]]]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    expect(shownText(tree)).toContain('Assistance per session');
    expect(chart(tree)!.props.accessibilityLabel).toMatch(/^Assistance per session\. Oct 1 to Oct 3: 40 lb to 30 lb\./);
    expect(buttonLabels(tree)).toContain('Least assistance, minus 30 lb by 8, Sat, Oct 3');
  });

  it('charts the most reps for a bodyweight-plus lift never loaded, and says "bodyweight" for BW', () => {
    mockId = addCustom('custom-dip', 'Dip', 'bodyweight_plus');
    workout(OCT_1, [['custom-dip', [{ reps: 10 }, { reps: 12 }]]]);
    const tree = mount(<LiftRoute />);
    const t = shownText(tree);
    expect(t).toContain('Most reps in a set, per session');
    expect(t).toEqual(expect.arrayContaining(['Most reps', '12']));
    expect(buttonLabels(tree)).toContain('Thu, Oct 1, bodyweight by 10, bodyweight by 12');
  });

  it('converts the working weight to a kg display unit', () => {
    setSetting(mockDb, 'unit', 'kg');
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    workout(OCT_1 + 2 * DAY, [[BENCH, [lb(140, 5)]]]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    expect(chart(tree)!.props.accessibilityLabel).toContain('Oct 1 to Oct 3: 61.2 kg to 63.5 kg.');
  });

  it('says holds in words to VoiceOver', () => {
    mockId = PLANK;
    workout(OCT_1, [[PLANK, [{ durationS: 45 }, { durationS: 60 }]]]);
    workout(OCT_1 + 2 * DAY, [[PLANK, [{ durationS: 90 }]]]);
    const tree = mount(<LiftRoute />);
    expect(buttonLabels(tree)).toEqual(
      expect.arrayContaining(['Thu, Oct 1, 45 seconds, 1 minute', 'Longest hold, 1 minute 30 seconds, Sat, Oct 3']),
    );
  });

  it('says how the line starts while the lift has one session, and drops it at two (R402)', () => {
    mockId = BENCH;
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    let tree = mount(<LiftRoute />);
    expect(shownText(tree)).toContain('One session so far. Your next one starts the line.');
    tree.unmount();
    workout(OCT_1 + 2 * DAY, [[BENCH, [lb(140, 5)]]]);
    tree = mount(<LiftRoute />);
    expect(shownText(tree)).not.toContain('One session so far. Your next one starts the line.');
  });

  it('says there is no chart yet when no session has a value to chart', () => {
    // A bodyweight-plus set ticked with no reps: a session, but no most reps to chart.
    mockId = addCustom('custom-dip', 'Dip', 'bodyweight_plus');
    workout(OCT_1, [['custom-dip', [{}]]]);
    const tree = mount(<LiftRoute />);
    expect(shownText(tree)).toContain('No chart for this lift yet.');
    expect(shownText(tree)).not.toContain('No sessions in this range.');
    expect(buttonLabels(tree)).not.toContain('3M, last 3 months');
  });

  it('uses no red', () => {
    workout(OCT_1, [[BENCH, [lb(135, 5)]]]);
    workout(OCT_1 + 2 * DAY, [[BENCH, [lb(130, 5)], 'rough_sleep']]);
    const tree = mount(<LiftRoute />);
    layOut(tree);
    expect(allPropValues(tree.root).map((v) => v.toUpperCase())).not.toContain('#E10600');
    // The chart's words are muted, never red.
    const label = tree.root.findAllByType(Text).find((n) => n.props.children === 'Rough sleep' && StyleSheet.flatten(n.props.style).opacity !== 0);
    expect(StyleSheet.flatten(label!.props.style).color).toBe('#a39d90');
  });
});
