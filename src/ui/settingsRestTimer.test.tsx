import { StyleSheet, Switch, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { setSetting } from '../db/repositories/settingsRepo';
import { playBell } from '../platform/restTimer/bell';
import { bumpData } from '../state/dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the screen reads. A write through `setSetting` lands here, as it would in SQLite. */
const mockStored: Record<string, unknown> = {};
const STARTING = { theme: 'system', unit: 'lb', distanceUnit: 'mi', restSeconds: 120, restBell: true, restBellSound: 'bell', restBellVolume: 1, lastSnapshotAt: null, lastSnapshotError: null };

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ ...mockStored }),
  setSetting: jest.fn((_db: unknown, key: string, value: unknown) => {
    mockStored[key] = value;
  }),
}));
jest.mock('../db/repositories/unitsRepo', () => ({ switchDisplayUnit: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../state/backup', () => ({
  snapshotListing: () => ({ path: null, names: [], error: null }),
  snapshotFolderReport: () => null,
  shareFile: jest.fn(),
}));
jest.mock('../state/dataVersion', () => ({
  useDbQuery: (query: (db: unknown) => unknown) => query('db'),
  useDataVersion: (select: (state: { version: number }) => unknown) => select({ version: 0 }),
  bumpData: jest.fn(),
}));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Settings />);
  });
  return tree;
}

/** The rest length choices in screen order, each pressable, by its m:ss label. */
function lengths(tree: ReactTestRenderer) {
  return tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^\d:\d\d$/.test(String(n.props.accessibilityLabel)));
}

/** The choices that report themselves selected to the screen reader. */
const selected = (tree: ReactTestRenderer) =>
  lengths(tree)
    .filter((n) => n.props.accessibilityState?.selected === true)
    .map((n) => n.props.accessibilityLabel);

/** The bell volume choices in screen order, each pressable, by its percent label. */
function volumes(tree: ReactTestRenderer) {
  return tree.root.findAll((n) => typeof n.props.onPress === 'function' && /^\d+%$/.test(String(n.props.accessibilityLabel)));
}

const selectedVolumes = (tree: ReactTestRenderer) =>
  volumes(tree)
    .filter((n) => n.props.accessibilityState?.selected === true)
    .map((n) => n.props.accessibilityLabel);

beforeEach(() => {
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  Object.assign(mockStored, STARTING);
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
  jest.mocked(playBell).mockClear();
});

describe('Settings: the bell volume (Task 26)', () => {
  it('offers 25%, 50%, 75% and 100%, with the stored volume selected', () => {
    const tree = mount();
    expect(volumes(tree).map((n) => n.props.accessibilityLabel)).toEqual(['25%', '50%', '75%', '100%']);
    expect(selectedVolumes(tree)).toEqual(['100%']);
  });

  it('stores 0.5 when 50% is chosen, bumps, plays the chosen bell at that volume, and shows 50% selected', () => {
    mockStored.restBellSound = 'chime';
    const tree = mount();
    const choice = volumes(tree).find((n) => n.props.accessibilityLabel === '50%')!;

    act(() => choice.props.onPress());

    expect(setSetting).toHaveBeenCalledWith('db', 'restBellVolume', 0.5);
    expect(bumpData).toHaveBeenCalledTimes(1);
    expect(playBell).toHaveBeenCalledWith('chime', 0.5);
    act(() => tree.update(<Settings />));
    expect(selectedVolumes(tree)).toEqual(['50%']);
  });

  it('previews a newly picked sound at the stored volume', () => {
    mockStored.restBellVolume = 0.75;
    const tree = mount();
    const ding = tree.root.findAll(
      (n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === 'Ding').length > 0,
    )[0];

    act(() => ding.props.onPress());

    expect(setSetting).toHaveBeenCalledWith('db', 'restBellSound', 'ding');
    expect(playBell).toHaveBeenCalledWith('ding', 0.75);
  });
});

describe('Settings: the rest timer length (spec 8.11, F7)', () => {
  it('offers every rest choice but Off, which belongs to an exercise', () => {
    const tree = mount();
    expect(lengths(tree).map((n) => n.props.accessibilityLabel)).toEqual(['0:30', '0:45', '1:00', '1:30', '2:00', '2:30', '3:00', '4:00', '5:00']);
  });

  it('shows the stored length as the selected choice (F10)', () => {
    expect(selected(mount())).toEqual(['2:00']);
  });

  it('stores 90 seconds when 1:30 is chosen, bumps, and shows 1:30 selected', () => {
    const tree = mount();
    const choice = lengths(tree).find((n) => n.props.accessibilityLabel === '1:30')!;

    act(() => choice.props.onPress());

    expect(setSetting).toHaveBeenCalledWith('db', 'restSeconds', 90);
    expect(bumpData).toHaveBeenCalledTimes(1);
    act(() => tree.update(<Settings />));
    expect(selected(tree)).toEqual(['1:30']);
  });
});

describe('Settings: the page (design pass)', () => {
  it('each group has an upper-case muted heading the screen reader hears as a heading', () => {
    const tree = mount();

    for (const title of ['Appearance', 'Units', 'Bar', 'Rest timer', 'Backups', 'Export']) {
      const heading = tree.root.findAll((n) => n.type === Text && n.props.children === title);
      expect(heading).toHaveLength(1);
      expect(heading[0].props.accessibilityRole).toBe('header');
      expect(StyleSheet.flatten(heading[0].props.style)).toMatchObject({ textTransform: 'uppercase', fontSize: 14, color: '#a39d90' });
    }
    // A field's own name stays a plain line in the text colour.
    const weight = tree.root.findAll((n) => n.type === Text && n.props.children === 'Weight')[0];
    expect(weight.props.accessibilityRole).toBeUndefined();
    expect(StyleSheet.flatten(weight.props.style)).toMatchObject({ color: '#f1ece2' });
  });

  it("the bar's purpose is a muted helper line", () => {
    const tree = mount();

    const helper = tree.root.findAll((n) => n.type === Text && n.props.children === 'Used by the plate calculator.')[0];
    expect(StyleSheet.flatten(helper.props.style)).toMatchObject({ color: '#a39d90' });
  });

  it('the bell switch reads in dark: a text-coloured thumb on a borderStrong track when on, a border track when off', () => {
    const tree = mount();

    const toggle = tree.root.findAllByType(Switch).find((s) => s.props.accessibilityLabel === 'Bell at the end')!;
    expect(toggle.props.trackColor).toEqual({ false: '#2e2a23', true: '#736c60' });
    expect(toggle.props.ios_backgroundColor).toBe('#2e2a23');
    expect(toggle.props.thumbColor).toBe('#f1ece2');
    expect(toggle.props.activeThumbColor).toBe('#f1ece2');
  });
});
