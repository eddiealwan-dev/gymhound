/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { snapshotName, type SnapshotFiles } from '../../db/snapshots';
import { nodeSnapshotFiles } from '../../db/testing/nodeSnapshotFiles';
import { expoSnapshotFiles, fileExists, setAsidePath } from './expoSnapshotFiles';
import { setDocumentDirectory } from './testing/fakeExpoFileSystem';

// The phone's implementation runs unchanged over a stand-in for expo-file-system that behaves like the real one
// (see the fake for the semantics it models). `liveDbPath()` is the real one, reading expo-sqlite's default folder.
jest.mock('expo-file-system', () => require('./testing/fakeExpoFileSystem'));
let mockDatabaseDirectory = '';
jest.mock('expo-sqlite', () => ({
  get defaultDatabaseDirectory() {
    return mockDatabaseDirectory;
  },
}));

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;

/** Where an implementation keeps things, for the tests to look at directly. */
type Harness = { files: SnapshotFiles; liveFile: string; liveDir: string; snapshotDir: string };

const posix = (p: string) => p.replace(/\\/g, '/');

/**
 * Each implementation of `SnapshotFiles` is built over a fresh temp folder. The phone's lives where iOS puts things:
 * the live file in `<documents>/SQLite`, snapshots in `<documents>/snapshots`, and the documents folder is named like
 * Expo Go's (a literal `%40` and `%2F`) plus a space, the awkward case for turning paths into URIs.
 */
const implementations: { name: string; build(root: string): Harness }[] = [
  {
    name: 'nodeSnapshotFiles',
    build(root) {
      const liveFile = path.join(root, 'gymhound.db');
      return { files: nodeSnapshotFiles(root, liveFile), liveFile, liveDir: root, snapshotDir: path.join(root, 'snapshots') };
    },
  },
  {
    name: 'expoSnapshotFiles',
    build(root) {
      const documents = posix(path.join(root, '%40anonymous%2Fgymhound x'));
      mockDatabaseDirectory = `${documents}/SQLite`;
      fs.mkdirSync(mockDatabaseDirectory, { recursive: true });
      setDocumentDirectory(documents);
      return {
        files: expoSnapshotFiles(),
        liveFile: `${mockDatabaseDirectory}/gymhound.db`,
        liveDir: mockDatabaseDirectory,
        snapshotDir: `${documents}/snapshots`,
      };
    },
  },
];

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-files-'));
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe.each(implementations)('SnapshotFiles contract: $name', ({ build }) => {
  let h: Harness;
  let files: SnapshotFiles;
  let liveFile: string;

  beforeEach(() => {
    h = build(root);
    ({ files, liveFile } = h);
  });

  /** What sits beside the live file, other than the snapshot folder (the Node harness keeps it there too). */
  const besideLive = () => fs.readdirSync(h.liveDir).filter((n) => n !== 'snapshots').sort();
  const snapshot = (content = 'snapshot bytes') => {
    const name = snapshotName(NOW);
    fs.writeFileSync(files.pathFor(name), content);
    return name;
  };

  describe('setAsideLive', () => {
    it('moves the live file with its -wal and -shm files under a new name, and deletes nothing', () => {
      fs.writeFileSync(liveFile, 'main');
      fs.writeFileSync(`${liveFile}-wal`, 'wal');
      fs.writeFileSync(`${liveFile}-shm`, 'shm');

      const name = files.setAsideLive('failed-x');

      expect(name).toBe('gymhound.failed-x.db');
      expect(besideLive()).toEqual(['gymhound.failed-x.db', 'gymhound.failed-x.db-shm', 'gymhound.failed-x.db-wal']);
      expect(fs.readFileSync(path.join(h.liveDir, name), 'utf8')).toBe('main');
      expect(fs.readFileSync(path.join(h.liveDir, `${name}-wal`), 'utf8')).toBe('wal');
      expect(fs.readFileSync(path.join(h.liveDir, `${name}-shm`), 'utf8')).toBe('shm');
      expect(files.liveIsMissingOrEmpty()).toBe(true);
    });

    it('moves only the files that exist', () => {
      fs.writeFileSync(liveFile, 'main');

      files.setAsideLive('failed-x');

      expect(besideLive()).toEqual(['gymhound.failed-x.db']);
    });

    it('refuses to set the live file aside over an existing file', () => {
      fs.writeFileSync(liveFile, 'live');
      fs.writeFileSync(path.join(h.liveDir, 'gymhound.failed-x.db'), 'earlier failure');

      expect(() => files.setAsideLive('failed-x')).toThrow();

      expect(fs.readFileSync(liveFile, 'utf8')).toBe('live');
      expect(fs.readFileSync(path.join(h.liveDir, 'gymhound.failed-x.db'), 'utf8')).toBe('earlier failure');
    });

    it('refuses to set the live file aside over an existing -wal file, and moves nothing', () => {
      fs.writeFileSync(liveFile, 'live');
      fs.writeFileSync(`${liveFile}-wal`, 'live wal');
      fs.writeFileSync(path.join(h.liveDir, 'gymhound.failed-x.db-wal'), 'earlier failure');

      expect(() => files.setAsideLive('failed-x')).toThrow();

      expect(fs.readFileSync(liveFile, 'utf8')).toBe('live');
      expect(fs.readFileSync(`${liveFile}-wal`, 'utf8')).toBe('live wal');
      expect(fs.existsSync(path.join(h.liveDir, 'gymhound.failed-x.db'))).toBe(false);
      expect(fs.readFileSync(path.join(h.liveDir, 'gymhound.failed-x.db-wal'), 'utf8')).toBe('earlier failure');
    });

    it('rolls back when moving a side file fails part-way, so nothing has moved', () => {
      fs.writeFileSync(liveFile, 'main');
      fs.writeFileSync(`${liveFile}-wal`, 'wal');
      fs.writeFileSync(`${liveFile}-shm`, 'shm');
      const realRename = fs.renameSync;
      let calls = 0;
      jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        calls += 1;
        if (calls === 2) throw new Error('rename failed'); // the -wal file
        realRename(from, to);
      });

      expect(() => files.setAsideLive('failed-x')).toThrow('rename failed');

      jest.restoreAllMocks();
      expect(besideLive()).toEqual(['gymhound.db', 'gymhound.db-shm', 'gymhound.db-wal']);
      expect(fs.readFileSync(liveFile, 'utf8')).toBe('main');
      expect(fs.readFileSync(`${liveFile}-wal`, 'utf8')).toBe('wal');
      expect(fs.readFileSync(`${liveFile}-shm`, 'utf8')).toBe('shm');
    });

    it('throws, moving nothing, when there is no live file to set aside', () => {
      expect(() => files.setAsideLive('failed-x')).toThrow();

      expect(besideLive()).toEqual([]);
    });
  });

  describe('copyToLive', () => {
    it('copies a snapshot to the live path, removing stale -wal and -shm files first', () => {
      const name = snapshot();
      fs.writeFileSync(`${liveFile}-wal`, 'stale wal');
      fs.writeFileSync(`${liveFile}-shm`, 'stale shm');

      files.copyToLive(name);

      expect(fs.readFileSync(liveFile, 'utf8')).toBe('snapshot bytes');
      expect(besideLive()).toEqual(['gymhound.db']);
      expect(fs.readFileSync(files.pathFor(name), 'utf8')).toBe('snapshot bytes');
    });

    it('replaces an empty live file', () => {
      const name = snapshot();
      fs.writeFileSync(liveFile, '');

      files.copyToLive(name);

      expect(fs.readFileSync(liveFile, 'utf8')).toBe('snapshot bytes');
    });

    it('copies through a temporary file and renames it into place', () => {
      const name = snapshot();
      const renames: string[][] = [];
      const realRename = fs.renameSync;
      jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        renames.push([posix(String(from)), posix(String(to))]);
        realRename(from, to);
      });

      files.copyToLive(name);

      jest.restoreAllMocks();
      expect(renames).toHaveLength(1);
      expect(path.posix.dirname(renames[0][0])).toBe(posix(h.liveDir)); // beside the live file, so the rename is atomic
      expect(renames[0][0]).not.toBe(posix(liveFile));
      expect(renames[0][1]).toBe(posix(liveFile));
    });

    it('leaves no half-written live file and no temporary file when the copy fails', () => {
      const name = snapshot();
      fs.writeFileSync(liveFile, ''); // an empty live file, which the restore replaces
      const realCopy = fs.copyFileSync;
      jest.spyOn(fs, 'copyFileSync').mockImplementation((from, to) => {
        realCopy(from, to);
        fs.truncateSync(to as string, 3); // the copy "dies" half way
        throw new Error('disk full');
      });

      expect(() => files.copyToLive(name)).toThrow('disk full');

      jest.restoreAllMocks();
      expect(besideLive()).toEqual(['gymhound.db']);
      expect(fs.statSync(liveFile).size).toBe(0);
    });

    it('refuses to copy over a live file that has data, and touches nothing', () => {
      const name = snapshot();
      fs.writeFileSync(liveFile, 'healthy live data');
      fs.writeFileSync(`${liveFile}-wal`, 'committed data still in the log');

      expect(() => files.copyToLive(name)).toThrow();

      expect(fs.readFileSync(liveFile, 'utf8')).toBe('healthy live data');
      expect(fs.readFileSync(`${liveFile}-wal`, 'utf8')).toBe('committed data still in the log');
      expect(besideLive()).toEqual(['gymhound.db', 'gymhound.db-wal']);
    });
  });

  describe('the snapshot folder', () => {
    it('reports a missing or zero-byte live file, and not a populated one', () => {
      expect(files.liveIsMissingOrEmpty()).toBe(true);
      fs.writeFileSync(liveFile, '');
      expect(files.liveIsMissingOrEmpty()).toBe(true);
      fs.writeFileSync(liveFile, 'x');
      expect(files.liveIsMissingOrEmpty()).toBe(false);
    });

    it('lists snapshot files but skips zero-byte ones', () => {
      const real = snapshotName(NOW);
      fs.writeFileSync(files.pathFor(real), 'a snapshot');
      fs.writeFileSync(files.pathFor(snapshotName(NOW + HOUR)), '');
      fs.writeFileSync(files.pathFor('notes.txt'), 'note');

      expect(files.list().sort()).toEqual([real, 'notes.txt'].sort());
    });

    it('removes a file, and a file that is not there is not an error', () => {
      fs.writeFileSync(files.pathFor('a.txt'), 'a');

      files.remove('a.txt');
      expect(() => files.remove('a.txt')).not.toThrow();
      expect(() => files.remove('never-existed.txt')).not.toThrow();

      expect(files.list()).toEqual([]);
    });

    it('renames a file, replacing an existing target', () => {
      fs.writeFileSync(files.pathFor('a.partial'), 'new');
      fs.writeFileSync(files.pathFor('a.db'), '');

      files.rename('a.partial', 'a.db');

      expect(files.list()).toEqual(['a.db']);
      expect(fs.readFileSync(files.pathFor('a.db'), 'utf8')).toBe('new');
    });

    it('hands out absolute paths with no file:// prefix, in a folder that exists', () => {
      const p = files.pathFor('gymhound-x.db');

      expect(p.startsWith('file:')).toBe(false);
      expect(posix(p)).toBe(`${posix(h.snapshotDir)}/gymhound-x.db`);
      expect(fs.statSync(h.snapshotDir).isDirectory()).toBe(true);
    });
  });
});

describe('expoSnapshotFiles on the phone', () => {
  let h: Harness;

  beforeEach(() => {
    h = implementations[1].build(root);
  });

  it('lists nothing, without creating anything, before the first snapshot', () => {
    expect(h.files.list()).toEqual([]);
    expect(fs.existsSync(h.snapshotDir)).toBe(false);
  });

  it('creates the database folder when a restore finds it missing', () => {
    const name = snapshotName(NOW);
    fs.writeFileSync(h.files.pathFor(name), 'snapshot bytes');
    fs.rmSync(h.liveDir, { recursive: true });

    h.files.copyToLive(name);

    expect(fs.readFileSync(h.liveFile, 'utf8')).toBe('snapshot bytes');
  });

  it('finds the set-aside file next to the live file, whatever the folder is called', () => {
    fs.writeFileSync(h.liveFile, 'main');

    const name = h.files.setAsideLive('failed-x');

    expect(setAsidePath(name)).toBe(`${h.liveDir}/gymhound.failed-x.db`);
    expect(fileExists(setAsidePath(name))).toBe(true);
    expect(fileExists(h.liveFile)).toBe(false);
  });

  it('says a path is not a file when it is a folder or missing', () => {
    expect(fileExists(h.liveDir)).toBe(false);
    expect(fileExists(`${h.liveDir}/nothing.db`)).toBe(false);
  });
});
