import { snapshotName, type SnapshotFiles } from '../../db/snapshots';
import { cloudRestorePick, cloudUploadPlan, copyNewestToCloud, KEEP_IN_CLOUD, restoreFromCloud, type CloudFolder } from './cloudCopy';
import { CLOUD_DIR, createICloudFolder, loadCloudFolder, type CloudStorageLike } from './iCloudFolder';

const s = (n: number) => snapshotName(Date.UTC(2026, 9, n, 8));

describe('cloudUploadPlan (§17.2, R303)', () => {
  it("sends the phone's newest snapshot when the cloud lacks it", () => {
    expect(cloudUploadPlan([s(1), s(3), s(2)], [s(1)])).toEqual({ upload: s(3), remove: [] });
  });

  it('sends nothing when the cloud already has the newest, or the phone has none', () => {
    expect(cloudUploadPlan([s(1), s(2)], [s(2)])).toEqual({ upload: null, remove: [] });
    expect(cloudUploadPlan([], [s(2)])).toEqual({ upload: null, remove: [] });
  });

  it(`keeps the newest ${KEEP_IN_CLOUD} in the cloud and never names another file`, () => {
    expect(cloudUploadPlan([s(5)], [s(1), s(2), s(3), 'notes.txt'])).toEqual({ upload: s(5), remove: [s(1)] });
    expect(cloudUploadPlan([s(5)], [s(1), s(2), s(3), s(4), s(5)])).toEqual({ upload: null, remove: [s(1), s(2)] });
  });
});

describe('cloudRestorePick', () => {
  it('brings back the newest cloud snapshot only to a phone with no data and no snapshot', () => {
    expect(cloudRestorePick(true, [], [s(1), s(4), s(2)])).toBe(s(4));
    expect(cloudRestorePick(false, [], [s(1)])).toBeNull();
    expect(cloudRestorePick(true, [s(1)], [s(4)])).toBeNull();
    expect(cloudRestorePick(true, ['gymhound-x.db.partial'], [s(4)])).toBe(s(4));
    expect(cloudRestorePick(true, [], [])).toBeNull();
  });
});

function fakeFiles(names: string[], liveEmpty = false): SnapshotFiles & { names: string[] } {
  const files = {
    names,
    list: () => [...files.names],
    pathFor: (name: string) => `/docs/snapshots/${name}`,
    remove: jest.fn((name: string) => {
      files.names = files.names.filter((n) => n !== name);
    }),
    rename: jest.fn((from: string, to: string) => {
      files.names = [...files.names.filter((n) => n !== from && n !== to), to];
    }),
    liveIsMissingOrEmpty: () => liveEmpty,
    setAsideLive: () => '',
    copyToLive: () => {},
  };
  return files;
}

type FakeCloud = jest.Mocked<CloudFolder> & { names: string[] };

function fakeCloud(names: string[], available = true): FakeCloud {
  const cloud: FakeCloud = {
    names,
    isAvailable: jest.fn(async () => available),
    list: jest.fn(async () => [...cloud.names]),
    upload: jest.fn(async (name: string) => {
      cloud.names.push(name);
    }),
    download: jest.fn(async () => {}),
    remove: jest.fn(async (name: string) => {
      cloud.names = cloud.names.filter((n: string) => n !== name);
    }),
  } as unknown as FakeCloud;
  return cloud;
}

describe('copyNewestToCloud', () => {
  it('uploads the newest from its path and trims the cloud', async () => {
    const cloud = fakeCloud([s(1), s(2), s(3)]);
    await expect(copyNewestToCloud(fakeFiles([s(3), s(4)]), cloud)).resolves.toBe(s(4));
    expect(cloud.upload).toHaveBeenCalledWith(s(4), `/docs/snapshots/${s(4)}`);
    expect(cloud.names).toEqual([s(2), s(3), s(4)]);
  });

  it('does nothing while the cloud cannot be reached', async () => {
    const cloud = fakeCloud([], false);
    await expect(copyNewestToCloud(fakeFiles([s(1)]), cloud)).resolves.toBeNull();
    expect(cloud.list).not.toHaveBeenCalled();
  });
});

describe('restoreFromCloud', () => {
  it('downloads the newest through a .partial file, then names it as a snapshot', async () => {
    const files = fakeFiles([], true);
    const cloud = fakeCloud([s(1), s(2)]);
    await expect(restoreFromCloud(files, cloud)).resolves.toBe(s(2));
    expect(cloud.download).toHaveBeenCalledWith(s(2), `/docs/snapshots/${s(2)}.partial`);
    expect(files.rename).toHaveBeenCalledWith(`${s(2)}.partial`, s(2));
    expect(files.names).toEqual([s(2)]);
  });

  it('never touches a phone with data or with its own snapshot', async () => {
    const cloud = fakeCloud([s(2)]);
    await expect(restoreFromCloud(fakeFiles([], false), cloud)).resolves.toBeNull();
    await expect(restoreFromCloud(fakeFiles([s(1)], true), cloud)).resolves.toBeNull();
    expect(cloud.isAvailable).not.toHaveBeenCalled();
  });

  it('leaves no snapshot behind when the download fails', async () => {
    const files = fakeFiles([], true);
    const cloud = fakeCloud([s(2)]);
    cloud.download.mockRejectedValueOnce(new Error('offline'));
    await expect(restoreFromCloud(files, cloud)).rejects.toThrow('offline');
    expect(files.rename).not.toHaveBeenCalled();
  });
});

describe('the iCloud folder (R303)', () => {
  function fakeStorage(): jest.Mocked<CloudStorageLike> {
    return {
      isCloudAvailable: jest.fn(async () => true),
      exists: jest.fn(async () => false),
      mkdir: jest.fn(async () => {}),
      readdir: jest.fn(async () => []),
      uploadFile: jest.fn(async () => {}),
      downloadFile: jest.fn(async () => {}),
      unlink: jest.fn(async () => {}),
    } as unknown as jest.Mocked<CloudStorageLike>;
  }

  it("uses the container's hidden app data, making the folder on the first upload", async () => {
    const storage = fakeStorage();
    const folder = createICloudFolder(storage);
    await expect(folder.list()).resolves.toEqual([]);
    await folder.upload(s(1), '/docs/snapshots/x.db');
    expect(storage.mkdir).toHaveBeenCalledWith(CLOUD_DIR, 'app_data');
    expect(storage.uploadFile).toHaveBeenCalledWith(`${CLOUD_DIR}/${s(1)}`, '/docs/snapshots/x.db', { mimeType: 'application/vnd.sqlite3' }, 'app_data');
    await folder.download(s(1), '/tmp/a');
    expect(storage.downloadFile).toHaveBeenCalledWith(`${CLOUD_DIR}/${s(1)}`, '/tmp/a', 'app_data');
    await folder.remove(s(1));
    expect(storage.unlink).toHaveBeenCalledWith(`${CLOUD_DIR}/${s(1)}`, 'app_data');
  });

  it('lists names whether the module gives names or paths, and is unavailable when it fails to answer', async () => {
    const storage = fakeStorage();
    storage.exists.mockResolvedValue(true);
    storage.readdir.mockResolvedValue([s(1), `${CLOUD_DIR}/${s(2)}`]);
    const folder = createICloudFolder(storage);
    await expect(folder.list()).resolves.toEqual([s(1), s(2)]);
    storage.isCloudAvailable.mockRejectedValue(new Error('signed out'));
    await expect(folder.isAvailable()).resolves.toBe(false);
  });

  it('is nothing on Android (its own backup), the web, Expo Go, or without the package', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadCloudFolder({ os: 'android', expoGo: false })).toBeNull();
    expect(loadCloudFolder({ os: 'web', expoGo: false })).toBeNull();
    expect(loadCloudFolder({ os: 'ios', expoGo: true })).toBeNull();
    expect(loadCloudFolder({ os: 'ios', expoGo: false })).toBeNull();
    jest.restoreAllMocks();
  });
});
