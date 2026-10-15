import type { BellSound, DistanceUnit, FuelTargets, LengthUnit, MeasurementSystem, MusicAppId, ThemePreference, WeightUnit } from '../../domain/types';
import { lengthUnitFor } from '../../domain/body';
import { DEFAULT_WIDGETS } from '../../domain/profile';
import { defaultUnitFor } from '../../domain/units';
import { settings } from '../schema';
import type { Db } from '../types';

export type { FuelTargets, Macros } from '../../domain/types';

export type Settings = {
  theme: ThemePreference;
  unit: WeightUnit;
  /** mi or km: ft and yd are a carry's own, for sets only (R607). */
  distanceUnit: Extract<DistanceUnit, 'mi' | 'km'>;
  /**
   * in or cm, for body measurements (R639b). Stored as null until the lifter picks one, and then it follows the weight
   * unit (lb gives in, kg gives cm); `getSettings` always returns the unit in force.
   */
  lengthUnit: LengthUnit;
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
  /** §18.15 (R407): Train's first-run line about units was dismissed. It only shows before the first finished workout. */
  hintUnitsDismissed: boolean;
  /** §18.15 (R408): the session's first-run tip (the name opens the form demo, ⋯ holds rest and plates) was dismissed. */
  hintSessionDismissed: boolean;
  /** Round 12 (R566): the Profile's name and goal, '' when not given. */
  profileName: string;
  profileGoal: string;
  /** The profile photo's file name in `profile/` in the documents folder, or null for none (R566). */
  profilePhoto: string | null;
  /** The Profile dashboard's widgets, in order (R567). Read through `dashboardWidgets`, which drops what it doesn't know. */
  profileWidgets: unknown;
  /** Workouts a week the Workouts per week widget aims at, or null for no goal (R567). */
  weeklyWorkoutGoal: number | null;
  /** §18.28 (R584): the rule test's answers, one entry per person. Read through `readRuleTestEntries`. */
  ruleTestAnswers: unknown;
  /** §18.28 (R586): when the store's rating prompt was last asked for (epoch ms), or null. */
  reviewAskedAt: number | null;
  /** §18.28 (R587): what the rating rules said at the last finish, for Settings → Developer. Null before one. */
  reviewLastCheck: string | null;
  /** §18.28 (R593): the tester questions' answers, one entry per workout asked after. Read through `readTesterEntries`. */
  testerAnswers: unknown;
};

/** The stored key for each field. One row per key, named as in spec §6. */
const KEYS: Record<keyof Settings, string> = {
  theme: 'theme',
  unit: 'unit',
  distanceUnit: 'distance_unit',
  lengthUnit: 'length_unit',
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
  hintUnitsDismissed: 'hint_units_dismissed',
  hintSessionDismissed: 'hint_session_dismissed',
  profileName: 'profile_name',
  profileGoal: 'profile_goal',
  profilePhoto: 'profile_photo',
  profileWidgets: 'profile_widgets',
  weeklyWorkoutGoal: 'weekly_workout_goal',
  ruleTestAnswers: 'rule_test_answers',
  reviewAskedAt: 'review_asked_at',
  reviewLastCheck: 'review_last_check',
  testerAnswers: 'tester_answers',
};

const FIELDS = Object.keys(KEYS) as (keyof Settings)[];

export function defaultSettings(m: MeasurementSystem): Settings {
  const unit = defaultUnitFor(m);
  return {
    theme: 'system',
    unit,
    distanceUnit: unit === 'lb' ? 'mi' : 'km',
    lengthUnit: lengthUnitFor(unit),
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
    hintUnitsDismissed: false,
    hintSessionDismissed: false,
    profileName: '',
    profileGoal: '',
    profilePhoto: null,
    profileWidgets: [...DEFAULT_WIDGETS],
    weeklyWorkoutGoal: null,
    ruleTestAnswers: [],
    reviewAskedAt: null,
    reviewLastCheck: null,
    testerAnswers: [],
  };
}

/** Writes the default for every key that has no row yet. Existing rows, even null ones, are left alone. */
export function ensureSettings(db: Db, m: MeasurementSystem): void {
  const defaults = defaultSettings(m);
  // The length unit starts unchosen (null), so it follows the weight unit until the lifter picks one.
  const rows = FIELDS.map((field) => ({ key: KEYS[field], value: field === 'lengthUnit' ? null : defaults[field] }));
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
  // No length unit chosen (null, or a lifter who had settings before it existed): it goes with the weight unit.
  const chosen = stored.get(KEYS.lengthUnit);
  result.lengthUnit = chosen === 'in' || chosen === 'cm' ? chosen : lengthUnitFor(result.unit as WeightUnit);
  return result as Settings;
}

export function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]): void {
  db.insert(settings)
    .values({ key: KEYS[key], value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}
