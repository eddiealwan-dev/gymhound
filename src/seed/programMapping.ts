// The hand-written mapping from the owner's Program Library v2 (scripts/vendor/programs/gymhound_programs.json, spec
// §18.29) to GymHound's programs: catalog names to exercise ids (Appendix A), ladders (Appendix B), the custom rules
// (Appendix C), the special weeks (Appendix D), the card pictures (Appendix E) and the free list (R597).
// `buildPrograms` turns the JSON into the bundled `PROGRAMS`. Pure, with type-only imports, so
// scripts/build-programs.mjs can import it straight into Node (type stripping).
import type {
  AddSetRule,
  Credit,
  LadderRung,
  Program,
  ProgramDay,
  ProgramLevel,
  ProgramSlot,
  ProgramSource,
  ProgramWeek,
  RuleKind,
  WeeklyRule,
} from './programTypes';

/** A catalog entry that is never logged on its own and only carries muscle credit inside a metcon (R602). */
export type VolumeOnly = { volumeOnly: true };
const VOLUME_ONLY: VolumeOnly = { volumeOnly: true };

// ---------------------------------------------------------------------------------------------------------------------
// Appendix A: the catalog on library ids

/** The 56 catalog names that are a library exercise's name or an alias it already had. */
export const BY_NAME: Readonly<Record<string, string>> = {
  'Barbell back squat': 'barbell-back-squat',
  'Barbell bench press': 'barbell-bench-press',
  'Barbell row': 'barbell-row',
  'Lying leg curl': 'lying-leg-curl',
  'Face pull': 'face-pull',
  'Dumbbell curl': 'dumbbell-curl',
  'Overhead press': 'barbell-overhead-press',
  Deadlift: 'barbell-deadlift',
  'Lat pulldown': 'lat-pulldown',
  'Dumbbell lateral raise': 'dumbbell-lateral-raise',
  'Goblet squat': 'dumbbell-goblet-squat',
  'Dumbbell bench press': 'dumbbell-bench-press',
  'One-arm dumbbell row': 'dumbbell-one-arm-row',
  'Dumbbell Romanian deadlift': 'dumbbell-romanian-deadlift',
  'Dumbbell standing calf raise': 'dumbbell-standing-calf-raise',
  'Bulgarian split squat': 'dumbbell-bulgarian-split-squat',
  'Seated dumbbell shoulder press': 'dumbbell-seated-shoulder-press',
  'Chest-supported dumbbell row': 'dumbbell-chest-supported-row',
  'Dumbbell flyes': 'fedb-dumbbell-flyes',
  'Dumbbell reverse fly': 'dumbbell-reverse-fly',
  'Overhead dumbbell triceps extension': 'dumbbell-overhead-triceps-extension',
  'Dumbbell reverse lunge': 'dumbbell-reverse-lunge',
  'Incline dumbbell press': 'incline-dumbbell-press',
  'Bent over two-dumbbell row': 'fedb-bent-over-two-dumbbell-row',
  'Hammer curl': 'dumbbell-hammer-curl',
  // The library writes it "Band pull apart".
  'Band pull-apart': 'fedb-band-pull-apart',
  'Romanian deadlift': 'barbell-romanian-deadlift',
  'Leg press': 'leg-press',
  'Pull-up': 'pull-up',
  'Barbell curl': 'barbell-curl',
  'Standing calf raise': 'standing-calf-raise',
  'Hanging leg raise': 'hanging-leg-raise',
  'Seated cable row': 'seated-cable-row',
  'Cable lateral raise': 'cable-lateral-raise',
  'Overhead cable triceps extension': 'cable-overhead-triceps-extension',
  'Dumbbell walking lunge': 'dumbbell-walking-lunge',
  'Leg extension': 'leg-extension',
  'Seated leg curl': 'fedb-seated-leg-curl',
  'Seated calf raise': 'seated-calf-raise',
  'Triceps pushdown': 'cable-triceps-pushdown',
  'Hip thrust': 'barbell-hip-thrust',
  Dip: 'dip',
  'Incline dumbbell curl': 'fedb-incline-dumbbell-curl',
  'Front squat': 'barbell-front-squat',
  'One-arm kettlebell row': 'fedb-one-arm-kettlebell-row',
  'Cable crossover': 'fedb-cable-crossover',
  Plank: 'plank',
  'Weighted pull-up': 'pull-up',
  'EZ-bar skullcrusher': 'fedb-ez-bar-skullcrusher',
  // A metcon element only; the library's own push-up.
  'Push-up': 'push-up',
  // A metcon element only; an alias of the bodyweight squat.
  'Air squat': 'bodyweight-squat',
  'Push press': 'fedb-push-press',
  Snatch: 'fedb-snatch',
  'Clean and jerk': 'fedb-clean-and-jerk',
  'Incline bench press': 'barbell-incline-bench-press',
  'Chin-up': 'fedb-chin-up',
};

/** The 17 catalog names that match an existing exercise by an alias the seed adds (R606, `NEW_ALIASES`). */
export const BY_NEW_ALIAS: Readonly<Record<string, string>> = {
  'Close-grip bench press': 'fedb-close-grip-barbell-bench-press',
  'Dumbbell skull crusher': 'fedb-lying-dumbbell-tricep-extension',
  'Band lateral raise': 'fedb-lateral-raise-with-bands',
  'Chest-supported row': 'dumbbell-chest-supported-row',
  'Double kettlebell front squat': 'fedb-front-squats-with-two-kettlebells',
  'Kettlebell gorilla row': 'fedb-alternating-kettlebell-row',
  'Kettlebell floor press': 'fedb-one-arm-kettlebell-floor-press',
  // #8, timed. #19's distance carry is its own exercise (SLOT_EXERCISE, F3).
  "Farmer's carry": 'fedb-farmers-walk',
  'Turkish get-up': 'fedb-kettlebell-turkish-get-up-squat-style',
  'Kettlebell single-leg Romanian deadlift': 'fedb-kettlebell-one-legged-deadlift',
  'Back extension': 'fedb-hyperextensions-back-extensions',
  'Weighted dip': 'dip',
  'Weighted chin-up': 'fedb-chin-up',
  'Log clean and press': 'fedb-log-lift',
  'Log clean and press (speed)': 'fedb-log-lift',
  'Ab wheel rollout': 'fedb-ab-roller',
  'Atlas stone load': 'fedb-atlas-stones',
};

/** Strength Peaking's top set and back-off sets: two slots of one exercise on a day (R625). */
export const TOP_SET_AND_BACK_OFF: Readonly<Record<string, string>> = {
  'Barbell back squat (top set)': 'barbell-back-squat',
  'Barbell back squat (back-off sets)': 'barbell-back-squat',
  'Barbell bench press (top set)': 'barbell-bench-press',
  'Barbell bench press (back-off sets)': 'barbell-bench-press',
  'Deadlift (top set)': 'barbell-deadlift',
  'Deadlift (back-off sets)': 'barbell-deadlift',
};

/**
 * The 11 volume-only entries: 9 metcon elements no library exercise matches, and Run and Row (erg) as metcon elements.
 * Ring row and Chest-to-bar pull-up are also ladder rungs; as elements they only carry credit.
 */
export const VOLUME_ONLY_NAMES: readonly string[] = [
  'Goblet squat (metcon)',
  'Thruster',
  'Ring row',
  'Pull-up (scaled as needed)',
  'Wall ball',
  'Toes-to-bar (scaled as needed)',
  'Burpee',
  'Dumbbell snatch',
  'Chest-to-bar pull-up',
  'Run',
  'Row (erg)',
];

/** The 46 catalog names on Appendix A's new exercises (the other two new ones are SLOT_EXERCISE's). */
export const NEW_BY_CATALOG: Readonly<Record<string, string>> = {
  'Double kettlebell clean and press': 'double-kettlebell-clean-and-press',
  'Kettlebell swing': 'kettlebell-swing',
  'Kettlebell reverse fly': 'kettlebell-reverse-fly',
  'Armor Building Complex (2 cleans / 1 press / 3 front squats)': 'armor-building-complex',
  'Kettlebell curl': 'kettlebell-curl',
  'Side-lying hip abduction': 'side-lying-hip-abduction',
  'Paused back squat': 'paused-back-squat',
  'Heels-elevated goblet squat': 'heels-elevated-goblet-squat',
  'Dumbbell hip thrust': 'dumbbell-hip-thrust',
  'Dumbbell single-leg Romanian deadlift': 'dumbbell-single-leg-romanian-deadlift',
  'Leg swings': 'leg-swing',
  '90/90 hip switch': 'ninety-ninety-hip-switch',
  'Couch stretch': 'couch-stretch',
  'Knee-to-wall ankle rock': 'knee-to-wall-ankle-rock',
  'Cossack squat': 'cossack-squat',
  'Deep goblet squat hold': 'deep-goblet-squat-hold',
  'Shoulder CARs': 'shoulder-cars',
  'Thoracic open book': 'thoracic-open-book',
  'Wall slide': 'wall-slide',
  'Band dislocate': 'band-dislocate',
  'Dumbbell pullover stretch': 'dumbbell-pullover-stretch',
  'Dead hang': 'dead-hang',
  'Hip CARs': 'hip-cars',
  'Jefferson curl': 'jefferson-curl',
  'Dumbbell RDL stretch hold': 'dumbbell-rdl-stretch-hold',
  'Pigeon stretch': 'pigeon-stretch',
  'Band face pull': 'band-face-pull',
  'Single-leg calf raise': 'single-leg-calf-raise',
  'Freestanding handstand practice': 'freestanding-handstand-practice',
  'Yoke carry': 'yoke-carry',
  'Sandbag carry': 'sandbag-carry',
  // The library's Sled push logs weight and time; #19's is weight and distance (F3, R607).
  'Sled push': 'sled-push-distance',
  'Bike intervals': 'bike-intervals',
  'Incline treadmill walk': 'incline-treadmill-walk',
  'Rower intervals': 'rower-intervals',
  'Easy run': 'easy-run',
  'Interval run': 'interval-run',
  'Tempo run': 'tempo-run',
  'Long run': 'long-run',
  'Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run': 'metcon-amrap-10-squat-pushup-run',
  'Metcon B · 3 rounds for time: 200 m row, 10 thrusters, 10 ring rows (cap 12 min)': 'metcon-3-rounds-row-thruster-ring-row',
  'Metcon C · AMRAP 15 min: 5 pull-ups (scaled), 10 push-ups, 15 air squats': 'metcon-amrap-15-cindy-scaled',
  'Metcon · AMRAP 12 min: 10 wall balls, 10 toes-to-bar, 12-cal row': 'metcon-amrap-12-wallball-t2b-row',
  'Metcon · 21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)': 'metcon-21-15-9-thruster-pullup',
  'Metcon · AMRAP 25 min: 400 m run, 15 wall balls, 10 burpees': 'metcon-amrap-25-run-wallball-burpee',
  'Metcon · 5 rounds for time: 12 dumbbell snatches (alternating), 10 chest-to-bar pull-ups (cap 15 min)': 'metcon-5-rounds-db-snatch-c2b',
};

/** The three ring ladders (#16): no discrete rungs (lower the rings to progress), so one exercise each (R618, F10). */
export const RING_LADDERS: Readonly<Record<string, string>> = {
  'Ring push-up ladder': 'ring-push-up',
  'Ring biceps curl ladder': 'ring-biceps-curl',
  'Ring triceps extension ladder': 'ring-triceps-extension',
};

/** Every catalog name that isn't a ladder of rungs: an exercise id, or volume-only (R602, Appendix A). */
export const CATALOG_TO_EXERCISE: Readonly<Record<string, string | VolumeOnly>> = {
  ...BY_NAME,
  ...BY_NEW_ALIAS,
  ...TOP_SET_AND_BACK_OFF,
  ...NEW_BY_CATALOG,
  ...RING_LADDERS,
  ...Object.fromEntries(VOLUME_ONLY_NAMES.map((name) => [name, VOLUME_ONLY])),
};

/**
 * Slots, keyed `${number}:${catalogName}`, that log a different exercise than the catalog name does elsewhere: #19's
 * Farmer's carry is distance, #8's is time (F3); #18 logs Toes-to-bar as a strength slot, while the metcons only take
 * its credit (F2).
 */
export const SLOT_EXERCISE: Readonly<Record<string, string>> = {
  "19:Farmer's carry": 'farmers-carry-distance',
  '18:Toes-to-bar (scaled as needed)': 'toes-to-bar',
};

// ---------------------------------------------------------------------------------------------------------------------
// Appendix B: ladders

type RungSpec = string | { id: string; timed?: boolean; min?: number; max?: number; lb?: number; note?: string };

// A hold rung inside a reps ladder uses its own range (R618).
const HOLD = (id: string): RungSpec => ({ id, timed: true, min: 10, max: 30 });
const WEIGHTED = (id: string, lb: number): RungSpec => ({ id, lb });
const NO_LOAD = (id: string): RungSpec => ({ id, note: 'No load' });

/** A ladder's rungs at the slot's range, unless a rung gives its own. `timedLadder`: every rung is a hold. */
function ladder(min: number, max: number, specs: readonly RungSpec[], timedLadder = false): readonly LadderRung[] {
  return specs.map((spec) => {
    const s = typeof spec === 'string' ? { id: spec } : spec;
    return {
      exerciseId: s.id,
      timed: s.timed ?? timedLadder,
      repMin: s.min ?? min,
      repMax: s.max ?? max,
      weightedIncrementLb: s.lb ?? null,
      note: s.note ?? null,
    };
  });
}

const HANGING_KNEE_RAISE = ['lying-knee-tuck', 'lying-straight-leg-raise', 'hanging-knee-raise', 'hanging-bent-leg-raise', 'hanging-leg-raise', 'toes-to-bar'];
const MUSCLE_UP = ['explosive-pull-up-and-dip', 'band-assisted-muscle-up', 'negative-muscle-up', 'fedb-muscle-up', 'ring-muscle-up'];
const HANDSTAND_PUSH_UP = ['pike-push-up', 'elevated-pike-push-up', 'partial-wall-handstand-push-up', 'fedb-handstand-push-ups', 'deficit-wall-handstand-push-up'];
const L_SIT = ['tuck-l-sit', 'one-leg-l-sit', 'l-sit', 'v-sit'];

/**
 * Appendix B's ladders, keyed `${number}:${catalogName}` (rung lists are per program where the documents differ, F8).
 * The slot logs the current rung's exercise; a first run starts on the first rung.
 */
export const LADDERS: Readonly<Record<string, readonly LadderRung[]>> = {
  // Calisthenics Foundations (#3). The pull-up ladder starts on the library's scapular pull-up (ruling R-t1a).
  '3:Pull-up ladder': ladder(5, 8, ['fedb-scapular-pull-up', HOLD('arch-hang'), 'negative-pull-up', 'fedb-band-assisted-pull-up', 'pull-up', WEIGHTED('pull-up', 5)]),
  '3:Squat ladder': ladder(5, 8, [
    'assisted-squat',
    'bodyweight-squat',
    'bodyweight-split-squat',
    NO_LOAD('dumbbell-bulgarian-split-squat'),
    'shrimp-squat',
    WEIGHTED('dumbbell-bulgarian-split-squat', 10),
  ]),
  '3:Dip ladder': ladder(5, 8, [HOLD('support-hold'), 'negative-dip', 'dip', WEIGHTED('dip', 5)]),
  '3:Hinge ladder': ladder(5, 8, [
    'glute-bridge',
    'single-leg-glute-bridge',
    'bodyweight-romanian-deadlift',
    NO_LOAD('dumbbell-single-leg-romanian-deadlift'),
    'hamstring-walkout',
    'band-assisted-nordic-curl',
    'eccentric-nordic-curl',
    'fedb-natural-glute-ham-raise',
    WEIGHTED('fedb-natural-glute-ham-raise', 10),
  ]),
  '3:Row ladder': ladder(5, 8, [
    'vertical-row',
    'incline-row',
    'fedb-inverted-row',
    { id: 'wide-grip-inverted-row', note: "Day B's rear-delt rung" },
    'feet-elevated-inverted-row',
    WEIGHTED('feet-elevated-inverted-row', 5),
  ]),
  // The intermediate rungs of the full push-up ladder are not in #3.
  '3:Push-up ladder': ladder(5, 8, ['wall-push-up', 'fedb-incline-push-up', 'knee-push-up', 'push-up', 'close-grip-push-up', 'fedb-decline-push-up']),
  '3:Plank ladder': ladder(20, 60, [
    { id: 'plank', timed: true },
    { id: 'fedb-ab-roller', min: 8, max: 12, note: 'Kneeling' },
    { id: 'standing-ab-wheel-rollout', min: 8, max: 12 },
  ]),
  '3:Hanging knee raise ladder': ladder(8, 12, HANGING_KNEE_RAISE),
  // Kettlebell Strength & Conditioning (#8): the hypertrophy range.
  '8:Push-up ladder (hypertrophy range)': ladder(8, 15, ['push-up', 'fedb-decline-push-up', 'deficit-push-up', 'archer-push-up']),
  // Advanced Calisthenics (#16)
  '16:Front lever ladder': ladder(5, 15, ['tuck-front-lever', 'advanced-tuck-front-lever', 'one-leg-front-lever', 'straddle-front-lever', 'front-lever'], true),
  '16:Front lever row ladder': ladder(5, 8, ['tuck-front-lever-row', 'advanced-tuck-front-lever-row', 'straddle-front-lever-row']),
  '16:Pistol squat ladder': ladder(5, 8, ['box-pistol-squat', 'pistol-squat', WEIGHTED('pistol-squat', 5)]),
  '16:Nordic curl ladder': ladder(4, 8, ['eccentric-nordic-curl', 'band-assisted-nordic-curl', 'fedb-natural-glute-ham-raise', WEIGHTED('fedb-natural-glute-ham-raise', 10)]),
  '16:L-sit ladder': ladder(10, 30, L_SIT, true),
  '16:Planche ladder': ladder(5, 15, ['planche-lean', 'tuck-planche', 'advanced-tuck-planche', 'straddle-planche'], true),
  '16:Handstand push-up ladder': ladder(4, 8, HANDSTAND_PUSH_UP),
  '16:Muscle-up ladder': ladder(3, 6, MUSCLE_UP),
  '16:Back lever ladder': ladder(5, 15, ['tuck-back-lever', 'advanced-tuck-back-lever', 'half-lay-back-lever', 'straddle-back-lever', 'back-lever'], true),
  // CrossFit Foundations (#17): CrossFit's scaling chains, kipping left out.
  '17:Pull-up ladder': ladder(5, 8, ['ring-row', 'fedb-band-assisted-pull-up', 'negative-pull-up', 'pull-up', 'chest-to-bar-pull-up']),
  '17:Push-up ladder': ladder(5, 8, ['fedb-incline-push-up', 'knee-push-up', 'push-up', 'deficit-push-up']),
  '17:Hanging knee raise ladder': ladder(8, 12, HANGING_KNEE_RAISE),
  '17:Box jump ladder': ladder(5, 8, [
    'box-step-up',
    { id: 'fedb-front-box-jump', note: '12–16 in' },
    { id: 'fedb-front-box-jump', note: '20 in / 24 in, step down' },
  ]),
  // CrossFit Performance (#18)
  '18:Muscle-up ladder': ladder(2, 5, MUSCLE_UP),
  '18:Handstand push-up ladder': ladder(4, 8, HANDSTAND_PUSH_UP),
  '18:L-sit ladder': ladder(10, 30, L_SIT, true),
};

// ---------------------------------------------------------------------------------------------------------------------
// Appendix C: custom rules

export type CustomRule = Pick<ProgramSlot, 'ruleKind' | 'addSet' | 'weekly' | 'manualText' | 'sessionsToRaise' | 'incrementLb'>;

function rule(ruleKind: RuleKind, rest: Partial<CustomRule> = {}): CustomRule {
  return { ruleKind, addSet: null, weekly: null, manualText: null, sessionsToRaise: 1, incrementLb: 0, ...rest };
}
const manual = (text: string) => rule('manual', { manualText: text });
const load = (lb: number, sessionsToRaise: 1 | 2 = 1) => rule('load', { incrementLb: lb, sessionsToRaise });
const addSet = (addSetRule: AddSetRule, incrementLb = 0) => rule('add_set', { addSet: addSetRule, incrementLb });
const weekly = (weeklyRule: WeeklyRule) => rule('weekly_seconds', { weekly: weeklyRule });
const seconds = (startS: number, stepS: number, capS: number): WeeklyRule => ({ kind: 'seconds', startS, stepS, capS });

const MOBILITY_REPS = 'Reps, then bigger range or +2.5 lb';
const MOBILITY_HOLD = '+5 s, then load +2.5–5 lb or deeper range';
const RINGS = 'Top of the range on every set: lower the rings or raise your feet, and start again at the bottom.';
const METCON = rule('metcon');

/**
 * Appendix C: the rule of each `custom` slot (R610), keyed `${number}:${catalogName}`; where one program gives a
 * catalog name two custom rules, the key adds `:${the JSON's rule}` (#20's Easy run: weekly on Tuesday, a fixed
 * warm-up or cool-down otherwise). Also the three ring ladders' manual rule (R618, F10).
 */
export const CUSTOM_RULES: Readonly<Record<string, CustomRule>> = {
  // Kettlebell Strength & Conditioning (#8)
  "8:Farmer's carry": load(8),
  '8:Armor Building Complex (2 cleans / 1 press / 3 front squats)': addSet({ capSets: 8, then: { kind: 'load', lb: 8, backToSets: 5 } }, 8),
  // Lean Out (#9): the documents give the intervals no cap; two more sets than they start with (F9).
  '9:Bike intervals': addSet({ capSets: 8, then: { kind: 'seconds', step: 5 } }),
  '9:Rower intervals': addSet({ capSets: 10, then: { kind: 'seconds', step: 5 } }),
  '9:Incline treadmill walk': weekly(seconds(900, 60, 1800)),
  // Mobility for Lifters (#14): the JSON's words, a hold for the timed stretches, manual for the loaded holds (R621).
  '14:90/90 hip switch': manual(MOBILITY_REPS),
  '14:Couch stretch': rule('hold'),
  '14:Knee-to-wall ankle rock': manual(MOBILITY_REPS),
  '14:Cossack squat': manual(MOBILITY_REPS),
  '14:Deep goblet squat hold': manual(MOBILITY_HOLD),
  '14:Shoulder CARs': manual(MOBILITY_REPS),
  '14:Thoracic open book': manual(MOBILITY_REPS),
  '14:Wall slide': manual(MOBILITY_REPS),
  '14:Band dislocate': manual(MOBILITY_REPS),
  '14:Dumbbell pullover stretch': manual(MOBILITY_HOLD),
  '14:Dead hang': rule('hold'),
  '14:Hip CARs': manual(MOBILITY_REPS),
  '14:Jefferson curl': manual(MOBILITY_REPS),
  '14:Dumbbell RDL stretch hold': manual(MOBILITY_HOLD),
  '14:Pigeon stretch': rule('hold'),
  // Advanced Calisthenics (#16): the ring ladders.
  '16:Ring push-up ladder': manual(RINGS),
  '16:Ring biceps curl ladder': manual(RINGS),
  '16:Ring triceps extension ladder': manual(RINGS),
  // CrossFit Foundations (#17) and Performance (#18): beat the score twice, then load or scaling is the lifter's (R622).
  '17:Metcon A · AMRAP 10 min: 10 goblet squats, 10 push-ups (scaled), 200 m run': METCON,
  '17:Metcon B · 3 rounds for time: 200 m row, 10 thrusters, 10 ring rows (cap 12 min)': METCON,
  '17:Metcon C · AMRAP 15 min: 5 pull-ups (scaled), 10 push-ups, 15 air squats': METCON,
  '18:Metcon · AMRAP 12 min: 10 wall balls, 10 toes-to-bar, 12-cal row': METCON,
  '18:Metcon · 21-15-9 for time: thrusters (95/65 lb) and pull-ups (cap 8 min)': METCON,
  '18:Metcon · AMRAP 25 min: 400 m run, 15 wall balls, 10 burpees': METCON,
  '18:Metcon · 5 rounds for time: 12 dumbbell snatches (alternating), 10 chest-to-bar pull-ups (cap 15 min)': METCON,
  // Strongman Prep (#19): every run drop-free → the increment (R607, F18); the stone after two clean sessions (R623).
  '19:Yoke carry': load(10),
  "19:Farmer's carry": load(5),
  '19:Sandbag carry': load(5),
  '19:Sled push': load(25),
  '19:Atlas stone load': load(10, 2),
  // Hybrid Athlete (#20): targets follow the program week (R620).
  '20:Easy run': weekly(seconds(1500, 120, 2400)),
  '20:Easy run:None': weekly({ kind: 'fixed' }),
  '20:Interval run': weekly({ kind: 'sets_then_seconds', startSets: 6, capSets: 8, seconds: 180, stepS: 15 }),
  '20:Tempo run': weekly(seconds(1200, 120, 1800)),
  '20:Long run': weekly(seconds(3600, 300, 5400)),
};

/** Lean Out's finishers keep their full length in the deload (R617), keyed `${number}:${catalogName}`. */
export const DELOAD_EXEMPT: readonly string[] = ['9:Bike intervals', '9:Incline treadmill walk', '9:Rower intervals'];

/** Strength Peaking's top sets reset to 95% (its notes, R613, F13), keyed `${number}:${catalogName}`. */
export const TOP_SETS: readonly string[] = ['12:Barbell back squat (top set)', '12:Barbell bench press (top set)', '12:Deadlift (top set)'];
const TOP_SET_RESET_MULTIPLIER = 0.95;

// ---------------------------------------------------------------------------------------------------------------------
// Appendix D: program weeks

const week = (w: number, kind: ProgramWeek['kind'], note = ''): ProgramWeek => {
  const halfSets = kind === 'deload' || kind === 'taper' || kind === 'lighter' || kind === 'transition';
  const holds = kind !== 'note';
  return { week: w, kind, halfSets, holds, runShare: kind === 'lighter' ? 0.6 : 1, note };
};
const notes = (from: number, to: number, note: string): ProgramWeek[] =>
  Array.from({ length: to - from + 1 }, (_, i) => week(from + i, 'note', note));

/**
 * Appendix D, transcribed (the JSON has the special weeks only as text, F7). Half-set weeks hold every weight;
 * test, mock meet and meet weeks hold at full sets; note weeks run the normal rules. Programs not listed have none.
 */
export const WEEK_PLANS: Readonly<Record<number, readonly ProgramWeek[]>> = {
  5: [week(10, 'deload')],
  6: [week(12, 'deload')],
  7: [week(10, 'deload')],
  9: [week(10, 'deload')],
  10: [week(8, 'deload')],
  11: [week(6, 'deload')],
  12: [
    ...notes(1, 4, 'Build: top sets heavy, back-off sets 8–10% lighter.'),
    week(5, 'taper', 'Taper: half the sets, top sets at full weight.'),
    week(6, 'test', 'Test week: work up to a single on squat, bench and deadlift. Skip the accessories.'),
  ],
  13: [week(10, 'deload')],
  15: [week(10, 'deload')],
  16: [week(5, 'deload'), week(10, 'deload')],
  17: [
    ...notes(1, 2, 'On-ramp: light loads. Stop each metcon at a pace you could hold for twice as long.'),
    week(8, 'note', "Retest week 1's metcons as benchmarks."),
  ],
  18: [week(8, 'transition', 'Transition: half the sets and metcon minutes, then retest the benchmark metcons.')],
  19: [
    ...notes(1, 4, 'Base: events at moderate loads.'),
    ...notes(5, 8, 'Build: events heavier, every contest event each week.'),
    week(9, 'mock_meet', 'Mock meet: a 4–5-event medley at near-contest weights on Thursday and Saturday, 15–20 min between events.'),
    week(10, 'note', 'Heavy week.'),
    week(11, 'taper', 'Taper: events at 60–70% of contest weight.'),
    week(12, 'meet', 'Meet week: light gym work early in the week, nothing heavy in the last 7–10 days.'),
  ],
  20: [week(4, 'lighter'), week(8, 'lighter'), week(12, 'lighter', 'Finish with a 5 km time trial and a rep-max test on the main lifts.')],
};

// ---------------------------------------------------------------------------------------------------------------------
// Appendix E: card pictures, and the free list

/**
 * Appendix E as settled by ruling R-t5d: each card's bundled free-exercise-db photo (frame 0 is the start photo, 1 the
 * end) and its VoiceOver movement (R632), the frame that shows the working position. Kept exactly in step with the copy
 * in scripts/build-program-pictures.mjs, which reads this one.
 */
export const PICTURES: Readonly<Record<number, Program['picture']>> = {
  1: { exerciseId: 'barbell-back-squat', frame: 1, label: 'Barbell back squat' },
  2: { exerciseId: 'dumbbell-bench-press', frame: 1, label: 'Dumbbell bench press' }, // the lockout, both dumbbells visible
  3: { exerciseId: 'pull-up', frame: 1, label: 'Pull-up' },
  4: { exerciseId: 'barbell-overhead-press', frame: 1, label: 'Overhead press' },
  5: { exerciseId: 'barbell-row', frame: 0, label: 'Barbell row' },
  6: { exerciseId: 'barbell-front-squat', frame: 1, label: 'Front squat' },
  7: { exerciseId: 'barbell-romanian-deadlift', frame: 0, label: 'Romanian deadlift' },
  8: { exerciseId: 'fedb-one-arm-kettlebell-swings', frame: 0, label: 'Kettlebell swing' },
  9: { exerciseId: 'fedb-recumbent-bike', frame: 0, label: 'Recumbent bike' },
  10: { exerciseId: 'glute-bridge', frame: 1, label: 'Glute bridge' },
  11: { exerciseId: 'barbell-bench-press', frame: 1, label: 'Bench press' },
  12: { exerciseId: 'barbell-deadlift', frame: 1, label: 'Deadlift' },
  13: { exerciseId: 'fedb-dumbbell-shoulder-press', frame: 1, label: 'Dumbbell shoulder press' }, // the lockout, both dumbbells overhead; the dumbbell squat photos show a logo
  14: { exerciseId: 'fedb-kneeling-hip-flexor', frame: 1, label: 'Kneeling hip flexor stretch' },
  15: { exerciseId: 'barbell-curl', frame: 1, label: 'Barbell curl' },
  16: { exerciseId: 'fedb-handstand-push-ups', frame: 0, label: 'Handstand push-up' }, // the lockout; nearest advanced move to a planche, which has no photo
  17: { exerciseId: 'fedb-push-press', frame: 1, label: 'Push press' },
  18: { exerciseId: 'fedb-snatch', frame: 0, label: 'Snatch' },
  19: { exerciseId: 'fedb-atlas-stones', frame: 1, label: 'Atlas stone' }, // the stone lifted to the lap
  20: { exerciseId: 'fedb-running-treadmill', frame: 1, label: 'Running on a treadmill' },
};

/** Free's five, in the owner's order, which Routines lists first (R597): the rest are Pro, listed by number. */
export const FREE_NUMBERS: readonly number[] = [1, 2, 4, 17, 14];

/** The groups a program's notes allow outside the 8–24 band (R629): the Minimalist Two-Day sits below 8 by design. */
export const VOLUME_BAND_EXEMPT: Readonly<Record<number, readonly string[]>> = {
  4: ['Chest', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings'],
};

// ---------------------------------------------------------------------------------------------------------------------
// Building

/** "A · Grind" → "a-grind". */
export function daySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** `${programId}:${daySlug}:${exerciseId}`, with `@2`, `@3`… for a repeat of one exercise on a day (R625). */
export function slotIds(programId: string, slug: string, exerciseIds: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return exerciseIds.map((id) => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return `${programId}:${slug}:${id}${n === 1 ? '' : `@${n}`}`;
  });
}

/** The docx's "Why it works" bullets, which must join with single spaces into the JSON's paragraph exactly (R596). */
export function whyBullets(paragraph: string, docxBullets: readonly string[]): string[] {
  if (docxBullets.length === 0 || docxBullets.join(' ') !== paragraph) {
    throw new Error(`The docx's "Why it works" bullets don't join into the JSON's paragraph: ${paragraph.slice(0, 60)}…`);
  }
  return [...docxBullets];
}

type LibraryEntry = { id: string; name: string; aliases: readonly string[] };

/** The exercises a program may log: the library with the aliases the seed adds (R606), then the new ones (R602). */
export function programLibrary(
  library: readonly LibraryEntry[],
  added: readonly { id: string; name: string }[],
  newAliases: Readonly<Record<string, readonly string[]>>,
): LibraryEntry[] {
  return [
    ...library.map((e) => ({ id: e.id, name: e.name, aliases: [...e.aliases, ...(newAliases[e.id] ?? [])] })),
    ...added.map((e) => ({ id: e.id, name: e.name, aliases: [] })),
  ];
}

type JsonCredit = { primary: string[]; secondary: string[]; type: string };
type JsonSlot = {
  exercise: string;
  type: string;
  sets: number;
  target: { min: number; max: number; unit: string; text: string };
  increment: string;
  increment_rule: { type: string; amount_lb?: number; amount_kg?: number; amount?: number; halve_after_first_stall?: boolean; rule?: string };
  counts_toward_volume: boolean;
  notes: string;
  metcon?: { format: string; work_minutes: number; elements: string[]; score: string };
};
type JsonProgram = {
  id: string;
  number: number;
  name: string;
  level: string;
  goal: string;
  days_per_week: number;
  weeks: number;
  equipment: string;
  schedule: string;
  deload_and_special_weeks: string;
  lineage: string;
  why_it_works: string;
  progression_notes: string;
  after_this_program: string;
  volume_checked: boolean;
  expected_weekly_volume: Record<string, { hard_sets: number; days_per_week: number } | number> | null;
  days: { name: string; exercises: JsonSlot[] }[];
  source_ids: number[];
};
type JsonLibrary = {
  rules: { stall: { consecutive_misses_to_reset: Record<string, number>; reset_multiplier: number } };
  exercise_catalog: Record<string, JsonCredit>;
  programs: JsonProgram[];
  sources: ProgramSource[];
};

const TARGET_UNITS: Readonly<Record<string, ProgramSlot['targetUnit']>> = {
  reps: 'reps',
  // Turkish get-up's "1+1": logged as reps, the note says per side (F14).
  reps_per_side: 'reps',
  seconds: 'seconds',
  rounds: 'rounds',
  minutes: 'minutes',
  feet: 'feet',
  yards: 'yards',
};

const LEVELS: readonly ProgramLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const DOCUMENT_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs'];

const sameName = (a: string, b: string) => {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return norm(a) === norm(b);
};

/**
 * The twenty programs (R596) and the 88 sources, from the vendored JSON, the exercises a program may log
 * (`programLibrary`) and the docx's "Why it works" bullets by JSON program id. Throws, naming the entry, on anything
 * the mapping can't place: an unknown catalog name, an exercise id the library lacks, a custom rule without a
 * transcription, a missing picture, or bullets that don't join into the paragraph.
 */
export function buildPrograms(
  json: unknown,
  library: readonly LibraryEntry[],
  why: Readonly<Record<string, readonly string[]>>,
): { programs: Program[]; sources: ProgramSource[] } {
  const source = json as JsonLibrary;
  const names = new Map(library.map((e) => [e.id, e.name]));
  const known = (id: string, where: string): string => {
    if (!names.has(id)) throw new Error(`${where}: the exercise ${id} is not in the library`);
    return id;
  };
  const credit = (name: string, where: string): Credit => {
    const c = source.exercise_catalog[name];
    if (!c) throw new Error(`${where}: ${name} is not in the exercise catalog`);
    return { primary: [...c.primary], secondary: [...c.secondary] };
  };

  const programs = source.programs.map((p): Program => {
    const programId = `program-${p.id}`;
    if (!LEVELS.includes(p.level as ProgramLevel)) throw new Error(`${p.name}: unknown level ${p.level}`);
    const missesToReset = source.rules.stall.consecutive_misses_to_reset[p.level];
    if (missesToReset !== 2 && missesToReset !== 3) throw new Error(`${p.name}: misses to a reset must be 2 or 3`);
    const picture = PICTURES[p.number];
    if (!picture) throw new Error(`${p.name}: no picture`);
    known(picture.exerciseId, `${p.name}'s picture`);
    const bullets = why[p.id];
    if (!bullets) throw new Error(`${p.name}: no "Why it works" bullets`);

    const days = p.days.map((d): ProgramDay => {
      const slug = daySlug(d.name);
      const slots = d.exercises.map((e, index) => buildSlot(p, e, index));
      const ids = slotIds(programId, slug, slots.map((s) => s.exerciseId));
      return { slug, name: d.name, slots: slots.map((s, i) => ({ ...s, id: ids[i] })) };
    });

    const expected = p.expected_weekly_volume ?? {};
    const expectedVolume: Record<string, { hardSets: number; daysPerWeek: number }> = {};
    for (const group of DOCUMENT_GROUPS) {
      const v = expected[group];
      if (v !== undefined && typeof v !== 'number') expectedVolume[group] = { hardSets: v.hard_sets, daysPerWeek: v.days_per_week };
    }
    const delt = (key: string) => {
      const v = expected[key];
      return typeof v === 'number' ? v : 0;
    };

    return {
      id: programId,
      jsonId: p.id,
      number: p.number,
      name: p.name,
      level: p.level as ProgramLevel,
      goal: p.goal,
      daysPerWeek: p.days_per_week,
      weeks: p.weeks,
      equipment: p.equipment,
      free: FREE_NUMBERS.includes(p.number),
      schedule: p.schedule,
      specialWeeksText: p.deload_and_special_weeks,
      lineage: p.lineage,
      whyItWorks: whyBullets(p.why_it_works, bullets),
      progressionNotes: p.progression_notes,
      afterThisProgram: p.after_this_program,
      volumeChecked: p.volume_checked,
      volumeBandExempt: [...(VOLUME_BAND_EXEMPT[p.number] ?? [])],
      expectedVolume,
      expectedDelts: { side: delt('side_delts'), rear: delt('rear_delts'), front: delt('front_delts') },
      sourceIds: [...p.source_ids],
      weekPlan: [...(WEEK_PLANS[p.number] ?? [])],
      missesToReset,
      reactiveDeload: p.number === 11,
      picture: { ...picture },
      days,
    };
  });

  function buildSlot(p: JsonProgram, e: JsonSlot, index: number): ProgramSlot {
    const key = `${p.number}:${e.exercise}`;
    const where = `#${p.number} ${p.name}, ${e.exercise}`;
    const r = e.increment_rule;

    // The exercise the slot logs, and its ladder.
    const rungs = LADDERS[key] ?? null;
    const mapped = SLOT_EXERCISE[key] ?? CATALOG_TO_EXERCISE[e.exercise];
    let exerciseId: string;
    if (rungs) {
      for (const rung of rungs) known(rung.exerciseId, where);
      exerciseId = rungs[0].exerciseId;
    } else if (typeof mapped === 'string') {
      exerciseId = known(mapped, where);
    } else {
      throw new Error(`${where}: the catalog name has no exercise, ladder or slot mapping`);
    }

    // The rule (R610, Appendix C).
    const custom = CUSTOM_RULES[`${key}:${r.rule}`] ?? CUSTOM_RULES[key];
    let ruled: CustomRule;
    if (custom) ruled = custom;
    else if (r.type === 'custom') throw new Error(`${where}: no transcription of the custom rule "${r.rule}"`);
    else if (rungs) ruled = rule('ladder');
    else if (r.type === 'load') ruled = load(r.amount_lb!);
    else if (r.type === 'next_bell') ruled = load(r.amount_kg! * 2); // 4 kg ↔ 8 lb (R611)
    else if (r.type === 'reps') ruled = rule('reps_only');
    else if (r.type === 'seconds') ruled = rule('hold');
    else throw new Error(`${where}: unknown increment rule ${r.type}`);
    if (ruled.ruleKind === 'ladder' && !rungs) throw new Error(`${where}: a ladder rule without rungs`);

    const unit = TARGET_UNITS[e.target.unit];
    if (!unit) throw new Error(`${where}: unknown target unit ${e.target.unit}`);

    const metcon = e.metcon
      ? {
          format: e.metcon.format === 'AMRAP' ? ('AMRAP' as const) : ('For Time' as const),
          workMinutes: e.metcon.work_minutes,
          elements: [...e.metcon.elements],
          capMinutes: (() => {
            const cap = /\(cap (\d+) min\)/.exec(e.exercise);
            return cap ? Number(cap[1]) : null;
          })(),
        }
      : null;
    if (metcon && e.metcon!.format !== 'AMRAP' && e.metcon!.format !== 'For Time') throw new Error(`${where}: unknown metcon format`);
    const credits = metcon ? metcon.elements.map((name) => credit(name, where)) : [credit(e.exercise, where)];

    const exerciseName = names.get(exerciseId)!;
    const note = [sameName(e.exercise, exerciseName) ? '' : e.exercise, e.notes].filter((part) => part !== '').join('. ');

    return {
      id: '',
      exerciseId,
      catalogName: e.exercise,
      note,
      sets: e.sets,
      repMin: e.target.min,
      repMax: e.target.max,
      targetUnit: unit,
      ruleKind: ruled.ruleKind,
      incrementLb: ruled.incrementLb,
      halveAfterFirstMiss: r.halve_after_first_stall === true,
      resetMultiplier: TOP_SETS.includes(key) ? TOP_SET_RESET_MULTIPLIER : source.rules.stall.reset_multiplier,
      sessionsToRaise: ruled.sessionsToRaise,
      ladder: rungs ? rungs.map((rung) => ({ ...rung })) : null,
      addSet: ruled.addSet,
      weekly: ruled.weekly,
      metcon,
      manualText: ruled.manualText,
      countsTowardVolume: e.counts_toward_volume,
      credits,
      creditPerSet: metcon ? metcon.workMinutes / 5 : 1,
      deloadExempt: DELOAD_EXEMPT.includes(key),
      isMain: index === 0,
      warmUpLine: index === 0,
    };
  }

  return { programs, sources: source.sources.map((s) => ({ id: s.id, citation: s.citation, url: s.url })) };
}
