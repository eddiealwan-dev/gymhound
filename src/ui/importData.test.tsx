import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import ImportData from '../../app/(tabs)/import';
import { listHistory } from '../db/repositories/historyRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { IMPORT_SAMPLES } from '../domain/importSamples';
import { pickCsvFile, shareSample } from '../platform/importFiles';
import { Button } from './Button';
import { Segmented } from './Segmented';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockPro = true;

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/locale', () => ({ deviceLocale: () => 'en-US', deviceRegion: () => 'US' }));
jest.mock('../platform/entitlements', () => ({ useIsPro: () => mockPro }));
jest.mock('../platform/importFiles', () => ({ pickCsvFile: jest.fn(), shareSample: jest.fn() }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ImportData />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label || b.props.accessibilityLabel === label)!;
const press = async (tree: ReactTestRenderer, label: string) => {
  await act(async () => button(tree, label).props.onPress());
};

beforeEach(() => {
  mockDb = seededDb();
  mockPro = true;
  jest.mocked(pickCsvFile).mockReset();
  jest.mocked(shareSample).mockReset().mockResolvedValue('shared');
});

describe('Settings → Import data (R565)', () => {
  it('says what it reads, and offers a sample of each kind', async () => {
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Import data', 'What it reads', 'Sample files']));
    await press(tree, 'Sample food file');
    expect(shareSample).toHaveBeenCalledWith('food');
  });

  it('shows what a file would add first, then adds it and says what it added', async () => {
    jest.mocked(pickCsvFile).mockResolvedValue({ name: 'workouts.csv', text: IMPORT_SAMPLES.workouts });
    const tree = mount();
    await press(tree, 'Choose a CSV file');
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['workouts.csv', '2 workouts with 6 sets.', 'From Sep 1, 2026 to Sep 3, 2026.', 'Matched to the library (3)', 'New, added as your own (1)', 'Running']),
    );
    // The sample names its unit, so nothing is asked.
    expect(tree.root.findAllByType(Segmented)).toHaveLength(0);
    expect(listHistory(mockDb, 'lb')).toHaveLength(0);

    await press(tree, 'Import');
    expect(texts(tree)).toEqual(expect.arrayContaining(["Added 2 workouts with 6 sets. They're in History, and Stats counts them.", 'Added as your own exercises']));
    expect(listHistory(mockDb, 'lb')).toHaveLength(2);
    await press(tree, 'Done');
    expect(router.back).toHaveBeenCalled();
  });

  it("asks the unit when the file doesn't say, and lists the rows it can't read", async () => {
    jest.mocked(pickCsvFile).mockResolvedValue({ name: 'strong.csv', text: ['Date,Exercise Name,Weight,Reps', '2026-01-02 08:00:00,Squat (Barbell),100,5', 'soon,Squat (Barbell),100,5'].join('\n') });
    const tree = mount();
    await press(tree, 'Choose a CSV file');
    const unit = tree.root.findByType(Segmented);
    expect(unit.props.value).toBe('lb');
    expect(texts(tree)).toEqual(expect.arrayContaining(["Rows that can't be read (1)", 'Row 3: Date not understood: soon']));
    act(() => unit.props.onChange('kg'));
    expect(tree.root.findByType(Segmented).props.value).toBe('kg');
    await press(tree, 'Import');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Rows left out']));
  });

  it("says when a file isn't one it can read, and when it's too big", async () => {
    jest.mocked(pickCsvFile).mockResolvedValueOnce({ name: 'notes.csv', text: 'a,b\n1,2' }).mockResolvedValueOnce({ name: 'huge.csv', tooBig: true });
    const tree = mount();
    await press(tree, 'Choose a CSV file');
    expect(texts(tree).some((t) => t.startsWith("notes.csv: GymHound couldn't tell what this file holds."))).toBe(true);
    await press(tree, 'Choose a CSV file');
    expect(texts(tree)).toContain('huge.csv is too big to import (over 20 MB).');
  });

  it('imports nothing twice', async () => {
    jest.mocked(pickCsvFile).mockResolvedValue({ name: 'food.csv', text: IMPORT_SAMPLES.food });
    const tree = mount();
    await press(tree, 'Choose a CSV file');
    await press(tree, 'Import');
    await press(tree, 'Import another file');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Nothing new to add.', '3 food entries were already in GymHound, and will be left out.']));
    expect(button(tree, 'Import').props.disabled).toBe(true);
  });

  it('free: says it is part of Pro, with See Pro', () => {
    mockPro = false;
    const tree = mount();
    expect(texts(tree)).toContain('Importing workouts, body measurements and food from another app is part of GymHound Pro.');
    expect(button(tree, 'See Pro')).toBeTruthy();
    expect(tree.root.findAllByType(Button).some((b) => b.props.label === 'Choose a CSV file')).toBe(false);
  });
});
