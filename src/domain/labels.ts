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

/** Sets by reps: "3×8–12", "5×5" when the range is one value, and "3×30–60s" for the types counted in seconds. */
export function formatRepScheme(setCount: number, repMin: number, repMax: number, loggingType: LoggingType): string {
  const reps = repMin === repMax ? `${repMin}` : `${repMin}–${repMax}`;
  return `${setCount}×${reps}${COUNTED_IN_SECONDS.includes(loggingType) ? 's' : ''}`;
}

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
