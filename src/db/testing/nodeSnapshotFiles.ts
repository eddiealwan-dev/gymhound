import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotFiles } from '../snapshots';

/** SQLite's write-ahead-log files. The app runs in WAL mode, so they can hold committed data. */
const SIDECARS = ['-wal', '-shm'];

/**
 * `SnapshotFiles` over Node `fs`, for tests. Snapshots live in `${dir}/snapshots`.
 * `liveFile` is the full path of the live database; a set-aside copy goes next to it.
 */
export function nodeSnapshotFiles(dir: string, liveFile: string): SnapshotFiles {
  const snapshotDir = path.join(dir, 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });

  return {
    list: () => fs.readdirSync(snapshotDir),
    pathFor: (name) => path.join(snapshotDir, name),
    remove: (name) => fs.rmSync(path.join(snapshotDir, name), { force: true }),
    liveIsMissingOrEmpty: () => !fs.existsSync(liveFile) || fs.statSync(liveFile).size === 0,
    setAsideLive(tag) {
      const name = `gymhound.${tag}.db`;
      const target = path.join(path.dirname(liveFile), name);
      // renameSync replaces an existing target on Windows, which would delete that file.
      if (fs.existsSync(target)) throw new Error(`${name} already exists.`);
      fs.renameSync(liveFile, target);
      for (const suffix of SIDECARS) {
        if (fs.existsSync(liveFile + suffix)) fs.renameSync(liveFile + suffix, target + suffix);
      }
      return name;
    },
    copyToLive: (name) => fs.copyFileSync(path.join(snapshotDir, name), liveFile),
  };
}
