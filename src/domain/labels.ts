import type { Equipment, ExerciseMark, LoggingType, Muscle } from './types';

/** How each Something off reason reads on screen, in the sheet's order (spec 18.7). */
export const MARK_LABELS: Record<ExerciseMark, string> = {
  rough_sleep: 'Rough sleep',
  sick: 'Sick',
  short_on_food: 'Short on food',
  pain: 'Pain',
  cutting: 'Cutting',
};

/** Types whose rep range counts seconds. */
const COUNTED_IN_SECONDS: LoggingType[] = ['timed', 'weighted_time'];

/**
 * What a program slot adds to its scheme (§18.29): a carry's distance unit (R607), a metcon's format and work minutes
 * (R622), and a run read on a clock (R620).
 */
export type RepSchemeExtra = {
  distanceUnit?: 'ft' | 'yd' | null;
  metcon?: { format: 'AMRAP' | 'For Time'; workMinutes: number } | null;
  clock?: boolean;
};

/** Minutes and seconds, "29:00". */
const clockOf = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * Sets by reps: "3×8–12", "5×5" when the range is one value, and "3×30–60s" for the types counted in seconds. A
 * program's carries say their distance ("4×50 ft"), its scores their format ("AMRAP 12 min", "For Time") and its runs
 * their time on a clock ("29:00", "6×3:00").
 */
export function formatRepScheme(setCount: number, repMin: number, repMax: number, loggingType: LoggingType, extra: RepSchemeExtra = {}): string {
  if (loggingType === 'rounds') return extra.metcon ? `AMRAP ${extra.metcon.workMinutes} min` : 'AMRAP';
  if (loggingType === 'for_time') return 'For Time';
  const reps = repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
  if (extra.clock && repMin === repMax) return setCount === 1 ? clockOf(repMin) : `${setCount}×${clockOf(repMin)}`;
  if (loggingType === 'weighted_distance' && extra.distanceUnit) return `${setCount}×${reps} ${extra.distanceUnit}`;
  return `${setCount}×${reps}${COUNTED_IN_SECONDS.includes(loggingType) ? 's' : ''}`;
}

/**
 * How each logging type reads in words: the six the custom exercise editor offers (R108, `CUSTOM_LOGGING_TYPES`), and
 * the three that only programs use (R607), which the editor never offers.
 */
export const LOGGING_TYPE_LABELS: Record<LoggingType, string> = {
  weighted: 'Weight and reps',
  bodyweight_plus: 'Bodyweight plus weight',
  assisted: 'Assisted',
  timed: 'Time',
  weighted_time: 'Weight and time',
  distance_time: 'Distance and time',
  // R607: for programs only.
  weighted_distance: 'Weight and distance',
  rounds: 'AMRAP score',
  for_time: 'For Time score',
};

/** The logging types the custom exercise editor offers, in its order: the six since R108, not the three of programs (R607). */
export const CUSTOM_LOGGING_TYPES: readonly LoggingType[] = ['weighted', 'bodyweight_plus', 'assisted', 'timed', 'weighted_time', 'distance_time'];

/** Every kind of equipment in the order chips show it: the six since phase 1, then the ones the library brings (R85). */
export const EQUIPMENT_ORDER: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'bodyweight',
  'ez_bar',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
];

/** Every muscle, head to toe, in the order chips show them. */
export const MUSCLE_ORDER: readonly Muscle[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
];

const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  kettlebell: 'Kettlebell',
  bodyweight: 'Bodyweight',
  ez_bar: 'EZ bar',
  band: 'Band',
  medicine_ball: 'Medicine ball',
  exercise_ball: 'Exercise ball',
  foam_roller: 'Foam roller',
  other: 'Other',
};

/** How an exercise's equipment reads in the picker: "Barbell", "EZ bar", "Bodyweight". */
export function equipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_LABELS[equipment];
}

/**
 * The three delts are split only to count a program's volume (R85, R93); a lifter reads all three as Shoulders, as the
 * form demo's "Chest · Shoulders, Triceps" does (§18.8).
 */
const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  front_delts: 'Shoulders',
  side_delts: 'Shoulders',
  rear_delts: 'Shoulders',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_back: 'Lower back',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
};

/** How a muscle reads on screen: "Chest", "Upper back", and "Shoulders" for each delt. */
export function muscleLabel(muscle: Muscle): string {
  return MUSCLE_LABELS[muscle];
}

const DELT_CHOICE_LABELS: Partial<Record<Muscle, string>> = {
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
};

/**
 * How a muscle reads where you choose it for your own exercise (R108): the three delts apart, since a program's volume
 * counts them apart (R85); every other muscle as `muscleLabel`.
 */
export function muscleChoiceLabel(muscle: Muscle): string {
  return DELT_CHOICE_LABELS[muscle] ?? MUSCLE_LABELS[muscle];
}

/** Each muscle's label once, in order: two delts are one "Shoulders". */
function distinctLabels(muscles: readonly Muscle[]): string[] {
  return [...new Set(muscles.map(muscleLabel))];
}

/** The primary muscles as a picker row shows them after the equipment: "Chest", "Lats, Upper back". */
export function primaryMusclesLabel(primary: readonly Muscle[]): string {
  return distinctLabels(primary).join(', ');
}

/**
 * The form demo's muscles line (R86): the primary muscles, then the secondary ones after a middle dot, "Chest ·
 * Shoulders, Triceps". Each label shows once, so a secondary muscle that reads like a primary one is left out, and with
 * none left the line is the primary muscles alone.
 */
export function musclesLine(primary: readonly Muscle[], secondary: readonly Muscle[]): string {
  const first = distinctLabels(primary);
  const then = distinctLabels(secondary).filter((label) => !first.includes(label));
  return [first, then]
    .filter((labels) => labels.length > 0)
    .map((labels) => labels.join(', '))
    .join(' · ');
}
