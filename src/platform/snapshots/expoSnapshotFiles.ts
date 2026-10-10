import { Directory, File, Paths } from 'expo-file-system';
import { liveDbPath } from '../../db/client';
import type { SnapshotFiles } from '../../db/snapshots';

/** SQLite's write-ahead-log files, which sit beside the database and can hold committed data. */
const SIDECARS = ['-wal', '-shm'];

/**
 * The `file://` URI for an absolute path. Each segment is percent-encoded, which matters: Expo Go's own
 * document folder has a literal `%40` in its name, so the URI for it reads `%2540`.
 */
export function fileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** The absolute path a `file://` URI points to, without a trailing slash. The inverse of `fileUri`. */
function pathFromUri(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const fileAt = (path: string) => new File(fileUri(path));
const dirAt = (path: string) => new Directory(fileUri(path));

function ensureDirectory(path: string): void {
  dirAt(path).create({ intermediates: true, idempotent: true });
}

/** Deletes a file if it is there. A file that is not there is not an error. */
function removeIfThere(path: string): void {
  const file = fileAt(path);
  if (file.exists) file.delete();
}

/** True when a file exists at the absolute path. Never throws. */
export function fileExists(path: string): boolean {
  try {
    return fileAt(path).exists;
  } catch {
    return false;
  }
}

/** The absolute path of a file set aside next to the live database, as named by `SnapshotFiles.setAsideLive`. */
export function setAsidePath(name: string): string {
  return `${dirOf(liveDbPath())}/${name}`;
}

/**
 * `SnapshotFiles` on the phone.
 * - The live database is `gymhound.db` in expo-sqlite's default database folder.
 * - Snapshots live in a `snapshots` folder in the app's documents folder.
 * Every path is absolute with no `file://` prefix, which is what SQLite (and `VACUUM INTO`) wants.
 * It honours the same contracts as the Node implementation the tests use; see `SnapshotFiles`.
 */
export function expoSnapshotFiles(): SnapshotFiles {
  const snapshotDir = `${pathFromUri(Paths.document.uri)}/snapshots`;
  const snapshotPath = (name: string) => `${snapshotDir}/${name}`;

  return {
    list() {
      const dir = dirAt(snapshotDir);
      if (!dir.exists) return [];
      return dir
        .list()
        .filter((entry): entry is File => entry instanceof File && entry.size > 0)
        .map((file) => pathFromUri(file.uri).split('/').pop()!);
    },
    pathFor(name) {
      ensureDirectory(snapshotDir);
      return snapshotPath(name);
    },
    remove: (name) => removeIfThere(snapshotPath(name)),
    rename: (from, to) => fileAt(snapshotPath(from)).moveSync(fileAt(snapshotPath(to)), { overwrite: true }),
    liveIsMissingOrEmpty() {
      const live = fileAt(liveDbPath());
      return !live.exists || live.size === 0;
    },
    setAsideLive(tag) {
      const live = liveDbPath();
      const name = `gymhound.${tag}.db`;
      const target = `${dirOf(live)}/${name}`;
      // The main file always moves (moveSync throws if it is missing). A side file moves only if it exists.
      const moves = ['', ...SIDECARS]
        .filter((suffix) => suffix === '' || fileAt(live + suffix).exists)
        .map((suffix) => ({ from: live + suffix, to: target + suffix }));
      // Check first, so a clash moves nothing at all.
      for (const { to } of moves) {
        if (fileAt(to).exists) throw new Error(`${to.split('/').pop()} already exists.`);
      }
      const moved: typeof moves = [];
      try {
        for (const move of moves) {
          fileAt(move.from).moveSync(fileAt(move.to));
          moved.push(move);
        }
      } catch (error) {
        for (const { from, to } of moved.reverse()) {
          try {
            fileAt(to).moveSync(fileAt(from));
          } catch {
            // Nothing more can be done; the original error is the one to report.
          }
        }
        throw error;
      }
      return name;
    },
    copyToLive(name) {
      const live = liveDbPath();
      for (const suffix of SIDECARS) removeIfThere(live + suffix);
      ensureDirectory(dirOf(live));
      const temp = `${live}.restoring`;
      removeIfThere(temp);
      try {
        fileAt(snapshotPath(name)).copySync(fileAt(temp));
        fileAt(temp).moveSync(fileAt(live), { overwrite: true });
      } catch (error) {
        try {
          removeIfThere(temp);
        } catch {
          // The copy's own error is the one to report.
        }
        throw error;
      }
    },
  };
}
