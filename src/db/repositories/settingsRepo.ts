import type { BellSound, DistanceUnit, MeasurementSystem, ThemePreference, WeightUnit } from '../../domain/types';
import { defaultUnitFor } from '../../domain/units';
import { settings } from '../schema';
import type { Db } from '../types';

export type Macros = { kcal: number; protein: number; carbs: number | null; fat: number | null };

export type Settings = {
  theme: ThemePreference;
  unit: WeightUnit;
  distanceUnit: DistanceUnit;
  barLb: number;
  barKg: number;
  /** Pairs owned, by plate weight: `{ '45': 4 }` is four pairs of 45s. */
  platesLb: Record<string, number>;
  platesKg: Record<string, number>;
  defaultIncrementLb: number;
  defaultIncrementKg: number;
  restSeconds: number;
  /** Whether the rest timer rings when it ends. */
  restBell: boolean;
  restBellSound: BellSound;
  /** When the last good snapshot was written (epoch ms), or null before the first one. */
  lastSnapshotAt: number | null;
  activeRoutineId: string | null;
  fuelTargets: null | { training: Macros; rest: Macros };
  proDebugUnlock: boolean;
  proCached: boolean;
  seedVersion: number;
};

/** The stored key for each field. One row per key, named as in spec §6. */
const KEYS: Record<keyof Settings, string> = {
  theme: 'theme',
  unit: 'unit',
  distanceUnit: 'distance_unit',
  barLb: 'bar_lb',
  barKg: 'bar_kg',
  platesLb: 'plates_lb',
  platesKg: 'plates_kg',
  defaultIncrementLb: 'default_increment_lb',
  defaultIncrementKg: 'default_increment_kg',
  restSeconds: 'rest_seconds',
  restBell: 'rest_bell',
  restBellSound: 'rest_bell_sound',
  lastSnapshotAt: 'last_snapshot_at',
  activeRoutineId: 'active_routine_id',
  fuelTargets: 'fuel_targets',
  proDebugUnlock: 'pro_debug_unlock',
  proCached: 'pro_cached',
  seedVersion: 'seed_version',
};

const FIELDS = Object.keys(KEYS) as (keyof Settings)[];

export function defaultSettings(m: MeasurementSystem): Settings {
  const unit = defaultUnitFor(m);
  return {
    theme: 'system',
    unit,
    distanceUnit: unit === 'lb' ? 'mi' : 'km',
    barLb: 45,
    barKg: 20,
    platesLb: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 },
    platesKg: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 },
    defaultIncrementLb: 5,
    defaultIncrementKg: 2.5,
    restSeconds: 120,
    restBell: true,
    restBellSound: 'bell',
    lastSnapshotAt: null,
    activeRoutineId: null,
    fuelTargets: null,
    proDebugUnlock: false,
    proCached: false,
    seedVersion: 0,
  };
}

/** Writes the default for every key that has no row yet. Existing rows, even null ones, are left alone. */
export function ensureSettings(db: Db, m: MeasurementSystem): void {
  const defaults = defaultSettings(m);
  const rows = FIELDS.map((field) => ({ key: KEYS[field], value: defaults[field] }));
  db.insert(settings).values(rows).onConflictDoNothing().run();
}

/** Every setting, with the default (for a device with no measurement system) in place of any missing key. */
export function getSettings(db: Db): Settings {
  const stored = new Map(db.select().from(settings).all().map((row) => [row.key, row.value]));
  const result: Record<string, unknown> = { ...defaultSettings(null) };
  for (const field of FIELDS) {
    const key = KEYS[field];
    if (stored.has(key)) result[field] = stored.get(key);
  }
  return result as Settings;
}

export function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]): void {
  db.insert(settings)
    .values({ key: KEYS[key], value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
