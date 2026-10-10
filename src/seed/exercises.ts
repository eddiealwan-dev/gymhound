import type { Equipment, LoggingType, Muscle, Pattern } from '../domain/types';

export type SeedExercise = {
  id: string;
  name: string;
  aliases: string[];
  equipment: Equipment;
  loggingType: LoggingType;
  pattern: Pattern;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
};

/** The bundled exercises (spec §10.1). Ids are stable slugs; seeded rows are never custom. */
export const SEED_EXERCISES: SeedExercise[] = [
  // Barbell
  {
    id: 'barbell-back-squat', name: 'Barbell back squat', aliases: ['squat', 'back squat'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'lower_back'],
  },
  {
    id: 'barbell-bench-press', name: 'Barbell bench press', aliases: ['bench', 'bench press', 'flat bench'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'horizontal_push',
    primaryMuscles: ['chest'], secondaryMuscles: ['front_delts', 'triceps'],
  },
  {
    id: 'barbell-row', name: 'Barbell row', aliases: ['bent-over row', 'BB row'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'horizontal_pull',
    primaryMuscles: ['lats', 'upper_back'], secondaryMuscles: ['biceps', 'rear_delts', 'lower_back'],
  },
  {
    id: 'barbell-deadlift', name: 'Deadlift', aliases: ['conventional deadlift', 'DL'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'], secondaryMuscles: ['quads', 'traps', 'forearms', 'lats'],
  },
  {
    id: 'barbell-overhead-press', name: 'Overhead press', aliases: ['OHP', 'military press', 'shoulder press'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'vertical_push',
    primaryMuscles: ['front_delts'], secondaryMuscles: ['side_delts', 'triceps', 'traps'],
  },
  {
    id: 'barbell-romanian-deadlift', name: 'Romanian deadlift', aliases: ['RDL'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back', 'forearms'],
  },
  {
    id: 'barbell-hip-thrust', name: 'Hip thrust', aliases: ['barbell hip thrust', 'glute thrust'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'hinge',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'adductors'],
  },
  {
    id: 'barbell-curl', name: 'Barbell curl', aliases: ['BB curl'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'],
  },
  {
    id: 'barbell-incline-bench-press', name: 'Incline bench press', aliases: ['incline bench'],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'horizontal_push',
    primaryMuscles: ['chest', 'front_delts'], secondaryMuscles: ['triceps'],
  },
  {
    id: 'barbell-front-squat', name: 'Front squat', aliases: [],
    equipment: 'barbell', loggingType: 'weighted', pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'abs', 'upper_back'],
  },

  // Dumbbell
  {
    id: 'dumbbell-lateral-raise', name: 'Dumbbell lateral raise', aliases: ['lateral raise', 'side raise'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['side_delts'], secondaryMuscles: ['traps'],
  },
  {
    id: 'dumbbell-walking-lunge', name: 'Dumbbell walking lunge', aliases: ['walking lunge', 'lunge'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors'],
  },
  {
    id: 'dumbbell-curl', name: 'Dumbbell curl', aliases: ['DB curl', 'bicep curl'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'],
  },
  {
    id: 'incline-dumbbell-press', name: 'Incline dumbbell press', aliases: ['incline DB press'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'horizontal_push',
    primaryMuscles: ['chest', 'front_delts'], secondaryMuscles: ['triceps'],
  },
  {
    id: 'dumbbell-bulgarian-split-squat', name: 'Bulgarian split squat',
    aliases: ['BSS', 'rear-foot elevated split squat'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'hamstrings'],
  },
  {
    id: 'dumbbell-reverse-fly', name: 'Dumbbell reverse fly', aliases: ['rear delt fly', 'reverse fly'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back', 'traps'],
  },
  {
    id: 'dumbbell-hammer-curl', name: 'Hammer curl', aliases: ['DB hammer curl'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'],
  },
  {
    id: 'dumbbell-goblet-squat', name: 'Goblet squat', aliases: [],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'abs'],
  },
  {
    id: 'dumbbell-bench-press', name: 'Dumbbell bench press', aliases: ['DB bench'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'horizontal_push',
    primaryMuscles: ['chest'], secondaryMuscles: ['front_delts', 'triceps'],
  },
  {
    id: 'dumbbell-one-arm-row', name: 'One-arm dumbbell row', aliases: ['DB row', 'single-arm row'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'horizontal_pull',
    primaryMuscles: ['lats', 'upper_back'], secondaryMuscles: ['biceps', 'rear_delts'],
  },
  {
    id: 'dumbbell-romanian-deadlift', name: 'Dumbbell Romanian deadlift', aliases: ['DB RDL', 'RDL'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'hinge',
    primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower_back', 'forearms'],
  },
  {
    id: 'dumbbell-seated-shoulder-press', name: 'Seated dumbbell shoulder press',
    aliases: ['DB shoulder press', 'OHP'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'vertical_push',
    primaryMuscles: ['front_delts'], secondaryMuscles: ['side_delts', 'triceps'],
  },
  {
    id: 'dumbbell-reverse-lunge', name: 'Dumbbell reverse lunge', aliases: ['reverse lunge'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors'],
  },
  {
    id: 'dumbbell-chest-supported-row', name: 'Chest-supported dumbbell row', aliases: ['incline row'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'horizontal_pull',
    primaryMuscles: ['upper_back', 'lats'], secondaryMuscles: ['rear_delts', 'biceps'],
  },
  {
    id: 'dumbbell-overhead-triceps-extension', name: 'Overhead dumbbell triceps extension',
    aliases: ['DB overhead extension'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['triceps'], secondaryMuscles: [],
  },
  {
    id: 'dumbbell-standing-calf-raise', name: 'Dumbbell standing calf raise', aliases: ['DB calf raise'],
    equipment: 'dumbbell', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['calves'], secondaryMuscles: [],
  },

  // Cable
  {
    id: 'lat-pulldown', name: 'Lat pulldown', aliases: ['pulldown', 'lat pull-down'],
    equipment: 'cable', loggingType: 'weighted', pattern: 'vertical_pull',
    primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back'],
  },
  {
    id: 'cable-triceps-pushdown', name: 'Triceps pushdown', aliases: ['pushdown', 'rope pushdown'],
    equipment: 'cable', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['triceps'], secondaryMuscles: [],
  },
  {
    id: 'seated-cable-row', name: 'Seated cable row', aliases: ['cable row'],
    equipment: 'cable', loggingType: 'weighted', pattern: 'horizontal_pull',
    primaryMuscles: ['lats', 'upper_back'], secondaryMuscles: ['biceps', 'rear_delts'],
  },
  {
    id: 'face-pull', name: 'Face pull', aliases: [],
    equipment: 'cable', loggingType: 'weighted', pattern: 'horizontal_pull',
    primaryMuscles: ['rear_delts'], secondaryMuscles: ['upper_back', 'traps'],
  },
  {
    id: 'cable-lateral-raise', name: 'Cable lateral raise', aliases: [],
    equipment: 'cable', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['side_delts'], secondaryMuscles: ['traps'],
  },
  {
    id: 'cable-overhead-triceps-extension', name: 'Overhead cable triceps extension',
    aliases: ['overhead extension'],
    equipment: 'cable', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['triceps'], secondaryMuscles: [],
  },

  // Machine
  {
    id: 'leg-press', name: 'Leg press', aliases: [],
    equipment: 'machine', loggingType: 'weighted', pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'hamstrings'],
  },
  {
    id: 'lying-leg-curl', name: 'Lying leg curl', aliases: ['leg curl', 'hamstring curl'],
    equipment: 'machine', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['hamstrings'], secondaryMuscles: ['calves'],
  },
  {
    id: 'standing-calf-raise', name: 'Standing calf raise', aliases: ['calf raise'],
    equipment: 'machine', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['calves'], secondaryMuscles: [],
  },
  {
    id: 'leg-extension', name: 'Leg extension', aliases: ['quad extension'],
    equipment: 'machine', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['quads'], secondaryMuscles: [],
  },
  {
    id: 'seated-calf-raise', name: 'Seated calf raise', aliases: [],
    equipment: 'machine', loggingType: 'weighted', pattern: 'isolation',
    primaryMuscles: ['calves'], secondaryMuscles: [],
  },

  // Bodyweight
  {
    id: 'pull-up', name: 'Pull-up', aliases: ['pullup', 'weighted pull-up'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'vertical_pull',
    primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'upper_back', 'forearms'],
  },
  {
    id: 'dip', name: 'Dip', aliases: ['dips', 'parallel bar dip'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'vertical_push',
    primaryMuscles: ['triceps', 'chest'], secondaryMuscles: ['front_delts'],
  },
  {
    id: 'hanging-leg-raise', name: 'Hanging leg raise', aliases: ['leg raise'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'core',
    primaryMuscles: ['abs'], secondaryMuscles: ['forearms'],
  },
  {
    id: 'plank', name: 'Plank', aliases: ['front plank'],
    equipment: 'bodyweight', loggingType: 'timed', pattern: 'core',
    primaryMuscles: ['abs'], secondaryMuscles: ['obliques', 'lower_back'],
  },
  {
    id: 'side-plank', name: 'Side plank', aliases: [],
    equipment: 'bodyweight', loggingType: 'timed', pattern: 'core',
    primaryMuscles: ['obliques'], secondaryMuscles: ['abs', 'glutes'],
  },
  {
    id: 'wall-sit', name: 'Wall sit', aliases: [],
    equipment: 'bodyweight', loggingType: 'timed', pattern: 'squat',
    primaryMuscles: ['quads'], secondaryMuscles: ['glutes'],
  },
  {
    id: 'hollow-body-hold', name: 'Hollow body hold', aliases: ['hollow hold'],
    equipment: 'bodyweight', loggingType: 'timed', pattern: 'core',
    primaryMuscles: ['abs'], secondaryMuscles: ['obliques'],
  },
  {
    id: 'bodyweight-squat', name: 'Bodyweight squat', aliases: ['air squat'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'squat',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors'],
  },
  {
    id: 'push-up', name: 'Push-up', aliases: ['pushup', 'press-up'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'horizontal_push',
    primaryMuscles: ['chest'], secondaryMuscles: ['front_delts', 'triceps'],
  },
  {
    id: 'glute-bridge', name: 'Glute bridge', aliases: ['hip bridge'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'hinge',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'],
  },
  {
    id: 'superman', name: 'Superman', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'hinge',
    primaryMuscles: ['lower_back', 'glutes'], secondaryMuscles: ['hamstrings', 'upper_back'],
  },
  {
    id: 'bodyweight-reverse-lunge', name: 'Reverse lunge', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors'],
  },
  {
    id: 'pike-push-up', name: 'Pike push-up', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'vertical_push',
    primaryMuscles: ['front_delts'], secondaryMuscles: ['side_delts', 'triceps'],
  },
  {
    id: 'single-leg-glute-bridge', name: 'Single-leg glute bridge', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'hinge',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'],
  },
  {
    id: 'dead-bug', name: 'Dead bug', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'core',
    primaryMuscles: ['abs'], secondaryMuscles: ['obliques'],
  },
  {
    id: 'bodyweight-split-squat', name: 'Split squat', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'lunge',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['adductors', 'hamstrings'],
  },
  {
    id: 'close-grip-push-up', name: 'Close-grip push-up', aliases: ['diamond push-up'],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'horizontal_push',
    primaryMuscles: ['triceps', 'chest'], secondaryMuscles: ['front_delts'],
  },
  {
    id: 'bird-dog', name: 'Bird dog', aliases: [],
    equipment: 'bodyweight', loggingType: 'bodyweight_plus', pattern: 'core',
    primaryMuscles: ['abs', 'lower_back'], secondaryMuscles: ['glutes', 'rear_delts'],
  },
];
