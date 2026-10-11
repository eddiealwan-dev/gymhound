/** @jest-environment node */
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { listWater, logWater, setWaterGoal } from '../db/repositories/waterRepo';
import { createTestDb } from '../db/testing/createTestDb';
import type { Db } from '../db/types';
import { toMl } from '../domain/water';
import { WaterCard } from './fuel/WaterCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A real database: the card reads and writes through the water repository, and every write bumps the data version,
// which makes the card read again, as on the phone.
let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));
const mockFlushAll = jest.fn();
jest.mock('../state/draftFlush', () => ({ flushAll: () => mockFlushAll() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** 9:00 on Sunday 11 October 2026, local time: "now" for every test. */
const NOW = new Date(2026, 9, 11, 9, 0, 0).getTime();
const TODAY = '2026-10-11';
let closeDb: () => void;

beforeEach(() => {
  const handle = createTestDb();
  mockDb = handle.db;
  closeDb = handle.close;
  // A kg user (ml) unless a test says otherwise.
  setSetting(mockDb, 'unit', 'kg');
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  mockAnnounce.mockClear();
  mockFlushAll.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  closeDb();
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Every string drawn, in order. */
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

const allText = (tree: ReactTestRenderer) => shownText(tree).join('');

const pressables = (tree: ReactTestRenderer, label: string): ReactTestInstance[] => {
  const found = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label);
  if (found.length > 0) return found;
  // A button with no separate VoiceOver label is found by its text.
  return tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityLabel === undefined &&
      n.findAll((c) => c.children.includes(label)).length > 0,
  );
};

const press = (tree: ReactTestRenderer, label: string) => {
  const found = pressables(tree, label);
  if (found.length === 0) throw new Error(`Nothing to press called ${label}`);
  act(() => found[found.length - 1].props.onPress());
};

const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label);
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label)!.props.onChangeText(text));

const bar = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.testID === 'water-progress-fill' && typeof n.type === 'string');

describe('the water card (R150)', () => {
  it('shows the day total of the goal, with the bar filled to the share drunk', () => {
    setWaterGoal(mockDb, 2000);
    logWater(mockDb, 500, TODAY, NOW - 3_600_000);
    logWater(mockDb, 750, TODAY, NOW);
    logWater(mockDb, 999, '2026-10-10', NOW);
    const tree = mount(<WaterCard localDate={TODAY} />);
    expect(shownText(tree)[0]).toBe('Water');
    expect(allText(tree)).toContain('1,250 ml of 2,000 ml');
    expect(bar(tree)).toHaveLength(1);
    expect(bar(tree)[0].props.style).toMatchObject({ width: '62.5%' });
    expect(allText(tree)).not.toContain('Set a daily goal');
    // The line reads as one, and opens the goal.
    expect(pressables(tree, '1,250 ml of 2,000 ml')).toHaveLength(1);
  });

  it('caps the bar full at the goal', () => {
    setWaterGoal(mockDb, 250);
    logWater(mockDb, 500, TODAY, NOW);
    const tree = mount(<WaterCard localDate={TODAY} />);
    expect(bar(tree)[0].props.style).toMatchObject({ width: '100%' });
  });

  it('with no goal shows the total, no bar and a quiet Set a daily goal', () => {
    logWater(mockDb, 250, TODAY, NOW);
    const tree = mount(<WaterCard localDate={TODAY} />);
    expect(shownText(tree)).toContain('250 ml');
    expect(allText(tree)).not.toContain(' of ');
    expect(bar(tree)).toHaveLength(0);
    expect(shownText(tree)).toContain('Set a daily goal');
  });

  it('shows 0 ml on a day with nothing, and no Entries', () => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    expect(shownText(tree)).toContain('0 ml');
    expect(allText(tree)).not.toContain('Entries');
  });

  it('offers +250 ml, +500 ml and Other to a kg user, each with a VoiceOver label', () => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    const t = shownText(tree);
    expect(t).toEqual(expect.arrayContaining(['+250 ml', '+500 ml', 'Other']));
    expect(pressables(tree, 'Add 250 ml of water').length).toBeGreaterThan(0);
    expect(pressables(tree, 'Add 500 ml of water').length).toBeGreaterThan(0);
    expect(pressables(tree, 'Add another amount of water').length).toBeGreaterThan(0);
  });

  it('offers +8 fl oz and +16 fl oz to a lb user and shows fl oz', () => {
    setSetting(mockDb, 'unit', 'lb');
    setWaterGoal(mockDb, toMl(64, 'fl_oz'));
    logWater(mockDb, toMl(40, 'fl_oz'), TODAY, NOW - 60_000);
    const tree = mount(<WaterCard localDate={TODAY} />);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['+8 fl oz', '+16 fl oz']));
    expect(allText(tree)).toContain('40 fl oz of 64 fl oz');
    press(tree, 'Add 8 fluid ounces of water');
    const entries = listWater(mockDb, TODAY);
    expect(entries[entries.length - 1].amountMl).toBeCloseTo(236.588, 3);
    expect(mockAnnounce).toHaveBeenCalledWith('Added 8 fluid ounces. 48 fluid ounces today.');
    // VoiceOver hears the goal line in full; the screen keeps fl oz.
    expect(pressables(tree, '48 fluid ounces of 64 fluid ounces').length).toBeGreaterThan(0);
  });

  it('a pill logs for today and says the new total', () => {
    logWater(mockDb, 1000, TODAY, NOW - 60_000);
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Add 250 ml of water');
    expect(listWater(mockDb, TODAY).map((e) => e.amountMl)).toEqual([1000, 250]);
    expect(listWater(mockDb, TODAY)[1].loggedAt).toBe(NOW);
    expect(mockAnnounce).toHaveBeenCalledWith('Added 250 ml. 1,250 ml today.');
    expect(shownText(tree)).toContain('1,250 ml');
    expect(mockFlushAll).toHaveBeenCalled();
  });

  it('a pill logs for the day the card shows, even an earlier one', () => {
    const tree = mount(<WaterCard localDate="2026-10-10" />);
    press(tree, 'Add 500 ml of water');
    expect(listWater(mockDb, TODAY)).toEqual([]);
    expect(listWater(mockDb, '2026-10-10').map((e) => e.amountMl)).toEqual([500]);
    expect(mockAnnounce).toHaveBeenCalledWith('Added 500 ml. 500 ml on Oct 10.');
  });

  it('draws nothing in red', () => {
    setWaterGoal(mockDb, 2000);
    logWater(mockDb, 250, TODAY, NOW);
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Water entries');
    expect(JSON.stringify(tree.toJSON()).toUpperCase()).not.toContain('#E10600');
  });
});

describe('Other', () => {
  it('adds an amount typed in the unit, for the card day', () => {
    const tree = mount(<WaterCard localDate="2026-10-10" />);
    press(tree, 'Add another amount of water');
    expect(shownText(tree)).toContain('Add water');
    type(tree, 'Amount, ml', '330');
    press(tree, 'Add');
    expect(listWater(mockDb, '2026-10-10').map((e) => e.amountMl)).toEqual([330]);
    expect(mockAnnounce).toHaveBeenCalledWith('Added 330 ml. 330 ml on Oct 10.');
    expect(shownText(tree)).not.toContain('Add water');
  });

  it.each(['', 'abc', '0', '5000'])('shows "Check this number" for "%s" and adds nothing', (text) => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Add another amount of water');
    type(tree, 'Amount, ml', text);
    press(tree, 'Add');
    expect(listWater(mockDb, TODAY)).toEqual([]);
    expect(shownText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
    // Typing again clears it.
    type(tree, 'Amount, ml', '3');
    expect(shownText(tree)).not.toContain('Check this number');
  });

  it('takes fl oz from a lb user, with a comma', () => {
    setSetting(mockDb, 'unit', 'lb');
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Add another amount of water');
    type(tree, 'Amount, fluid ounces', '12,5');
    press(tree, 'Add');
    expect(listWater(mockDb, TODAY)[0].amountMl).toBeCloseTo(toMl(12.5, 'fl_oz'), 6);
  });

  it('Cancel adds nothing', () => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Add another amount of water');
    type(tree, 'Amount, ml', '330');
    press(tree, 'Cancel');
    expect(listWater(mockDb, TODAY)).toEqual([]);
    expect(shownText(tree)).not.toContain('Add water');
  });
});

describe('the daily goal', () => {
  it('Set a daily goal opens the goal sheet and saves it', () => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Set a daily goal');
    expect(shownText(tree)).toContain('Daily water goal');
    // No goal yet, so nothing to clear.
    expect(shownText(tree)).not.toContain('Clear goal');
    type(tree, 'Daily water goal, ml', '2000');
    press(tree, 'Save');
    expect(getSettings(mockDb).waterGoalMl).toBe(2000);
    expect(allText(tree)).toContain('0 ml of 2,000 ml');
    expect(shownText(tree)).not.toContain('Set a daily goal');
  });

  it('refuses a goal out of bounds', () => {
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Set a daily goal');
    type(tree, 'Daily water goal, ml', '100');
    press(tree, 'Save');
    expect(getSettings(mockDb).waterGoalMl).toBeNull();
    expect(shownText(tree)).toContain('Check this number');
    expect(mockAnnounce).toHaveBeenCalledWith('Check this number');
  });

  it('tapping the goal opens it with the goal in the field, and Clear goal clears it', () => {
    setWaterGoal(mockDb, 2000);
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, '0 ml of 2,000 ml');
    expect(field(tree, 'Daily water goal, ml')!.props.value).toBe('2000');
    press(tree, 'Clear goal');
    expect(getSettings(mockDb).waterGoalMl).toBeNull();
    expect(shownText(tree)).toContain('Set a daily goal');
  });

  it('a lb user sets the goal in fl oz', () => {
    setSetting(mockDb, 'unit', 'lb');
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Set a daily goal');
    type(tree, 'Daily water goal, fluid ounces', '64');
    press(tree, 'Save');
    expect(getSettings(mockDb).waterGoalMl).toBeCloseTo(toMl(64, 'fl_oz'), 6);
    expect(allText(tree)).toContain('0 fl oz of 64 fl oz');
  });

  it('Cancel keeps the goal', () => {
    setWaterGoal(mockDb, 2000);
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, '0 ml of 2,000 ml');
    type(tree, 'Daily water goal, ml', '3000');
    press(tree, 'Cancel');
    expect(getSettings(mockDb).waterGoalMl).toBe(2000);
  });
});

describe('Entries', () => {
  it('says fluid ounces to VoiceOver on Delete', () => {
    setSetting(mockDb, 'unit', 'lb');
    logWater(mockDb, toMl(8, 'fl_oz'), TODAY, new Date(2026, 9, 11, 8, 14).getTime());
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Water entries');
    expect(shownText(tree)).toContain('8 fl oz');
    const del = tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^Delete 8 fluid ounces at 8:14\sAM$/.test(n.props.accessibilityLabel ?? ''));
    act(() => del[0].props.onPress());
    expect(mockAnnounce).toHaveBeenCalledWith('Deleted 8 fluid ounces.');
  });

  it('lists the day by time and amount, and Delete removes one without asking', () => {
    const at814 = new Date(2026, 9, 11, 8, 14).getTime();
    const at1030 = new Date(2026, 9, 11, 10, 30).getTime();
    logWater(mockDb, 250, TODAY, at814);
    logWater(mockDb, 500, TODAY, at1030);
    const tree = mount(<WaterCard localDate={TODAY} />);
    press(tree, 'Water entries');
    expect(shownText(tree)).toContain('Water today');
    const text = allText(tree);
    expect(text).toMatch(/8:14\sAM/);
    expect(text).toMatch(/10:30\sAM/);
    const del = tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^Delete 250 ml at 8:14\sAM$/.test(n.props.accessibilityLabel ?? ''));
    expect(del.length).toBeGreaterThan(0);
    act(() => del[0].props.onPress());
    expect(listWater(mockDb, TODAY).map((e) => e.amountMl)).toEqual([500]);
    expect(mockAnnounce).toHaveBeenCalledWith('Deleted 250 ml.');
    expect(allText(tree)).not.toMatch(/8:14\sAM/);
  });

  it('closes when the last entry is deleted, and Entries goes', () => {
    logWater(mockDb, 250, '2026-10-10', NOW);
    const tree = mount(<WaterCard localDate="2026-10-10" />);
    press(tree, 'Water entries');
    expect(shownText(tree)).toContain('Water on Oct 10');
    // An earlier day's entries were logged later, so their time says nothing: just the amount.
    expect(allText(tree)).not.toMatch(/\d:\d\d/);
    const del = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === 'Delete 250 ml');
    act(() => del[0].props.onPress());
    expect(listWater(mockDb, '2026-10-10')).toEqual([]);
    expect(shownText(tree)).not.toContain('Water on Oct 10');
    expect(allText(tree)).not.toContain('Entries');
  });
});
