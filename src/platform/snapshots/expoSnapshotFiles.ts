import { Directory, File, Paths } from 'expo-file-system';
import { liveDbPath } from '../../db/client';
import type { SnapshotFiles } from '../../db/snapshots';
import { describeError } from './describeError';
import { fileUri, pathFromUri } from './fileUri';

/** SQLite's write-ahead-log files, which sit beside the database and can hold committed data. */
const SIDECARS = ['-wal', '-shm'];

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const fileAt = (path: string) => new File(fileUri(path));
const dirAt = (path: string) => new Directory(fileUri(path));
/** The name of an entry `Directory.list()` returned, taken from its uri. */
const nameOf = (entry: File | Directory) => pathFromUri(entry.uri).split('/').pop()!;
/** The path of a snapshot by its name, in the app's own form (which `remove`, `rename` and `copyToLive` use too). */
const snapshotPathIn = (snapshotDir: string, name: string) => `${snapshotDir}/${name}`;

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

/** The absolute path of the folder snapshots live in: `snapshots` in the app's documents folder. */
export function snapshotDirPath(): string {
  return `${pathFromUri(Paths.document.uri)}/snapshots`;
}

/**
 * `SnapshotFiles` on the phone.
 * - The live database is `gymhound.db` in expo-sqlite's default database folder.
 * - Snapshots live in a `snapshots` folder in the app's documents folder.
 * Every path is absolute with no `file://` prefix, which is what SQLite (and `VACUUM INTO`) wants.
 * It honours the same contracts as the Node implementation the tests use; see `SnapshotFiles`.
 */
export function expoSnapshotFiles(): SnapshotFiles {
  const snapshotDir = snapshotDirPath();
  const snapshotPath = (name: string) => snapshotPathIn(snapshotDir, name);
  const liveIsMissingOrEmpty = () => {
    const live = fileAt(liveDbPath());
    return !live.exists || live.size === 0;
  };

  return {
    list() {
      const dir = dirAt(snapshotDir);
      if (!dir.exists) return [];
      const names: string[] = [];
      for (const entry of dir.list()) {
        // A listed entry is built from the URI iOS listed it under, which can differ from the app's own form, and then
        // its size reads null. So only its name is taken from it; the size is read through the app's own path.
        try {
          if (!(entry instanceof File)) continue;
          const name = nameOf(entry);
          if (fileAt(snapshotPath(name)).size > 0) names.push(name);
        } catch {
          // One entry that can't be read is skipped; it must not cost the rest of the list.
        }
      }
      return names;
    },
    pathFor(name) {
      ensureDirectory(snapshotDir);
      return snapshotPath(name);
    },
    remove: (name) => removeIfThere(snapshotPath(name)),
    rename: (from, to) => fileAt(snapshotPath(from)).moveSync(fileAt(snapshotPath(to)), { overwrite: true }),
    liveIsMissingOrEmpty,
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
      // Checked before anything is removed: a healthy live database, and the -wal that may hold its newest data, are never touched.
      if (!liveIsMissingOrEmpty()) throw new Error('The live database has data, so a snapshot will not be copied over it.');
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

/** How much of each entry's uri the folder description shows: enough to compare its form with the app's own. */
const URI_CHARS = 60;

/** A value read from the phone, as text (null included), or the error reading it threw. Never throws. */
function readText(read: () => unknown): string {
  try {
    return String(read());
  } catch (error) {
    return `error: ${describeError(error)}`;
  }
}

/**
 * The snapshot folder as the phone lists it, for the development line in Settings → Backups: whether the folder exists
 * and its path, then each entry `Directory.list()` returned, one per line, with its name, File or Directory, the start of
 * its uri, the size read from the listed entry (null when the phone can't read it there) and the size read through the
 * app's own path. So a missing folder, an empty one and files the listing drops can be told apart. Never throws: an
 * error comes back as its message and code.
 */
export function describeSnapshotFolder(): string {
  try {
    const snapshotDir = snapshotDirPath();
    const dir = dirAt(snapshotDir);
    if (!dir.exists) return `Folder missing: ${snapshotDir}`;
    const entries = dir.list();
    const lines = entries.map((entry) => {
      const uri = readText(() => entry.uri);
      return [
        `${readText(() => nameOf(entry))}: ${entry instanceof Directory ? 'Directory' : 'File'}`,
        uri.length > URI_CHARS ? `${uri.slice(0, URI_CHARS)}…` : uri,
        `listed size ${readText(() => entry.size)}`,
        `size ${readText(() => fileAt(snapshotPathIn(snapshotDir, nameOf(entry))).size)}`,
      ].join(', ');
    });
    return [`Folder exists: ${snapshotDir}`, `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, ...lines].join('\n');
  } catch (error) {
    return describeError(error);
  }
}
