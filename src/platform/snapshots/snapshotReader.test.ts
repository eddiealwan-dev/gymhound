/** @jest-environment node */
import { openSnapshotForCheck } from './snapshotReader';
import { setDocumentDirectory } from './testing/fakeExpoFileSystem';

jest.mock('expo-file-system', () => require('./testing/fakeExpoFileSystem'));
const mockOpen = jest.fn();
jest.mock('expo-sqlite', () => ({
  defaultDatabaseDirectory: '/docs/SQLite',
  openDatabaseSync: (...args: unknown[]) => mockOpen(...args),
}));

describe('openSnapshotForCheck', () => {
  it('opens the snapshot on its own connection in the snapshot folder, reads rows, and closes it', () => {
    setDocumentDirectory('/docs');
    const handle = { getAllSync: jest.fn(() => [{ quick_check: 'ok' }]), closeSync: jest.fn() };
    mockOpen.mockReturnValue(handle);

    const reader = openSnapshotForCheck('gymhound-20261009-090000-000.db');
    const rows = reader.all('PRAGMA quick_check');
    reader.close();

    expect(mockOpen).toHaveBeenCalledWith('gymhound-20261009-090000-000.db', { useNewConnection: true }, '/docs/snapshots');
    expect(handle.getAllSync).toHaveBeenCalledWith('PRAGMA quick_check');
    expect(rows).toEqual([{ quick_check: 'ok' }]);
    expect(handle.closeSync).toHaveBeenCalledTimes(1);
  });
});
