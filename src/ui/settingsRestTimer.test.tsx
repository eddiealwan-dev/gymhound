import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { setSetting } from '../db/repositories/settingsRepo';
import { bumpData } from '../state/dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the screen reads. A write through `setSetting` lands here, as it would in SQLite. */
const mockStored: Record<string, unknown> = {};
const STARTING = { theme: 'system', unit: 'lb', distanceUnit: 'mi', restSeconds: 120, restBell: true, restBellSound: 'bell', lastSnapshotAt: null };

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ ...mockStored }),
  setSetting: jest.fn((_db: unknown, key: string, value: unknown) => {
    mockStored[key] = value;
  }),
}));
jest.mock('../db/repositories/unitsRepo', () => ({ switchDisplayUnit: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../state/backup', () => ({ latestSnapshotPath: () => null, shareFile: jest.fn() }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
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

beforeEach(() => {
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  Object.assign(mockStored, STARTING);
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
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
