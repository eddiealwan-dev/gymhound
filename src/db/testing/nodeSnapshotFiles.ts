import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { SnapshotFiles, SnapshotReader } from '../snapshots';

/** SQLite's write-ahead-log files. The app runs in WAL mode, so they can hold committed data. */
const SIDECARS = ['-wal', '-shm'];

/** Errors Windows gives while another process (an antivirus or sync scan) briefly holds a file. */
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_TRIES = 10;

/** Blocks this thread for `ms` milliseconds: the snapshot contract is synchronous. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * `fs.renameSync`, retried on Windows while the error is a transient lock (EPERM, EACCES, EBUSY): up to ten tries,
 * 10 to 100 ms apart. Any other error, or any error elsewhere, is thrown at once; the last error after ten tries.
 */
export function renameWithRetry(from: string, to: string, platform: NodeJS.Platform = process.platform): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== 'win32' || code === undefined || !TRANSIENT.has(code) || attempt >= RENAME_TRIES) throw error;
      sleepSync(Math.min(10 * attempt, 100));
    }
  }
}

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
    rename: (from, to) => renameWithRetry(path.join(snapshotDir, from), path.join(snapshotDir, to)),
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
          renameWithRetry(move.from, move.to);
          moved.push(move);
        }
      } catch (error) {
        for (const { from, to } of moved.reverse()) {
          try {
            renameWithRetry(to, from);
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
        renameWithRetry(temp, liveFile);
      } catch (error) {
        fs.rmSync(temp, { force: true });
        throw error;
      }
    },
  };
}

/** `StartupDeps.openSnapshot` over better-sqlite3, for tests: opens a snapshot in `files`' folder read-only, to check it. */
export function nodeSnapshotReader(files: SnapshotFiles): (name: string) => SnapshotReader {
  return (name) => {
    const sqlite = new Database(files.pathFor(name), { readonly: true, fileMustExist: true });
    return {
      all: (query) => sqlite.prepare(query).all() as Record<string, unknown>[],
      close: () => sqlite.close(),
    };
  };
}
