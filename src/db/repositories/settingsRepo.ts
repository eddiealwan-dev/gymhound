import type { BellSound, DistanceUnit, FuelTargets, MeasurementSystem, MusicAppId, ThemePreference, WeightUnit } from '../../domain/types';
import { defaultUnitFor } from '../../domain/units';
import { settings } from '../schema';
import type { Db } from '../types';

export type { FuelTargets, Macros } from '../../domain/types';

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
  /** How loud the in-app bell plays, from 0.25 to 1 (Settings offers 25%, 50%, 75% and 100%). */
  restBellVolume: number;
  /** The app the session's music bar opens, picked with the header's Music button; null when the bar is closed. */
  musicApp: MusicAppId | null;
  /** When the last good snapshot was written (epoch ms), or null before the first one. */
  lastSnapshotAt: number | null;
  /** Why the last snapshot attempt failed, and when; null once one works. Settings shows it while it is newer than `lastSnapshotAt`. */
  lastSnapshotError: { at: number; message: string } | null;
  activeRoutineId: string | null;
  fuelTargets: FuelTargets | null;
  proDebugUnlock: boolean;
  proCached: boolean;
  seedVersion: number;
  /** Whether the PR flags of workouts finished before phase 4 have been written (R127). Runs once at launch. */
  prFlagsBackfilled: boolean;
  /** The daily water goal in ml, or null until the user sets one (R150: no health default). */
  waterGoalMl: number | null;
  /** Phase 7 (§17.1, R307): finished workouts are written to Apple Health or Health Connect. Off until turned on. */
  healthWorkouts: boolean;
  /** When `healthWorkouts` was last turned on (epoch ms): workouts finished from then on are written (R308). */
  healthWorkoutsSince: number | null;
  /** Phase 7 (§17.1): the three reads, each switched on separately. Sleep and resting heart rate feed the Rough sleep offer. */
  healthSleep: boolean;
  healthHeartRate: boolean;
  /** A newer body weight in Health than the app's latest is offered on the body-weight card. */
  healthBodyweight: boolean;
  /** Phase 7 (§17.2, R303): when the newest snapshot was last copied to iCloud, or null. */
  lastCloudCopyAt: number | null;
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
  restBellVolume: 'rest_bell_volume',
  musicApp: 'music_app',
  lastSnapshotAt: 'last_snapshot_at',
  lastSnapshotError: 'last_snapshot_error',
  activeRoutineId: 'active_routine_id',
  fuelTargets: 'fuel_targets',
  proDebugUnlock: 'pro_debug_unlock',
  proCached: 'pro_cached',
  seedVersion: 'seed_version',
  prFlagsBackfilled: 'pr_flags_backfilled',
  waterGoalMl: 'water_goal_ml',
  healthWorkouts: 'health_workouts',
  healthWorkoutsSince: 'health_workouts_since',
  healthSleep: 'health_sleep',
  healthHeartRate: 'health_heart_rate',
  healthBodyweight: 'health_bodyweight',
  lastCloudCopyAt: 'last_cloud_copy_at',
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
    restBellVolume: 1,
    musicApp: null,
    lastSnapshotAt: null,
    lastSnapshotError: null,
    activeRoutineId: null,
    fuelTargets: null,
    proDebugUnlock: false,
    proCached: false,
    seedVersion: 0,
    prFlagsBackfilled: false,
    waterGoalMl: null,
    healthWorkouts: false,
    healthWorkoutsSince: null,
    healthSleep: false,
    healthHeartRate: false,
    healthBodyweight: false,
    lastCloudCopyAt: null,
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
