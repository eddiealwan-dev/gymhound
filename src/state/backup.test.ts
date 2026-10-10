/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Sharing from 'expo-sharing';
import { ensureSettings, getSettings } from '../db/repositories/settingsRepo';
import { snapshotName, type SnapshotFiles } from '../db/snapshots';
import { createTestDb } from '../db/testing/createTestDb';
import { nodeSnapshotFiles } from '../db/testing/nodeSnapshotFiles';
import { getSnapshotFiles } from '../platform/snapshots';
import { shareFile, takeSnapshotSafely } from './backup';

jest.mock('../platform/snapshots', () => ({
  getSnapshotFiles: jest.fn(),
  fileUri: (p: string) => `file://${p}`,
}));
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

describe('shareFile', () => {
  it('opens the share sheet for the file', async () => {
    await shareFile('/data/snapshots/gymhound-20261009-090000-000.db');

    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(jest.mocked(Sharing.shareAsync).mock.calls[0][0]).toBe('file:///data/snapshots/gymhound-20261009-090000-000.db');
  });

  it('passes a failure to the caller', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('sharing is not available'));

    await expect(shareFile('/data/x.db')).rejects.toThrow('sharing is not available');
  });
});
