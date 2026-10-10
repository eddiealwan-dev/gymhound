/** @jest-environment node */
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSeed } from '../seed/seed';
import { ensureSettings } from './repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './repositories/workoutsRepo';
import { getActiveWorkoutView } from './repositories/workoutViewsRepo';
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

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gymhound-snap-'));
  liveFile = path.join(dir, 'gymhound.db');
  handles = [];
});

afterEach(() => {
  // Runs even when a test fails, so no handle keeps the folder locked on Windows.
  for (const h of handles) h.close();
  fs.rmSync(dir, { recursive: true, force: true });
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
        fs.writeFileSync(files.pathFor(snapshotName(NOW)), 'half a database');
        throw new Error('disk full');
      },
    } as unknown as Db;

    expect(() => writeSnapshot(half, files, NOW)).toThrow('disk full');
    expect(files.list()).toEqual([]);
  });

  it('never removes an existing snapshot when VACUUM INTO refuses to overwrite it', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    const { db } = openSeeded(liveFile);
    finishOne(db, NOW);
    const name = writeSnapshot(db, files, NOW + 2 * HOUR);
    const before = fs.readFileSync(files.pathFor(name));

    expect(() => writeSnapshot(db, files, NOW + 2 * HOUR)).toThrow();

    expect(files.list()).toEqual([name]);
    expect(fs.readFileSync(files.pathFor(name)).equals(before)).toBe(true);
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

  it('reports a missing or zero-byte live file, and not a populated one', () => {
    const files = nodeSnapshotFiles(dir, liveFile);
    expect(files.liveIsMissingOrEmpty()).toBe(true);
    fs.writeFileSync(liveFile, '');
    expect(files.liveIsMissingOrEmpty()).toBe(true);
    fs.writeFileSync(liveFile, 'x');
    expect(files.liveIsMissingOrEmpty()).toBe(false);
  });
});
