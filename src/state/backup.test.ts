/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Sharing from 'expo-sharing';
import { ensureSettings, getSettings, setSetting } from '../db/repositories/settingsRepo';
import { snapshotName, type SnapshotFiles } from '../db/snapshots';
import type { Db } from '../db/types';
import { createTestDb } from '../db/testing/createTestDb';
import { nodeSnapshotFiles } from '../db/testing/nodeSnapshotFiles';
import { getSnapshotFiles } from '../platform/snapshots';
import { latestSnapshotPath, recordRestoredSnapshot, shareFile, snapshotListing, takeSnapshotSafely } from './backup';

// Only the files lookup is faked; shareFile runs the real fileUri.
jest.mock('../platform/snapshots', () => ({ getSnapshotFiles: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => {}) }));

const NOW = new Date(2026, 9, 9, 9, 0).getTime();

let dir: string;
let handle: { db: ReturnType<typeof createTestDb>['db']; close(): void };
let files: SnapshotFiles;
let warn: jest.SpyInstance;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-backup-'));
  files = nodeSnapshotFiles(dir, path.join(dir, 'gymhound.db'));
  jest.mocked(getSnapshotFiles).mockReturnValue(files);
  handle = createTestDb();
  ensureSettings(handle.db, 'us');
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  handle.close();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('takeSnapshotSafely', () => {
  it('writes a snapshot, records its time, and returns true', () => {
    expect(takeSnapshotSafely(handle.db, NOW)).toBe(true);

    expect(files.list()).toEqual([snapshotName(NOW)]);
    expect(getSettings(handle.db).lastSnapshotAt).toBe(NOW);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns false, logs, and leaves the last good time alone when the snapshot fails', () => {
    takeSnapshotSafely(handle.db, NOW);
    jest.mocked(getSnapshotFiles).mockReturnValue({
      ...files,
      rename: () => {
        throw new Error('disk full');
      },
    });

    const taken = takeSnapshotSafely(handle.db, NOW + 1000);

    expect(taken).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(getSettings(handle.db).lastSnapshotAt).toBe(NOW);
    expect(files.list()).toEqual([snapshotName(NOW)]);
  });

  it('stores why it failed, with the time, and leaves the last good time alone', () => {
    takeSnapshotSafely(handle.db, NOW);
    jest.mocked(getSnapshotFiles).mockReturnValue({
      ...files,
      rename: () => {
        throw new Error('disk full');
      },
    });

    takeSnapshotSafely(handle.db, NOW + 1000);

    expect(getSettings(handle.db)).toMatchObject({ lastSnapshotAt: NOW, lastSnapshotError: { at: NOW + 1000, message: 'disk full' } });
  });

  it("adds the error's code to the stored message when it has one (expo's CodedError)", () => {
    jest.mocked(getSnapshotFiles).mockReturnValue({
      ...files,
      rename: () => {
        throw Object.assign(new Error('Unable to move the file'), { code: 'ERR_FILE_SYSTEM' });
      },
    });

    takeSnapshotSafely(handle.db, NOW);

    expect(getSettings(handle.db).lastSnapshotError).toEqual({ at: NOW, message: 'Unable to move the file (ERR_FILE_SYSTEM)' });
    expect(getSettings(handle.db).lastSnapshotAt).toBeNull();
  });

  it('clears the stored error when a later snapshot works', () => {
    jest.mocked(getSnapshotFiles).mockImplementationOnce(() => {
      throw new Error('no documents folder');
    });
    takeSnapshotSafely(handle.db, NOW);
    expect(getSettings(handle.db).lastSnapshotError).toEqual({ at: NOW, message: 'no documents folder' });

    expect(takeSnapshotSafely(handle.db, NOW + 1000)).toBe(true);

    expect(getSettings(handle.db)).toMatchObject({ lastSnapshotAt: NOW + 1000, lastSnapshotError: null });
  });

  it('never throws when the error cannot be stored either', () => {
    const broken = {
      select: () => {
        throw new Error('database is locked');
      },
      insert: () => {
        throw new Error('database is locked');
      },
    } as unknown as Db;

    expect(takeSnapshotSafely(broken, NOW)).toBe(false);
  });

  it('never throws, even when the snapshot files themselves cannot be reached', () => {
    jest.mocked(getSnapshotFiles).mockImplementation(() => {
      throw new Error('no documents folder');
    });

    expect(takeSnapshotSafely(handle.db, NOW)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('returns false without logging where snapshots never run (web)', () => {
    jest.mocked(getSnapshotFiles).mockReturnValue(null);

    expect(takeSnapshotSafely(handle.db, NOW)).toBe(false);

    expect(warn).not.toHaveBeenCalled();
    expect(getSettings(handle.db).lastSnapshotAt).toBeNull();
  });
});

describe('snapshotListing', () => {
  it('returns every listed name and the path of the newest snapshot', () => {
    takeSnapshotSafely(handle.db, NOW);
    takeSnapshotSafely(handle.db, NOW + 60_000);

    expect(snapshotListing()).toEqual({
      path: files.pathFor(snapshotName(NOW + 60_000)),
      names: expect.arrayContaining([snapshotName(NOW), snapshotName(NOW + 60_000)]),
      error: null,
    });
    expect(snapshotListing().names).toHaveLength(2);
    expect(latestSnapshotPath()).toBe(files.pathFor(snapshotName(NOW + 60_000)));
  });

  it('returns no path and no error when the folder holds no snapshot', () => {
    expect(snapshotListing()).toEqual({ path: null, names: [], error: null });
    expect(latestSnapshotPath()).toBeNull();
  });

  it('returns no path and the listing error, with its code, when list() throws', () => {
    jest.mocked(getSnapshotFiles).mockReturnValue({
      ...files,
      list: () => {
        throw Object.assign(new Error('Unable to list the directory'), { code: 'ERR_DIRECTORY_LIST' });
      },
    });

    expect(snapshotListing()).toEqual({ path: null, names: [], error: 'Unable to list the directory (ERR_DIRECTORY_LIST)' });
    expect(latestSnapshotPath()).toBeNull();
  });

  it('keeps the listed names when a name has no path', () => {
    takeSnapshotSafely(handle.db, NOW);
    jest.mocked(getSnapshotFiles).mockReturnValue({
      ...files,
      pathFor: () => {
        throw new Error('Unable to create the folder');
      },
    });

    expect(snapshotListing()).toEqual({ path: null, names: [snapshotName(NOW)], error: 'Unable to create the folder' });
  });

  it('returns nothing, and no error, where snapshots never run (web)', () => {
    jest.mocked(getSnapshotFiles).mockReturnValue(null);

    expect(snapshotListing()).toEqual({ path: null, names: [], error: null });
  });
});

describe('recordRestoredSnapshot', () => {
  const restored = snapshotName(NOW);

  it('sets the last snapshot time to the restored snapshot when none is stored', () => {
    recordRestoredSnapshot(handle.db, restored);

    expect(getSettings(handle.db).lastSnapshotAt).toBe(NOW);
  });

  it('raises an older stored time to the restored snapshot, so Settings never lags behind the Share button', () => {
    setSetting(handle.db, 'lastSnapshotAt', NOW - 3_600_000);

    recordRestoredSnapshot(handle.db, restored);

    expect(getSettings(handle.db).lastSnapshotAt).toBe(NOW);
  });

  it('keeps a stored time that is newer than the restored snapshot', () => {
    setSetting(handle.db, 'lastSnapshotAt', NOW + 3_600_000);

    recordRestoredSnapshot(handle.db, restored);

    expect(getSettings(handle.db).lastSnapshotAt).toBe(NOW + 3_600_000);
  });

  it('never throws: a name that is not a snapshot, or a database that fails, is logged', () => {
    recordRestoredSnapshot(handle.db, 'notes.txt');
    const broken = {
      select: () => {
        throw new Error('database is locked');
      },
    } as unknown as Db;
    recordRestoredSnapshot(broken, restored);

    expect(warn).toHaveBeenCalledTimes(2);
    expect(getSettings(handle.db).lastSnapshotAt).toBeNull();
  });
});

describe('shareFile', () => {
  it('opens the share sheet for the file', async () => {
    await shareFile('/data/snapshots/gymhound-20261009-090000-000.db');

    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toBe('file:///data/snapshots/gymhound-20261009-090000-000.db');
  });

  it("hands expo-sharing a URI that survives Expo Go's %40 folder name and a space", async () => {
    await shareFile('/docs/%40anonymous%2Fgymhound-1234/SQLite/gymhound.failed-x y.db');

    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toBe(
      'file:///docs/%2540anonymous%252Fgymhound-1234/SQLite/gymhound.failed-x%20y.db',
    );
  });

  it('passes a failure to the caller', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('sharing is not available'));

    await expect(shareFile('/data/x.db')).rejects.toThrow('sharing is not available');
  });
});
