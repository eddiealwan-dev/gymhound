import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { setSetting } from '../db/repositories/settingsRepo';
import { bumpData } from '../state/dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the screen reads. A write through `setSetting` lands here, as it would in SQLite. */
const mockStored: Record<string, unknown> = {};
const STARTING = {
  theme: 'system',
  unit: 'lb',
  distanceUnit: 'mi',
  lengthUnit: 'in',
  defaultIncrementLb: 5,
  defaultIncrementKg: 2.5,
  restSeconds: 120,
  restBell: true,
  restBellSound: 'bell',
  restBellVolume: 1,
  lastSnapshotAt: null,
  lastSnapshotError: null,
};

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
jest.mock('./PlatesEditor', () => {
  const { Text: MockText } = jest.requireActual('react-native');
  return { PlatesEditor: () => <MockText>plates editor</MockText> };
});
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

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

/** The increment choices in screen order, each pressable, by its "5 lb" label. */
function increments(tree: ReactTestRenderer) {
  return tree.root.findAll(
    (n) => typeof n.props.onPress === 'function' && n.props.accessibilityRole === 'button' && /^[\d.]+ (lb|kg)$/.test(String(n.props.accessibilityLabel)),
  );
}

const selectedIncrements = (tree: ReactTestRenderer) =>
  increments(tree)
    .filter((n) => n.props.accessibilityState?.selected === true)
    .map((n) => n.props.accessibilityLabel);

beforeEach(() => {
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  Object.assign(mockStored, STARTING);
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
});

describe('Settings: Plates (Task 5, R107)', () => {
  it('has a Plates group after Bar, holding the plates editor', () => {
    const t = texts(mount());
    expect(t).toContain('Plates');
    expect(t.indexOf('Plates')).toBeGreaterThan(t.indexOf('Bar'));
    expect(t.indexOf('plates editor')).toBe(t.indexOf('Plates') + 1);
  });
});

describe('Settings: the segmented choices to VoiceOver', () => {
  it('are radios in a labelled group, each saying whether it is checked', () => {
    const tree = mount();
    const group = (label: string) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === label)[0];
    const radios = (label: string) =>
      group(label)
        .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radio')
        .map((n) => [n.findAllByType(Text)[0].props.children, n.props.accessibilityState]);
    expect(radios('Appearance')).toEqual([
      ['Light', { checked: false }],
      ['Dark', { checked: false }],
      ['System', { checked: true }],
    ]);
    expect(radios('Weight')).toEqual([
      ['lb', { checked: true }],
      ['kg', { checked: false }],
    ]);
  });
});

describe('Settings: the length unit for body measurements (R639b)', () => {
  const group = (tree: ReactTestRenderer, label: string) =>
    tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === label)[0];
  const radios = (tree: ReactTestRenderer) =>
    group(tree, 'Length')
      .findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radio')
      .map((n) => [n.findAllByType(Text)[0].props.children, n.props.accessibilityLabel, n.props.accessibilityState]);

  it('puts Length in Units after Weight and Distance, in and cm, read as inches and centimetres', () => {
    const tree = mount();
    const t = texts(tree);
    expect(t.indexOf('Length')).toBeGreaterThan(t.indexOf('Distance'));
    expect(t.indexOf('Length')).toBeLessThan(t.indexOf('Bar'));
    expect(radios(tree)).toEqual([
      ['in', 'inches', { checked: true }],
      ['cm', 'centimetres', { checked: false }],
    ]);
  });

  it('stores the choice, bumps, and shows it chosen', () => {
    const tree = mount();
    const cm = group(tree, 'Length').findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')[1];
    act(() => cm.props.onPress());
    expect(setSetting).toHaveBeenCalledWith('db', 'lengthUnit', 'cm');
    expect(bumpData).toHaveBeenCalledTimes(1);
    act(() => tree.update(<Settings />));
    expect(radios(tree).map((r) => r[2])).toEqual([{ checked: false }, { checked: true }]);
  });

  it('leaves the weight unit alone', () => {
    const tree = mount();
    const cm = group(tree, 'Length').findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function')[1];
    act(() => cm.props.onPress());
    expect(mockStored.unit).toBe('lb');
  });
});

describe('Settings: the default increment (spec 8.11, R124)', () => {
  it('offers 2.5, 5 and 10 lb for a lb lifter, with the stored 5 lb selected', () => {
    const tree = mount();
    expect(increments(tree).map((n) => n.props.accessibilityLabel)).toEqual(['2.5 lb', '5 lb', '10 lb']);
    expect(selectedIncrements(tree)).toEqual(['5 lb']);
    expect(texts(tree)).toContain('Progression');
    expect(texts(tree)).toContain('New exercises in a routine start with this. Change any one in the routine editor.');
  });

  it('stores 10 lb when it is chosen, bumps, and shows it selected', () => {
    const tree = mount();
    act(() => increments(tree).find((n) => n.props.accessibilityLabel === '10 lb')!.props.onPress());

    expect(setSetting).toHaveBeenCalledWith('db', 'defaultIncrementLb', 10);
    expect(bumpData).toHaveBeenCalledTimes(1);
    act(() => tree.update(<Settings />));
    expect(selectedIncrements(tree)).toEqual(['10 lb']);
  });

  it('edits the kg increment for a kg lifter: 1, 1.25, 2.5 and 5 kg', () => {
    mockStored.unit = 'kg';
    const tree = mount();
    expect(increments(tree).map((n) => n.props.accessibilityLabel)).toEqual(['1 kg', '1.25 kg', '2.5 kg', '5 kg']);
    expect(selectedIncrements(tree)).toEqual(['2.5 kg']);
    act(() => increments(tree).find((n) => n.props.accessibilityLabel === '1.25 kg')!.props.onPress());
    expect(setSetting).toHaveBeenCalledWith('db', 'defaultIncrementKg', 1.25);
    expect(mockStored.defaultIncrementLb).toBe(5);
  });

  it('keeps a stored increment that is not one of the choices, in its place, selected', () => {
    mockStored.defaultIncrementLb = 7.5;
    const tree = mount();
    expect(increments(tree).map((n) => n.props.accessibilityLabel)).toEqual(['2.5 lb', '5 lb', '7.5 lb', '10 lb']);
    expect(selectedIncrements(tree)).toEqual(['7.5 lb']);
  });
});
