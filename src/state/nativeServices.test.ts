/** @jest-environment node */
import type { CloudFolder } from '../platform/cloud/cloudCopy';

// The cloud folder and the snapshot files are stand-ins: what matters here is the wiring and that nothing throws.
let mockCloud: CloudFolder | null = null;
const mockFiles = {
  list: jest.fn((): string[] => []),
  pathFor: (name: string) => `/docs/snapshots/${name}`,
  remove: jest.fn(),
  rename: jest.fn(),
  liveIsMissingOrEmpty: jest.fn(() => true),
  setAsideLive: jest.fn(),
  copyToLive: jest.fn(),
};
jest.mock('../platform/cloud/iCloudFolder', () => ({ getCloudFolder: () => mockCloud }));
jest.mock('../platform/snapshots', () => ({ getSnapshotFiles: () => mockFiles }));
const mockSync = jest.fn(async () => {});
jest.mock('./healthSync', () => ({
  syncHealthSoon: () => mockSync(),
  healthRecordIdOf: () => {
    throw new Error('db gone');
  },
  removeHealthRecord: jest.fn(async () => {
    throw new Error('refused');
  }),
}));

import { afterFinish, afterHistoryDelete, beforeDatabaseStart, CLOUD_RESTORE_WAIT_MS, healthRecordBeforeDelete } from './nativeServices';

const SNAP = 'gymhound-20261012-080000-000.db';

function cloud(download: () => Promise<void>): CloudFolder {
  return {
    isAvailable: async () => true,
    list: async () => [SNAP],
    upload: jest.fn(async () => {}),
    download: jest.fn(download),
    remove: jest.fn(async () => {}),
  };
}

beforeEach(() => {
  mockCloud = null;
  mockFiles.liveIsMissingOrEmpty.mockReturnValue(true);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('beforeDatabaseStart (§17.2, R303)', () => {
  it('does nothing without a cloud folder (Expo Go, Android, the web)', async () => {
    await expect(beforeDatabaseStart()).resolves.toBeNull();
  });

  it('brings the newest iCloud snapshot to a phone with no data', async () => {
    mockCloud = cloud(async () => {});
    await expect(beforeDatabaseStart()).resolves.toBe(SNAP);
    expect(mockFiles.rename).toHaveBeenCalledWith(`${SNAP}.partial`, SNAP);
  });

  it('never asks iCloud on a phone with data', async () => {
    mockCloud = cloud(async () => {});
    mockFiles.liveIsMissingOrEmpty.mockReturnValue(false);
    await expect(beforeDatabaseStart()).resolves.toBeNull();
    expect(mockCloud.download).not.toHaveBeenCalled();
  });

  it(`gives up after ${CLOUD_RESTORE_WAIT_MS / 1000} seconds, and on a failure, without throwing`, async () => {
    jest.useFakeTimers();
    mockCloud = cloud(() => new Promise(() => {}));
    const waiting = beforeDatabaseStart();
    await jest.advanceTimersByTimeAsync(CLOUD_RESTORE_WAIT_MS);
    await expect(waiting).resolves.toBeNull();
    jest.useRealTimers();

    mockCloud = cloud(async () => Promise.reject(new Error('offline')));
    await expect(beforeDatabaseStart()).resolves.toBeNull();
  });
});

describe('the app events', () => {
  const db = {} as never;

  it('a finish starts the Health pass and never throws', () => {
    expect(() => afterFinish(db)).not.toThrow();
    expect(mockSync).toHaveBeenCalled();
  });

  it('a History delete never throws, even when the record id cannot be read or Health refuses', async () => {
    expect(healthRecordBeforeDelete(db, 'w1')).toBeNull();
    expect(() => afterHistoryDelete(db, 'HK-1')).not.toThrow();
    await Promise.resolve();
  });
});
