import { sql } from 'drizzle-orm';
import type { Db } from './types';

/**
 * The files GymHound's second copy lives in. The app and the Node tests each supply one.
 * Nothing here ever deletes the live database.
 */
export interface SnapshotFiles {
  /** File names in the snapshot folder. */
  list(): string[];
  /** Absolute path of a file in the snapshot folder, with no `file://` prefix (used by VACUUM INTO). */
  pathFor(name: string): string;
  remove(name: string): void;
  /** True when the live database file is absent or 0 bytes. */
  liveIsMissingOrEmpty(): boolean;
  /** Renames the live file to `gymhound.${tag}.db` and returns that name. Never deletes. */
  setAsideLive(tag: string): string;
  /** Copies a snapshot over the live database path. */
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
 */
export function writeSnapshot(db: Db, files: SnapshotFiles, now: number): string {
  const name = snapshotName(now);
  const existed = files.list().includes(name);
  const target = files.pathFor(name).replace(/'/g, "''");
  try {
    db.run(sql.raw(`VACUUM INTO '${target}'`));
  } catch (error) {
    // A half-written file with a snapshot name would be restored from as the newest. Never touch an earlier one.
    if (!existed) files.remove(name);
    throw error;
  }
  for (const old of snapshotsToPrune(files.list())) files.remove(old);
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

/**
 * Opens and migrates the database. The app never starts empty while a snapshot exists, and the live file is never deleted.
 * 1. Live file missing or empty, and a snapshot exists: copy the newest snapshot in.
 * 2. Open and migrate. If that works, done.
 * 3. If it fails and there is no snapshot, report the failure and leave the file as it is.
 * 4. If it fails and there is a snapshot: set the failed file aside, copy the newest snapshot in, open and migrate again.
 */
export async function startDatabase(deps: StartupDeps): Promise<StartupResult> {
  const { files, open, close, migrate } = deps;
  const newest = newestSnapshot(files.list());
  let restoredFrom: string | null = null;
  if (files.liveIsMissingOrEmpty() && newest) {
    files.copyToLive(newest);
    restoredFrom = newest;
  }

  const first = open();
  try {
    await migrate(first);
    return { kind: 'ok', db: first, restoredFrom };
  } catch (firstError) {
    close(first);
    if (!newest) return { kind: 'failed', error: asError(firstError), newestSnapshot: null, setAside: null };
  }

  let setAside: string | null = null;
  let second: Db | null = null;
  try {
    setAside = files.setAsideLive(`failed-${stamp(deps.now)}`);
    files.copyToLive(newest);
    second = open();
    await migrate(second);
    return { kind: 'ok', db: second, restoredFrom: newest };
  } catch (secondError) {
    if (second) close(second);
    return { kind: 'failed', error: asError(secondError), newestSnapshot: newest, setAside };
  }
}
