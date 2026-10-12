import { Platform, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { formatDateTime } from '../domain/dates';
import { shareFile, snapshotListing } from '../state/backup';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The stored settings the screen reads. */
const mockStored: Record<string, unknown> = {};
const STARTING = {
  theme: 'system',
  unit: 'lb',
  distanceUnit: 'mi',
  restSeconds: 120,
  restBell: true,
  restBellSound: 'bell',
  lastSnapshotAt: null,
  lastSnapshotError: null,
};
const FOLDER = '/docs/%40anonymous%2Fgymhound-1234/snapshots';
/** The phone's raw listing of the snapshot folder (`describeSnapshotFolder`). */
const REPORT = [
  `Folder exists: ${FOLDER}`,
  '1 entry',
  'gymhound-20261009-090000-000.db: File, file:///private/docs/%2540anonymous%252Fgymhound-1234/snapsh…, listed size null, size 40960',
].join('\n');
const SAVED = new Date(2026, 9, 9, 9, 0).getTime();
const FAILED = SAVED + 3_600_000;

let mockReport: string | null = null;

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ ...mockStored }),
  setSetting: jest.fn(),
}));
jest.mock('../db/repositories/unitsRepo', () => ({ switchDisplayUnit: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../state/backup', () => ({
  snapshotListing: jest.fn(),
  snapshotFolderReport: () => mockReport,
  shareFile: jest.fn(),
}));
jest.mock('../platform/exportFiles', () => ({ exportWorkoutsCsv: jest.fn() }));
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

/** Every line of text in the Backups section, from its heading to the Export heading after it. */
function backupLines(tree: ReactTestRenderer): string[] {
  const lines = tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));
  return lines.slice(lines.indexOf('Backups') + 1, lines.indexOf('Export'));
}

const SAVE = 'Save a backup copy';
/** The muted line under the button (Task 27). */
const EXPLAINER = "A backup file for restoring GymHound. Keep it in Files or iCloud Drive; it won't open in other apps.";

const hasShare = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.label === SAVE).length > 0;

const listing = (value: Partial<ReturnType<typeof snapshotListing>>) =>
  jest.mocked(snapshotListing).mockReturnValue({ path: null, names: [], error: null, ...value });

const originalOS = Platform.OS;
const originalDev = __DEV__;

beforeEach(() => {
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  Object.assign(mockStored, STARTING);
  listing({});
  mockReport = REPORT;
});

afterEach(() => {
  Platform.OS = originalOS;
  (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
});

describe('Settings: Backups diagnostics (Task 25)', () => {
  it('says only that there is no snapshot yet before the first one', () => {
    expect(backupLines(mount())).toEqual(['No snapshot yet.']);
  });

  it('shows the last snapshot and the Share button when its file is listed, with no diagnostic line', () => {
    mockStored.lastSnapshotAt = SAVED;
    listing({ path: `${FOLDER}/gymhound-20261009-090000-000.db`, names: ['gymhound-20261009-090000-000.db'] });

    const tree = mount();

    expect(backupLines(tree)).toEqual([`Last snapshot: ${formatDateTime(SAVED)}`, SAVE, EXPLAINER]);
    expect(hasShare(tree)).toBe(true);
  });

  it("says the share sheet couldn't open, and logs why, when saving a backup copy fails", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockStored.lastSnapshotAt = SAVED;
    listing({ path: `${FOLDER}/gymhound-20261009-090000-000.db`, names: ['gymhound-20261009-090000-000.db'] });
    jest.mocked(shareFile).mockRejectedValueOnce(new Error('share exploded'));
    const tree = mount();

    await act(async () => tree.root.findAll((n) => n.props.label === SAVE && typeof n.props.onPress === 'function')[0].props.onPress());

    expect(backupLines(tree)).toContain("Couldn't open the share sheet. Try again.");
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'share exploded' }));
    warn.mockRestore();
  });

  it('says why the last snapshot failed when the failure is newer than the last good one', () => {
    mockStored.lastSnapshotAt = SAVED;
    mockStored.lastSnapshotError = { at: FAILED, message: 'disk full (ERR_FILE_SYSTEM)' };
    listing({ path: `${FOLDER}/gymhound-20261009-090000-000.db`, names: ['gymhound-20261009-090000-000.db'] });

    expect(backupLines(mount())).toEqual([
      `Last snapshot: ${formatDateTime(SAVED)}`,
      `The last snapshot failed: disk full (ERR_FILE_SYSTEM) (${formatDateTime(FAILED)}).`,
      SAVE,
      EXPLAINER,
    ]);
  });

  it('says why the snapshot failed when there has never been a good one', () => {
    mockStored.lastSnapshotError = { at: FAILED, message: 'no documents folder' };

    expect(backupLines(mount())).toEqual(['No snapshot yet.', `The last snapshot failed: no documents folder (${formatDateTime(FAILED)}).`]);
  });

  it('keeps quiet about a failure older than the last good snapshot', () => {
    mockStored.lastSnapshotAt = FAILED;
    mockStored.lastSnapshotError = { at: SAVED, message: 'disk full' };
    listing({ path: `${FOLDER}/x.db`, names: ['x.db'] });

    expect(backupLines(mount())).toEqual([`Last snapshot: ${formatDateTime(FAILED)}`, SAVE, EXPLAINER]);
  });

  it("says a saved snapshot's file isn't listed, and in development shows the phone's raw listing of the folder (G2)", () => {
    mockStored.lastSnapshotAt = SAVED;
    listing({ names: [] });

    const tree = mount();

    expect(backupLines(tree)).toEqual([
      `Last snapshot: ${formatDateTime(SAVED)}`,
      `A snapshot was saved at ${formatDateTime(SAVED)}, but its file isn't listed.`,
      REPORT,
    ]);
    expect(hasShare(tree)).toBe(false);
  });

  it('keeps the raw listing selectable, so it can be copied off the phone', () => {
    mockStored.lastSnapshotAt = SAVED;

    const line = mount().root.findAllByType(Text).find((n) => n.props.children === REPORT)!;

    expect(line.props.selectable).toBe(true);
  });

  it('shows the listing error above the raw listing in development', () => {
    mockStored.lastSnapshotAt = SAVED;
    listing({ error: 'Unable to list the directory (ERR_DIRECTORY_LIST)' });

    expect(backupLines(mount())).toEqual([
      `Last snapshot: ${formatDateTime(SAVED)}`,
      `A snapshot was saved at ${formatDateTime(SAVED)}, but its file isn't listed.`,
      `Unable to list the directory (ERR_DIRECTORY_LIST)\n${REPORT}`,
    ]);
  });

  it('leaves out the development line in a release build', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    mockStored.lastSnapshotAt = SAVED;

    expect(backupLines(mount())).toEqual([
      `Last snapshot: ${formatDateTime(SAVED)}`,
      `A snapshot was saved at ${formatDateTime(SAVED)}, but its file isn't listed.`,
    ]);
  });

  it('shows only the phone-app line on web', () => {
    Platform.OS = 'web';
    mockStored.lastSnapshotAt = SAVED;
    mockStored.lastSnapshotError = { at: FAILED, message: 'disk full' };

    expect(backupLines(mount())).toEqual(['Backups run in the phone app.']);
  });
});
