/** @jest-environment node */
import Database from 'better-sqlite3';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SEED_EXERCISES } from '../seed/exercises';
import { LIBRARY_EXERCISES } from '../seed/library.generated';
import { PREMADE_ORDER, runSeed, SEED_VERSION } from '../seed/seed';
import { getExercise, getExerciseNote } from './repositories/exercisesRepo';
import { listRoutines } from './repositories/routinesRepo';
import { ensureSettings, getSettings, setSetting } from './repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from './repositories/workoutsRepo';
import { getActiveWorkoutView, getPreviousSets } from './repositories/workoutViewsRepo';
import * as schema from './schema';
import { workoutExercises, workouts } from './schema';
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
import { writeSeedV1 } from './testing/seedV1';
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

/** The tables in a database, and the columns of one of them. */
const tableNames = (db: Db) => db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type = 'table'`).map((r) => r.name);
const columnNames = (db: Db, table: string) => db.all<{ name: string }>(sql.raw(`PRAGMA table_info(${table})`)).map((r) => r.name);
const appliedMigrations = (db: Db) => db.all<{ hash: string }>(sql`SELECT hash FROM __drizzle_migrations`).length;

/**
 * A live database as GymHound left it before migration 0002: migrations 0000 and 0001 only (no `exercise_prefs`, no
 * `workouts.rest_set_id`), seeded as seed version 1 left it (the 55 exercises and six premades), with one finished
 * Push A holding bench 185 lb x 8. Rows are written with that schema's own columns, since the code's tables now have
 * more. Returns the open handle.
 */
function livePre0002(): { db: Db; close(): void } {
  const source = path.resolve(__dirname, 'migrations');
  const folder = path.join(dir, 'migrations-to-0001');
  fs.mkdirSync(path.join(folder, 'meta'), { recursive: true });
  const journal = JSON.parse(fs.readFileSync(path.join(source, 'meta', '_journal.json'), 'utf8')) as { entries: { idx: number; tag: string }[] };
  journal.entries = journal.entries.filter((entry) => entry.idx <= 1);
  for (const { tag } of journal.entries) fs.copyFileSync(path.join(source, `${tag}.sql`), path.join(folder, `${tag}.sql`));
  fs.writeFileSync(path.join(folder, 'meta', '_journal.json'), JSON.stringify(journal));

  const handle = track(openFileDb(liveFile));
  migrate(handle.db as BetterSQLite3Database<typeof schema>, { migrationsFolder: folder });
  ensureSettings(handle.db, 'us');
  writeSeedV1(handle.db, NOW);
  handle.db.run(sql`
    INSERT INTO workouts (id, name, routine_id, routine_day_id, status, day_mark, started_at, finished_at, local_date, rest_ends_at, food_offer_shown)
    VALUES ('old-workout', 'Push A', 'premade-ppl-6', ${PUSH_A}, 'finished', 'normal', ${NOW}, ${NOW + HOUR}, '2026-10-09', NULL, 0)`);
  handle.db.run(sql`
    INSERT INTO workout_exercises (id, workout_id, exercise_id, position, show_rpe, note)
    VALUES ('old-bench', 'old-workout', 'barbell-bench-press', 0, 0, 'Pause on the chest')`);
  handle.db.run(sql`
    INSERT INTO sets (id, workout_exercise_id, position, set_type, weight, weight_unit, reps, done, pr_flags, completed_at)
    VALUES ('old-set', 'old-bench', 0, 'working', 185, 'lb', 8, 1, 0, ${NOW + 60_000})`);
  return handle;
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

  it('restores a snapshot taken before migrations 0002 to 0006, and migrates it forward with the finished workout intact (F11)', async () => {
    const { deps, files } = makeDeps();
    const old = livePre0002();
    expect(appliedMigrations(old.db)).toBe(2);
    expect(tableNames(old.db)).not.toContain('exercise_prefs');
    expect(columnNames(old.db, 'workouts')).not.toContain('rest_set_id');
    expect(columnNames(old.db, 'workout_exercises')).not.toContain('mark');
    const name = writeSnapshot(old.db, files, NOW + 2 * HOUR);
    old.close();
    fs.rmSync(liveFile);

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBe(name);
    expect(appliedMigrations(result.db)).toBe(7);
    expect(tableNames(result.db)).toContain('exercise_prefs');
    expect(tableNames(result.db)).toEqual(expect.arrayContaining(['measurements', 'exercise_photos', 'saved_workouts', 'saved_workout_exercises']));
    expect(columnNames(result.db, 'workouts')).toContain('rest_set_id');
    expect(columnNames(result.db, 'workout_exercises')).toContain('mark');
    expect(result.db.select().from(schema.exercises).where(eq(schema.exercises.id, 'barbell-bench-press')).get()).toMatchObject({
      name: 'Barbell bench press',
      instructions: [],
      sourceId: null,
    });
    expect(result.db.select().from(workoutExercises).where(eq(workoutExercises.id, 'old-bench')).get()).toMatchObject({ mark: null });
    expect(finishedIds(result.db)).toEqual(['old-workout']);
    expect(result.db.select().from(workouts).where(eq(workouts.id, 'old-workout')).get()).toMatchObject({
      name: 'Push A',
      status: 'finished',
      startedAt: NOW,
      finishedAt: NOW + HOUR,
      restSetId: null,
      savedWorkoutId: null,
    });
    // The current code reads it: bench's last result is the set logged before the migrations.
    expect(getPreviousSets(result.db, 'barbell-bench-press', 'none')).toEqual([
      { position: 0, setType: 'working', weight: 185, weightUnit: 'lb', reps: 8, durationS: null, distance: null, distanceUnit: null },
    ]);
  });

  it('restores a version 1 snapshot from before 0002; migrated and seeded to version 2, it keeps its history and legacy ids', async () => {
    const { deps, files } = makeDeps();
    const old = livePre0002();
    old.db.run(sql`INSERT INTO exercise_notes (exercise_id, text, updated_at) VALUES ('barbell-bench-press', 'Elbows in', ${NOW})`);
    old.db.run(sql`UPDATE routine_exercises SET next_weight = 190, next_weight_unit = 'lb' WHERE id = ${`${PUSH_A}:barbell-bench-press`}`);
    old.db.run(sql`UPDATE routines SET next_day_index = 1 WHERE id = 'premade-ppl-6'`);
    setSetting(old.db, 'activeRoutineId', 'premade-5x5-3');
    const name = writeSnapshot(old.db, files, NOW + 2 * HOUR);
    old.close();
    fs.rmSync(liveFile);

    const result = expectOk(await startDatabase(deps));
    expect(result.restoredFrom).toBe(name);
    expect(getSettings(result.db).seedVersion).toBe(1);
    runSeed(result.db, NOW + DAY);

    const db = result.db;
    expect(getSettings(db).seedVersion).toBe(SEED_VERSION);
    expect(db.select().from(schema.exercises).all()).toHaveLength(LIBRARY_EXERCISES.length);
    const ids = new Set(db.select({ id: schema.exercises.id }).from(schema.exercises).all().map((e) => e.id));
    expect(SEED_EXERCISES.filter((e) => !ids.has(e.id))).toEqual([]);
    // Bench keeps its id and name, and gains its steps and source.
    const bench = getExercise(db, 'barbell-bench-press')!;
    expect(bench).toMatchObject({ name: 'Barbell bench press', sourceId: 'Barbell_Bench_Press_-_Medium_Grip' });
    expect(bench.instructions.length).toBeGreaterThan(0);
    // History, the note and progress read as before.
    expect(finishedIds(db)).toEqual(['old-workout']);
    expect(db.select().from(workoutExercises).where(eq(workoutExercises.id, 'old-bench')).get()).toMatchObject({
      exerciseId: 'barbell-bench-press',
      note: 'Pause on the chest',
      mark: null,
    });
    expect(getPreviousSets(db, 'barbell-bench-press', 'none')).toEqual([
      { position: 0, setType: 'working', weight: 185, weightUnit: 'lb', reps: 8, durationS: null, distance: null, distanceUnit: null },
    ]);
    expect(getExerciseNote(db, 'barbell-bench-press')).toBe('Elbows in');
    expect(db.select().from(schema.routineExercises).where(eq(schema.routineExercises.id, `${PUSH_A}:barbell-bench-press`)).get()).toMatchObject({
      nextWeight: 190,
      nextWeightUnit: 'lb',
    });
    expect(db.select().from(schema.routines).where(eq(schema.routines.id, 'premade-ppl-6')).get()).toMatchObject({
      nextDayIndex: 1,
      retired: false,
    });
    // The retired 5×5 is still the active routine, so it stays listed after the eight programs.
    expect(listRoutines(db).map((r) => r.id)).toEqual([...PREMADE_ORDER, 'premade-5x5-3']);
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
    // The restored copy that would not migrate either is set aside too, so the next launch restores again.
    const restoredCopies = fs.readdirSync(dir).filter((n) => /^gymhound\.restore-failed-.+\.db$/.test(n));
    expect(restoredCopies).toHaveLength(1);
    expect(fs.readdirSync(dir).sort()).toEqual([result.setAside, restoredCopies[0], 'snapshots'].sort());
    expect(files.list().sort()).toEqual([...snapshotBytes.keys()].sort());
    for (const [name, bytes] of snapshotBytes) expect(fs.readFileSync(files.pathFor(name)).equals(bytes)).toBe(true);
    expect(count.opened).toBe(count.closed);
    // The first error is logged on the failed-restore branch too.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warnedWithError('migration exploded')).toBe(true);
  });

  it('sets the restored copy aside when it will not open either, so the next launch restores and shows the notice', async () => {
    const { deps, files } = makeDeps({ migrate: migrateAlwaysFailing() });
    const { ids, newest } = liveWithTwoSnapshots(files);
    const live = track(openFileDb(liveFile));
    finishOne(live.db, NOW + 2 * DAY);
    live.close();
    const original = fs.readFileSync(liveFile);

    const failed = expectFailed(await startDatabase(deps));

    // The original failed file is still there to export, under the name the result reports.
    expect(fs.readFileSync(path.join(dir, failed.setAside!)).equals(original)).toBe(true);
    expect(fs.existsSync(liveFile)).toBe(false);

    // The next launch (here, with a migration that works) sees a missing live file, restores, and says so.
    const next = makeDeps();
    const again = expectOk(await startDatabase(next.deps));

    expect(again.restoredFrom).toBe(newest);
    expect(finishedIds(again.db)).toEqual(ids);
    expect(fs.readFileSync(path.join(dir, failed.setAside!)).equals(original)).toBe(true);
  });

  it('leaves the live file alone, and does not claim a restore, when setting the failed file aside fails', async () => {
    const realFiles = nodeSnapshotFiles(dir, liveFile);
    const setAsideCalls: string[] = [];
    const files: SnapshotFiles = {
      ...realFiles,
      setAsideLive: (tag) => {
        setAsideCalls.push(tag);
        throw new Error('cannot move');
      },
    };
    const { deps, count } = makeDeps({ files, migrate: migrateAlwaysFailing() });
    const { newest } = liveWithTwoSnapshots(realFiles);
    const original = fs.readFileSync(liveFile);

    const result = expectFailed(await startDatabase(deps));

    expect(result.error.message).toBe('cannot move');
    expect(result.newestSnapshot).toBe(newest);
    expect(result.setAside).toBeNull();
    expect(setAsideCalls).toHaveLength(1); // no second set-aside for a restored copy that was never made
    expect(fs.readFileSync(liveFile).equals(original)).toBe(true);
    expect(count.opened).toBe(count.closed);
  });

  it('opens a healthy live file as it is when committed data is still in its -wal, with no restore', async () => {
    // A running database whose newest workout is only in the write-ahead log, and a snapshot taken before it.
    const files = nodeSnapshotFiles(dir, liveFile);
    const source = path.join(dir, 'running.db');
    const sqlite = new Database(source);
    handles.push({ close: () => sqlite.close() });
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const running: Db = drizzle(sqlite, { schema });
    migrateTestDb(running);
    ensureSettings(running, 'us');
    runSeed(running, NOW);
    const first = finishOne(running, NOW);
    sqlite.pragma('wal_checkpoint(TRUNCATE)'); // schema and the first workout are in the main file
    sqlite.pragma('wal_autocheckpoint = 0'); // from here on, nothing is moved out of the log
    writeSnapshot(running, files, NOW + 2 * HOUR);
    const second = finishOne(running, NOW + DAY);
    expect(fs.statSync(`${source}-wal`).size).toBeGreaterThan(0);
    // The app is killed here: its files are left as they are, the newest workout only in the -wal.
    fs.copyFileSync(source, liveFile);
    fs.copyFileSync(`${source}-wal`, `${liveFile}-wal`);
    const walBefore = fs.readFileSync(`${liveFile}-wal`);
    expect(fs.statSync(liveFile).size).toBeGreaterThan(0);
    const calls: string[] = [];
    const spied: SnapshotFiles = {
      ...files,
      setAsideLive: (tag) => {
        calls.push('setAsideLive');
        return files.setAsideLive(tag);
      },
      copyToLive: (name) => {
        calls.push('copyToLive');
        files.copyToLive(name);
      },
    };
    const { deps } = makeDeps({ files: spied });

    const result = expectOk(await startDatabase(deps));

    expect(result.restoredFrom).toBeNull();
    expect(calls).toEqual([]);
    expect(finishedIds(result.db)).toEqual([first, second].sort()); // the snapshot only has the first
    expect(fs.readdirSync(dir).filter((n) => n.includes('failed'))).toEqual([]);
    expect(fs.existsSync(`${liveFile}-wal`)).toBe(true);
    expect(fs.readFileSync(`${liveFile}-wal`).subarray(0, 32).equals(walBefore.subarray(0, 32))).toBe(true); // same log, same header
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

describe('startDatabase when the snapshot folder cannot be listed (R32)', () => {
  /** The real files, except that listing throws once `armed.on` is set, so a test can build its data first. */
  function filesFailingToList(armed: { on: boolean }): SnapshotFiles {
    const real = nodeSnapshotFiles(dir, liveFile);
    return {
      ...real,
      list: () => {
        if (armed.on) throw new Error('list exploded');
        return real.list();
      },
    };
  }

  describe('with a live database that has data', () => {
    it('logs it, treats it as no snapshots, and opens and migrates the live file as usual', async () => {
      const armed = { on: false };
      const files = filesFailingToList(armed);
      const { deps, count } = makeDeps({ files });
      const { ids } = liveWithTwoSnapshots(files);
      const before = fs.readFileSync(liveFile);
      armed.on = true;

      const result = expectOk(await startDatabase(deps));

      expect(result.restoredFrom).toBeNull();
      expect(finishedIds(result.db)).toEqual(ids);
      expect(count).toEqual({ opened: 1, closed: 0 });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warnedWithError('list exploded')).toBe(true);
      expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
      for (const h of handles) h.close();
      expect(fs.readFileSync(liveFile).equals(before)).toBe(true);
    });

    it('fails when the migration then fails: there is no snapshot to restore, and the live file is untouched', async () => {
      const armed = { on: false };
      const files = filesFailingToList(armed);
      const { deps, count } = makeDeps({ files, migrate: migrateAlwaysFailing() });
      liveWithTwoSnapshots(files);
      const original = fs.readFileSync(liveFile);
      const snapshots = nodeSnapshotFiles(dir, liveFile).list();
      armed.on = true;

      const result = expectFailed(await startDatabase(deps));

      expect(result.error.message).toBe('migration exploded');
      expect(result.newestSnapshot).toBeNull();
      expect(result.setAside).toBeNull();
      expect(fs.readdirSync(dir).sort()).toEqual(['gymhound.db', 'snapshots']);
      expect(fs.readFileSync(liveFile).equals(original)).toBe(true);
      armed.on = false;
      expect(files.list()).toEqual(snapshots);
      expect(count.opened).toBe(count.closed);
      expect(warnedWithError('list exploded')).toBe(true);
    });
  });

  describe('with the live file missing or empty', () => {
    it.each([
      ['missing', () => fs.rmSync(liveFile)],
      ['empty', () => fs.writeFileSync(liveFile, '')],
    ])('fails closed when it is %s: nothing is opened, so the app never starts empty beside a snapshot', async (_name, makeGone) => {
      const armed = { on: false };
      const files = filesFailingToList(armed);
      const { deps, count } = makeDeps({ files });
      liveWithTwoSnapshots(files);
      makeGone();
      armed.on = true;

      await expect(startDatabase(deps)).rejects.toThrow('list exploded');

      expect(count.opened).toBe(0);
      expect(fs.existsSync(liveFile) ? fs.statSync(liveFile).size : 0).toBe(0);
      expect(warn).not.toHaveBeenCalled();
      armed.on = false;
      expect(files.list()).toHaveLength(2);
    });
  });
});
