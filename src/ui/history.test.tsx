/** @jest-environment node */
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import History from '../../app/(tabs)/history/index';
import { listHistory } from '../db/repositories/historyRepo';
import { addExerciseToWorkout, addSet, setExerciseMark } from '../db/repositories/workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import type { ExerciseMark } from '../domain/types';
import { Footer } from './Footer';
import { ConsistencyCalendar } from './history/ConsistencyCalendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Phase 6 Task 7 (R163): the History list, on a real database. The calendar has its own tests (calendar.test). */

let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
/** Every focus callback the screen registered, so a test can bring History back into sight. */
const mockFocusCallbacks = new Set<() => void>();
const mockCalls: string[] = [];
jest.mock('expo-router', () => ({
  router: { push: jest.fn((href: string) => mockCalls.push(`push ${href}`)) },
  useFocusEffect: (cb: () => void) => mockFocusCallbacks.add(cb),
}));
jest.mock('../state/draftFlush', () => ({
  ...jest.requireActual('../state/draftFlush'),
  flushAll: () => mockCalls.push('flushAll'),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
const mockAnnounce = jest.fn();
const mockFocusOn = jest.fn();
jest.mock('../platform/announce', () => ({
  ...jest.requireActual('../platform/announce'),
  announce: (text: string) => mockAnnounce(text),
  focusOn: (node: unknown) => mockFocusOn(node),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Noon on Sunday 11 October 2026, local time: "today" for every test. */
const NOW = new Date(2026, 9, 11, 12, 0).getTime();
const MIN = 60_000;
const BENCH = 'barbell-bench-press';

beforeEach(() => {
  mockDb = seededDb();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.mocked(router.push).mockClear();
  mockAnnounce.mockClear();
  mockFocusOn.mockClear();
  mockFocusCallbacks.clear();
  mockCalls.length = 0;
});

/** History comes back into sight: every focus callback runs, as React Navigation's would. */
function refocus() {
  act(() => {
    for (const cb of [...mockFocusCallbacks]) cb();
  });
}

afterEach(() => jest.restoreAllMocks());

/** A finished 48-minute workout at 9:00 on `localDate`: bench, `weight` lb × 5 twice, with an optional mark. */
function trainOn(localDate: string, weight = 135, mark: ExerciseMark | null = null): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const start = new Date(y, m - 1, d, 9, 0).getTime();
  const id = startEmptyWorkout(mockDb, start);
  const we = addExerciseToWorkout(mockDb, id, BENCH);
  const first = addSet(mockDb, we);
  const second = addSet(mockDb, we);
  for (const [i, s] of [first, second].entries()) {
    tickSet(mockDb, s, { weight, reps: 5, durationS: null, distance: null }, 'lb', start + (i + 1) * MIN, 'mi');
  }
  if (mark) setExerciseMark(mockDb, we, mark);
  finishWorkout(mockDb, id, start + 48 * MIN);
  return id;
}

/** The heading the nth focusOn call was given: its testID and words (the ref is the Text, carrying its props). */
function focused(n: number) {
  const node = mockFocusOn.mock.calls[n][0] as { props: { testID?: string; children?: unknown } };
  return { testID: node.props.testID, words: node.props.children };
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<History />);
  });
  return tree;
}

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

/** The month Labels (headings) on screen, in order, leaving out the calendar's own month title. */
const monthLabels = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header' && n.props.testID === 'history-month')
    .map((n) => String(n.props.children));

const cards = (tree: ReactTestRenderer): ReactTestInstance[] =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && String(n.props.testID).startsWith('history-card-'));

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === label || n.props.label === label))[0];

describe('History (R163)', () => {
  it('shows the title, the calendar and the footer', () => {
    const tree = mount();
    expect(shownText(tree)[0]).toBe('History');
    expect(tree.root.findAllByType(ConsistencyCalendar)).toHaveLength(1);
    expect(tree.root.findByType(ConsistencyCalendar).props.month).toBe('2026-10');
    expect(tree.root.findAllByType(Footer)).toHaveLength(1);
  });

  it('says how to fill it when there is nothing yet', () => {
    const tree = mount();
    expect(shownText(tree)).toContain('Finish a workout and it shows here.');
    expect(cards(tree)).toHaveLength(0);
    expect(pressable(tree, 'Show earlier months')).toBeUndefined();
  });

  it('groups the cards by month, newest first, and leaves out the active workout', () => {
    trainOn('2026-09-20');
    trainOn('2026-10-02');
    trainOn('2026-10-09');
    startEmptyWorkout(mockDb, NOW);
    const tree = mount();
    expect(monthLabels(tree)).toEqual(['October', 'September']);
    expect(cards(tree)).toHaveLength(3);
    expect(shownText(tree)).not.toContain('Finish a workout and it shows here.');
  });

  it('shows the date, the name, the card line and the marks line', () => {
    trainOn('2026-10-02', 135);
    trainOn('2026-10-09', 185, 'pain');
    const tree = mount();
    const text = shownText(tree);
    expect(text).toContain('Fri, Oct 9');
    expect(text).toContain('Workout');
    // 2 × 185 × 5 = 1,850 lb; heavier than the first session, so it holds personal bests.
    const [newest] = listHistory(mockDb, 'lb');
    expect(newest.prCount).toBeGreaterThan(0);
    const prs = newest.prCount === 1 ? '1 PR' : `${newest.prCount} PRs`;
    expect(text).toContain(`48 min · 1,850 lb · ${prs}`);
    expect(text).toContain('48 min · 1,350 lb');
    expect(text).toContain('Something off: Pain');
  });

  it('reads a card as one sentence and opens its workout', () => {
    const id = trainOn('2026-10-09', 185, 'rough_sleep');
    const tree = mount();
    const [card] = cards(tree);
    expect(card.props.accessibilityLabel).toBe('Workout, Fri, Oct 9, 48 min · 1,850 lb, Something off: Rough sleep');
    expect(card.props.accessibilityRole).toBe('button');
    act(() => card.props.onPress());
    expect(router.push).toHaveBeenCalledWith(`/history/${id}`);
    // Drafts are saved before the screen changes (R29).
    expect(mockCalls).toEqual(['flushAll', `push /history/${id}`]);
  });

  it('shows the 3 newest months, then Show earlier months adds 6 more each tap until none are left', () => {
    // Eleven months with a workout: December 2025 to October 2026.
    for (let i = 0; i < 11; i++) {
      const d = new Date(2026, 9 - i, 5);
      trainOn(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-05`);
    }
    const tree = mount();
    expect(monthLabels(tree)).toEqual(['October', 'September', 'August']);
    expect(cards(tree)).toHaveLength(3);

    act(() => pressable(tree, 'Show earlier months')!.props.onPress());
    expect(monthLabels(tree)).toHaveLength(9);
    expect(monthLabels(tree)[8]).toBe('February');

    // VoiceOver moves to the first month added (the 4th month, July).
    expect(mockFocusOn).toHaveBeenCalledTimes(1);
    expect(focused(0)).toEqual({ testID: 'history-month', words: 'July' });

    act(() => pressable(tree, 'Show earlier months')!.props.onPress());
    expect(monthLabels(tree)).toHaveLength(11);
    expect(mockFocusOn).toHaveBeenCalledTimes(2);
    expect(focused(1)).toEqual({ testID: 'history-month', words: 'January' });
    expect(monthLabels(tree)[10]).toBe('December 2025');
    expect(pressable(tree, 'Show earlier months')).toBeUndefined();
  });

  it('hides Show earlier months with 3 months or fewer', () => {
    trainOn('2026-08-05');
    trainOn('2026-09-05');
    trainOn('2026-10-05');
    const tree = mount();
    expect(monthLabels(tree)).toHaveLength(3);
    expect(pressable(tree, 'Show earlier months')).toBeUndefined();
  });

  it('moving the calendar does not move the list', () => {
    trainOn('2026-09-05');
    trainOn('2026-10-05');
    const tree = mount();
    act(() => pressable(tree, 'Previous month')!.props.onPress());
    expect(tree.root.findByType(ConsistencyCalendar).props.month).toBe('2026-09');
    expect(monthLabels(tree)).toEqual(['October', 'September']);
  });

  it('moves the calendar to the new current month when History comes back in a new month', () => {
    const tree = mount();
    expect(tree.root.findByType(ConsistencyCalendar).props.month).toBe('2026-10');
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 2, 9, 0).getTime());
    refocus();
    expect(tree.root.findByType(ConsistencyCalendar).props.month).toBe('2026-11');
    expect(tree.root.findByType(ConsistencyCalendar).props.today).toBe('2026-11-02');
  });

  it('keeps an earlier month the lifter moved to when History comes back in a new month', () => {
    trainOn('2026-09-05');
    const tree = mount();
    act(() => pressable(tree, 'Previous month')!.props.onPress());
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 2, 9, 0).getTime());
    refocus();
    expect(tree.root.findByType(ConsistencyCalendar).props.month).toBe('2026-09');
  });

  it('uses no red and no live region, even with personal bests', () => {
    trainOn('2026-10-02', 135);
    trainOn('2026-10-09', 185);
    const tree = mount();
    const reds = tree.root
      .findAll((n) => typeof n.type === 'string')
      .flatMap((n) => Object.values(StyleSheet.flatten(n.props.style) ?? {}))
      .filter((v) => typeof v === 'string' && v.toUpperCase() === '#E10600');
    expect(reds).toHaveLength(0);
    const live = tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none');
    expect(live).toHaveLength(0);
  });
});
