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
export type DayMark = 'normal' | 'rough_sleep' | 'short_on_food' | 'pain' | 'cutting';

export type BellSound = 'bell' | 'chime' | 'ding';

export type ThemePreference = 'system' | 'light' | 'dark';
export type MeasurementSystem = 'us' | 'metric' | 'uk' | null;
