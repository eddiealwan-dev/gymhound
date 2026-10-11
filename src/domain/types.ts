export type WeightUnit = 'lb' | 'kg';
export type DistanceUnit = 'm' | 'km' | 'mi';

export type LoggingType =
  | 'weighted'
  | 'bodyweight_plus'
  | 'assisted'
  | 'timed'
  | 'weighted_time'
  | 'distance_time';
export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'kettlebell' | 'bodyweight';
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
/** Something off (spec 18.7, R60): why an exercise is flagged today. Stored per workout exercise; null is nothing off. */
export type ExerciseMark = 'rough_sleep' | 'sick' | 'short_on_food' | 'pain' | 'cutting';
export type DayMark = 'normal' | ExerciseMark;

export type BellSound = 'bell' | 'chime' | 'ding';

/** The music apps the session's music bar can open (`src/platform/music.ts`). */
export type MusicAppId = 'apple-music' | 'spotify' | 'audible';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MeasurementSystem = 'us' | 'metric' | 'uk' | null;
