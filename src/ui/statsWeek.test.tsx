/** @jest-environment node */
import { and, eq } from 'drizzle-orm';
import { router } from 'expo-router';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { addBodyEntry } from '../db/repositories/bodyRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import { addExerciseToWorkout, addSet, updateSet } from '../db/repositories/workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { progressPhotos, sets } from '../db/schema';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import Stats from '../../app/(tabs)/stats';
import { bumpData } from '../state/dataVersion';
import { CheckInCard } from './stats/CheckInCard';
import { WeekCard } from './stats/WeekCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the cards read through the analytics repository, and a write bumps the data version, which makes
// them read again while Stats is in sight (useFocusedDbQuery; the focus effect is a no-op here, so they stay focused).
let mockDb: Db;
/** The progress photo files on "this phone", by name. */
const mockFiles = new Set<string>();
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useFocusEffect: () => undefined,
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///docs/' } },
  File: class {
    mockUri: string;
    constructor(mockUri: string) {
      this.mockUri = mockUri;
    }
    get exists() {
      const prefix = 'file:///docs/progress-photos/';
      return this.mockUri.startsWith(prefix) && mockFiles.has(decodeURIComponent(this.mockUri.slice(prefix.length)));
    }
  },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
// Stats' other sections are tested in their own files.
jest.mock('./stats/LiftsSection', () => ({ LiftsSection: () => null }));
jest.mock('./stats/StepsCard', () => ({ StepsCard: () => null }));
jest.mock('./stats/PhotosRow', () => ({ PhotosRow: () => null }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({
  ...jest.requireActual('../platform/announce'),
  announce: (text: string) => mockAnnounce(text),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const BENCH = 'barbell-bench-press';
const MINUTE = 60_000;
const DAY = 86_400_000;
/** Wednesday 14 October 2026: this week starts Monday 12 October; last week is 5–11 October. */
const TODAY = '2026-10-14';
const at = (m: number, d: number, h = 9, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const NOW = at(10, 14, 12);
const originalOS = Platform.OS;

beforeEach(() => {
  mockDb = seededDb('us');
  setSetting(mockDb, 'unit', 'lb');
  mockFiles.clear();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.mocked(router.push).mockClear();
  mockAnnounce.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = originalOS;
});

function firstSetId(workoutExerciseId: string): string {
  return mockDb
    .select({ id: sets.id })
    .from(sets)
    .where(and(eq(sets.workoutExerciseId, workoutExerciseId), eq(sets.position, 0)))
    .get()!.id;
}

/** Logs and finishes a workout started at `start`: `n` done bench sets of `weight` × `reps`. */
function logBench(start: number, n: number, weight = 100, reps = 5): string {
  const id = startEmptyWorkout(mockDb, start);
  const weId = addExerciseToWorkout(mockDb, id, BENCH);
  for (let i = 0; i < n; i++) {
    const setId = i === 0 ? firstSetId(weId) : addSet(mockDb, weId);
    tickSet(mockDb, setId, { weight, reps, durationS: null, distance: null }, 'lb', start + (i + 1) * MINUTE, 'mi');
  }
  finishWorkout(mockDb, id, start + 50 * MINUTE);
  return id;
}

/** Logs and finishes a workout started at `start`: one done plank of 60 s (timed: no hard sets, no volume). */
function logPlank(start: number): string {
  const id = startEmptyWorkout(mockDb, start);
  const weId = addExerciseToWorkout(mockDb, id, 'plank');
  tickSet(mockDb, firstSetId(weId), { weight: null, reps: null, durationS: 60, distance: null }, 'lb', start + MINUTE, 'mi');
  finishWorkout(mockDb, id, start + 50 * MINUTE);
  return id;
}

function addPhoto(localDate: string, fileName: string): void {
  mockDb.insert(progressPhotos).values({ id: fileName, localDate, takenAt: NOW, fileName }).run();
}

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

/** The text of each Text element, its children joined (a line built from parts reads as one). */
function lines(tree: ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => n.type === ('Text' as unknown))
    .map((n) => [n.props.children].flat().join(''));
}

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) throw new Error(`Nothing to press called ${label}`);
  return found[0];
};

/** Every colour in every style drawn. */
function colours(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  for (const node of tree.root.findAll(() => true)) {
    const style = StyleSheet.flatten(node.props.style) as Record<string, unknown> | undefined;
    if (!style) continue;
    for (const [key, value] of Object.entries(style)) if (/color/i.test(key) && typeof value === 'string') out.push(value.toUpperCase());
  }
  return out;
}

describe('WeekCard (R176–R179)', () => {
  it('shows sets per muscle with the band, sessions, personal bests and the bodyweight trend', () => {
    // Last week: one workout. This week: 12 bench sets over two workouts (chest primary; triceps and front delts ½).
    logBench(at(10, 6), 3, 95);
    logBench(at(10, 12), 6, 100);
    logBench(at(10, 13), 6, 105);
    addBodyEntry(mockDb, 'bodyweight', 182, 'lb', NOW - 30 * DAY);
    addBodyEntry(mockDb, 'bodyweight', 180.8, 'lb', NOW);

    const t = lines(mount(<WeekCard today={TODAY} />));
    expect(t.slice(0, 3)).toEqual([
      'This week',
      'Sets per muscle',
      'Hard sets so far this week. About 10 to 20 a week is the usual aim; GymHound counts 8 to 24 as in range.',
    ]);
    expect(t).toContain('Chest · 12 sets · in range');
    expect(t).toContain('Triceps · 6 sets · under 8');
    expect(t).toContain('Hamstrings · 0 sets · under 8');
    expect(t).toContain('Shoulders · 3 sets, front delts count half · under 8');
    // One row per group, in the band's order.
    expect(t.filter((line) => / · (in range|under 8|over 24)$/.test(line))).toHaveLength(8);
    const sessions = t.indexOf('Sessions');
    expect(t[sessions + 1]).toBe('2 this week · 1 last week');
    const prs = t.indexOf('Personal bests');
    // The first bench session sets every PR; this week's heavier weights beat it twice (one workout each).
    expect(t[prs + 1]).toMatch(/^\d+ this week · \d+ in the last 4 weeks$/);
    const bodyweight = t.indexOf('Bodyweight');
    expect(t[bodyweight + 1]).toBe('Down 1.2 lb in 4 weeks, about 0.3 lb a week.');
  });

  it('counts personal bests this week and in the last 4 weeks', () => {
    logBench(at(9, 1), 1, 100); // too old for the 4 weeks
    logBench(at(10, 6), 1, 110); // last week: heaviest and e1RM
    logBench(at(10, 13), 1, 120); // this week: heaviest and e1RM
    const t = lines(mount(<WeekCard today={TODAY} />));
    expect(t[t.indexOf('Personal bests') + 1]).toBe('2 this week · 4 in the last 4 weeks');
  });

  it('asks for bodyweight entries when there is no trend', () => {
    logBench(at(10, 13), 2);
    const t = lines(mount(<WeekCard today={TODAY} />));
    expect(t[t.indexOf('Bodyweight') + 1]).toBe('Log your weight a few times a week to see a trend.');
  });

  it('collapses to one line before the first workout, and reads again after a write', () => {
    addBodyEntry(mockDb, 'bodyweight', 180, 'lb', NOW);
    const tree = mount(<WeekCard today={TODAY} />);
    expect(lines(tree)).toEqual(['This week', 'Your week shows here after your first workout.']);
    act(() => {
      logBench(at(10, 13), 2);
      bumpData();
    });
    const t = lines(tree);
    expect(t[t.indexOf('Sessions') + 1]).toBe('1 this week · 0 last week');
    expect(t).toContain('Chest · 2 sets · under 8');
  });

  it('says no workouts yet this week in place of the band and the rows', () => {
    logBench(at(10, 6), 3);
    const t = lines(mount(<WeekCard today={TODAY} />));
    expect(t.slice(0, 3)).toEqual(['This week', 'Sets per muscle', 'No workouts yet this week.']);
    expect(t.some((line) => line.startsWith('Hard sets so far'))).toBe(false);
    expect(t.filter((line) => / · (in range|under 8|over 24)$/.test(line))).toHaveLength(0);
    expect(t[t.indexOf('Sessions') + 1]).toBe('0 this week · 1 last week');
  });

  it('says under and over in words only: nothing is red', () => {
    logBench(at(10, 12), 26);
    const tree = mount(<WeekCard today={TODAY} />);
    expect(lines(tree)).toContain('Chest · 26 sets · over 24');
    expect(colours(tree)).not.toContain('#E10600');
  });
});

describe('CheckInCard (R180)', () => {
  it('says the first check-in comes after a full week with no history', () => {
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t[0]).toBe('Weekly check-in');
    expect(t).toContain('Your first check-in comes after a full week of training.');
    expect(t).not.toContain('No workouts or bodyweight logged last week.');
  });

  it('says last week was empty when there is older history', () => {
    logBench(at(9, 22), 3);
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('No workouts or bodyweight logged last week.');
    expect(t).not.toContain('Your first check-in comes after a full week of training.');
  });

  it("reviews last week: sessions, hard sets, volume, personal bests, bodyweight and the groups out of range", () => {
    logBench(at(10, 6), 3, 100, 5); // 1,500 lb
    logBench(at(10, 8), 2, 110, 5); // 1,100 lb
    addBodyEntry(mockDb, 'bodyweight', 182, 'lb', at(9, 30, 8));
    addBodyEntry(mockDb, 'bodyweight', 181, 'lb', at(10, 6, 8));
    addBodyEntry(mockDb, 'bodyweight', 180.6, 'lb', at(10, 9, 8));

    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('Week of Oct 5');
    expect(t).toContain('2 sessions · 5 hard sets · 2,600 lb');
    expect(t).toContain('2 personal bests'); // the first bench session sets none (R103); the second beats it twice
    expect(t).toContain('Bodyweight 180.8 lb average, −1.2 lb on the week before');
    expect(t).toContain('Under 8 sets: Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes');
    expect(t.some((line) => line.startsWith('Over 24 sets'))).toBe(false);
  });

  it('says one session and one hard set, no personal bests line at zero, and no bodyweight', () => {
    logBench(at(9, 28), 1, 200); // the PRs are set the week before
    logBench(at(10, 6), 1, 100);
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('1 session · 1 hard set · 500 lb');
    expect(t.some((line) => /personal best/.test(line))).toBe(false);
    expect(t).toContain('No bodyweight logged.');
    expect(t).toContain('Under 8 sets: Chest, Back, Shoulders, Biceps, Triceps, Quads, Hamstrings, Glutes');
  });

  it('shows a bodyweight average with no change when the week before has none, and over 24 sets', () => {
    logBench(at(10, 6), 26);
    addBodyEntry(mockDb, 'bodyweight', 181, 'lb', at(10, 7, 8));
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('Bodyweight 181 lb average');
    expect(t).toContain('Over 24 sets: Chest');
  });

  it('says the same as the week before when the average did not move', () => {
    addBodyEntry(mockDb, 'bodyweight', 181, 'lb', at(10, 1, 8));
    addBodyEntry(mockDb, 'bodyweight', 181, 'lb', at(10, 7, 8));
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('No workouts.');
    expect(t).toContain('Bodyweight 181 lb average, the same as the week before');
    // With no workout, every group would read under: those lines are left out.
    expect(t.some((line) => line.startsWith('Under 8 sets') || line.startsWith('Over 24 sets'))).toBe(false);
  });

  it('leaves zero hard sets and zero volume out of a cardio-only week', () => {
    logPlank(at(10, 7));
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('1 session');
    expect(t.some((line) => /hard set|0 lb/.test(line))).toBe(false);
  });

  it("lists this week's three things, open, with the bodyweight entry inline", () => {
    const tree = mount(<CheckInCard today={TODAY} />);
    const t = lines(tree);
    expect(t).toEqual(expect.arrayContaining(["This week's check-in", 'Log your bodyweight', 'Measure your waist', 'Take a progress photo']));
    expect(tree.root.findAllByType(TextInput).map((n) => n.props.accessibilityLabel)).toEqual(["Bodyweight for this week's check-in, lb"]);
    expect(lines(tree)).not.toContain('This week');
  });

  it('ticks bodyweight once it is logged here, with no live region (the entry announces)', () => {
    const tree = mount(<CheckInCard today={TODAY} />);
    const field = tree.root.findByType(TextInput);
    act(() => field.props.onChangeText('180.4'));
    act(() => pressable(tree, 'Log bodyweight for the check-in').props.onPress());
    const t = lines(tree);
    expect(t).toContain('Bodyweight logged');
    expect(t).not.toContain('Log your bodyweight');
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(mockAnnounce).toHaveBeenCalledWith('Logged 180.4 lb.');
    const live = tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none');
    expect(live).toHaveLength(0);
  });

  it('ticks the waist and the photo from entries dated this week only', () => {
    addBodyEntry(mockDb, 'waist', 34, 'in', at(10, 9, 8)); // last week
    addPhoto('2026-10-10', 'progress-1.jpg'); // last week
    mockFiles.add('progress-1.jpg');
    let t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toEqual(expect.arrayContaining(['Measure your waist', 'Take a progress photo']));

    addBodyEntry(mockDb, 'waist', 33.5, 'in', at(10, 12, 8));
    addPhoto('2026-10-13', 'progress-2.jpg');
    mockFiles.add('progress-2.jpg');
    t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toEqual(expect.arrayContaining(['Waist measured', 'Progress photo taken']));
  });

  it("doesn't count a photo whose file is gone from this phone", () => {
    addPhoto('2026-10-13', 'progress-2.jpg');
    const t = lines(mount(<CheckInCard today={TODAY} />));
    expect(t).toContain('Take a progress photo');
    expect(t).not.toContain('Progress photo taken');
  });

  it('opens the waist and the photos', () => {
    const tree = mount(<CheckInCard today={TODAY} />);
    act(() => pressable(tree, 'Measure your waist').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/body/waist');
    act(() => pressable(tree, 'Take a progress photo').props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/photos');
    // Every row is at least 44pt tall.
    for (const label of ['Measure your waist', 'Take a progress photo']) {
      const style = StyleSheet.flatten(
        typeof pressable(tree, label).props.style === 'function' ? pressable(tree, label).props.style({ pressed: false }) : pressable(tree, label).props.style,
      );
      expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('hides the progress photo row in the browser', () => {
    Platform.OS = 'web';
    addPhoto('2026-10-13', 'progress-2.jpg');
    mockFiles.add('progress-2.jpg');
    const t = shownText(mount(<CheckInCard today={TODAY} />));
    expect(t).not.toContain('Take a progress photo');
    expect(t).not.toContain('Progress photo taken');
    expect(t).toContain('Measure your waist');
  });

  it('uses no red', () => {
    logBench(at(10, 6), 26);
    expect(colours(mount(<CheckInCard today={TODAY} />))).not.toContain('#E10600');
  });
});

describe('Stats with the check-in and Body', () => {
  it("gives the check-in's bodyweight field and button their own VoiceOver labels", () => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const tree = mount(<Stats />);
    expect(tree.root.findAllByType(TextInput).map((n) => n.props.accessibilityLabel)).toEqual([
      "Bodyweight for this week's check-in, lb",
      'Bodyweight, lb',
    ]);
    expect(pressable(tree, 'Log bodyweight for the check-in')).toBeDefined();
    expect(pressable(tree, 'Log bodyweight')).toBeDefined();
  });
});
