import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotFiles } from '../snapshots';

/** SQLite's write-ahead-log files. The app runs in WAL mode, so they can hold committed data. */
const SIDECARS = ['-wal', '-shm'];

/**
 * `SnapshotFiles` over Node `fs`, for tests. Snapshots live in `${dir}/snapshots`.
 * `liveFile` is the full path of the live database; a set-aside copy goes next to it.
 * The contracts on `SnapshotFiles` are what the phone's implementation honours too.
 */
export function nodeSnapshotFiles(dir: string, liveFile: string): SnapshotFiles {
  const snapshotDir = path.join(dir, 'snapshots');
  fs.mkdirSync(snapshotDir, { recursive: true });
  const liveIsMissingOrEmpty = () => !fs.existsSync(liveFile) || fs.statSync(liveFile).size === 0;

  return {
    list: () => fs.readdirSync(snapshotDir).filter((name) => fs.statSync(path.join(snapshotDir, name)).size > 0),
    pathFor: (name) => path.join(snapshotDir, name),
    remove: (name) => fs.rmSync(path.join(snapshotDir, name), { force: true }),
    rename: (from, to) => fs.renameSync(path.join(snapshotDir, from), path.join(snapshotDir, to)),
    liveIsMissingOrEmpty,
    setAsideLive(tag) {
      const name = `gymhound.${tag}.db`;
      const target = path.join(path.dirname(liveFile), name);
      // The main file always moves (renameSync throws if it is missing). A side file moves only if it exists.
      const moves = ['', ...SIDECARS]
        .filter((suffix) => suffix === '' || fs.existsSync(liveFile + suffix))
        .map((suffix) => ({ from: liveFile + suffix, to: target + suffix }));
      // renameSync replaces an existing target, which would delete that file. Check before moving anything.
      for (const { to } of moves) {
        if (fs.existsSync(to)) throw new Error(`${path.basename(to)} already exists.`);
      }
      const moved: typeof moves = [];
      try {
        for (const move of moves) {
          fs.renameSync(move.from, move.to);
          moved.push(move);
        }
      } catch (error) {
        for (const { from, to } of moved.reverse()) {
          try {
            fs.renameSync(to, from);
          } catch {
            // Nothing more can be done; the original error is the one to report.
          }
        }
        throw error;
      }
      return name;
    },
    copyToLive(name) {
      // Checked before anything is removed: a healthy live database, and the -wal that may hold its newest data, are never touched.
      if (!liveIsMissingOrEmpty()) throw new Error('The live database has data, so a snapshot will not be copied over it.');
      for (const suffix of SIDECARS) fs.rmSync(liveFile + suffix, { force: true });
      const temp = `${liveFile}.restoring`;
      try {
        fs.copyFileSync(path.join(snapshotDir, name), temp);
        fs.renameSync(temp, liveFile);
      } catch (error) {
        fs.rmSync(temp, { force: true });
        throw error;
      }
    },
  };
}
