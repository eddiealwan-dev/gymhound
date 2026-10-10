/** @jest-environment node */
import { eq } from 'drizzle-orm';
import { settings } from '../schema';
import { createTestDb } from '../testing/createTestDb';
import type { Db } from '../types';
import { defaultSettings, ensureSettings, getSettings, setSetting } from './settingsRepo';

const SPEC_KEYS = [
  'active_routine_id',
  'bar_kg',
  'bar_lb',
  'default_increment_kg',
  'default_increment_lb',
  'distance_unit',
  'fuel_targets',
  'last_snapshot_at',
  'last_snapshot_error',
  'music_app',
  'plates_kg',
  'plates_lb',
  'pro_cached',
  'pro_debug_unlock',
  'rest_bell',
  'rest_bell_sound',
  'rest_bell_volume',
  'rest_seconds',
  'seed_version',
  'theme',
  'unit',
];

const storedKeys = (db: Db) =>
  db
    .select()
    .from(settings)
    .all()
    .map((r) => r.key)
    .sort();

describe('defaultSettings', () => {
  it('uses lb and mi for a US device, kg and km for everything else', () => {
    expect(defaultSettings('us')).toMatchObject({ unit: 'lb', distanceUnit: 'mi' });
    expect(defaultSettings('metric')).toMatchObject({ unit: 'kg', distanceUnit: 'km' });
    expect(defaultSettings('uk')).toMatchObject({ unit: 'kg', distanceUnit: 'km' });
    expect(defaultSettings(null)).toMatchObject({ unit: 'kg', distanceUnit: 'km' });
  });

  it('returns a fresh object each call', () => {
    const a = defaultSettings('us');
    a.platesLb['45'] = 99;
    expect(defaultSettings('us').platesLb['45']).toBe(4);
  });
});

describe('ensureSettings and getSettings', () => {
  it('writes the spec defaults for a US device', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    expect(getSettings(db)).toMatchObject({
      theme: 'system',
      unit: 'lb',
      distanceUnit: 'mi',
      barLb: 45,
      barKg: 20,
      defaultIncrementLb: 5,
      defaultIncrementKg: 2.5,
      restSeconds: 120,
      activeRoutineId: null,
      fuelTargets: null,
      proDebugUnlock: false,
    });
    expect(getSettings(db)).toMatchObject({ restBell: true, restBellSound: 'bell', lastSnapshotAt: null, lastSnapshotError: null });
    expect(getSettings(db).platesLb).toEqual({ '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 });
  });

  it('writes kg and km defaults for a metric device', () => {
    const m = createTestDb().db;
    ensureSettings(m, 'metric');
    expect(getSettings(m)).toMatchObject({ unit: 'kg', distanceUnit: 'km' });
    expect(getSettings(m).platesKg).toEqual({ '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 });
  });

  it('stores one row per key under the spec snake_case names', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    expect(storedKeys(db)).toEqual(SPEC_KEYS);
    expect(getSettings(db)).toEqual(defaultSettings('us'));
  });

  it('does not overwrite keys that already exist', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'theme', 'dark');
    ensureSettings(db, 'metric');
    expect(getSettings(db).theme).toBe('dark');
    expect(getSettings(db).unit).toBe('lb'); // ensure does not overwrite
    expect(getSettings(db).distanceUnit).toBe('mi');
  });

  it('keeps a key whose stored value is null instead of rewriting it', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'activeRoutineId', 'premade-ppl-6');
    setSetting(db, 'activeRoutineId', null);
    ensureSettings(db, 'us');
    expect(getSettings(db).activeRoutineId).toBeNull();
    expect(storedKeys(db)).toEqual(SPEC_KEYS);
  });

  it('writes only the keys that are missing', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    db.delete(settings).where(eq(settings.key, 'rest_seconds')).run();
    setSetting(db, 'barLb', 35);
    ensureSettings(db, 'us');
    expect(getSettings(db)).toMatchObject({ restSeconds: 120, barLb: 35 });
    expect(storedKeys(db)).toEqual(SPEC_KEYS);
  });

  it('falls back to the defaults for any missing key', () => {
    const { db } = createTestDb();
    expect(getSettings(db)).toEqual(defaultSettings(null));
    ensureSettings(db, 'us');
    db.delete(settings).where(eq(settings.key, 'rest_seconds')).run();
    db.delete(settings).where(eq(settings.key, 'plates_kg')).run();
    expect(getSettings(db)).toMatchObject({ unit: 'lb', restSeconds: 120, platesKg: defaultSettings(null).platesKg });
  });
});

describe('bell and snapshot settings', () => {
  it('are added to a database whose settings predate them, without touching the other keys', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    // The settings an install made before these keys existed.
    for (const key of ['rest_bell', 'rest_bell_sound', 'last_snapshot_at']) {
      db.delete(settings).where(eq(settings.key, key)).run();
    }
    setSetting(db, 'theme', 'dark');
    setSetting(db, 'restSeconds', 90);
    expect(storedKeys(db)).not.toContain('rest_bell');

    ensureSettings(db, 'metric');

    expect(storedKeys(db)).toEqual(SPEC_KEYS);
    expect(getSettings(db)).toMatchObject({
      restBell: true,
      restBellSound: 'bell',
      lastSnapshotAt: null,
      theme: 'dark',
      restSeconds: 90,
      unit: 'lb',
    });
  });

  it('keep what the user chose when ensureSettings runs again', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'restBell', false);
    setSetting(db, 'restBellSound', 'chime');
    setSetting(db, 'lastSnapshotAt', 1_791_595_146_459);
    ensureSettings(db, 'us');
    expect(getSettings(db)).toMatchObject({
      restBell: false,
      restBellSound: 'chime',
      lastSnapshotAt: 1_791_595_146_459,
    });
  });

  it('read back as defaults before ensureSettings has run', () => {
    const { db } = createTestDb();
    expect(getSettings(db)).toMatchObject({ restBell: true, restBellSound: 'bell', lastSnapshotAt: null });
  });
});

describe('the bell volume and the music app (Task 26)', () => {
  it('default to full volume and no music app', () => {
    expect(defaultSettings('us')).toMatchObject({ restBellVolume: 1, musicApp: null });
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    expect(getSettings(db)).toMatchObject({ restBellVolume: 1, musicApp: null });
  });

  it('are added to a database whose settings predate them, without touching the other keys', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    for (const key of ['rest_bell_volume', 'music_app']) db.delete(settings).where(eq(settings.key, key)).run();
    setSetting(db, 'restBellSound', 'ding');
    expect(storedKeys(db)).not.toContain('rest_bell_volume');

    ensureSettings(db, 'us');

    expect(storedKeys(db)).toEqual(SPEC_KEYS);
    expect(getSettings(db)).toMatchObject({ restBellVolume: 1, musicApp: null, restBellSound: 'ding' });
  });

  it('keep what the user chose, and the music app clears back to null', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'restBellVolume', 0.5);
    setSetting(db, 'musicApp', 'spotify');
    ensureSettings(db, 'us');
    expect(getSettings(db)).toMatchObject({ restBellVolume: 0.5, musicApp: 'spotify' });
    setSetting(db, 'musicApp', null);
    expect(getSettings(db).musicApp).toBeNull();
  });
});

describe('the last snapshot error', () => {
  it('is added, as null, to a database whose settings predate it, without touching the other keys', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    db.delete(settings).where(eq(settings.key, 'last_snapshot_error')).run();
    setSetting(db, 'lastSnapshotAt', 1_791_595_146_459);
    expect(storedKeys(db)).not.toContain('last_snapshot_error');

    ensureSettings(db, 'us');

    expect(storedKeys(db)).toEqual(SPEC_KEYS);
    expect(getSettings(db)).toMatchObject({ lastSnapshotError: null, lastSnapshotAt: 1_791_595_146_459 });
  });

  it('round-trips its time and message, survives ensureSettings, and clears back to null', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    const failure = { at: 1_791_595_146_459, message: 'disk full (ERR_FILE_SYSTEM)' };
    setSetting(db, 'lastSnapshotError', failure);
    ensureSettings(db, 'us');
    expect(getSettings(db).lastSnapshotError).toEqual(failure);
    setSetting(db, 'lastSnapshotError', null);
    expect(getSettings(db).lastSnapshotError).toBeNull();
  });
});

describe('setSetting', () => {
  it('creates the row when the key is missing and replaces it when present', () => {
    const { db } = createTestDb();
    setSetting(db, 'restSeconds', 90);
    expect(getSettings(db).restSeconds).toBe(90);
    setSetting(db, 'restSeconds', 150);
    expect(getSettings(db).restSeconds).toBe(150);
    expect(storedKeys(db)).toEqual(['rest_seconds']);
  });

  it('round-trips booleans, numbers, strings, null and objects', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'proDebugUnlock', true);
    setSetting(db, 'proCached', true);
    setSetting(db, 'proCached', false);
    setSetting(db, 'barKg', 15);
    setSetting(db, 'unit', 'kg');
    setSetting(db, 'distanceUnit', 'km');
    setSetting(db, 'platesLb', { '45': 2, '2.5': 1 });
    setSetting(db, 'seedVersion', 3);
    const fuel = {
      training: { kcal: 2800, protein: 180, carbs: 320, fat: null },
      rest: { kcal: 2400, protein: 180, carbs: null, fat: null },
    };
    setSetting(db, 'fuelTargets', fuel);
    expect(getSettings(db)).toMatchObject({
      proDebugUnlock: true,
      proCached: false,
      barKg: 15,
      unit: 'kg',
      distanceUnit: 'km',
      platesLb: { '45': 2, '2.5': 1 },
      seedVersion: 3,
      fuelTargets: fuel,
    });
    setSetting(db, 'fuelTargets', null);
    expect(getSettings(db).fuelTargets).toBeNull();
  });

  it('sets and clears the active routine', () => {
    const { db } = createTestDb();
    ensureSettings(db, 'us');
    setSetting(db, 'activeRoutineId', 'premade-5x5-3');
    expect(getSettings(db).activeRoutineId).toBe('premade-5x5-3');
    setSetting(db, 'activeRoutineId', null);
    expect(getSettings(db).activeRoutineId).toBeNull();
  });
});
