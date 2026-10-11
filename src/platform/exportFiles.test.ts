/** @jest-environment node */
import * as Sharing from 'expo-sharing';
import { foodCsvRows, workoutCsvRows } from '../db/repositories/exportRepo';
import { logQuickAdd } from '../db/repositories/foodLogRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import { finishWorkout, startWorkoutFromDay, tickSet } from '../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../db/repositories/workoutViewsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { FOOD_CSV_COLUMNS, toCsv, WORKOUT_CSV_COLUMNS } from '../domain/csv';
import { exportFoodCsv, exportWorkoutsCsv } from './exportFiles';

/** What the code did to files, in order: each file made, with its options, and each write with its content. */
const mockFileEvents: { op: 'new' | 'create' | 'write'; uri: string; arg?: unknown }[] = [];

// Expo Go's cache folder sits under a folder with a literal %40 in its name, so its uri reads %2540.
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///data/Containers/%2540anonymous%252Fgymhound-1234/Library/Caches/' } },
  File: class {
    readonly uri: string;
    constructor(mockUri: string) {
      this.uri = mockUri;
      mockFileEvents.push({ op: 'new', uri: mockUri });
    }
    create(options?: unknown) {
      mockFileEvents.push({ op: 'create', uri: this.uri, arg: options });
    }
    write(content: string) {
      mockFileEvents.push({ op: 'write', uri: this.uri, arg: content });
    }
  },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));

const PUSH_A = 'premade-ppl-6:push-a';
/** 23:30 on Oct 10 on the device: the file is named for the device's own date. */
const NOW = new Date(2026, 9, 10, 23, 30).getTime();
const URI = 'file:///data/Containers/%2540anonymous%252Fgymhound-1234/Library/Caches/gymhound-workouts-2026-10-10.csv';

/** A seeded database with one finished Push A: bench press 100 lb x 5. */
function withOneWorkout(): Db {
  const db = seededDb();
  const start = new Date(2026, 9, 10, 18, 0).getTime();
  const id = startWorkoutFromDay(db, PUSH_A, start);
  const setId = getActiveWorkoutView(db)!.exercises[0].sets[0].id;
  tickSet(db, setId, { weight: 100, reps: 5, durationS: null, distance: null }, 'lb', start + 60_000, 'mi');
  finishWorkout(db, id, start + 3_600_000);
  return db;
}

beforeEach(() => {
  mockFileEvents.length = 0;
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockClear();
});

describe('exportWorkoutsCsv', () => {
  it('writes the workouts CSV to the cache folder, named for the local date, replacing a same-day file', async () => {
    const db = withOneWorkout();

    await expect(exportWorkoutsCsv(db, NOW)).resolves.toBe('shared');

    expect(mockFileEvents.filter((e) => e.op !== 'new')).toEqual([
      { op: 'create', uri: URI, arg: { overwrite: true } },
      { op: 'write', uri: URI, arg: toCsv([...WORKOUT_CSV_COLUMNS], workoutCsvRows(db)) },
    ]);
  });

  it('writes the BOM, the header and one row per done set', async () => {
    const db = withOneWorkout();

    await exportWorkoutsCsv(db, NOW);

    const content = mockFileEvents.find((e) => e.op === 'write')!.arg as string;
    const lines = content.split('\r\n');
    expect(content.startsWith('﻿workout_id,date,started_at,')).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',Push A,Push/pull/legs,Push A,normal,');
    expect(lines[1]).toContain(',barbell-bench-press,1,working,100,lb,5,');
  });

  it('opens the share sheet for that file as a CSV', async () => {
    await exportWorkoutsCsv(withOneWorkout(), NOW);

    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(URI, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'GymHound workouts',
    });
  });

  it('returns empty, with no file and no share sheet, when no workout is finished', async () => {
    await expect(exportWorkoutsCsv(seededDb(), NOW)).resolves.toBe('empty');

    expect(mockFileEvents).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('returns unavailable, writing nothing, when the phone cannot share', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await expect(exportWorkoutsCsv(withOneWorkout(), NOW)).resolves.toBe('unavailable');

    expect(mockFileEvents).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('passes a failure to share to the caller', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('share sheet failed'));

    await expect(exportWorkoutsCsv(withOneWorkout(), NOW)).rejects.toThrow('share sheet failed');
  });
});

describe('exportFoodCsv (§11, R153)', () => {
  const FOOD_URI = 'file:///data/Containers/%2540anonymous%252Fgymhound-1234/Library/Caches/gymhound-food-2026-10-10.csv';

  /** A seeded database with one quick add logged on Oct 10. */
  function withOneEntry(): Db {
    const db = seededDb();
    logQuickAdd(db, 'Shake', { kcal: 120, proteinG: 24, carbsG: 3, fatG: 1.5 }, '2026-10-10', new Date(2026, 9, 10, 8, 0).getTime());
    return db;
  }

  it('writes the food CSV to the cache folder, named for the local date, replacing a same-day file', async () => {
    const db = withOneEntry();

    await expect(exportFoodCsv(db, NOW)).resolves.toBe('shared');

    expect(mockFileEvents.filter((e) => e.op !== 'new')).toEqual([
      { op: 'create', uri: FOOD_URI, arg: { overwrite: true } },
      { op: 'write', uri: FOOD_URI, arg: toCsv([...FOOD_CSV_COLUMNS], foodCsvRows(db)) },
    ]);
  });

  it('writes the BOM, the header and one row per entry', async () => {
    await exportFoodCsv(withOneEntry(), NOW);

    const content = mockFileEvents.find((e) => e.op === 'write')!.arg as string;
    const lines = content.split('\r\n');
    expect(lines[0]).toBe('﻿date,logged_at,name,servings,kcal,protein_g,carbs_g,fat_g');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^2026-10-10,2026-10-10T08:00:00\.000[+-]\d\d:\d\d,Shake,1,120,24,3,1\.5$/);
  });

  it('opens the share sheet for that file as a CSV called GymHound food', async () => {
    await exportFoodCsv(withOneEntry(), NOW);

    expect(Sharing.shareAsync).toHaveBeenCalledWith(FOOD_URI, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'GymHound food',
    });
  });

  it('returns empty, with no file and no share sheet, when no food is logged', async () => {
    await expect(exportFoodCsv(withOneWorkout(), NOW)).resolves.toBe('empty');

    expect(mockFileEvents).toEqual([]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('returns unavailable, writing nothing, when the phone cannot share', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await expect(exportFoodCsv(withOneEntry(), NOW)).resolves.toBe('unavailable');

    expect(mockFileEvents).toEqual([]);
  });

  it('still exports for a lapsed user with entries (§9)', async () => {
    const db = withOneEntry();
    setSetting(db, 'proCached', false);
    setSetting(db, 'proDebugUnlock', false);

    await expect(exportFoodCsv(db, NOW)).resolves.toBe('shared');
  });

  it('passes a failure to share to the caller', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('share sheet failed'));

    await expect(exportFoodCsv(withOneEntry(), NOW)).rejects.toThrow('share sheet failed');
  });
});
