/** @jest-environment node */
import { router } from 'expo-router';
import { AccessibilityInfo, Platform, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import BodyDetail from '../../app/(tabs)/body/[kind]';
import Stats from '../../app/(tabs)/stats';
import { addBodyEntry, listBodyEntries } from '../db/repositories/bodyRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { LineChart } from './charts/LineChart';
import { Footer } from './Footer';

/** React Native's own sendAccessibilityEvent, put back after a test takes it away as React Native Web does. */
const realSendAccessibilityEvent = AccessibilityInfo.sendAccessibilityEvent;
function setSendAccessibilityEvent(fn: (() => void) | undefined): void {
  (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent = fn;
}
afterEach(() => setSendAccessibilityEvent(realSendAccessibilityEvent as () => void));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the screens read and write through the body repository, and every write bumps the data version,
// which makes the screen read again, as on the phone.
let mockDb: Db;
let mockKind = 'bodyweight';
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => ({ kind: mockKind }),
  useFocusEffect: () => undefined,
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('./Footer', () => ({ Footer: () => null }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({
  ...jest.requireActual('../platform/announce'),
  announce: (text: string) => mockAnnounce(text),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Noon on Sunday 11 October 2026, local time: "today" for every test. */
const NOW = new Date(2026, 9, 11, 12, 0, 0).getTime();
const DAY = 86_400_000;
let closeDb: () => void;

beforeEach(() => {
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
  // A lb lifter unless a test says otherwise (a fresh database with no region defaults to kg).
  setSetting(mockDb, 'unit', 'lb');
  mockKind = 'bodyweight';
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.mocked(router.push).mockClear();
  mockAnnounce.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  closeDb();
});

/** Every node with a live region, which TalkBack reads as it changes. */
const liveRegions = (tree: ReactTestRenderer) =>
  tree.root
    .findAll((n) => n.props.accessibilityLiveRegion !== undefined && n.props.accessibilityLiveRegion !== 'none')
    .map((n) => n.props.accessibilityLiveRegion as string);

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

const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label)!;

const pressable = (tree: ReactTestRenderer, label: string): ReactTestInstance => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length === 0) {
    // A button with no separate VoiceOver label is found by its text.
    const byText = tree.root.findAll(
      (n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && n.findAll((c) => c.children.includes(label)).length > 0,
    );
    if (byText.length === 0) throw new Error(`Nothing to press called ${label}`);
    return byText[byText.length - 1];
  }
  return found[0];
};

const press = (tree: ReactTestRenderer, label: string) => act(() => pressable(tree, label).props.onPress());
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label).props.onChangeText(text));
const chartPoints = (tree: ReactTestRenderer) => tree.root.findByType(LineChart).props.points as { localDate: string; value: number }[];

describe('Stats: Body (R114)', () => {
  it('shows Stats, Body, a Bodyweight card with "No entries yet.", Measurements and the footer', () => {
    const tree = mount(<Stats />);
    const t = shownText(tree);
    // Other Stats sections may draw between the title and Body (R172); Body is followed by its Bodyweight card.
    expect(t[0]).toBe('Stats');
    expect(t.slice(t.indexOf('Body'), t.indexOf('Body') + 2)).toEqual(['Body', 'Bodyweight']);
    expect(t).toContain('No entries yet.');
    expect(t).toContain('Measurements');
    expect(t).not.toContain('Not built yet.');
    expect(tree.root.findAllByType(Footer).length).toBe(1);
    // No entries draw no chart.
    expect(tree.root.findAllByType(LineChart).length).toBe(0);
  });

  it('logs a bodyweight for today and shows it as the latest', () => {
    const tree = mount(<Stats />);
    type(tree, 'Bodyweight, lb', '182.5');
    press(tree, 'Log');

    const [entry] = listBodyEntries(mockDb, 'bodyweight');
    expect(entry).toMatchObject({ value: 182.5, unit: 'lb', localDate: '2026-10-11', measuredAt: NOW });
    const t = shownText(tree);
    expect(t).not.toContain('No entries yet.');
    expect(t).toContain('182.5');
    expect(t).toContain('Oct 11');
    expect(field(tree, 'Bodyweight, lb').props.value).toBe('');
    expect(chartPoints(tree)).toEqual([{ localDate: '2026-10-11', value: 182.5 }]);
    expect(mockAnnounce).toHaveBeenCalledWith('Logged 182.5 lb.');
  });

  it.each(['1855', 'abc', '-3', '19'])('shows "Check this number" for %s and writes nothing', (text) => {
    const tree = mount(<Stats />);
    type(tree, 'Bodyweight, lb', text);
    press(tree, 'Log');
    expect(listBodyEntries(mockDb, 'bodyweight')).toEqual([]);
    expect(shownText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    expect(mockAnnounce).not.toHaveBeenCalledWith(expect.stringMatching(/^Logged/));
    // Said once: announce() speaks it on both phones, so no live region reads it again on Android.
    expect(liveRegions(tree)).toEqual([]);
    // Typing again clears it.
    type(tree, 'Bodyweight, lb', '180');
    expect(shownText(tree)).not.toContain('Check this number');
  });

  it("says Couldn't log. Try again. in a muted line when the write fails, tells the screen reader, and keeps the number", () => {
    const tree = mount(<Stats />);
    type(tree, 'Bodyweight, lb', '182.5');
    const insert = jest.spyOn(mockDb, 'insert').mockImplementation(() => {
      throw new Error('SQLITE_BUSY');
    });
    expect(() => press(tree, 'Log')).not.toThrow();
    insert.mockRestore();

    expect(listBodyEntries(mockDb, 'bodyweight')).toEqual([]);
    expect(shownText(tree)).toContain("Couldn't log. Try again.");
    expect(mockAnnounce).toHaveBeenCalledWith("Couldn't log. Try again.");
    expect(mockAnnounce).not.toHaveBeenCalledWith(expect.stringMatching(/^Logged/));
    expect(field(tree, 'Bodyweight, lb').props.value).toBe('182.5');
    // Typing again clears it.
    type(tree, 'Bodyweight, lb', '182');
    expect(shownText(tree)).not.toContain("Couldn't log. Try again.");
  });

  it('a kg lifter logs in kg, and an earlier lb entry charts in kg', () => {
    setSetting(mockDb, 'unit', 'kg');
    addBodyEntry(mockDb, 'bodyweight', 220.5, 'lb', NOW - 10 * DAY);
    const tree = mount(<Stats />);
    expect(shownText(tree)).toContain('kg');
    type(tree, 'Bodyweight, kg', '99,5');
    press(tree, 'Log');

    const [latest, earlier] = listBodyEntries(mockDb, 'bodyweight');
    expect(latest).toMatchObject({ value: 99.5, unit: 'kg' });
    expect(earlier).toMatchObject({ value: 220.5, unit: 'lb' });
    const points = chartPoints(tree);
    expect(points.map((p) => p.localDate)).toEqual(['2026-10-01', '2026-10-11']);
    expect(points[0].value).toBeCloseTo(100.017, 2);
    expect(points[1].value).toBe(99.5);
    expect(tree.root.findByType(LineChart).props.accessibilityLabel).toMatch(/^Bodyweight\. Oct 1 to Oct 11: 100 kg to 99\.5 kg\./);
  });

  it('shows the latest bodyweight in the unit it was logged in (spec 7), while the chart converts it', () => {
    setSetting(mockDb, 'unit', 'kg');
    addBodyEntry(mockDb, 'bodyweight', 220.5, 'lb', NOW - DAY);
    const tree = mount(<Stats />);
    const t = shownText(tree);
    expect(t).toContain('220.5');
    expect(t).toContain('lb');
    expect(t).not.toContain('100');
    expect(t).toContain('Oct 10');
    expect(chartPoints(tree)[0].value).toBeCloseTo(100.017, 2);
  });

  it('shows a measurement in the unit it was logged in', () => {
    addBodyEntry(mockDb, 'waist', 86.4, 'cm', NOW - DAY);
    expect(shownText(mount(<Stats />))).toContain('86.4 cm · Oct 10');
  });

  it('lists each measurement with its latest value and date, or "No entries", and opens its detail', () => {
    addBodyEntry(mockDb, 'waist', 34, 'in', NOW - 2 * DAY);
    addBodyEntry(mockDb, 'waist', 33.5, 'in', NOW - DAY);
    const tree = mount(<Stats />);
    const t = shownText(tree);
    for (const name of ['Waist', 'Chest', 'Hips', 'Arms', 'Thighs', 'Neck', 'Body fat']) expect(t).toContain(name);
    expect(t).toContain('33.5 in · Oct 10');
    expect(t.filter((s) => s === 'No entries')).toHaveLength(6);

    press(tree, 'Waist, 33.5 in, Oct 10');
    expect(router.push).toHaveBeenCalledWith('/body/waist');
    press(tree, 'Body fat, No entries');
    expect(router.push).toHaveBeenCalledWith('/body/body_fat');
  });

  it('opens all bodyweight entries', () => {
    const tree = mount(<Stats />);
    press(tree, 'All entries, bodyweight');
    expect(router.push).toHaveBeenCalledWith('/body/bodyweight');
  });

  it('switches the chart range with the chips: 3M by default, then 1Y and All', () => {
    addBodyEntry(mockDb, 'bodyweight', 190, 'lb', NOW - 500 * DAY);
    addBodyEntry(mockDb, 'bodyweight', 186, 'lb', NOW - 200 * DAY);
    addBodyEntry(mockDb, 'bodyweight', 182, 'lb', NOW - 5 * DAY);
    const tree = mount(<Stats />);
    const chip = (label: string) => pressable(tree, label);
    expect(chip('3M, last 3 months').props.accessibilityRole).toBe('radio');
    expect(chip('3M, last 3 months').props.accessibilityState).toEqual({ checked: true });
    expect(chartPoints(tree).map((p) => p.value)).toEqual([182]);

    press(tree, '1Y, last year');
    expect(chip('1Y, last year').props.accessibilityState).toEqual({ checked: true });
    expect(chip('3M, last 3 months').props.accessibilityState).toEqual({ checked: false });
    expect(chartPoints(tree).map((p) => p.value)).toEqual([186, 182]);

    press(tree, 'All, all time');
    expect(chartPoints(tree).map((p) => p.value)).toEqual([190, 186, 182]);
  });

  it('says so when the range holds no entries', () => {
    addBodyEntry(mockDb, 'bodyweight', 186, 'lb', NOW - 200 * DAY);
    const tree = mount(<Stats />);
    expect(tree.root.findAllByType(LineChart).length).toBe(0);
    expect(shownText(tree)).toContain('No entries in this range.');
    press(tree, '1Y, last year');
    expect(tree.root.findAllByType(LineChart).length).toBe(1);
  });

  it('charts each day by its latest entry (R115)', () => {
    addBodyEntry(mockDb, 'bodyweight', 181, 'lb', NOW - 3 * 3_600_000);
    addBodyEntry(mockDb, 'bodyweight', 180, 'lb', NOW - 3_600_000);
    expect(chartPoints(mount(<Stats />))).toEqual([{ localDate: '2026-10-11', value: 180 }]);
  });

  it('says the change across the range under the chart, in the chart unit (R175)', () => {
    addBodyEntry(mockDb, 'bodyweight', 190, 'lb', NOW - 200 * DAY);
    addBodyEntry(mockDb, 'bodyweight', 186, 'lb', NOW - 30 * DAY);
    addBodyEntry(mockDb, 'bodyweight', 184, 'lb', NOW - DAY);
    const tree = mount(<Stats />);
    expect(shownText(tree)).toContain('Down 2 lb since Sep 11.');
    press(tree, '1Y, last year');
    expect(shownText(tree)).toContain('Down 6 lb since Mar 25.');
  });

  it('says no change line with one point in the range', () => {
    addBodyEntry(mockDb, 'bodyweight', 186, 'lb', NOW - DAY);
    expect(shownText(mount(<Stats />)).some((s) => / since /.test(s))).toBe(false);
  });
});

describe('a body detail (/body/[kind], R114, R115)', () => {
  it('shows the label, the entry row, the chart and every entry newest first, each in its own unit', () => {
    mockKind = 'waist';
    addBodyEntry(mockDb, 'waist', 86.4, 'cm', NOW - 2 * DAY);
    addBodyEntry(mockDb, 'waist', 34, 'in', NOW - DAY);
    addBodyEntry(mockDb, 'waist', 33.75, 'in', NOW - 60_000);
    const tree = mount(<BodyDetail />);
    const t = shownText(tree);
    expect(t).toContain('Waist');
    expect(t).toContain('Stats');
    expect(field(tree, 'Waist, in')).toBeDefined();
    const rows = ['Oct 11, 33.8 in', 'Oct 10, 34 in', 'Oct 9, 86.4 cm'];
    const found = tree.root
      .findAll((n) => typeof n.props.onPress === 'function' && rows.includes(n.props.accessibilityLabel))
      .map((n) => n.props.accessibilityLabel);
    expect(found).toEqual(rows);
    expect(chartPoints(tree).map((p) => p.localDate)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(chartPoints(tree)[0].value).toBeCloseTo(34.016, 2);
  });

  it('says a measurement\'s change under its chart, converted to the chart unit (R175)', () => {
    mockKind = 'waist';
    setSetting(mockDb, 'unit', 'kg');
    addBodyEntry(mockDb, 'waist', 88, 'cm', NOW - 69 * DAY);
    addBodyEntry(mockDb, 'waist', 86, 'cm', NOW - DAY);
    expect(shownText(mount(<BodyDetail />))).toContain('Down 2 cm since Aug 3.');
  });

  it('logs a new entry from the detail', () => {
    mockKind = 'body_fat';
    const tree = mount(<BodyDetail />);
    type(tree, 'Body fat, %', '18.5');
    press(tree, 'Log');
    expect(listBodyEntries(mockDb, 'body_fat')[0]).toMatchObject({ value: 18.5, unit: '%' });
    expect(shownText(tree)).toContain('18.5%');
  });

  it('edits an entry: the field holds the stored value, untouched Save writes nothing new, a new value is saved', () => {
    mockKind = 'waist';
    const id = addBodyEntry(mockDb, 'waist', 33.75, 'in', NOW - DAY);
    const tree = mount(<BodyDetail />);
    press(tree, 'Oct 10, 33.8 in');
    expect(shownText(tree)).toContain('Waist on Oct 10');
    const edit = () => tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Waist on Oct 10, in')!;
    expect(edit().props.value).toBe('33.75');

    press(tree, 'Save');
    expect(listBodyEntries(mockDb, 'waist')).toEqual([expect.objectContaining({ id, value: 33.75 })]);
    expect(shownText(tree)).not.toContain('Waist on Oct 10');

    press(tree, 'Oct 10, 33.8 in');
    act(() => edit().props.onChangeText('200'));
    press(tree, 'Save');
    expect(shownText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    expect(liveRegions(tree)).toEqual([]);
    expect(listBodyEntries(mockDb, 'waist')[0].value).toBe(33.75);

    act(() => edit().props.onChangeText('33'));
    press(tree, 'Save');
    expect(listBodyEntries(mockDb, 'waist')).toEqual([expect.objectContaining({ id, value: 33, unit: 'in', localDate: '2026-10-10' })]);
    expect(shownText(tree)).toContain('33 in');
  });

  it('an untouched Save closes without checking a stored value outside the bounds', () => {
    mockKind = 'bodyweight';
    addBodyEntry(mockDb, 'bodyweight', 1500, 'lb', NOW);
    const tree = mount(<BodyDetail />);
    press(tree, 'Oct 11, 1500 lb');
    press(tree, 'Save');
    expect(shownText(tree)).not.toContain('Check this number');
    expect(shownText(tree)).not.toContain('Bodyweight on Oct 11');
    expect(listBodyEntries(mockDb, 'bodyweight')[0].value).toBe(1500);
  });

  it('Cancel leaves the entry as it was', () => {
    mockKind = 'bodyweight';
    addBodyEntry(mockDb, 'bodyweight', 180, 'lb', NOW);
    const tree = mount(<BodyDetail />);
    press(tree, 'Oct 11, 180 lb');
    act(() => tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === 'Bodyweight on Oct 11, lb')!.props.onChangeText('190'));
    press(tree, 'Cancel');
    expect(listBodyEntries(mockDb, 'bodyweight')[0].value).toBe(180);
    expect(shownText(tree)).not.toContain('Bodyweight on Oct 11');
  });

  it('deletes an entry after asking, and Keep keeps it', () => {
    mockKind = 'waist';
    addBodyEntry(mockDb, 'waist', 34, 'in', NOW);
    const tree = mount(<BodyDetail />);
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => undefined);
    press(tree, 'Oct 11, 34 in');
    expect(focus).not.toHaveBeenCalled();
    press(tree, 'Delete');
    expect(shownText(tree)).toContain('Delete this entry?');
    // VoiceOver moves to the question's title, a header.
    expect(focus).toHaveBeenCalledTimes(1);
    // In tests Text is a mock component, so the ref is that instance and carries the title's props.
    type Sent = [{ props: { children: unknown; accessibilityRole?: string } }, string];
    const [node, event] = focus.mock.calls[0] as unknown as Sent;
    expect(event).toBe('focus');
    expect(node.props.children).toBe('Delete this entry?');
    expect(node.props.accessibilityRole).toBe('header');
    press(tree, 'Keep');
    expect((focus.mock.calls[1] as unknown as Sent)[0].props.children).toBe('Waist on Oct 11');
    expect(listBodyEntries(mockDb, 'waist')).toHaveLength(1);
    expect(shownText(tree)).toContain('Waist on Oct 11');

    press(tree, 'Delete');
    press(tree, 'Delete');
    expect(listBodyEntries(mockDb, 'waist')).toEqual([]);
    expect(shownText(tree)).not.toContain('Delete this entry?');
    expect(shownText(tree)).toContain('No entries yet.');
  });

  it('on the web, which has no sendAccessibilityEvent, Delete asks and deletes without crashing', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    setSendAccessibilityEvent(undefined);
    mockKind = 'waist';
    addBodyEntry(mockDb, 'waist', 34, 'in', NOW);
    const tree = mount(<BodyDetail />);
    press(tree, 'Oct 11, 34 in');
    press(tree, 'Delete');
    expect(shownText(tree)).toContain('Delete this entry?');
    press(tree, 'Delete');
    expect(listBodyEntries(mockDb, 'waist')).toEqual([]);
  });

  it('says "That isn\'t here." for a kind that is not one', () => {
    mockKind = 'ankles';
    const tree = mount(<BodyDetail />);
    expect(shownText(tree)).toContain("That isn't here.");
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    press(tree, 'Back to Stats');
    expect(router.back).toHaveBeenCalled();
  });
});
