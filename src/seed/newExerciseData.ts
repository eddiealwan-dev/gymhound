// The Program Library v2's new exercises (spec §18.29, R602–R606, Appendices A and B), without their steps. Kept free
// of runtime imports (types only) so a build script can import it straight into Node (type stripping); the app reads
// NEW_EXERCISES from src/seed/newExercises.ts, which adds the steps.
import type { Equipment, LoggingType, Muscle, Pattern } from '../domain/types';

/** One new exercise's library fields. Every one has plain slug ids, no free-exercise-db source and no aliases (R604). */
export type NewExerciseRow = {
  id: string;
  name: string;
  loggingType: LoggingType;
  equipment: Equipment;
  pattern: Pattern;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
};

const row = (
  id: string,
  name: string,
  loggingType: LoggingType,
  equipment: Equipment,
  pattern: Pattern,
  primaryMuscles: readonly Muscle[],
  secondaryMuscles: readonly Muscle[],
): NewExerciseRow => ({ id, name, loggingType, equipment, pattern, primaryMuscles, secondaryMuscles });

// The library tags of a run (Appendix A): no muscle is credited for volume, but search and Stats need a muscle.
const RUN_PRIMARY: readonly Muscle[] = ['quads'];
const RUN_SECONDARY: readonly Muscle[] = ['calves', 'hamstrings'];

/**
 * Appendix A's 48: 32 catalog movements the library lacks, Farmer's carry and Sled push for distance (R607), Toes-to-bar
 * on its own, the 7 runs and intervals and the 7 metcons. Muscles are the catalog's, with the five outside the app's
 * list mapped for tags only (R604: abductors → glutes, hip flexors → quads, hip rotators → glutes, shoulder rotators
 * → rear delts, thoracic spine → upper back). A metcon's muscles are the union of its elements' primaries.
 */
export const CATALOG_NEW: readonly NewExerciseRow[] = [
  // Kettlebell (#8)
  row('double-kettlebell-clean-and-press', 'Double kettlebell clean and press', 'weighted', 'kettlebell', 'vertical_push', ['front_delts', 'upper_back'], ['triceps', 'side_delts', 'glutes', 'hamstrings']),
  row('kettlebell-swing', 'Kettlebell swing', 'weighted', 'kettlebell', 'hinge', ['hamstrings', 'glutes'], ['lower_back', 'forearms']),
  row('kettlebell-reverse-fly', 'Kettlebell reverse fly', 'weighted', 'kettlebell', 'isolation', ['rear_delts'], ['upper_back', 'traps']),
  // Reps are rounds of 2 cleans, 1 press and 3 front squats.
  row('armor-building-complex', 'Armor building complex', 'weighted', 'kettlebell', 'squat', ['quads', 'front_delts'], ['glutes', 'upper_back', 'hamstrings', 'triceps']),
  row('kettlebell-curl', 'Kettlebell curl', 'weighted', 'kettlebell', 'isolation', ['biceps'], ['forearms']),
  // Glutes and lower body (#10)
  row('side-lying-hip-abduction', 'Side-lying hip abduction', 'bodyweight_plus', 'bodyweight', 'isolation', ['glutes'], []),
  row('paused-back-squat', 'Paused back squat', 'weighted', 'barbell', 'squat', ['quads', 'glutes'], ['adductors', 'lower_back']),
  row('heels-elevated-goblet-squat', 'Heels-elevated goblet squat', 'weighted', 'dumbbell', 'squat', ['quads'], ['glutes', 'adductors']),
  row('dumbbell-hip-thrust', 'Dumbbell hip thrust', 'weighted', 'dumbbell', 'hinge', ['glutes'], ['hamstrings', 'adductors']),
  row('dumbbell-single-leg-romanian-deadlift', 'Dumbbell single-leg Romanian deadlift', 'weighted', 'dumbbell', 'hinge', ['hamstrings', 'glutes'], ['lower_back', 'abs']),
  // Mobility for Lifters (#14)
  row('leg-swing', 'Leg swing', 'bodyweight_plus', 'bodyweight', 'isolation', ['quads'], ['hamstrings', 'adductors']),
  row('ninety-ninety-hip-switch', '90/90 hip switch', 'bodyweight_plus', 'bodyweight', 'isolation', ['glutes'], ['adductors']),
  row('couch-stretch', 'Couch stretch', 'timed', 'bodyweight', 'isolation', ['quads'], []),
  row('knee-to-wall-ankle-rock', 'Knee-to-wall ankle rock', 'bodyweight_plus', 'bodyweight', 'isolation', ['calves'], []),
  row('cossack-squat', 'Cossack squat', 'bodyweight_plus', 'bodyweight', 'squat', ['adductors'], ['quads', 'glutes']),
  row('deep-goblet-squat-hold', 'Deep goblet squat hold', 'weighted_time', 'dumbbell', 'isolation', ['adductors', 'glutes'], ['quads', 'calves']),
  row('shoulder-cars', 'Shoulder CARs', 'bodyweight_plus', 'bodyweight', 'isolation', ['rear_delts'], ['upper_back']),
  row('thoracic-open-book', 'Thoracic open book', 'bodyweight_plus', 'bodyweight', 'isolation', ['upper_back'], ['chest']),
  row('wall-slide', 'Wall slide', 'bodyweight_plus', 'bodyweight', 'isolation', ['upper_back'], ['rear_delts']),
  row('band-dislocate', 'Band dislocate', 'weighted', 'band', 'isolation', ['rear_delts'], ['chest', 'front_delts']),
  row('dumbbell-pullover-stretch', 'Dumbbell pullover stretch', 'weighted_time', 'dumbbell', 'isolation', ['lats'], ['chest']),
  row('dead-hang', 'Dead hang', 'timed', 'bodyweight', 'isolation', ['lats'], ['forearms']),
  row('hip-cars', 'Hip CARs', 'bodyweight_plus', 'bodyweight', 'isolation', ['glutes'], []),
  row('jefferson-curl', 'Jefferson curl', 'weighted', 'dumbbell', 'hinge', ['hamstrings', 'lower_back'], []),
  row('dumbbell-rdl-stretch-hold', 'Dumbbell RDL stretch hold', 'weighted_time', 'dumbbell', 'isolation', ['hamstrings'], ['glutes']),
  row('pigeon-stretch', 'Pigeon stretch', 'timed', 'bodyweight', 'isolation', ['glutes'], []),
  // Calisthenics (#16)
  row('band-face-pull', 'Band face pull', 'weighted', 'band', 'horizontal_pull', ['rear_delts'], ['upper_back', 'traps']),
  row('single-leg-calf-raise', 'Single-leg calf raise', 'bodyweight_plus', 'bodyweight', 'isolation', ['calves'], []),
  // Not volume-counted.
  row('freestanding-handstand-practice', 'Freestanding handstand practice', 'timed', 'bodyweight', 'vertical_push', ['front_delts'], ['triceps']),
  // Strongman's moving events (#19, R607)
  row('yoke-carry', 'Yoke carry', 'weighted_distance', 'other', 'carry', ['traps', 'abs', 'lower_back'], ['quads', 'glutes', 'upper_back']),
  row('farmers-carry-distance', "Farmer's carry for distance", 'weighted_distance', 'other', 'carry', ['forearms', 'traps'], ['abs', 'upper_back']),
  row('sandbag-carry', 'Sandbag carry', 'weighted_distance', 'other', 'carry', ['upper_back', 'abs'], ['biceps', 'glutes', 'quads']),
  row('sled-push-distance', 'Sled push for distance', 'weighted_distance', 'other', 'carry', ['quads', 'glutes'], ['calves']),
  // A strength slot in #18 (F2); its metcon element keeps its own credit.
  row('toes-to-bar', 'Toes-to-bar', 'bodyweight_plus', 'bodyweight', 'core', ['abs'], ['lats', 'forearms']),
  // Runs and conditioning intervals (#9, #20): timed, intervals are sets.
  row('easy-run', 'Easy run', 'timed', 'bodyweight', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  row('interval-run', 'Interval run', 'timed', 'bodyweight', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  row('tempo-run', 'Tempo run', 'timed', 'bodyweight', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  row('long-run', 'Long run', 'timed', 'bodyweight', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  row('bike-intervals', 'Bike intervals', 'timed', 'machine', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  row('rower-intervals', 'Rower intervals', 'timed', 'machine', 'isolation', ['lats'], ['quads']),
  row('incline-treadmill-walk', 'Incline treadmill walk', 'timed', 'machine', 'isolation', RUN_PRIMARY, RUN_SECONDARY),
  // Metcons (#17, #18): one score set each; the full JSON name is the slot's note.
  row('metcon-amrap-10-squat-pushup-run', 'AMRAP 10: goblet squat, push-up, run', 'rounds', 'other', 'isolation', ['quads', 'glutes', 'chest'], []),
  row('metcon-3-rounds-row-thruster-ring-row', '3 rounds for time: row, thruster, ring row', 'for_time', 'other', 'isolation', ['quads', 'front_delts', 'upper_back', 'lats'], []),
  row('metcon-amrap-15-cindy-scaled', 'AMRAP 15: pull-up, push-up, air squat', 'rounds', 'other', 'isolation', ['lats', 'chest', 'quads', 'glutes'], []),
  row('metcon-amrap-12-wallball-t2b-row', 'AMRAP 12: wall ball, toes-to-bar, row', 'rounds', 'other', 'isolation', ['quads', 'front_delts', 'abs'], []),
  row('metcon-21-15-9-thruster-pullup', '21-15-9 for time: thruster, pull-up', 'for_time', 'other', 'isolation', ['quads', 'front_delts', 'lats'], []),
  row('metcon-amrap-25-run-wallball-burpee', 'AMRAP 25: run, wall ball, burpee', 'rounds', 'other', 'isolation', ['quads', 'front_delts', 'chest'], []),
  row('metcon-5-rounds-db-snatch-c2b', '5 rounds for time: dumbbell snatch, chest-to-bar pull-up', 'for_time', 'other', 'isolation', ['glutes', 'hamstrings', 'lats'], []),
];

// Each ladder's catalog muscles (gymhound_programs.json), in the app's words; a rung takes its ladder's (R604).
const PULL_UP: readonly [readonly Muscle[], readonly Muscle[]] = [['lats'], ['biceps', 'upper_back', 'forearms']];
const SQUAT: readonly [readonly Muscle[], readonly Muscle[]] = [['quads', 'glutes'], ['adductors']];
const DIP: readonly [readonly Muscle[], readonly Muscle[]] = [['triceps', 'chest'], ['front_delts']];
const HINGE: readonly [readonly Muscle[], readonly Muscle[]] = [['hamstrings', 'glutes'], ['lower_back']];
const NORDIC: readonly [readonly Muscle[], readonly Muscle[]] = [['hamstrings'], []];
const ROW: readonly [readonly Muscle[], readonly Muscle[]] = [['upper_back', 'lats'], ['biceps', 'rear_delts']];
const PUSH_UP: readonly [readonly Muscle[], readonly Muscle[]] = [['chest'], ['front_delts', 'triceps']];
const PLANK: readonly [readonly Muscle[], readonly Muscle[]] = [['abs'], ['obliques', 'lower_back']];
const KNEE_RAISE: readonly [readonly Muscle[], readonly Muscle[]] = [['abs'], ['forearms']];
const FRONT_LEVER: readonly [readonly Muscle[], readonly Muscle[]] = [['lats', 'abs'], ['rear_delts', 'upper_back']];
const FRONT_LEVER_ROW: readonly [readonly Muscle[], readonly Muscle[]] = [['lats', 'upper_back'], ['biceps', 'rear_delts', 'abs']];
const BACK_LEVER: readonly [readonly Muscle[], readonly Muscle[]] = [['lats'], ['chest', 'biceps', 'abs']];
const PLANCHE: readonly [readonly Muscle[], readonly Muscle[]] = [['front_delts'], ['chest', 'triceps', 'abs']];
const MUSCLE_UP: readonly [readonly Muscle[], readonly Muscle[]] = [['lats'], ['triceps', 'chest', 'biceps']];
const HANDSTAND_PUSH_UP: readonly [readonly Muscle[], readonly Muscle[]] = [['front_delts', 'triceps'], ['side_delts', 'upper_back']];
const PISTOL: readonly [readonly Muscle[], readonly Muscle[]] = [['quads', 'glutes'], ['adductors']];
// The catalog's hip flexors read as quads (R604).
const L_SIT: readonly [readonly Muscle[], readonly Muscle[]] = [['abs'], ['quads', 'triceps']];
const BOX_JUMP: readonly [readonly Muscle[], readonly Muscle[]] = [['quads', 'glutes'], ['calves']];
// Ring row and Chest-to-bar pull-up have catalog entries of their own (metcon elements), whose muscles fit them better
// than the pull-up ladder's.
const RING_ROW: readonly [readonly Muscle[], readonly Muscle[]] = [['upper_back', 'lats'], ['biceps', 'rear_delts']];
const CHEST_TO_BAR: readonly [readonly Muscle[], readonly Muscle[]] = [['lats'], ['biceps', 'upper_back']];

const rung = (
  id: string,
  name: string,
  loggingType: 'bodyweight_plus' | 'timed',
  equipment: Equipment,
  pattern: Pattern,
  [primary, secondary]: readonly [readonly Muscle[], readonly Muscle[]],
): NewExerciseRow => row(id, name, loggingType, equipment, pattern, primary, secondary);

/**
 * Appendix B's 60 rungs the library lacks, by ladder, in rung order. Bodyweight plus unless the ladder is timed;
 * equipment is bodyweight, band, or other for rings and the ab wheel (the app has no rings, as the library files ring
 * dips under other).
 */
export const RUNG_NEW: readonly NewExerciseRow[] = [
  // Pull-up (#3)
  rung('scapular-pull-up', 'Scapular pull-up', 'bodyweight_plus', 'bodyweight', 'vertical_pull', PULL_UP),
  rung('arch-hang', 'Arch hang', 'timed', 'bodyweight', 'vertical_pull', PULL_UP),
  rung('negative-pull-up', 'Negative pull-up', 'bodyweight_plus', 'bodyweight', 'vertical_pull', PULL_UP),
  // Pull-up (#17, CrossFit scaling)
  rung('ring-row', 'Ring row', 'bodyweight_plus', 'other', 'horizontal_pull', RING_ROW),
  rung('chest-to-bar-pull-up', 'Chest-to-bar pull-up', 'bodyweight_plus', 'bodyweight', 'vertical_pull', CHEST_TO_BAR),
  // Squat (#3)
  rung('assisted-squat', 'Assisted squat', 'bodyweight_plus', 'bodyweight', 'squat', SQUAT),
  rung('shrimp-squat', 'Shrimp squat', 'bodyweight_plus', 'bodyweight', 'squat', SQUAT),
  // Dip (#3)
  rung('support-hold', 'Support hold', 'timed', 'bodyweight', 'vertical_push', DIP),
  rung('negative-dip', 'Negative dip', 'bodyweight_plus', 'bodyweight', 'vertical_push', DIP),
  // Hinge (#3); the two Nordic rungs are also the Nordic curl ladder's (#16), and take its hamstrings-only credit.
  rung('bodyweight-romanian-deadlift', 'Bodyweight Romanian deadlift', 'bodyweight_plus', 'bodyweight', 'hinge', HINGE),
  rung('hamstring-walkout', 'Hamstring walkout', 'bodyweight_plus', 'bodyweight', 'hinge', HINGE),
  rung('band-assisted-nordic-curl', 'Band-assisted Nordic curl', 'bodyweight_plus', 'band', 'hinge', NORDIC),
  rung('eccentric-nordic-curl', 'Eccentric Nordic curl', 'bodyweight_plus', 'bodyweight', 'hinge', NORDIC),
  // Row (#3)
  rung('vertical-row', 'Vertical row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', ROW),
  // "Incline row" is already an alias of the chest-supported dumbbell row.
  rung('incline-row', 'Incline bodyweight row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', ROW),
  rung('wide-grip-inverted-row', 'Wide-grip inverted row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', ROW),
  rung('feet-elevated-inverted-row', 'Feet-elevated inverted row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', ROW),
  // Push-up (#3, #17, and #8's hypertrophy range)
  rung('wall-push-up', 'Wall push-up', 'bodyweight_plus', 'bodyweight', 'horizontal_push', PUSH_UP),
  rung('knee-push-up', 'Knee push-up', 'bodyweight_plus', 'bodyweight', 'horizontal_push', PUSH_UP),
  rung('deficit-push-up', 'Deficit push-up', 'bodyweight_plus', 'bodyweight', 'horizontal_push', PUSH_UP),
  rung('archer-push-up', 'Archer push-up', 'bodyweight_plus', 'bodyweight', 'horizontal_push', PUSH_UP),
  // Plank (#3)
  rung('standing-ab-wheel-rollout', 'Standing ab wheel rollout', 'bodyweight_plus', 'other', 'core', PLANK),
  // Hanging knee raise (#3, #17)
  rung('lying-knee-tuck', 'Lying knee tuck', 'bodyweight_plus', 'bodyweight', 'core', KNEE_RAISE),
  rung('lying-straight-leg-raise', 'Lying straight-leg raise', 'bodyweight_plus', 'bodyweight', 'core', KNEE_RAISE),
  rung('hanging-knee-raise', 'Hanging knee raise', 'bodyweight_plus', 'bodyweight', 'core', KNEE_RAISE),
  rung('hanging-bent-leg-raise', 'Hanging bent-leg raise', 'bodyweight_plus', 'bodyweight', 'core', KNEE_RAISE),
  // Front lever (#16, timed)
  rung('tuck-front-lever', 'Tuck front lever', 'timed', 'bodyweight', 'vertical_pull', FRONT_LEVER),
  rung('advanced-tuck-front-lever', 'Advanced tuck front lever', 'timed', 'bodyweight', 'vertical_pull', FRONT_LEVER),
  rung('one-leg-front-lever', 'One-leg front lever', 'timed', 'bodyweight', 'vertical_pull', FRONT_LEVER),
  rung('straddle-front-lever', 'Straddle front lever', 'timed', 'bodyweight', 'vertical_pull', FRONT_LEVER),
  rung('front-lever', 'Front lever', 'timed', 'bodyweight', 'vertical_pull', FRONT_LEVER),
  // Front lever row (#16)
  rung('tuck-front-lever-row', 'Tuck front lever row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', FRONT_LEVER_ROW),
  rung('advanced-tuck-front-lever-row', 'Advanced tuck front lever row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', FRONT_LEVER_ROW),
  rung('straddle-front-lever-row', 'Straddle front lever row', 'bodyweight_plus', 'bodyweight', 'horizontal_pull', FRONT_LEVER_ROW),
  // Back lever (#16, timed)
  rung('tuck-back-lever', 'Tuck back lever', 'timed', 'bodyweight', 'vertical_pull', BACK_LEVER),
  rung('advanced-tuck-back-lever', 'Advanced tuck back lever', 'timed', 'bodyweight', 'vertical_pull', BACK_LEVER),
  rung('half-lay-back-lever', 'Half-lay back lever', 'timed', 'bodyweight', 'vertical_pull', BACK_LEVER),
  rung('straddle-back-lever', 'Straddle back lever', 'timed', 'bodyweight', 'vertical_pull', BACK_LEVER),
  rung('back-lever', 'Back lever', 'timed', 'bodyweight', 'vertical_pull', BACK_LEVER),
  // Planche (#16, timed)
  rung('planche-lean', 'Planche lean', 'timed', 'bodyweight', 'horizontal_push', PLANCHE),
  rung('tuck-planche', 'Tuck planche', 'timed', 'bodyweight', 'horizontal_push', PLANCHE),
  rung('advanced-tuck-planche', 'Advanced tuck planche', 'timed', 'bodyweight', 'horizontal_push', PLANCHE),
  rung('straddle-planche', 'Straddle planche', 'timed', 'bodyweight', 'horizontal_push', PLANCHE),
  // Muscle-up (#16, #18)
  rung('explosive-pull-up-and-dip', 'Explosive pull-up and dip', 'bodyweight_plus', 'bodyweight', 'vertical_pull', MUSCLE_UP),
  rung('band-assisted-muscle-up', 'Band-assisted muscle-up', 'bodyweight_plus', 'band', 'vertical_pull', MUSCLE_UP),
  rung('negative-muscle-up', 'Negative muscle-up', 'bodyweight_plus', 'bodyweight', 'vertical_pull', MUSCLE_UP),
  rung('ring-muscle-up', 'Ring muscle-up', 'bodyweight_plus', 'other', 'vertical_pull', MUSCLE_UP),
  // Handstand push-up (#16, #18)
  rung('elevated-pike-push-up', 'Elevated pike push-up', 'bodyweight_plus', 'bodyweight', 'vertical_push', HANDSTAND_PUSH_UP),
  rung('partial-wall-handstand-push-up', 'Partial wall handstand push-up', 'bodyweight_plus', 'bodyweight', 'vertical_push', HANDSTAND_PUSH_UP),
  rung('deficit-wall-handstand-push-up', 'Deficit wall handstand push-up', 'bodyweight_plus', 'bodyweight', 'vertical_push', HANDSTAND_PUSH_UP),
  // Pistol squat (#16)
  rung('box-pistol-squat', 'Box pistol squat', 'bodyweight_plus', 'bodyweight', 'squat', PISTOL),
  rung('pistol-squat', 'Pistol squat', 'bodyweight_plus', 'bodyweight', 'squat', PISTOL),
  // L-sit (#16, #18, timed)
  rung('tuck-l-sit', 'Tuck L-sit', 'timed', 'bodyweight', 'core', L_SIT),
  rung('one-leg-l-sit', 'One-leg L-sit', 'timed', 'bodyweight', 'core', L_SIT),
  rung('l-sit', 'L-sit', 'timed', 'bodyweight', 'core', L_SIT),
  rung('v-sit', 'V-sit', 'timed', 'bodyweight', 'core', L_SIT),
  // Box jump (#17)
  rung('box-step-up', 'Box step-up', 'bodyweight_plus', 'bodyweight', 'lunge', BOX_JUMP),
  // The three ring ladders (#16) are single exercises with a manual rule (R618, F10).
  rung('ring-push-up', 'Ring push-up', 'bodyweight_plus', 'other', 'horizontal_push', [['chest'], ['front_delts', 'triceps', 'abs']]),
  rung('ring-biceps-curl', 'Ring biceps curl', 'bodyweight_plus', 'other', 'isolation', [['biceps'], ['forearms']]),
  rung('ring-triceps-extension', 'Ring triceps extension', 'bodyweight_plus', 'other', 'isolation', [['triceps'], ['abs']]),
];

/** The ids of Appendix A's 48, whose steps are in CATALOG_STEPS (Task 3). */
export const CATALOG_NEW_IDS: readonly string[] = CATALOG_NEW.map((e) => e.id);
/** The ids of Appendix B's 60 rungs, whose steps are in RUNG_STEPS (Task 4). */
export const RUNG_NEW_IDS: readonly string[] = RUNG_NEW.map((e) => e.id);

/**
 * R605: the seven new exercises that show the bundled photos of a free-exercise-db exercise whose still looks the
 * same. The other 101 have none: the form demo shows their steps, and a phone build offers your own photos (R111).
 */
export const PHOTO_ALIAS: Readonly<Record<string, string>> = {
  'paused-back-squat': 'barbell-back-squat',
  'farmers-carry-distance': 'fedb-farmers-walk',
  'yoke-carry': 'fedb-yoke-walk',
  'sled-push-distance': 'fedb-sled-push',
  'bike-intervals': 'fedb-bicycling-stationary',
  'rower-intervals': 'fedb-rowing-stationary',
  'incline-treadmill-walk': 'fedb-walking-treadmill',
};

/**
 * R606: the aliases the seed adds to existing library exercises, so search finds the program's word (existing id →
 * aliases). Lower case as the library's aliases are, keeping proper nouns. Diamond push-up is not here: the close-grip
 * push-up already has it.
 */
export const NEW_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'fedb-close-grip-barbell-bench-press': ['close-grip bench press'],
  'fedb-lying-dumbbell-tricep-extension': ['dumbbell skull crusher'],
  'fedb-lateral-raise-with-bands': ['band lateral raise'],
  'dumbbell-chest-supported-row': ['chest-supported row'],
  'fedb-front-squats-with-two-kettlebells': ['double kettlebell front squat'],
  'fedb-alternating-kettlebell-row': ['kettlebell gorilla row'],
  'fedb-one-arm-kettlebell-floor-press': ['kettlebell floor press'],
  'fedb-farmers-walk': ["farmer's carry"],
  'fedb-kettlebell-turkish-get-up-squat-style': ['Turkish get-up'],
  'fedb-kettlebell-one-legged-deadlift': ['kettlebell single-leg Romanian deadlift'],
  'fedb-hyperextensions-back-extensions': ['back extension'],
  dip: ['weighted dip'],
  'fedb-chin-up': ['weighted chin-up'],
  'fedb-log-lift': ['log clean and press'],
  'fedb-ab-roller': ['ab wheel rollout'],
  'fedb-atlas-stones': ['atlas stone load'],
  'fedb-muscle-up': ['bar muscle-up'],
  'fedb-natural-glute-ham-raise': ['Nordic curl'],
  'fedb-front-box-jump': ['low box jump'],
};
