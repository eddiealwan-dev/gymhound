import { Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { announce } from '../platform/announce';
import { exportBodyCsv, exportFoodCsv, exportWorkoutsCsv } from '../platform/exportFiles';
import { shareFile } from '../state/backup';
import { bumpData } from '../state/dataVersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAVED = new Date(2026, 9, 9, 9, 0).getTime();
const SNAPSHOT = '/docs/snapshots/gymhound-20261009-090000-000.db';
const mockStored = {
  theme: 'system',
  unit: 'lb',
  distanceUnit: 'mi',
  restSeconds: 120,
  restBell: true,
  restBellSound: 'bell',
  lastSnapshotAt: SAVED,
  lastSnapshotError: null,
};

// The full access trial's lines have their own tests (trialLines.test.tsx); here they draw nothing.
jest.mock('./pro/TrialLines', () => ({
  TrialSettingsLine: () => null,
  TrialChip: () => null,
  TrainTrialNotice: () => null,
  TrialStartedNotice: () => null,
  TrialPitchLine: () => null,
}));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: () => ({ ...mockStored }), setSetting: jest.fn() }));
jest.mock('../db/repositories/unitsRepo', () => ({ switchDisplayUnit: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/exportFiles', () => ({ exportWorkoutsCsv: jest.fn(), exportFoodCsv: jest.fn(), exportBodyCsv: jest.fn() }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../state/backup', () => ({
  snapshotListing: () => ({ path: '/docs/snapshots/gymhound-20261009-090000-000.db', names: [], error: null }),
  snapshotFolderReport: () => null,
  shareFile: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
// The real data version store, so a test can bump it as a finish does.
jest.mock('../state/dataVersion', () => ({
  ...jest.requireActual('../state/dataVersion'),
  useDbQuery: (query: (db: unknown) => unknown) => query('db'),
}));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
// Developer comes after Export where the debug unlock is allowed; these tests read Export as the last group.
jest.mock('../platform/entitlements', () => ({
  debugUnlockAllowed: () => false,
  entitlementsFor: jest.fn(),
  useEntitlementsState: () => ({ isPro: false, isDebugPro: false, canPurchase: false, plans: [], subscribed: false, kind: 'free' }),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const EXPORT = 'Export workouts (CSV)';
const FOOD = 'Export food (CSV)';
const BODY = 'Export body (CSV)';
const SHARE_FAILED = "Couldn't open the share sheet. Try again.";

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Settings />);
  });
  return tree;
}

const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));

/** Every line of text in the Export section, from its heading to the next group (GymHound Pro). */
const exportLines = (tree: ReactTestRenderer) => {
  const all = lines(tree);
  const next = all.indexOf('GymHound Pro');
  return all.slice(all.indexOf('Export') + 1, next === -1 ? undefined : next);
};

const button = (tree: ReactTestRenderer, label: string) => tree.root.find((n) => n.props.label === label && typeof n.props.onPress === 'function');

/** Presses a button and lets the promise it starts settle. */
async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  await act(async () => {
    button(tree, label).props.onPress();
  });
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.mocked(exportWorkoutsCsv).mockReset();
  jest.mocked(exportFoodCsv).mockReset();
  jest.mocked(exportBodyCsv).mockReset();
  jest.mocked(announce).mockClear();
  jest.mocked(shareFile).mockClear();
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe('Settings: Backups wording (Task 27)', () => {
  it('calls the snapshot button Save a backup copy, with a muted line saying what the file is for', () => {
    const tree = mount();
    const all = lines(tree);
    const explainer = "A backup file for restoring GymHound. Keep it in Files or iCloud Drive; it won't open in other apps.";

    expect(all).toContain('Save a backup copy');
    expect(all).not.toContain('Share latest snapshot');
    expect(all[all.indexOf('Save a backup copy') + 1]).toBe(explainer);
    expect(tree.root.findAllByType(Text).find((n) => n.props.children === explainer)!.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#a39d90' })]),
    );
  });

  it('still shares the newest snapshot', async () => {
    const tree = mount();

    await press(tree, 'Save a backup copy');

    expect(shareFile).toHaveBeenCalledWith(SNAPSHOT);
  });
});

describe('Settings: Export (Task 27)', () => {
  it('comes after Backups, with Export workouts (CSV), Export food (CSV) and then Export body (CSV)', () => {
    const all = lines(mount());

    expect(all.indexOf('Export')).toBeGreaterThan(all.indexOf('Backups'));
    expect(exportLines(mount())).toEqual([EXPORT, FOOD, BODY]);
  });

  it('exports with the time it was pressed and says nothing more when the share sheet opens', async () => {
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('shared');
    const tree = mount();
    const before = Date.now();

    await press(tree, EXPORT);

    expect(exportWorkoutsCsv).toHaveBeenCalledTimes(1);
    const [db, now] = jest.mocked(exportWorkoutsCsv).mock.calls[0];
    expect(db).toBe('db');
    expect(now).toBeGreaterThanOrEqual(before);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY]);
  });

  it('says there is nothing to export before the first finished workout', async () => {
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('empty');
    const tree = mount();

    await press(tree, EXPORT);

    expect(exportLines(tree)).toEqual([EXPORT, 'No finished workouts yet.', FOOD, BODY]);
    expect(announce).toHaveBeenCalledWith('No finished workouts yet.');
  });

  it("says the share sheet couldn't open when sharing is unavailable", async () => {
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('unavailable');
    const tree = mount();

    await press(tree, EXPORT);

    expect(exportLines(tree)).toEqual([EXPORT, SHARE_FAILED, FOOD, BODY]);
    expect(announce).toHaveBeenCalledWith(SHARE_FAILED);
  });

  it("says the share sheet couldn't open when the export throws, and clears the message on the next try", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(exportWorkoutsCsv).mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce('shared');
    const tree = mount();

    await press(tree, EXPORT);
    expect(exportLines(tree)).toEqual([EXPORT, SHARE_FAILED, FOOD, BODY]);
    expect(announce).toHaveBeenCalledWith(SHARE_FAILED);
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'disk full' }));
    warn.mockRestore();

    await press(tree, EXPORT);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY]);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('shows a muted message, never red', async () => {
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('empty');
    const tree = mount();

    await press(tree, EXPORT);

    const message = tree.root.findAllByType(Text).find((n) => n.props.children === 'No finished workouts yet.')!;
    expect(message.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#a39d90' })]));
  });

  it('ignores a second press while the first export is still running, and takes presses again once it ends', async () => {
    let finish!: (result: 'shared') => void;
    jest.mocked(exportWorkoutsCsv).mockReturnValueOnce(new Promise((resolve) => (finish = resolve))).mockResolvedValueOnce('shared');
    const tree = mount();

    await press(tree, EXPORT);
    await press(tree, EXPORT);

    expect(exportWorkoutsCsv).toHaveBeenCalledTimes(1);
    expect(button(tree, EXPORT).props.disabled).toBe(true);

    await act(async () => finish('shared'));
    expect(button(tree, EXPORT).props.disabled).toBe(false);

    await press(tree, EXPORT);
    expect(exportWorkoutsCsv).toHaveBeenCalledTimes(2);
  });

  it('takes presses again after an export that throws', async () => {
    jest.mocked(exportWorkoutsCsv).mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce('shared');
    const tree = mount();

    await press(tree, EXPORT);
    await press(tree, EXPORT);

    expect(exportWorkoutsCsv).toHaveBeenCalledTimes(2);
  });

  it('drops the nothing-to-export line once the data changes, as when a workout is finished', async () => {
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('empty');
    const tree = mount();
    await press(tree, EXPORT);
    expect(exportLines(tree)).toEqual([EXPORT, 'No finished workouts yet.', FOOD, BODY]);

    act(() => bumpData());

    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY]);
  });

  it('has no export button on web, only the phone-app line', () => {
    Platform.OS = 'web';

    const tree = mount();

    expect(exportLines(tree)).toEqual(['Export runs in the phone app.']);
    expect(tree.root.findAll((n) => n.props.label === EXPORT)).toHaveLength(0);
  });
});

describe('Settings: Export food (CSV) (§11, R153)', () => {
  it('exports the food with the time it was pressed and says nothing more when the share sheet opens', async () => {
    jest.mocked(exportFoodCsv).mockResolvedValue('shared');
    const tree = mount();
    const before = Date.now();

    await press(tree, FOOD);

    expect(exportFoodCsv).toHaveBeenCalledTimes(1);
    expect(exportWorkoutsCsv).not.toHaveBeenCalled();
    const [db, now] = jest.mocked(exportFoodCsv).mock.calls[0];
    expect(db).toBe('db');
    expect(now).toBeGreaterThanOrEqual(before);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('is there for a free user too: the food CSV is never behind Pro', () => {
    // The entitlements mock here is free (isPro false).
    expect(button(mount(), FOOD).props.disabled).toBe(false);
  });

  it('says no food is logged yet, under its own button, and tells the screen reader', async () => {
    jest.mocked(exportFoodCsv).mockResolvedValue('empty');
    const tree = mount();

    await press(tree, FOOD);

    expect(exportLines(tree)).toEqual([EXPORT, FOOD, 'No food logged yet.', BODY]);
    expect(announce).toHaveBeenCalledWith('No food logged yet.');
    const message = tree.root.findAllByType(Text).find((n) => n.props.children === 'No food logged yet.')!;
    expect(message.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#a39d90' })]));
    expect(message.props.accessibilityLiveRegion).toBeUndefined();
  });

  it("says the share sheet couldn't open when sharing is unavailable or the export throws", async () => {
    jest.mocked(exportFoodCsv).mockResolvedValueOnce('unavailable').mockRejectedValueOnce(new Error('disk full'));
    const tree = mount();

    await press(tree, FOOD);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, SHARE_FAILED, BODY]);

    await press(tree, FOOD);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, SHARE_FAILED, BODY]);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(SHARE_FAILED);
  });

  it('moves the line to the other button when that one is pressed next', async () => {
    jest.mocked(exportFoodCsv).mockResolvedValue('empty');
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('empty');
    const tree = mount();

    await press(tree, FOOD);
    await press(tree, EXPORT);

    expect(exportLines(tree)).toEqual([EXPORT, 'No finished workouts yet.', FOOD, BODY]);
  });

  it('ignores either button while an export is running, so two share sheets never open', async () => {
    let finish!: (result: 'shared') => void;
    jest.mocked(exportWorkoutsCsv).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    jest.mocked(exportFoodCsv).mockResolvedValue('shared');
    const tree = mount();

    await press(tree, EXPORT);
    await press(tree, FOOD);

    expect(exportFoodCsv).not.toHaveBeenCalled();
    expect(button(tree, FOOD).props.disabled).toBe(true);

    await act(async () => finish('shared'));
    await press(tree, FOOD);
    expect(exportFoodCsv).toHaveBeenCalledTimes(1);
  });

  it('has no food export button on web', () => {
    Platform.OS = 'web';

    expect(mount().root.findAll((n) => n.props.label === FOOD)).toHaveLength(0);
  });
});

describe('Settings: Export body (CSV) (R183)', () => {
  it('exports the body entries with the time it was pressed and says nothing more when the share sheet opens', async () => {
    jest.mocked(exportBodyCsv).mockResolvedValue('shared');
    const tree = mount();
    const before = Date.now();

    await press(tree, BODY);

    expect(exportBodyCsv).toHaveBeenCalledTimes(1);
    expect(exportWorkoutsCsv).not.toHaveBeenCalled();
    expect(exportFoodCsv).not.toHaveBeenCalled();
    const [db, now] = jest.mocked(exportBodyCsv).mock.calls[0];
    expect(db).toBe('db');
    expect(now).toBeGreaterThanOrEqual(before);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('is there for a free user too', () => {
    expect(button(mount(), BODY).props.disabled).toBe(false);
  });

  it('says no body entries yet, under its own button, muted, and tells the screen reader', async () => {
    jest.mocked(exportBodyCsv).mockResolvedValue('empty');
    const tree = mount();

    await press(tree, BODY);

    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY, 'No body entries yet.']);
    expect(announce).toHaveBeenCalledWith('No body entries yet.');
    const message = tree.root.findAllByType(Text).find((n) => n.props.children === 'No body entries yet.')!;
    expect(message.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: '#a39d90' })]));
  });

  it("says the share sheet couldn't open when sharing is unavailable or the export throws", async () => {
    jest.mocked(exportBodyCsv).mockResolvedValueOnce('unavailable').mockRejectedValueOnce(new Error('disk full'));
    const tree = mount();

    await press(tree, BODY);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY, SHARE_FAILED]);

    await press(tree, BODY);
    expect(exportLines(tree)).toEqual([EXPORT, FOOD, BODY, SHARE_FAILED]);
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(SHARE_FAILED);
  });

  it('fades all three buttons and ignores them while any export is running', async () => {
    let finish!: (result: 'shared') => void;
    jest.mocked(exportBodyCsv).mockReturnValueOnce(new Promise((resolve) => (finish = resolve))).mockResolvedValueOnce('shared');
    jest.mocked(exportWorkoutsCsv).mockResolvedValue('shared');
    jest.mocked(exportFoodCsv).mockResolvedValue('shared');
    const tree = mount();

    await press(tree, BODY);
    await press(tree, EXPORT);
    await press(tree, FOOD);
    await press(tree, BODY);

    expect(exportWorkoutsCsv).not.toHaveBeenCalled();
    expect(exportFoodCsv).not.toHaveBeenCalled();
    expect(exportBodyCsv).toHaveBeenCalledTimes(1);
    expect([EXPORT, FOOD, BODY].map((label) => button(tree, label).props.disabled)).toEqual([true, true, true]);

    await act(async () => finish('shared'));
    expect([EXPORT, FOOD, BODY].map((label) => button(tree, label).props.disabled)).toEqual([false, false, false]);
    await press(tree, BODY);
    expect(exportBodyCsv).toHaveBeenCalledTimes(2);
  });

  it('has no body export button on web', () => {
    Platform.OS = 'web';

    expect(mount().root.findAll((n) => n.props.label === BODY)).toHaveLength(0);
  });
});
