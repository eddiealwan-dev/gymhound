// Turns free-exercise-db (github.com/yuhonas/free-exercise-db, the Unlicense) into GymHound's library (spec §18.8,
// R84 and R85). Pure functions, run at build time by scripts/build-library.mjs, which imports this file straight into
// Node (type stripping), so it uses only `import type` and no TypeScript-only runtime syntax.
import type { Equipment, LoggingType, Muscle, Pattern } from '../domain/types';
import type { SeedExercise } from './exercises';

/** One entry of free-exercise-db's dist/exercises.json. */
export type FedbExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
  images: string[];
};

/** GymHound's equipment plus the six kinds the library brings (R85). Task 2 adds these to `Equipment` itself. */
export type LibraryEquipment = Equipment | 'ez_bar' | 'band' | 'medicine_ball' | 'exercise_ball' | 'foam_roller' | 'other';

/** One of the 55 exercises GymHound bundled before the library. */
export type LegacyExercise = SeedExercise;

/** One exercise of the library: its GymHound fields, its steps and the free-exercise-db entry it came from. */
export type LibraryExercise = {
  id: string;
  /** The free-exercise-db id, or null for an existing exercise free-exercise-db has no good match for. */
  sourceId: string | null;
  name: string;
  aliases: string[];
  equipment: LibraryEquipment;
  loggingType: LoggingType;
  pattern: Pattern;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  instructions: string[];
};

/**
 * Each existing exercise's free-exercise-db entry (R84), for its steps and photos. Null where nothing in
 * free-exercise-db is the same movement; each entry is used at most once, and an entry used here is not added again.
 */
export const LEGACY_SOURCE: Readonly<Record<string, string | null>> = {
  // Barbell
  'barbell-back-squat': 'Barbell_Squat',
  'barbell-bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'barbell-row': 'Bent_Over_Barbell_Row',
  'barbell-deadlift': 'Barbell_Deadlift',
  'barbell-overhead-press': 'Standing_Military_Press',
  'barbell-romanian-deadlift': 'Romanian_Deadlift',
  'barbell-hip-thrust': 'Barbell_Hip_Thrust',
  'barbell-curl': 'Barbell_Curl',
  'barbell-incline-bench-press': 'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'barbell-front-squat': 'Front_Barbell_Squat',
  // Dumbbell
  'dumbbell-lateral-raise': 'Side_Lateral_Raise',
  'dumbbell-walking-lunge': 'Dumbbell_Lunges',
  'dumbbell-curl': 'Dumbbell_Bicep_Curl',
  'incline-dumbbell-press': 'Incline_Dumbbell_Press',
  'dumbbell-bulgarian-split-squat': 'Split_Squat_with_Dumbbells',
  'dumbbell-reverse-fly': 'Reverse_Flyes',
  'dumbbell-hammer-curl': 'Hammer_Curls',
  'dumbbell-goblet-squat': 'Goblet_Squat',
  'dumbbell-bench-press': 'Dumbbell_Bench_Press',
  'dumbbell-one-arm-row': 'One-Arm_Dumbbell_Row',
  'dumbbell-romanian-deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  'dumbbell-seated-shoulder-press': 'Seated_Dumbbell_Press',
  'dumbbell-reverse-lunge': 'Dumbbell_Rear_Lunge',
  'dumbbell-chest-supported-row': 'Dumbbell_Incline_Row',
  'dumbbell-overhead-triceps-extension': 'Standing_Dumbbell_Triceps_Extension',
  'dumbbell-standing-calf-raise': 'Standing_Dumbbell_Calf_Raise',
  // Cable
  'lat-pulldown': 'Wide-Grip_Lat_Pulldown',
  'cable-triceps-pushdown': 'Triceps_Pushdown',
  'seated-cable-row': 'Seated_Cable_Rows',
  'face-pull': 'Face_Pull',
  'cable-lateral-raise': 'Standing_Low-Pulley_Deltoid_Raise',
  'cable-overhead-triceps-extension': 'Triceps_Overhead_Extension_with_Rope',
  // Machine
  'leg-press': 'Leg_Press',
  'lying-leg-curl': 'Lying_Leg_Curls',
  'standing-calf-raise': 'Standing_Calf_Raises',
  'leg-extension': 'Leg_Extensions',
  'seated-calf-raise': 'Seated_Calf_Raise',
  // Bodyweight
  'pull-up': 'Pullups',
  dip: 'Parallel_Bar_Dip',
  'hanging-leg-raise': 'Hanging_Leg_Raise',
  plank: 'Plank',
  'side-plank': 'Side_Bridge',
  'wall-sit': null,
  'hollow-body-hold': null,
  'bodyweight-squat': 'Bodyweight_Squat',
  'push-up': 'Pushups',
  'glute-bridge': 'Butt_Lift_Bridge',
  superman: 'Superman',
  'bodyweight-reverse-lunge': null,
  'pike-push-up': null,
  'single-leg-glute-bridge': 'Single_Leg_Glute_Bridge',
  'dead-bug': 'Dead_Bug',
  'bodyweight-split-squat': null,
  'close-grip-push-up': 'Push-Ups_-_Close_Triceps_Position',
  'bird-dog': null,
};

const EQUIPMENT: Readonly<Record<string, LibraryEquipment>> = {
  barbell: 'barbell',
  'e-z curl bar': 'ez_bar',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  kettlebells: 'kettlebell',
  bands: 'band',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'exercise_ball',
  'foam roll': 'foam_roller',
  'body only': 'bodyweight',
  other: 'other',
};

/** free-exercise-db muscles that map straight onto one of GymHound's. Shoulders depend on the movement. */
const MUSCLE: Readonly<Record<string, Muscle>> = {
  abdominals: 'abs',
  quadriceps: 'quads',
  'middle back': 'upper_back',
  'lower back': 'lower_back',
  abductors: 'glutes',
  neck: 'traps',
  hamstrings: 'hamstrings',
  adductors: 'adductors',
  calves: 'calves',
  glutes: 'glutes',
  traps: 'traps',
  forearms: 'forearms',
  biceps: 'biceps',
  triceps: 'triceps',
  lats: 'lats',
  chest: 'chest',
};

const lower = (e: FedbExercise) => e.name.toLowerCase();

/** The equipment (R85): free-exercise-db's kinds one to one; body only and none are bodyweight. */
export function mapEquipment(e: FedbExercise): LibraryEquipment {
  if (e.equipment === null) return 'bodyweight';
  const equipment = EQUIPMENT[e.equipment];
  if (!equipment) throw new Error(`Unknown free-exercise-db equipment "${e.equipment}" on ${e.id}`);
  return equipment;
}

/**
 * Which delt a "shoulders" exercise works (R85): rear-delt moves (rear, reverse flyes, face pulls, pull-aparts) the
 * rear; lateral raises and upright rows the side; front raises the front; other raises the side; then pushes the
 * front and pulls the rear.
 */
function deltFor(e: FedbExercise): Muscle {
  const name = lower(e);
  if (/\brear\b|reverse fl|back fl|face pull|pull apart/.test(name)) return 'rear_delts';
  if (/lateral|upright/.test(name)) return 'side_delts';
  if (/\bfront\b/.test(name) && /raise/.test(name)) return 'front_delts';
  if (/raise/.test(name) && !/press|\bpush\b|\bpull\b|\brow\b/.test(name)) return 'side_delts';
  return e.force === 'pull' ? 'rear_delts' : 'front_delts';
}

/** Maps free-exercise-db muscle names onto GymHound's (R85), deduped, in their order. */
export function mapMuscles(names: readonly string[], e: FedbExercise): Muscle[] {
  const out: Muscle[] = [];
  for (const name of names) {
    const muscle = name === 'shoulders' ? deltFor(e) : MUSCLE[name];
    if (!muscle) throw new Error(`Unknown free-exercise-db muscle "${name}" on ${e.id}`);
    if (!out.includes(muscle)) out.push(muscle);
  }
  return out;
}

/** Cardio measured over a distance: runs, walks, rows, rides and the machines for them. */
const DISTANCE_CARDIO = /\brun|\bjog|\bwalk|\brow|\bbike|cycl|elliptical|treadmill/;
/** Strongman events done over a distance or a time with a load: carries, walks and sleds. */
const LOADED_LOCOMOTION = /carry|walk|yoke|sled|drag|push/;
/** Moves done with your own body whose free-exercise-db equipment is "other" (bars, rings, straps, a rope). */
const BODYWEIGHT_MOVE =
  /bodyweight|\bdips?\b|\bchin|pull[- ]?ups?\b|muscle up|push-?ups?\b|suspended|inverted row|rope climb|parallel bars|hyperextension|ab roller/;
/** Conditioning done for time whatever the equipment. */
const TIMED_MOVE = /battling ropes|balance board/;

/**
 * How a set is logged (R85): stretches, static holds, battling ropes and the balance board are timed; distance
 * cardio is distance and time, other cardio timed; strongman carries, walks and sleds are weight and time; assisted
 * moves (machine or band) are assisted; bodyweight strength and plyometrics (including those on an exercise ball,
 * and dips, chins, rings, straps and plyometrics whose equipment is "other") are bodyweight plus; everything else is
 * weighted.
 */
export function mapLoggingType(e: FedbExercise): LoggingType {
  const name = lower(e);
  if (e.category === 'stretching' || e.force === 'static' || TIMED_MOVE.test(name)) return 'timed';
  if (e.category === 'cardio') return DISTANCE_CARDIO.test(name) ? 'distance_time' : 'timed';
  if (e.category === 'strongman' && LOADED_LOCOMOTION.test(name)) return 'weighted_time';
  if (/assist/.test(name)) return 'assisted';
  const equipment = mapEquipment(e);
  if (e.category === 'strength' || e.category === 'plyometrics') {
    if (equipment === 'bodyweight' || equipment === 'exercise_ball') return 'bodyweight_plus';
    if (equipment === 'other' && (e.category === 'plyometrics' || BODYWEIGHT_MOVE.test(name))) return 'bodyweight_plus';
  }
  return 'weighted';
}

const LEG_MUSCLES: readonly string[] = ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'];
const VERTICAL_PUSH = /overhead|military|shoulder press|push press|jerk|handstand|arnold|bradford|\bdips?\b|log lift|circus bell/;
const PUSH = /press|push-?ups?\b|pushups|\bfl(y|ye|yes)\b|crossover|chest push|\bthrow\b/;

/**
 * The movement pattern (R85), from the name's keywords, then the mechanic, force and primary muscle; `isolation`
 * when nothing fits. Stretches and cardio are `isolation` (no strength pattern), carries and sleds `carry`, and
 * anything whose primary muscle is the abs `core`.
 */
export function mapPattern(e: FedbExercise): Pattern {
  const name = lower(e);
  const primary = e.primaryMuscles[0];
  if (e.category === 'stretching' || e.category === 'cardio') return 'isolation';
  if (mapLoggingType(e) === 'weighted_time' || /carry|farmer|yoke/.test(name)) return 'carry';
  if (primary === 'abdominals') return 'core';
  const hips = primary === 'glutes' || primary === 'hamstrings' || primary === 'lower back';
  if (hips && /bridge|hip thrust|hip lift|hyperextension|back extension|good morning|superman/.test(name)) return 'hinge';
  if (e.mechanic === 'isolation') return 'isolation';
  if (/lunge|split squat|step[- ]?ups?\b|split jump|scissor/.test(name)) return 'lunge';
  if (/squat|leg press|hack|thruster|pistol/.test(name)) return 'squat';
  if (/deadlift|good morning|romanian|stiff.leg|hip thrust|swing|pull.?through|clean|snatch|glute.?ham/.test(name)) return 'hinge';
  if (/pulldown|pull-down|pull[- ]?ups?\b|pullups|\bchin|muscle.?up|rope climb|upright/.test(name)) return 'vertical_pull';
  if (/\brows?\b|face pull|pull apart|reverse fl|back fl|rear delt/.test(name)) return 'horizontal_pull';
  const legs = LEG_MUSCLES.includes(primary ?? '');
  if (legs && /jump|hop|bound|leap|skip/.test(name)) return 'squat';
  if (!legs && VERTICAL_PUSH.test(name)) return 'vertical_push';
  if (!legs && PUSH.test(name)) return primary === 'shoulders' ? 'vertical_push' : 'horizontal_push';
  if (primary === 'quadriceps') return 'squat';
  if (hips) return 'hinge';
  if (e.force === 'pull' && primary === 'lats') return 'vertical_pull';
  if (e.force === 'pull' && (primary === 'middle back' || primary === 'shoulders')) return 'horizontal_pull';
  if (e.force === 'push' && primary === 'shoulders') return 'vertical_push';
  if (e.force === 'push' && (primary === 'chest' || primary === 'triceps')) return 'horizontal_push';
  return 'isolation';
}

/** A library exercise's id: `fedb-` and the source id in lower case, each run of other characters one hyphen. */
export function libraryId(fedbId: string): string {
  const slug = fedbId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `fedb-${slug}`;
}

/**
 * The whole library (R84): the existing exercises exactly as they were (id, name, aliases, equipment, logging type,
 * pattern and muscles) with their source's steps, then every other free-exercise-db entry mapped, sorted by name
 * ignoring case. Throws on a link to a missing entry, an entry linked twice, or an id that comes out twice.
 */
export function buildLibrary(src: readonly FedbExercise[], legacy: readonly LegacyExercise[]): LibraryExercise[] {
  const byId = new Map(src.map((e) => [e.id, e]));
  const linked = new Set<string>();
  const out: LibraryExercise[] = [];

  for (const exercise of legacy) {
    if (!(exercise.id in LEGACY_SOURCE)) throw new Error(`No LEGACY_SOURCE entry for ${exercise.id}`);
    const sourceId = LEGACY_SOURCE[exercise.id] ?? null;
    let instructions: string[] = [];
    if (sourceId !== null) {
      const source = byId.get(sourceId);
      if (!source) throw new Error(`${exercise.id} is linked to ${sourceId}, which free-exercise-db does not have`);
      if (linked.has(sourceId)) throw new Error(`${sourceId} is linked to more than one existing exercise`);
      linked.add(sourceId);
      instructions = [...source.instructions];
    }
    out.push({
      id: exercise.id,
      sourceId,
      name: exercise.name,
      aliases: [...exercise.aliases],
      equipment: exercise.equipment,
      loggingType: exercise.loggingType,
      pattern: exercise.pattern,
      primaryMuscles: [...exercise.primaryMuscles],
      secondaryMuscles: [...exercise.secondaryMuscles],
      instructions,
    });
  }

  for (const e of src) {
    if (linked.has(e.id)) continue;
    const primaryMuscles = mapMuscles(e.primaryMuscles, e);
    out.push({
      id: libraryId(e.id),
      sourceId: e.id,
      name: e.name.trim(),
      aliases: [],
      equipment: mapEquipment(e),
      loggingType: mapLoggingType(e),
      pattern: mapPattern(e),
      primaryMuscles,
      secondaryMuscles: mapMuscles(e.secondaryMuscles, e).filter((m) => !primaryMuscles.includes(m)),
      instructions: [...e.instructions],
    });
  }

  const ids = new Set<string>();
  for (const e of out) {
    if (ids.has(e.id)) throw new Error(`Library id ${e.id} comes out twice`);
    ids.add(e.id);
  }

  const key = (e: LibraryExercise) => e.name.toLowerCase();
  return out.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
