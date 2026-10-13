export type WeightUnit = 'lb' | 'kg';
export type DistanceUnit = 'm' | 'km' | 'mi';

export type LoggingType =
  | 'weighted'
  | 'bodyweight_plus'
  | 'assisted'
  | 'timed'
  | 'weighted_time'
  | 'distance_time';
/** The first six since phase 1; the library brings the rest (§18.8, R85). Only `barbell` uses plates and barbell rounding. */
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'kettlebell'
  | 'bodyweight'
  | 'ez_bar'
  | 'band'
  | 'medicine_ball'
  | 'exercise_ball'
  | 'foam_roller'
  | 'other';
export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'core'
  | 'isolation';
export type Muscle =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'upper_back'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'adductors'
  | 'calves';

export type SetType = 'working' | 'warmup' | 'drop' | 'failure';

/** Body measurements other than bodyweight (phase 4, R113: arms and thighs are one value each). */
export type MeasurementKind = 'waist' | 'chest' | 'hips' | 'arms' | 'thighs' | 'neck' | 'body_fat';
/** Lengths follow the weight unit: lb → in, kg → cm (R112). */
export type LengthUnit = 'in' | 'cm';
export type MeasurementUnit = LengthUnit | '%';

/** One remembered set of a saved workout's exercise (R118), in the unit it was logged in. */
export type SavedSet = {
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
};
/** Something off (spec 18.7, R60): why an exercise is flagged today. Stored per workout exercise; null is nothing off. */
export type ExerciseMark = 'rough_sleep' | 'sick' | 'short_on_food' | 'pain' | 'cutting';
export type DayMark = 'normal' | ExerciseMark;

export type BellSound = 'bell' | 'chime' | 'ding';

/** The music apps the session's music bar can open (`src/platform/music.ts`). */
export type MusicAppId = 'apple-music' | 'spotify' | 'audible';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MeasurementSystem = 'us' | 'metric' | 'uk' | null;

/** Calories and grams of protein, carbs and fat for one day's target (spec §6). Carbs and fat are optional (R145). */
export type Macros = { kcal: number; protein: number; carbs: number | null; fat: number | null };
/** The stored `fuel_targets` setting: training-day and rest-day targets (§7.11). */
export type FuelTargets = { training: Macros; rest: Macros };
/** How water is shown and typed: ml for kg users, fl oz for lb users (R150). Always stored in ml. */
export type WaterUnit = 'ml' | 'fl_oz';

/** A progress photo (R181): the row holds the file name only; the file is in the documents folder's `progress-photos/`. */
export type ProgressPhoto = { id: string; localDate: string; takenAt: number; fileName: string };
