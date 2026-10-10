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
   * Makes the live database a copy of a snapshot. Call it only when no live database exists (missing, empty or just set aside).
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

export type StartupDeps = {
  files: SnapshotFiles;
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

/**
 * Opens and migrates the database. The app never starts empty while a snapshot exists, and the live file is never deleted.
 * 1. Live file missing or empty, and a snapshot exists: copy the newest snapshot in.
 * 2. Open and migrate. If that works, done.
 * 3. If it fails and there is no snapshot, report the failure and leave the file as it is.
 * 4. If it fails and there is a snapshot: set the failed file aside, copy the newest snapshot in, open and migrate again.
 *
 * "Fails" includes a live file too corrupt to open: `open()` throwing is handled like a failed migration.
 */
export async function startDatabase(deps: StartupDeps): Promise<StartupResult> {
  const { files, open, close, migrate } = deps;
  const newest = newestSnapshot(files.list());
  let restoredFrom: string | null = null;
  if (newest && files.liveIsMissingOrEmpty()) {
    try {
      files.copyToLive(newest);
    } catch (error) {
      // Opening now would create an empty database next to a snapshot that has the user's workouts.
      return { kind: 'failed', error: asError(error), newestSnapshot: newest, setAside: null };
    }
    restoredFrom = newest;
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
  if (!newest) return { kind: 'failed', error: firstError, newestSnapshot: null, setAside: null };

  let setAside: string | null = null;
  let second: Db | null = null;
  try {
    setAside = files.setAsideLive(`failed-${stamp(deps.now)}`);
    files.copyToLive(newest);
    second = open();
    await migrate(second);
    console.warn('GymHound restored its data from the newest snapshot because the database would not open.', firstError);
    return { kind: 'ok', db: second, restoredFrom: newest };
  } catch (secondError) {
    if (second) closeQuietly(close, second);
    return { kind: 'failed', error: asError(secondError), newestSnapshot: newest, setAside };
  }
}
