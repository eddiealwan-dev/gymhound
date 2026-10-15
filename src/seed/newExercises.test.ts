import { EQUIPMENT_ORDER, MUSCLE_ORDER } from '../domain/labels';
import type { LoggingType, Pattern } from '../domain/types';
import { EXERCISE_PHOTOS } from './exercisePhotos.generated';
import { LIBRARY_EXERCISES } from './library.generated';
import { CATALOG_NEW_IDS, NEW_ALIASES, NEW_EXERCISES, PHOTO_ALIAS, RUNG_NEW_IDS } from './newExercises';
import { CATALOG_STEPS } from './steps/catalogSteps';
import { RUNG_STEPS } from './steps/rungSteps';

const LISTED: string[] = require('./libraryIds.json');
const byId = new Map(NEW_EXERCISES.map((e) => [e.id, e]));
const PATTERNS: readonly Pattern[] = [
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'carry',
  'core',
  'isolation',
];

// Spec §18.29, Appendix A: the 48 new catalog exercises, transcribed here apart from the registry.
const CATALOG: Readonly<Record<string, LoggingType>> = {
  'double-kettlebell-clean-and-press': 'weighted',
  'kettlebell-swing': 'weighted',
  'kettlebell-reverse-fly': 'weighted',
  'armor-building-complex': 'weighted',
  'kettlebell-curl': 'weighted',
  'side-lying-hip-abduction': 'bodyweight_plus',
  'paused-back-squat': 'weighted',
  'heels-elevated-goblet-squat': 'weighted',
  'dumbbell-hip-thrust': 'weighted',
  'dumbbell-single-leg-romanian-deadlift': 'weighted',
  'leg-swing': 'bodyweight_plus',
  'ninety-ninety-hip-switch': 'bodyweight_plus',
  'couch-stretch': 'timed',
  'knee-to-wall-ankle-rock': 'bodyweight_plus',
  'cossack-squat': 'bodyweight_plus',
  'deep-goblet-squat-hold': 'weighted_time',
  'shoulder-cars': 'bodyweight_plus',
  'thoracic-open-book': 'bodyweight_plus',
  'wall-slide': 'bodyweight_plus',
  'band-dislocate': 'weighted',
  'dumbbell-pullover-stretch': 'weighted_time',
  'dead-hang': 'timed',
  'hip-cars': 'bodyweight_plus',
  'jefferson-curl': 'weighted',
  'dumbbell-rdl-stretch-hold': 'weighted_time',
  'pigeon-stretch': 'timed',
  'band-face-pull': 'weighted',
  'single-leg-calf-raise': 'bodyweight_plus',
  'freestanding-handstand-practice': 'timed',
  'yoke-carry': 'weighted_distance',
  'farmers-carry-distance': 'weighted_distance',
  'sandbag-carry': 'weighted_distance',
  'sled-push-distance': 'weighted_distance',
  'toes-to-bar': 'bodyweight_plus',
  'easy-run': 'timed',
  'interval-run': 'timed',
  'tempo-run': 'timed',
  'long-run': 'timed',
  'bike-intervals': 'timed',
  'rower-intervals': 'timed',
  'incline-treadmill-walk': 'timed',
  'metcon-amrap-10-squat-pushup-run': 'rounds',
  'metcon-3-rounds-row-thruster-ring-row': 'for_time',
  'metcon-amrap-15-cindy-scaled': 'rounds',
  'metcon-amrap-12-wallball-t2b-row': 'rounds',
  'metcon-21-15-9-thruster-pullup': 'for_time',
  'metcon-amrap-25-run-wallball-burpee': 'rounds',
  'metcon-5-rounds-db-snatch-c2b': 'for_time',
};

// Appendix B: the rungs the library lacks, by ladder; bodyweight plus unless the ladder marks them timed.
const RUNGS: Readonly<Record<string, readonly string[]>> = {
  // The first rung, the scapular pull-up, is the library's own `fedb-scapular-pull-up` (controller ruling, Task 1).
  'pull-up #3': ['arch-hang', 'negative-pull-up'],
  'pull-up #17': ['ring-row', 'chest-to-bar-pull-up'],
  squat: ['assisted-squat', 'shrimp-squat'],
  dip: ['support-hold', 'negative-dip'],
  hinge: ['bodyweight-romanian-deadlift', 'hamstring-walkout', 'band-assisted-nordic-curl', 'eccentric-nordic-curl'],
  row: ['vertical-row', 'incline-row', 'wide-grip-inverted-row', 'feet-elevated-inverted-row'],
  'push-up': ['wall-push-up', 'knee-push-up', 'deficit-push-up', 'archer-push-up'],
  plank: ['standing-ab-wheel-rollout'],
  'hanging knee raise': ['lying-knee-tuck', 'lying-straight-leg-raise', 'hanging-knee-raise', 'hanging-bent-leg-raise'],
  'front lever': ['tuck-front-lever', 'advanced-tuck-front-lever', 'one-leg-front-lever', 'straddle-front-lever', 'front-lever'],
  'front lever row': ['tuck-front-lever-row', 'advanced-tuck-front-lever-row', 'straddle-front-lever-row'],
  'back lever': ['tuck-back-lever', 'advanced-tuck-back-lever', 'half-lay-back-lever', 'straddle-back-lever', 'back-lever'],
  planche: ['planche-lean', 'tuck-planche', 'advanced-tuck-planche', 'straddle-planche'],
  'muscle-up': ['explosive-pull-up-and-dip', 'band-assisted-muscle-up', 'negative-muscle-up', 'ring-muscle-up'],
  'handstand push-up': ['elevated-pike-push-up', 'partial-wall-handstand-push-up', 'deficit-wall-handstand-push-up'],
  'pistol squat': ['box-pistol-squat', 'pistol-squat'],
  'l-sit': ['tuck-l-sit', 'one-leg-l-sit', 'l-sit', 'v-sit'],
  'box jump': ['box-step-up'],
  ring: ['ring-push-up', 'ring-biceps-curl', 'ring-triceps-extension'],
};
const TIMED_RUNGS = new Set([
  'arch-hang',
  'support-hold',
  ...RUNGS['front lever'],
  ...RUNGS['back lever'],
  ...RUNGS.planche,
  ...RUNGS['l-sit'],
]);

/** Words that keep their capitals inside a sentence-case name: proper nouns and abbreviations. */
const KEEPS_CAPITALS = new Set(['Romanian', 'Nordic', 'RDL', 'CARs', 'AMRAP', 'L-sit', 'V-sit']);
function isSentenceCase(name: string): boolean {
  const words = name.split(' ');
  if (!/^[A-Z0-9]/.test(words[0])) return false;
  return words.every((word, i) => {
    if (KEEPS_CAPITALS.has(word.replace(/[,:]$/, ''))) return true;
    const rest = i === 0 ? word.slice(1) : word;
    return rest === rest.toLowerCase();
  });
}

describe('NEW_EXERCISES (§18.29, R602, R604)', () => {
  it('has 107 entries with unique ids, none in the library, and every one in libraryIds.json, after the library', () => {
    expect(NEW_EXERCISES).toHaveLength(107);
    expect(byId.size).toBe(107);
    const library = new Set(LIBRARY_EXERCISES.map((e) => e.id));
    expect(NEW_EXERCISES.filter((e) => library.has(e.id)).map((e) => e.id)).toEqual([]);
    expect(NEW_EXERCISES.filter((e) => !LISTED.includes(e.id)).map((e) => e.id)).toEqual([]);
    // The list lost none of the library's ids: each new id comes after them all.
    const lastLibrary = Math.max(...LIBRARY_EXERCISES.map((e) => LISTED.indexOf(e.id)));
    expect(NEW_EXERCISES.filter((e) => LISTED.indexOf(e.id) < lastLibrary).map((e) => e.id)).toEqual([]);
  });

  it('is the 48 catalog exercises of Appendix A and the 59 new rungs of Appendix B, with their logging types', () => {
    expect([...CATALOG_NEW_IDS].sort()).toEqual(Object.keys(CATALOG).sort());
    const rungIds = Object.values(RUNGS).flat();
    expect(rungIds).toHaveLength(59);
    expect([...RUNG_NEW_IDS].sort()).toEqual([...rungIds].sort());
    expect(NEW_EXERCISES.map((e) => e.id)).toEqual([...CATALOG_NEW_IDS, ...RUNG_NEW_IDS]);
    for (const [id, type] of Object.entries(CATALOG)) expect([id, byId.get(id)?.loggingType]).toEqual([id, type]);
    for (const id of rungIds) {
      expect([id, byId.get(id)?.loggingType]).toEqual([id, TIMED_RUNGS.has(id) ? 'timed' : 'bodyweight_plus']);
    }
  });

  it('uses only the muscles, equipment and patterns of the app, with at least one primary muscle', () => {
    for (const e of NEW_EXERCISES) {
      expect([e.id, e.primaryMuscles.length > 0]).toEqual([e.id, true]);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) expect([e.id, MUSCLE_ORDER.includes(m)]).toEqual([e.id, true]);
      expect(e.secondaryMuscles.filter((m) => e.primaryMuscles.includes(m))).toEqual([]);
      expect([e.id, EQUIPMENT_ORDER.includes(e.equipment)]).toEqual([e.id, true]);
      expect([e.id, PATTERNS.includes(e.pattern)]).toEqual([e.id, true]);
    }
  });

  it('takes the muscles and equipment of Appendix A where it gives them', () => {
    expect(byId.get('yoke-carry')).toMatchObject({
      equipment: 'other',
      primaryMuscles: ['traps', 'abs', 'lower_back'],
      secondaryMuscles: ['quads', 'glutes', 'upper_back'],
    });
    // Out-of-vocabulary muscles map for tags only (R604): hip flexors → quads, hip rotators → glutes, abductors → glutes,
    // shoulder rotators → rear delts, thoracic spine → upper back.
    expect(byId.get('leg-swing')).toMatchObject({ primaryMuscles: ['quads'], secondaryMuscles: ['hamstrings', 'adductors'] });
    expect(byId.get('ninety-ninety-hip-switch')).toMatchObject({ primaryMuscles: ['glutes'], secondaryMuscles: ['adductors'] });
    expect(byId.get('side-lying-hip-abduction')).toMatchObject({ primaryMuscles: ['glutes'], secondaryMuscles: [] });
    expect(byId.get('band-dislocate')).toMatchObject({ equipment: 'band', primaryMuscles: ['rear_delts'] });
    expect(byId.get('thoracic-open-book')).toMatchObject({ primaryMuscles: ['upper_back'], secondaryMuscles: ['chest'] });
    expect(byId.get('freestanding-handstand-practice')).toMatchObject({ primaryMuscles: ['front_delts'], secondaryMuscles: ['triceps'] });
    expect(byId.get('rower-intervals')).toMatchObject({ equipment: 'machine', primaryMuscles: ['lats'], secondaryMuscles: ['quads'] });
    expect(byId.get('easy-run')).toMatchObject({ primaryMuscles: ['quads'], secondaryMuscles: ['calves', 'hamstrings'] });
    // A metcon's muscles are the union of its elements' primaries.
    expect(byId.get('metcon-21-15-9-thruster-pullup')).toMatchObject({
      equipment: 'other',
      primaryMuscles: ['quads', 'front_delts', 'lats'],
      secondaryMuscles: [],
    });
    // A rung takes its ladder's muscles: L-sit's hip flexors read as quads.
    expect(byId.get('l-sit')).toMatchObject({ primaryMuscles: ['abs'], secondaryMuscles: ['quads', 'triceps'] });
  });

  it('names each in sentence case, with straight apostrophes and no exclamation marks', () => {
    for (const e of NEW_EXERCISES) {
      expect([e.id, isSentenceCase(e.name)]).toEqual([e.id, true]);
      expect(e.name).not.toMatch(/[!‘’“”]/);
    }
    expect(byId.get('farmers-carry-distance')!.name).toBe("Farmer's carry for distance");
    expect(byId.get('sled-push-distance')!.name).toBe('Sled push for distance');
    expect(byId.get('metcon-amrap-10-squat-pushup-run')!.name).toBe('AMRAP 10: goblet squat, push-up, run');
  });

  it('gives no new exercise the name or alias of another exercise, so the picker never shows two of one name', () => {
    const taken = new Map<string, string>();
    for (const e of LIBRARY_EXERCISES) for (const word of [e.name, ...e.aliases]) taken.set(word.toLowerCase(), e.id);
    for (const e of NEW_EXERCISES) expect([e.id, taken.get(e.name.toLowerCase()) ?? null]).toEqual([e.id, null]);
    expect(new Set(NEW_EXERCISES.map((e) => e.name.toLowerCase())).size).toBe(107);
  });

  it('has no source, no aliases of its own, and its steps from the two step files (empty until written)', () => {
    for (const e of NEW_EXERCISES) {
      expect(e.sourceId).toBeNull();
      expect(e.aliases).toEqual([]);
    }
    for (const id of CATALOG_NEW_IDS) expect(byId.get(id)!.instructions).toEqual(CATALOG_STEPS[id] ?? []);
    for (const id of RUNG_NEW_IDS) expect(byId.get(id)!.instructions).toEqual(RUNG_STEPS[id] ?? []);
  });

  it('lists steps only for its own ids', () => {
    expect(Object.keys(CATALOG_STEPS).filter((id) => !CATALOG_NEW_IDS.includes(id))).toEqual([]);
    expect(Object.keys(RUNG_STEPS).filter((id) => !RUNG_NEW_IDS.includes(id))).toEqual([]);
  });
});

describe('PHOTO_ALIAS (R605)', () => {
  it('is the seven new exercises that share a bundled photo', () => {
    expect(PHOTO_ALIAS).toEqual({
      'paused-back-squat': 'barbell-back-squat',
      'farmers-carry-distance': 'fedb-farmers-walk',
      'yoke-carry': 'fedb-yoke-walk',
      'sled-push-distance': 'fedb-sled-push',
      'bike-intervals': 'fedb-bicycling-stationary',
      'rower-intervals': 'fedb-rowing-stationary',
      'incline-treadmill-walk': 'fedb-walking-treadmill',
    });
  });

  it('every target has bundled photos, and every key is a new exercise without its own', () => {
    for (const [id, target] of Object.entries(PHOTO_ALIAS)) {
      expect(byId.has(id)).toBe(true);
      expect(EXERCISE_PHOTOS[id]).toBeUndefined();
      expect([target, EXERCISE_PHOTOS[target] !== undefined]).toEqual([target, true]);
    }
  });
});

describe('NEW_ALIASES (R606)', () => {
  const library = new Map(LIBRARY_EXERCISES.map((e) => [e.id, e]));

  it('every key is a library id', () => {
    expect(Object.keys(NEW_ALIASES).filter((id) => !library.has(id))).toEqual([]);
  });

  it('adds the word of the program to each exercise it names, only where it is new', () => {
    expect(Object.values(NEW_ALIASES).flat().map((a) => a.toLowerCase()).sort()).toEqual(
      [
        'close-grip bench press',
        'dumbbell skull crusher',
        'band lateral raise',
        'chest-supported row',
        'double kettlebell front squat',
        'kettlebell gorilla row',
        'kettlebell floor press',
        "farmer's carry",
        'turkish get-up',
        'kettlebell single-leg romanian deadlift',
        'back extension',
        'weighted dip',
        'weighted chin-up',
        'log clean and press',
        'ab wheel rollout',
        'atlas stone load',
        'bar muscle-up',
        'nordic curl',
        'low box jump',
      ].sort(),
    );
    expect(NEW_ALIASES['fedb-log-lift']).toEqual(['log clean and press']);
    expect(NEW_ALIASES['dip']).toEqual(['weighted dip']);
    // Diamond push-up is already an alias of the close-grip push-up.
    expect(library.get('close-grip-push-up')!.aliases).toContain('diamond push-up');
    expect(NEW_ALIASES['close-grip-push-up']).toBeUndefined();
    for (const [id, aliases] of Object.entries(NEW_ALIASES)) {
      const own = [library.get(id)!.name, ...library.get(id)!.aliases].map((w) => w.toLowerCase());
      for (const alias of aliases) expect([id, own.includes(alias.toLowerCase())]).toEqual([id, false]);
    }
  });

  it('never gives an alias that names another exercise', () => {
    const owner = new Map<string, string>();
    for (const e of [...LIBRARY_EXERCISES, ...NEW_EXERCISES]) for (const w of [e.name, ...e.aliases]) owner.set(w.toLowerCase(), e.id);
    for (const [id, aliases] of Object.entries(NEW_ALIASES)) {
      for (const alias of aliases) expect([alias, owner.get(alias.toLowerCase()) ?? id]).toEqual([alias, id]);
    }
  });
});
