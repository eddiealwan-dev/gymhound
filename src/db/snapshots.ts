import { sql } from 'drizzle-orm';
import type { Db } from './types';

/**
 * The files GymHound's second copy lives in. The app and the Node tests each supply one, and both honour the contracts below.
 * Nothing here ever deletes the live database.
 */
export interface SnapshotFiles {
  /** File names in the snapshot folder. A 0-byte file is left out: a crash can leave one, and it is not a snapshot. */
  list(): string[];
  /** Absolute path of a file in the snapshot folder, with no `file://` prefix (used by VACUUM INTO). The folder exists afterwards. */
  pathFor(name: string): string;
  /** Removes a file from the snapshot folder. A file that is not there is not an error. */
  remove(name: string): void;
  /** Renames a file in the snapshot folder, replacing `to` if it exists. */
  rename(from: string, to: string): void;
  /** True when the live database file is absent or 0 bytes. */
  liveIsMissingOrEmpty(): boolean;
  /**
   * Moves the live file, and its -wal and -shm files when they exist, to `gymhound.${tag}.db` (and the same suffixes) beside it. Returns that name.
   * Either every file moves or the call throws having moved nothing: a part-way failure is rolled back.
   * Never deletes, and never replaces a file that is already there.
   */
  setAsideLive(tag: string): string;
  /**
   * Makes the live database a copy of a snapshot. It throws, changing nothing, if a live database with data exists:
   * it is only for a live file that is missing, empty or just set aside, so a healthy database is never overwritten.
   * It first removes any -wal and -shm files left at the live path: they belong to a database that is gone and would corrupt the copy.
   * Then it copies to a temporary file beside the live one and renames that into place, so the live path never holds half a database.
   */
  copyToLive(name: string): void;
}

/** How many snapshots are kept. */
export const KEEP_SNAPSHOTS = 7;

const SNAPSHOT_NAME = /^gymhound-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-(\d{3})\.db$/;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** `YYYYMMDD-HHmmss-SSS` in UTC, so names sort as text in time order. */
function stamp(now: number): string {
  const d = new Date(now);
  const date = `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `${date}-${time}-${pad(d.getUTCMilliseconds(), 3)}`;
}

function asError(x: unknown): Error {
  return x instanceof Error ? x : new Error(String(x));
}

/** `gymhound-YYYYMMDD-HHmmss-SSS.db`, in UTC. */
export function snapshotName(now: number): string {
  return `gymhound-${stamp(now)}.db`;
}

/** The epoch milliseconds a snapshot name was made from. The inverse of `snapshotName`. */
export function snapshotTime(name: string): number {
  const m = SNAPSHOT_NAME.exec(name);
  if (!m) throw new Error(`Not a snapshot name: ${name}`);
  const [year, month, day, hour, minute, second, ms] = m.slice(1).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second, ms);
}

/** The snapshot names in `names`, oldest first. Any other file is ignored. */
function snapshotsOldestFirst(names: string[]): string[] {
  return names.filter((n) => SNAPSHOT_NAME.test(n)).sort();
}

export function newestSnapshot(names: string[]): string | null {
  return snapshotsOldestFirst(names).at(-1) ?? null;
}

/** The snapshots to remove so only the newest `keep` stay. Other files are never named. */
export function snapshotsToPrune(names: string[], keep: number = KEEP_SNAPSHOTS): string[] {
  const all = snapshotsOldestFirst(names);
  return all.slice(0, Math.max(0, all.length - keep));
}

/**
 * Copies the whole database to a new snapshot file with `VACUUM INTO`, then removes the snapshots beyond the newest 7.
 * Returns the new name. Throws if the copy fails; the caller keeps the finish and retries at the next one.
 * Call it outside any transaction: VACUUM cannot run inside one.
 *
 * The copy is written to `${name}.partial` and renamed to `name` only when it is complete, so a process killed part-way
 * can never leave a half-written file under a snapshot name for the next startup to restore from.
 */
export function writeSnapshot(db: Db, files: SnapshotFiles, now: number): string {
  const name = snapshotName(now);
  if (files.list().includes(name)) throw new Error(`Snapshot ${name} already exists.`);
  const partial = `${name}.partial`;
  files.remove(partial); // an earlier killed run may have left one, and VACUUM INTO refuses a target that exists
  const target = files.pathFor(partial).replace(/'/g, "''");
  try {
    db.run(sql.raw(`VACUUM INTO '${target}'`));
    files.rename(partial, name);
  } catch (error) {
    try {
      files.remove(partial);
    } catch {
      // The copy's own error is the one to report, so this one is dropped.
    }
    throw error;
  }
  try {
    // Never the snapshot just written: if the clock moved back, its name sorts among the oldest.
    for (const old of snapshotsToPrune(files.list())) if (old !== name) files.remove(old);
  } catch (error) {
    // The snapshot is written; a leftover old one costs only space.
    console.warn('GymHound could not remove an old snapshot.', error);
  }
  return name;
}

/** A snapshot opened only to be checked, never written. `all` returns a query's rows. */
export type SnapshotReader = { all(query: string): Record<string, unknown>[]; close(): void };

export type StartupDeps = {
  files: SnapshotFiles;
  /** Opens a snapshot by name to check it before a restore. Only called when a restore is needed. */
  openSnapshot(name: string): SnapshotReader;
  /** Opens the live database without migrating it. */
  open(): Db;
  /** Closes the connection for real: the file may be renamed straight afterwards. */
  close(db: Db): void;
  migrate(db: Db): Promise<void> | void;
  now: number;
};

export type StartupResult =
  | { kind: 'ok'; db: Db; restoredFrom: string | null }
  | { kind: 'failed'; error: Error; newestSnapshot: string | null; setAside: string | null };

/** Closes a connection, ignoring a failure: the caller is already handling a bigger one. */
function closeQuietly(close: StartupDeps['close'], db: Db): void {
  try {
    close(db);
  } catch {
    // Nothing more can be done with a connection that will not close.
  }
}

/** Sets the live file aside, leaving it in place if that fails: the caller is already handling a bigger failure. */
function setAsideQuietly(files: SnapshotFiles, tag: string): void {
  try {
    files.setAsideLive(tag);
  } catch {
    // Nothing more can be done.
  }
}

/**
 * The snapshot names, newest first.
 *
 * With a live database that has data, a snapshot folder that cannot be listed is logged and treated as holding no
 * snapshots: a healthy database must still open, and the snapshots are only a second copy. With the live file missing or
 * empty the error is thrown instead (the startup error screen): opening now would create an empty database beside
 * snapshots that might hold the user's workouts.
 */
function snapshotsNewestFirst(files: SnapshotFiles, liveIsGone: boolean): string[] {
  try {
    return snapshotsOldestFirst(files.list()).reverse();
  } catch (error) {
    if (liveIsGone) throw error;
    console.warn('GymHound could not list its snapshots, so it is starting without them.', error);
    return [];
  }
}

/** Tables every GymHound database has had since its first migration. A file without them is not GymHound's. */
const GYMHOUND_TABLES = ['exercises', 'routines', 'settings', 'workouts', 'workout_exercises', 'sets'];

/**
 * True when a snapshot passes a quick integrity check: `PRAGMA quick_check` says ok and GymHound's tables are there.
 * A file cut short when the phone died mid-copy, or one that is not a database at all, fails. Never throws; a failure is logged.
 */
function snapshotIsSound(open: StartupDeps['openSnapshot'], name: string): boolean {
  let reader: SnapshotReader | null = null;
  try {
    reader = open(name);
    const check = reader.all('PRAGMA quick_check');
    const ok = check.length === 1 && Object.values(check[0])[0] === 'ok';
    const tables = new Set(reader.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name));
    const missing = GYMHOUND_TABLES.filter((table) => !tables.has(table));
    if (ok && missing.length === 0) return true;
    console.warn(`GymHound skipped snapshot ${name}: it failed its check.`, ok ? `Missing tables: ${missing.join(', ')}` : check);
    return false;
  } catch (error) {
    console.warn(`GymHound skipped snapshot ${name}: it could not be checked.`, error);
    return false;
  } finally {
    try {
      reader?.close();
    } catch {
      // The check's own result is what matters.
    }
  }
}

/**
 * Opens and migrates the database. The app never starts empty while a snapshot exists, and the live file is never deleted.
 * 0. Whether the live file is missing or empty is read first. A snapshot folder that cannot be listed is then an error
 *    when it is (fail closed), and "no snapshots" when the live file has data (see `snapshotsNewestFirst`).
 * 1. Live file missing or empty, and a snapshot exists: copy the newest sound snapshot in (see `snapshotIsSound`). If
 *    none is sound, fail without opening anything.
 * 2. Open and migrate. If that works, done.
 * 3. If it fails and there is no sound snapshot, report the failure and leave the file as it is.
 * 4. If it fails and there is one: set the failed file aside, copy that snapshot in, open and migrate again.
 * 5. If the restored copy fails too, set it aside as well (under its own name) and report the failure, so the next launch restores again.
 *
 * Snapshots are checked only when a restore is needed, never on a normal start: newest first, stopping at the first
 * sound one, because a phone that died while a snapshot was being copied can leave the newest one damaged.
 * "Fails" includes a live file too corrupt to open: `open()` throwing is handled like a failed migration.
 */
export async function startDatabase(deps: StartupDeps): Promise<StartupResult> {
  const { files, open, close, migrate } = deps;
  const liveIsGone = files.liveIsMissingOrEmpty();
  const names = snapshotsNewestFirst(files, liveIsGone);
  const newest = names[0] ?? null;
  // Found once, and only when a restore is needed.
  let sound: string | null | undefined;
  const restoreSource = (): string | null => {
    if (sound === undefined) sound = names.find((name) => snapshotIsSound(deps.openSnapshot, name)) ?? null;
    return sound;
  };
  let restoredFrom: string | null = null;
  if (newest && liveIsGone) {
    const source = restoreSource();
    // Opening now would create an empty database next to snapshots that may hold the user's workouts.
    if (!source) return { kind: 'failed', error: new Error("None of GymHound's backups on this phone could be read."), newestSnapshot: newest, setAside: null };
    try {
      files.copyToLive(source);
    } catch (error) {
      return { kind: 'failed', error: asError(error), newestSnapshot: source, setAside: null };
    }
    restoredFrom = source;
  }

  let first: Db | null = null;
  let firstError: Error;
  try {
    first = open();
    await migrate(first);
    return { kind: 'ok', db: first, restoredFrom };
  } catch (error) {
    firstError = asError(error);
    if (first) closeQuietly(close, first);
  }
  const source = newest ? restoreSource() : null;
  if (!source) {
    if (newest) console.warn('GymHound could not restore its data: no snapshot passed its check.', firstError);
    return { kind: 'failed', error: firstError, newestSnapshot: newest, setAside: null };
  }

  let setAside: string | null = null;
  let second: Db | null = null;
  let restoredCopyInPlace = false;
  try {
    setAside = files.setAsideLive(`failed-${stamp(deps.now)}`);
    files.copyToLive(source);
    restoredCopyInPlace = true;
    second = open();
    await migrate(second);
    console.warn('GymHound restored its data from a snapshot because the database would not open.', firstError);
    return { kind: 'ok', db: second, restoredFrom: source };
  } catch (secondError) {
    if (second) closeQuietly(close, second);
    // A restored copy that will not open either must not stay live: set it aside too, so the next launch finds no live
    // file, restores again (and says so), while the original failed file stays where the error screen exports it from.
    if (restoredCopyInPlace) setAsideQuietly(files, `restore-failed-${stamp(deps.now)}`);
    console.warn('GymHound could not restore its data from a snapshot. The database first failed with:', firstError);
    return { kind: 'failed', error: asError(secondError), newestSnapshot: source, setAside };
  }
}
