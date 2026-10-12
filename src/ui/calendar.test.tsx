/** @jest-environment node */
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { addExerciseToWorkout, addSet } from '../db/repositories/workoutEditRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import {
  ConsistencyCalendar,
  calendarSentence,
  monthGrid,
  ordinal,
  trainedLine,
  shiftMonth,
  weekdayInitials,
} from './history/ConsistencyCalendar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Phase 6 Task 7 (R164): History's consistency calendar, on a real database. */

let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: () => undefined }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({
  ...jest.requireActual('../platform/announce'),
  announce: (text: string) => mockAnnounce(text),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const TEXT = '#f1ece2';
const BG = '#100f0c';
const TODAY = '2026-10-11';
const BENCH = 'barbell-bench-press';

beforeEach(() => {
  mockDb = seededDb();
  mockAnnounce.mockClear();
});

/** A finished workout started at 9:00 on `localDate`, with one ticked bench set. */
function trainOn(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  const start = new Date(y, m - 1, d, 9, 0).getTime();
  const id = startEmptyWorkout(mockDb, start);
  const we = addExerciseToWorkout(mockDb, id, BENCH);
  const set = addSet(mockDb, we);
  tickSet(mockDb, set, { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', start + 60_000, 'mi');
  finishWorkout(mockDb, id, start + 45 * 60_000);
  return id;
}

/** The calendar with the month as screen state, as History holds it. */
function Harness({ initial, onChange }: { initial: string; onChange?: (m: string) => void }) {
  const [month, setMonth] = useState(initial);
  return (
    <ConsistencyCalendar
      month={month}
      today={TODAY}
      onMonthChange={(m) => {
        onChange?.(m);
        setMonth(m);
      }}
    />
  );
}

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
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

const button = (tree: ReactTestRenderer, label: string): ReactTestInstance =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label)[0];

const disabled = (node: ReactTestInstance) => node.props.accessibilityState?.disabled === true;

/** The day circle for a date (testID `day-YYYY-MM-DD`), as a host view with its flattened style. */
const dayCircle = (tree: ReactTestRenderer, date: string) => {
  const found = tree.root.findAll((n) => n.props.testID === `day-${date}` && typeof n.type === 'string');
  return found[0];
};
/** Whether the day's circle (or the fill inside its ring) is the text colour. */
const filled = (tree: ReactTestRenderer, date: string) =>
  dayCircle(tree, date).findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor === TEXT).length > 0;

/** Every colour in every style on screen. */
function colours(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  for (const n of tree.root.findAll((x) => typeof x.type === 'string')) {
    const s = StyleSheet.flatten(n.props.style) ?? {};
    for (const v of Object.values(s)) if (typeof v === 'string' && v.startsWith('#')) out.push(v.toUpperCase());
  }
  return out;
}

describe('the calendar rules', () => {
  it('names days as ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '31st',
    ]);
  });

  it('reads the month as one sentence', () => {
    expect(calendarSentence('October', [])).toBe('October: no training.');
    expect(calendarSentence('October', ['2026-10-01'])).toBe('October: trained on the 1st.');
    expect(calendarSentence('October', ['2026-10-01', '2026-10-03'])).toBe('October: trained on the 1st and 3rd.');
    expect(calendarSentence('October', ['2026-10-01', '2026-10-03', '2026-10-05'])).toBe('October: trained on the 1st, 3rd and 5th.');
  });

  it('counts days trained (R193), with the streak only when given one', () => {
    expect(trainedLine(0, 'October', 0)).toBe('No training in October');
    expect(trainedLine(1, 'October', 0)).toBe('Trained 1 day in October');
    expect(trainedLine(3, 'September', 0)).toBe('Trained 3 days in September');
    expect(trainedLine(4, 'October', 9)).toBe('Trained 4 days in October · 9-day streak');
  });

  it('moves a month back and forth across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2025-12', 1)).toBe('2026-01');
    expect(shiftMonth('2026-10', -1)).toBe('2026-09');
  });

  it('lays a month out in weeks from Monday, with empty days outside it', () => {
    // 1 October 2026 is a Thursday; the 31st a Saturday.
    const weeks = monthGrid('2026-10');
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks[weeks.length - 1]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null]);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it('lays out a month that starts on Sunday with six empty days before the 1st', () => {
    // 1 November 2026 is a Sunday; 30 days end on a Monday.
    const weeks = monthGrid('2026-11');
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks).toHaveLength(6);
    expect(weeks[5]).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });

  it('gives a leap February 29 days and a common one 28', () => {
    const days = (m: string) => monthGrid(m).flat().filter(Boolean);
    expect(days('2028-02')).toHaveLength(29);
    expect(days('2028-02').at(-1)).toBe('2028-02-29');
    expect(days('2027-02')).toHaveLength(28);
  });

  it('gives weekday initials from the locale, Monday first', () => {
    expect(weekdayInitials('en-US')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  });
});

describe('ConsistencyCalendar (R164)', () => {
  it('fills the trained days only, rings today, and leaves the active workout out', () => {
    trainOn('2026-10-01');
    trainOn('2026-10-03');
    startEmptyWorkout(mockDb, new Date(2026, 9, 11, 9, 0).getTime());
    const tree = mount(<Harness initial="2026-10" />);

    expect(filled(tree, '2026-10-01')).toBe(true);
    expect(filled(tree, '2026-10-03')).toBe(true);
    expect(filled(tree, '2026-10-02')).toBe(false);
    // The active workout started today: today is ringed, not filled.
    expect(filled(tree, '2026-10-11')).toBe(false);
    expect(StyleSheet.flatten(dayCircle(tree, '2026-10-11').props.style).borderColor).toBe(TEXT);
    // A trained day's number is in the background colour.
    const one = tree.root.findAll((n) => n.props.children === '1' && typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(one.props.style).color).toBe(BG);
  });

  it("keeps today's ring on a day trained today", () => {
    trainOn('2026-10-11');
    const tree = mount(<Harness initial="2026-10" />);
    expect(filled(tree, '2026-10-11')).toBe(true);
    expect(StyleSheet.flatten(dayCircle(tree, '2026-10-11').props.style).borderColor).toBe(TEXT);
    // Another trained day has no ring.
    trainOn('2026-10-09');
    const again = mount(<Harness initial="2026-10" />);
    expect(StyleSheet.flatten(dayCircle(again, '2026-10-09').props.style).borderColor).toBe('transparent');
  });

  it('puts Monday first: the grid starts with the weekday initials and three empty days before the 1st', () => {
    const tree = mount(<Harness initial="2026-10" />);
    const text = shownText(tree);
    const start = text.indexOf('M');
    expect(text.slice(start, start + 8)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S', '1']);
  });

  it('disables › on the current month and ‹ when there are no workouts', () => {
    const tree = mount(<Harness initial="2026-10" />);
    expect(disabled(button(tree, 'Next month'))).toBe(true);
    expect(disabled(button(tree, 'Previous month'))).toBe(true);
    expect(shownText(tree)).toContain('October');
    expect(shownText(tree)).toContain('No training in October');
  });

  it('goes back month by month and stops at the first workout\'s month, then forward to the current one', () => {
    trainOn('2026-08-20');
    const onChange = jest.fn();
    const tree = mount(<Harness initial="2026-10" onChange={onChange} />);
    expect(disabled(button(tree, 'Previous month'))).toBe(false);

    act(() => button(tree, 'Previous month').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('2026-09');
    expect(shownText(tree)).toContain('September');
    expect(disabled(button(tree, 'Next month'))).toBe(false);

    act(() => button(tree, 'Previous month').props.onPress());
    expect(shownText(tree)).toContain('August');
    expect(disabled(button(tree, 'Previous month'))).toBe(true);
    expect(filled(tree, '2026-08-20')).toBe(true);

    act(() => button(tree, 'Next month').props.onPress());
    act(() => button(tree, 'Next month').props.onPress());
    expect(onChange).toHaveBeenLastCalledWith('2026-10');
    expect(disabled(button(tree, 'Next month'))).toBe(true);
  });

  it('says the days trained and the streak for the current month', () => {
    trainOn('2026-10-01');
    trainOn('2026-10-03');
    trainOn('2026-10-08');
    trainOn('2026-10-10');
    const tree = mount(<Harness initial="2026-10" />);
    // The run is 8 → 10, alive on the 11th: 4 days.
    expect(shownText(tree)).toContain('Trained 4 days in October · 4-day streak');
  });

  it('leaves the streak out for another month, and when there is none', () => {
    trainOn('2026-09-15');
    trainOn('2026-10-10');
    const tree = mount(<Harness initial="2026-09" />);
    expect(shownText(tree)).toContain('Trained 1 day in September');

    const lapsed = seededDb();
    mockDb = lapsed;
    trainOn('2026-10-01');
    const other = mount(<Harness initial="2026-10" />);
    expect(shownText(other)).toContain('Trained 1 day in October');
  });

  it('reads the grid as one sentence', () => {
    trainOn('2026-10-01');
    trainOn('2026-10-03');
    trainOn('2026-10-05');
    const tree = mount(<Harness initial="2026-10" />);
    const grid = tree.root.findAll((n) => n.props.accessibilityLabel === 'October: trained on the 1st, 3rd and 5th.' && n.props.accessible === true);
    expect(grid.length).toBeGreaterThan(0);
    // The days inside it are not buttons.
    expect(tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^day-/.test(String(n.props.testID))).length).toBe(0);

    const empty = mount(<Harness initial="2026-09" />);
    expect(empty.root.findAll((n) => n.props.accessibilityLabel === 'September: no training.').length).toBeGreaterThan(0);
  });

  it('says the new month when it moves, without a live region', () => {
    trainOn('2026-09-02');
    const tree = mount(<Harness initial="2026-10" />);
    expect(mockAnnounce).not.toHaveBeenCalled();
    act(() => button(tree, 'Previous month').props.onPress());
    expect(mockAnnounce).toHaveBeenCalledWith('September: trained on the 2nd.');
    const live = tree.root.findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none');
    expect(live).toHaveLength(0);
  });

  it('reads again on a bump: a workout finished after mount fills its day', () => {
    const tree = mount(<Harness initial="2026-10" />);
    expect(filled(tree, '2026-10-05')).toBe(false);
    act(() => {
      trainOn('2026-10-05');
      bumpData();
    });
    expect(filled(tree, '2026-10-05')).toBe(true);
  });

  it('uses no red', () => {
    trainOn('2026-10-01');
    trainOn('2026-10-10');
    const tree = mount(<Harness initial="2026-10" />);
    expect(colours(tree)).not.toContain('#E10600');
  });
});
