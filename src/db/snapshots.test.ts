/** @jest-environment node */
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSeed } from '../seed/seed';
import { ensureSettings } from './repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './repositories/workoutsRepo';
import { getActiveWorkoutView } from './repositories/workoutViewsRepo';
import * as schema from './schema';
import { workouts } from './schema';
import {
  KEEP_SNAPSHOTS,
  newestSnapshot,
  snapshotName,
  snapshotsToPrune,
  snapshotTime,
  startDatabase,
  writeSnapshot,
  type SnapshotFiles,
  type StartupDeps,
  type StartupResult,
} from './snapshots';
import { createTestDb, migrateTestDb } from './testing/createTestDb';
import { nodeSnapshotFiles } from './testing/nodeSnapshotFiles';
import { openFileDb } from './testing/openFileDb';
import type { Db } from './types';

const NOW = new Date(2026, 9, 9, 9, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PUSH_A = 'premade-ppl-6:push-a';

let dir: string;
let liveFile: string;
let handles: { close(): void }[];
let warn: jest.SpyInstance;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-snap-'));
  liveFile = path.join(dir, 'gymhound.db');
  handles = [];
  // The code under test logs with console.warn; keeping it quiet keeps the test output clean, and tests can assert on it.
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // Runs even when a test fails, so no handle keeps the folder locked on Windows.
  for (const h of handles) h.close();
  fs.rmSync(dir, { recursive: true, force: true });
  jest.restoreAllMocks();
});

function track<T extends { close(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
}

/** Opens a migrated, seeded file database at `file`. */
function openSeeded(file: string): { db: Db; close(): void } {
  const handle = track(createTestDb(file));
  ensureSettings(handle.db, 'us');
  runSeed(handle.db, NOW);
  return handle;
}

/** Logs one set and finishes a Push A workout started at `at`. Returns its id. */
function finishOne(db: Db, at: number): string {
  const id = startWorkoutFromDay(db, PUSH_A, at);
  const [first] = getActiveWorkoutView(db)!.exercises[0].sets;
  tickSet(db, first.id, { weight: 185, reps: 8, durationS: null, distance: null }, 'lb', at + 60_000, 'mi');
  finishWorkout(db, id, at + HOUR);
  return id;
}

function finishedIds(db: Db): string[] {
  return db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.status, 'finished'))
    .all()
    .map((r) => r.id)
    .sort();
}

/**
 * A live database with two finished workouts and a snapshot taken after each, then closed.
 * Returns the workout ids (sorted) and the two snapshot names.
 */
function liveWithTwoSnapshots(files: SnapshotFiles): { ids: string[]; oldest: string; newest: string } {
  const { db, close } = openSeeded(liveFile);
  const first = finishOne(db, NOW);
  const oldest = writeSnapshot(db, files, NOW + 2 * HOUR);
  const second = finishOne(db, NOW + DAY);
  const newest = writeSnapshot(db, files, NOW + DAY + 2 * HOUR);
  close();
  return { ids: [first, second].sort(), oldest, newest };
}

/** Startup dependencies over the temp folder. `closed` counts closes so tests can check no handle leaks. */
function makeDeps(overrides: Partial<StartupDeps> = {}) {
  const files = nodeSnapshotFiles(dir, liveFile);
  const handleOf = new Map<Db, { close(): void }>();
  const count = { opened: 0, closed: 0 };
  const deps: StartupDeps = {
    files,
    open: () => {
      const handle = track(openFileDb(liveFile));
      handleOf.set(handle.db, handle);
      count.opened += 1;
      return handle.db;
    },
    close: (db) => {
      handleOf.get(db)!.close();
      count.closed += 1;
    },
    migrate: migrateTestDb,
    now: NOW + 10 * DAY,
    ...overrides,
  };
  return { deps, files, count };
}

/** A migrate that throws on its first call, then runs the real migrator. */
function migrateFailingOnce(): StartupDeps['migrate'] {
  let calls = 0;
  return (db) => {
    calls += 1;
    if (calls === 1) throw new Error('migration exploded');
    migrateTestDb(db);
  };
}

function migrateAlwaysFailing(): StartupDeps['migrate'] {
  return () => {
    throw new Error('migration exploded');
  };
}

function expectOk(result: StartupResult): Extract<StartupResult, { kind: 'ok' }> {
  if (result.kind !== 'ok') throw new Error(`Expected startup to succeed, but it failed: ${result.error.message}`);
  return result;
}

/** True when the first console.warn call carried an Error whose message matches. */
function warnedWithError(message: string | RegExp): boolean {
  const args: unknown[] = warn.mock.calls[0] ?? [];
  return args.some((arg) => arg instanceof Error && (typeof message === 'string' ? arg.message === message : message.test(arg.message)));
}

function expectFailed(result: StartupResult): Extract<StartupResult, { kind: 'failed' }> {
  if (result.kind !== 'failed') throw new Error('Expected startup to fail, but it succeeded.');
  return result;
}

describe('writeSnapshot', () => {
  it('writes a file that opens as a database holding the finished workout', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    const id = finishOne(db, NOW);

    const name = writeSnapshot(db, files, NOW + 2 * HOUR);

    expect(name).toBe(snapshotName(NOW + 2 * HOUR));
    expect(files.list()).toEqual([name]);
    const copy = track(openFileDb(files.pathFor(name)));
    expect(finishedIds(copy.db)).toEqual([id]);
  });

  it('keeps the newest 7 of nine snapshots and leaves other files alone', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(files.pathFor('notes.txt'), 'keep me');
    fs.writeFileSync(files.pathFor('gymhound.failed-x.db'), 'keep me too');
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);

    const written: string[] = [];
    for (let i = 0; i < 9; i++) written.push(writeSnapshot(db, files, NOW + 2 * HOUR + i * HOUR));

    expect(KEEP_SNAPSHOTS).toBe(7);
    const snapshots = files.list().filter((n) => n !== 'notes.txt' && n !== 'gymhound.failed-x.db');
    expect(snapshots.sort()).toEqual(written.slice(2));
    expect(files.list()).toEqual(expect.arrayContaining(['notes.txt', 'gymhound.failed-x.db']));
  });

  it('copes with a single quote in the snapshot folder name', () => {
    const quoted = fs.mkdtempSync(path.join(os.tmpdir(), "gym'hound-snap-"));
    try {
      const files = nodeSnapshotFiles(quoted, path.join(quoted, 'gymhound.db'));
      const { db } = openSeeded(liveFile);
      const id = finishOne(db, NOW);

      const name = writeSnapshot(db, files, NOW + 2 * HOUR);

      const copy = track(openFileDb(files.pathFor(name)));
      expect(finishedIds(copy.db)).toEqual([id]);
      copy.close();
    } finally {
      fs.rmSync(quoted, { recursive: true, force: true });
    }
  });

  it('removes the partial file a failed VACUUM INTO left behind', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const half = {
      run: () => {
        fs.writeFileSync(files.pathFor(`${snapshotName(NOW)}.partial`), 'half a database');
        throw new Error('disk full');
      },
    } as unknown as Db;

    expect(() => writeSnapshot(half, files, NOW)).toThrow('disk full');
    expect(files.list()).toEqual([]);
  });

  it('writes under a .partial name and renames it only once the copy is complete', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);
    const at = NOW + 2 * HOUR;
    const seen: string[][] = [];
    const watching = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'run') return Reflect.get(target, prop, receiver);
        return (query: Parameters<Db['run']>[0]) => {
          // This is the moment a killed process would stop at: the copy has not started, so nothing may carry a snapshot name yet.
          seen.push(files.list());
          return target.run(query);
        };
      },
    });
    const renames: [string, string][] = [];
    const recording: SnapshotFiles = {
      ...files,
      rename: (from, to) => {
        renames.push([from, to]);
        files.rename(from, to);
      },
    };

    const name = writeSnapshot(watching, recording, at);

    expect(seen).toEqual([[]]);
    expect(renames).toEqual([[`${name}.partial`, name]]);
    expect(files.list()).toEqual([name]);
  });

  it('replaces a stale .partial file an earlier killed run left behind', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    const id = finishOne(db, NOW);
    const at = NOW + 2 * HOUR;
    fs.writeFileSync(files.pathFor(`${snapshotName(at)}.partial`), 'what a killed run left');

    const name = writeSnapshot(db, files, at);

    expect(files.list()).toEqual([name]);
    const copy = track(openFileDb(files.pathFor(name)));
    expect(finishedIds(copy.db)).toEqual([id]);
  });

  it('removes the partial file when the rename fails, and reports the rename error', () => {
    const real = nodeSnapshotFiles(dir, liveFile);
    const files: SnapshotFiles = {
      ...real,
      rename: () => {
        throw new Error('rename refused');
      },
    };
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);

    expect(() => writeSnapshot(db, files, NOW + 2 * HOUR)).toThrow('rename refused');

    expect(real.list()).toEqual([]);
  });

  it('reports the VACUUM INTO error even when removing the partial file fails too', () => {
    const real = nodeSnapshotFiles(dir, liveFile);
    let vacuumFailed = false;
    const files: SnapshotFiles = {
      ...real,
      remove: (name) => {
        if (vacuumFailed) throw new Error('cannot remove');
        real.remove(name);
      },
    };
    const failing = {
      run: () => {
        vacuumFailed = true;
        throw new Error('disk full');
      },
    } as unknown as Db;

    expect(() => writeSnapshot(failing, files, NOW)).toThrow('disk full');
  });

  it('never removes an existing snapshot when one with the same name exists', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);
    const name = writeSnapshot(db, files, NOW + 2 * HOUR);
    const before = fs.readFileSync(files.pathFor(name));

    expect(() => writeSnapshot(db, files, NOW + 2 * HOUR)).toThrow();

    expect(files.list()).toEqual([name]);
    expect(fs.readFileSync(files.pathFor(name)).equals(before)).toBe(true);
  });

  it('captures committed data that is still in the write-ahead log', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const sqlite = new Database(liveFile);
    handles.push({ close: () => sqlite.close() });
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('wal_autocheckpoint = 0'); // never move the log into the main file
    sqlite.pragma('foreign_keys = ON');
    const db: Db = drizzle(sqlite, { schema });
    migrateTestDb(db);
    ensureSettings(db, 'us');
    runSeed(db, NOW);
    const id = finishOne(db, NOW);
    expect(fs.statSync(`${liveFile}-wal`).size).toBeGreaterThan(0);

    const name = writeSnapshot(db, files, NOW + 2 * HOUR);

    const copy = track(openFileDb(files.pathFor(name)));
    expect(finishedIds(copy.db)).toEqual([id]);
    // Copying the main file alone would have lost it, which is why snapshots use VACUUM INTO.
    const mainOnly = path.join(dir, 'main-only.db');
    fs.copyFileSync(liveFile, mainOnly);
    const bare = track(openFileDb(mainOnly));
    expect(() => finishedIds(bare.db)).toThrow();
  });

  it('never prunes the snapshot it just wrote, even when names from a clock set ahead exist', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);
    const future: string[] = [];
    for (let i = 0; i < KEEP_SNAPSHOTS; i++) future.push(writeSnapshot(db, files, NOW + 400 * DAY + i * HOUR));

    const name = writeSnapshot(db, files, NOW + 2 * HOUR); // the clock moved back: this is now the oldest name

    expect(files.list().sort()).toEqual([name, ...future].sort());
    const copy = track(openFileDb(files.pathFor(name)));
    expect(finishedIds(copy.db)).toHaveLength(1);
  });

  it('keeps the new snapshot, and logs, when pruning an old one fails', () => {
    const real = nodeSnapshotFiles(dir, liveFile);
    const files: SnapshotFiles = {
      ...real,
      remove: (name) => {
        if (!name.endsWith('.partial')) throw new Error('cannot prune');
        real.remove(name);
      },
    };
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);
    for (let i = 0; i < KEEP_SNAPSHOTS; i++) writeSnapshot(db, real, NOW + 2 * HOUR + i * HOUR);

    const name = writeSnapshot(db, files, NOW + 2 * HOUR + KEEP_SNAPSHOTS * HOUR);

    expect(real.list()).toContain(name);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/snapshot/i);
  });
});

describe('snapshot names', () => {
  it('sorts chronologically and round-trips to epoch milliseconds', () => {
    const t1 = Date.UTC(2026, 9, 9, 8, 5, 3, 7);
    const t2 = t1 + 1;
    const t3 = Date.UTC(2026, 9, 9, 8, 5, 4, 0);
    const t4 = Date.UTC(2027, 0, 1, 0, 0, 0, 0);

    expect(snapshotName(t1)).toBe('gymhound-20261009-080503-007.db');
    expect(snapshotName(t1) < snapshotName(t2)).toBe(true);
    expect(snapshotName(t2) < snapshotName(t3)).toBe(true);
    expect(snapshotName(t3) < snapshotName(t4)).toBe(true);
    for (const t of [t1, t2, t3, t4, NOW]) expect(snapshotTime(snapshotName(t))).toBe(t);
  });

  it('newestSnapshot picks the latest and ignores every other file', () => {
    const older = snapshotName(NOW);
    const newer = snapshotName(NOW + DAY);
    const names = ['notes.txt', 'gymhound.failed-x.db', 'gymhound-2026.db', newer, 'gymhound-20990101-000000-000.db.bak', older];

    expect(newestSnapshot(names)).toBe(newer);
    expect(newestSnapshot(['notes.txt', 'gymhound.failed-x.db'])).toBeNull();
    expect(newestSnapshot([])).toBeNull();
  });

  it('snapshotsToPrune returns the oldest beyond the keep count, whatever the input order', () => {
    const all = Array.from({ length: 9 }, (_, i) => snapshotName(NOW + i * HOUR));
    const shuffled = [all[4], all[8], all[0], 'notes.txt', all[2], all[6], all[1], 'gymhound.failed-x.db', all[3], all[7], all[5]];

    expect(snapshotsToPrune(shuffled)).toEqual([all[0], all[1]]);
    expect(snapshotsToPrune(all.slice(0, 7))).toEqual([]);
    expect(snapshotsToPrune(all, 3)).toEqual(all.slice(0, 6));
  });
});

describe('startDatabase', () => {
  it('starts a fresh install with a migrated database and nothing restored', async () => {
    const { deps, count } = makeDeps();

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBeNull();
    expect(finishedIds(result.db)).toEqual([]);
    expect(count).toEqual({ opened: 1, closed: 0 });
  });

  it('restores the newest snapshot when the live file is missing', async () => {
    const { deps, files } = makeDeps();
    const { ids, newest } = liveWithTwoSnapshots(files);
    fs.rmSync(liveFile);

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
  });

  it('restores the newest snapshot when the live file is empty', async () => {
    const { deps, files } = makeDeps();
    const { ids, newest } = liveWithTwoSnapshots(files);
    fs.writeFileSync(liveFile, '');

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
  });

  it('leaves a healthy live database alone', async () => {
    const { deps, files } = makeDeps();
    const { ids } = liveWithTwoSnapshots(files);
    const before = fs.readFileSync(liveFile);

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBeNull();
    expect(finishedIds(result.db)).toEqual(ids);
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
    for (const h of handles) h.close();
    expect(fs.readFileSync(liveFile).equals(before)).toBe(true);
  });

  it('restores the newest snapshot when the migration fails once, and keeps the failed file', async () => {
    const { deps, files, count } = makeDeps({ migrate: migrateFailingOnce() });
    const { ids, newest } = liveWithTwoSnapshots(files);
    const live = track(openFileDb(liveFile));
    const unsnapshotted = finishOne(live.db, NOW + 2 * DAY);
    live.close();
    const original = fs.readFileSync(liveFile);

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
    expect(finishedIds(result.db)).not.toContain(unsnapshotted);
    const setAside = fs.readdirSync(dir).filter((n) => /^gymhound\.failed-.+\.db$/.test(n));
    expect(setAside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, setAside[0])).equals(original)).toBe(true);
    expect(count.opened).toBe(2);
    expect(count.closed).toBe(1);
    // The restore worked, so the migration error that caused it is logged rather than lost.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnedWithError('migration exploded')).toBe(true);
  });

  it('restores the newest snapshot when the live file is missing and the migration then fails', async () => {
    const { deps, files, count } = makeDeps({ migrate: migrateFailingOnce() });
    const { ids, newest } = liveWithTwoSnapshots(files);
    fs.rmSync(liveFile);

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
    // The first copy of the snapshot failed to migrate, so it was set aside rather than deleted.
    expect(fs.readdirSync(dir).filter((n) => /^gymhound\.failed-.+\.db$/.test(n))).toHaveLength(1);
    expect(count.opened).toBe(2);
    expect(count.closed).toBe(1);
  });

  it('fails, keeping the snapshots, when the live file is missing and the migration keeps failing', async () => {
    const { deps, files, count } = makeDeps({ migrate: migrateAlwaysFailing() });
    const { newest } = liveWithTwoSnapshots(files);
    fs.rmSync(liveFile);
    const snapshots = files.list();

    const result = expectFailed(await startDatabase(deps));

    expect(result.newestSnapshot).toBe(newest);
    expect(result.setAside).toMatch(/^gymhound\.failed-.+\.db$/);
    expect(fs.existsSync(path.join(dir, result.setAside!))).toBe(true);
    expect(files.list()).toEqual(snapshots);
    expect(count.opened).toBe(count.closed);
  });

  it('restores the newest snapshot when open() throws on the first call, and keeps the live file', async () => {
    const { deps: base, files, count } = makeDeps();
    const { ids, newest } = liveWithTwoSnapshots(files);
    const live = track(openFileDb(liveFile));
    const unsnapshotted = finishOne(live.db, NOW + 2 * DAY);
    live.close();
    const original = fs.readFileSync(liveFile);
    let calls = 0;
    const deps: StartupDeps = {
      ...base,
      open: () => {
        calls += 1;
        if (calls === 1) throw new Error('open exploded');
        return base.open();
      },
    };

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
    expect(finishedIds(result.db)).not.toContain(unsnapshotted);
    const setAside = fs.readdirSync(dir).filter((n) => /^gymhound\.failed-.+\.db$/.test(n));
    expect(setAside).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, setAside[0])).equals(original)).toBe(true);
    expect(count).toEqual({ opened: 1, closed: 0 }); // the first open() threw, so there was no handle to close
    expect(warnedWithError('open exploded')).toBe(true);
  });

  it('restores the newest snapshot when the live file is too corrupt for the first PRAGMA', async () => {
    const { deps: base, files, count } = makeDeps();
    const { ids, newest } = liveWithTwoSnapshots(files);
    fs.writeFileSync(liveFile, Buffer.alloc(8192, 'x'));
    // Like the app's open(): configure the connection straight away, and close it if that throws.
    const deps: StartupDeps = {
      ...base,
      open: () => {
        const handle = track(openFileDb(liveFile));
        try {
          handle.db.run(sql.raw('PRAGMA journal_mode = WAL'));
        } catch (error) {
          handle.close();
          throw error;
        }
        count.opened += 1;
        return handle.db;
      },
    };

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(newest);
    expect(finishedIds(result.db)).toEqual(ids);
    expect(fs.readdirSync(dir).filter((n) => /^gymhound\.failed-.+\.db$/.test(n))).toHaveLength(1);
    expect(warnedWithError(/PRAGMA journal_mode/)).toBe(true);
  });

  it('fails, offering the newest snapshot, when copying it into a missing live file fails', async () => {
    const realFiles = nodeSnapshotFiles(dir, liveFile);
    const files: SnapshotFiles = {
      ...realFiles,
      copyToLive: () => {
        throw new Error('disk full');
      },
    };
    const { deps, count } = makeDeps({ files });
    const { newest } = liveWithTwoSnapshots(realFiles);
    fs.rmSync(liveFile);

    const result = expectFailed(await startDatabase(deps));

    expect(result.error.message).toBe('disk full');
    expect(result.newestSnapshot).toBe(newest);
    expect(result.setAside).toBeNull();
    expect(fs.existsSync(liveFile)).toBe(false); // it never opened an empty database
    expect(count.opened).toBe(0);
  });

  it('fails, keeping every file, when the migration keeps failing with a snapshot', async () => {
    const { deps, files, count } = makeDeps({ migrate: migrateAlwaysFailing() });
    const { newest } = liveWithTwoSnapshots(files);
    const original = fs.readFileSync(liveFile);
    const snapshotBytes = new Map(files.list().map((n) => [n, fs.readFileSync(files.pathFor(n))]));

    const result = expectFailed(await startDatabase(deps));

    expect(result.error.message).toBe('migration exploded');
    expect(result.newestSnapshot).toBe(newest);
    expect(result.setAside).toMatch(/^gymhound\.failed-.+\.db$/);
    expect(fs.readFileSync(path.join(dir, result.setAside!)).equals(original)).toBe(true);
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', result.setAside, 'snapshots'].sort());
    expect(files.list().sort()).toEqual([...snapshotBytes.keys()].sort());
    for (const [name, bytes] of snapshotBytes) expect(fs.readFileSync(files.pathFor(name)).equals(bytes)).toBe(true);
    expect(count.opened).toBe(count.closed);
  });

  it('fails without touching anything when the migration fails and there is no snapshot', async () => {
    const { deps, count } = makeDeps({ migrate: migrateAlwaysFailing() });
    const { db, close } = openSeeded(liveFile);
    finishOne(db, NOW);
    close();
    const before = fs.readFileSync(liveFile);

    const result = expectFailed(await startDatabase(deps));

    expect(result.newestSnapshot).toBeNull();
    expect(result.setAside).toBeNull();
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
    expect(fs.readFileSync(liveFile).equals(before)).toBe(true);
    expect(count.opened).toBe(count.closed);
  });

  it('still reports the set-aside file when copying the snapshot in fails', async () => {
    const realFiles = nodeSnapshotFiles(dir, liveFile);
    const files: SnapshotFiles = {
      ...realFiles,
      copyToLive: () => {
        throw new Error('disk full');
      },
    };
    const { deps, count } = makeDeps({ files, migrate: migrateAlwaysFailing() });
    const { newest } = liveWithTwoSnapshots(realFiles);
    const original = fs.readFileSync(liveFile);

    const result = expectFailed(await startDatabase(deps));

    expect(result.error.message).toBe('disk full');
    expect(result.newestSnapshot).toBe(newest);
    expect(result.setAside).toMatch(/^gymhound\.failed-.+\.db$/);
    expect(fs.readFileSync(path.join(dir, result.setAside!)).equals(original)).toBe(true);
    expect(count.opened).toBe(count.closed);
  });

  it('turns a non-Error throw into an Error', async () => {
    const { deps } = makeDeps({
      migrate: () => {
        throw 'plain string';
      },
    });

    const result = expectFailed(await startDatabase(deps));

    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('plain string');
  });
});

describe('nodeSnapshotFiles', () => {
  it('sets the live file aside under a new name, with its -wal and -shm files, and deletes nothing', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(liveFile, 'main');
    fs.writeFileSync(`${liveFile}-wal`, 'wal');
    fs.writeFileSync(`${liveFile}-shm`, 'shm');

    const name = files.setAsideLive('failed-x');

    expect(name).toBe('gymhound.failed-x.db');
    expect(fs.readdirSync(dir).sort()).toEqual(
      ['gymhound.failed-x.db', 'gymhound.failed-x.db-shm', 'gymhound.failed-x.db-wal', 'snapshots'].sort(),
    );
    expect(fs.readFileSync(path.join(dir, name), 'utf8')).toBe('main');
    expect(fs.readFileSync(path.join(dir, `${name}-wal`), 'utf8')).toBe('wal');
    expect(files.liveIsMissingOrEmpty()).toBe(true);
  });

  it('refuses to set the live file aside over an existing file', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(liveFile, 'live');
    fs.writeFileSync(path.join(dir, 'gymhound.failed-x.db'), 'earlier failure');

    expect(() => files.setAsideLive('failed-x')).toThrow();

    expect(fs.readFileSync(liveFile, 'utf8')).toBe('live');
    expect(fs.readFileSync(path.join(dir, 'gymhound.failed-x.db'), 'utf8')).toBe('earlier failure');
  });

  it('refuses to set the live file aside over an existing -wal file, and moves nothing', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(liveFile, 'live');
    fs.writeFileSync(`${liveFile}-wal`, 'live wal');
    fs.writeFileSync(path.join(dir, 'gymhound.failed-x.db-wal'), 'earlier failure');

    expect(() => files.setAsideLive('failed-x')).toThrow();

    expect(fs.readFileSync(liveFile, 'utf8')).toBe('live');
    expect(fs.readFileSync(`${liveFile}-wal`, 'utf8')).toBe('live wal');
    expect(fs.existsSync(path.join(dir, 'gymhound.failed-x.db'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'gymhound.failed-x.db-wal'), 'utf8')).toBe('earlier failure');
  });

  it('rolls back when moving a side file fails part-way, so nothing has moved', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
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
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'gymhound.db-shm', 'gymhound.db-wal', 'snapshots']);
    expect(fs.readFileSync(liveFile, 'utf8')).toBe('main');
    expect(fs.readFileSync(`${liveFile}-wal`, 'utf8')).toBe('wal');
    expect(fs.readFileSync(`${liveFile}-shm`, 'utf8')).toBe('shm');
  });

  it('throws, moving nothing, when there is no live file to set aside', () => {
    const files = nodeSnapshotFiles(dir, liveFile);

    expect(() => files.setAsideLive('failed-x')).toThrow();

    expect(fs.readdirSync(dir)).toEqual(['snapshots']);
  });

  it('reports a missing or zero-byte live file, and not a populated one', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    expect(files.liveIsMissingOrEmpty()).toBe(true);
    fs.writeFileSync(liveFile, '');
    expect(files.liveIsMissingOrEmpty()).toBe(true);
    fs.writeFileSync(liveFile, 'x');
    expect(files.liveIsMissingOrEmpty()).toBe(false);
  });

  it('lists snapshot files but skips zero-byte ones', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const real = snapshotName(NOW);
    fs.writeFileSync(files.pathFor(real), 'a snapshot');
    fs.writeFileSync(files.pathFor(snapshotName(NOW + HOUR)), '');
    fs.writeFileSync(files.pathFor('notes.txt'), 'note');

    expect(files.list().sort()).toEqual([real, 'notes.txt'].sort());
  });

  it('removes a file, and a file that is not there is not an error', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(files.pathFor('a.txt'), 'a');

    files.remove('a.txt');
    expect(() => files.remove('a.txt')).not.toThrow();
    expect(() => files.remove('never-existed.txt')).not.toThrow();

    expect(files.list()).toEqual([]);
  });

  it('renames a file in the snapshot folder, replacing an existing target', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    fs.writeFileSync(files.pathFor('a.partial'), 'new');
    fs.writeFileSync(files.pathFor('a.db'), '');

    files.rename('a.partial', 'a.db');

    expect(files.list()).toEqual(['a.db']);
    expect(fs.readFileSync(files.pathFor('a.db'), 'utf8')).toBe('new');
  });

  it('copies a snapshot to the live path, removing stale -wal and -shm files first', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const snapshot = snapshotName(NOW);
    fs.writeFileSync(files.pathFor(snapshot), 'snapshot bytes');
    fs.writeFileSync(`${liveFile}-wal`, 'stale wal');
    fs.writeFileSync(`${liveFile}-shm`, 'stale shm');

    files.copyToLive(snapshot);

    expect(fs.readFileSync(liveFile, 'utf8')).toBe('snapshot bytes');
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
    expect(fs.readFileSync(files.pathFor(snapshot), 'utf8')).toBe('snapshot bytes');
  });

  it('copies through a temporary file and renames it into place', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const snapshot = snapshotName(NOW);
    fs.writeFileSync(files.pathFor(snapshot), 'snapshot bytes');
    const renames: string[][] = [];
    const realRename = fs.renameSync;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      renames.push([String(from), String(to)]);
      realRename(from, to);
    });

    files.copyToLive(snapshot);

    jest.restoreAllMocks();
    expect(renames).toHaveLength(1);
    expect(path.dirname(renames[0][0])).toBe(dir); // beside the live file, so the rename is atomic
    expect(renames[0][0]).not.toBe(liveFile);
    expect(renames[0][1]).toBe(liveFile);
  });

  it('leaves no half-written live file and no temporary file when the copy fails', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const snapshot = snapshotName(NOW);
    fs.writeFileSync(files.pathFor(snapshot), 'snapshot bytes');
    fs.writeFileSync(liveFile, ''); // an empty live file, which the restore replaces
    const realCopy = fs.copyFileSync;
    jest.spyOn(fs, 'copyFileSync').mockImplementation((from, to) => {
      realCopy(from, to);
      fs.truncateSync(to as string, 3); // the copy "dies" half way
      throw new Error('disk full');
    });

    expect(() => files.copyToLive(snapshot)).toThrow('disk full');

    jest.restoreAllMocks();
    expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
    expect(fs.statSync(liveFile).size).toBe(0);
  });
});
