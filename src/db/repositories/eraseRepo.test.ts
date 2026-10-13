import { is } from 'drizzle-orm';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { planImport } from '../../domain/importCsv';
import { IMPORT_SAMPLES } from '../../domain/importSamples';
import * as seed from '../../seed/seed';
import * as schema from '../schema';
import { seededDb } from '../testing/fixtures';
import type { Db } from '../types';
import { ERASED_TABLES, eraseAllData } from './eraseRepo';
import { applyImport } from './importRepo';
import { defaultSettings, getSettings, setSetting } from './settingsRepo';

const NOW = Date.UTC(2026, 9, 13, 15);
/** Every table the schema declares, so a table added later is checked too. */
const TABLES = Object.entries(schema).filter(([, table]) => is(table, SQLiteTable)) as [string, SQLiteTable][];

/** How many rows each table holds. */
function counts(db: Db): Record<string, number> {
  return Object.fromEntries(TABLES.map(([name, table]) => [name, db.select().from(table as never).all().length]));
}

function lived(db: Db): void {
  for (const text of [IMPORT_SAMPLES.workouts, IMPORT_SAMPLES.body, IMPORT_SAMPLES.food]) {
    const plan = planImport(text, { weightUnit: 'lb', distanceUnit: 'mi', dayFirst: false });
    if (plan.kind === 'unknown') throw new Error(plan.reason);
    applyImport(db, plan, NOW);
  }
  setSetting(db, 'profileName', 'Eddie');
  setSetting(db, 'profileGoal', 'Bench 225');
  setSetting(db, 'profilePhoto', 'profile-1.jpg');
  setSetting(db, 'profileWidgets', ['body_weight']);
  setSetting(db, 'weeklyWorkoutGoal', 4);
  setSetting(db, 'unit', 'kg');
  setSetting(db, 'restSeconds', 90);
  setSetting(db, 'fuelTargets', { training: { kcal: 2600, protein: 180, carbs: null, fat: null }, rest: { kcal: 2400, protein: 180, carbs: null, fat: null } });
  setSetting(db, 'proCached', true);
  setSetting(db, 'proDebugUnlock', true);
}

describe('Profile → Delete all data (R568)', () => {
  it('empties every table the schema has, so a table added later is not missed', () => {
    expect(new Set(ERASED_TABLES)).toEqual(new Set(TABLES.map(([, table]) => table)));
  });

  it('leaves the database as a fresh install has it', () => {
    const fresh = seededDb();
    const db = seededDb();
    lived(db);
    expect(counts(db)).not.toEqual(counts(fresh));

    eraseAllData(db, 'us', NOW);

    expect(counts(db)).toEqual(counts(fresh));
    // The library, the programs and the bundled foods are back, as at first launch.
    expect(counts(db).exercises).toBeGreaterThan(100);
    expect(counts(db).routines).toBeGreaterThan(3);
    expect(counts(db).foods).toBeGreaterThan(1000);
  });

  it("resets every setting to the phone's defaults, the profile with them, but keeps Pro as the store last said", () => {
    const db = seededDb();
    lived(db);
    eraseAllData(db, 'metric', NOW);

    expect(getSettings(db)).toEqual({
      ...defaultSettings('metric'),
      proCached: true,
      proDebugUnlock: true,
      seedVersion: seed.SEED_VERSION,
      prFlagsBackfilled: true,
    });
    expect(getSettings(db)).toMatchObject({ profileName: '', profileGoal: '', profilePhoto: null, weeklyWorkoutGoal: null, unit: 'kg', fuelTargets: null });
  });

  it('deletes nothing when any part fails', () => {
    const db = seededDb();
    lived(db);
    const before = counts(db);
    const fail = jest.spyOn(seed, 'runSeed').mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() => eraseAllData(db, 'us', NOW)).toThrow('disk full');
    fail.mockRestore();
    expect(counts(db)).toEqual(before);
    expect(getSettings(db).profileName).toBe('Eddie');
  });
});
