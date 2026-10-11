import { SEED_EXERCISES } from './exercises';
import {
  LEGACY_SOURCE,
  LEGACY_STEPS,
  NAME_ACRONYMS,
  NAME_PROPER_NOUNS,
  buildLibrary,
  libraryId,
  mapEquipment,
  mapLoggingType,
  mapMuscles,
  mapPattern,
  nextLibraryIds,
  sentenceCase,
} from './libraryMapping';
import type { FedbExercise, LibraryExercise } from './libraryMapping';

// The vendored free-exercise-db data, so every sample below is a real entry.
const FEDB: FedbExercise[] = require('../../scripts/vendor/free-exercise-db/exercises.json');

const fedb = (name: string): FedbExercise => {
  const found = FEDB.find((e) => e.name === name);
  if (!found) throw new Error(`No free-exercise-db entry named ${name}`);
  return found;
};

const BENCH = 'Barbell Bench Press - Medium Grip';

describe('mapEquipment', () => {
  it.each([
    [BENCH, 'barbell'],
    ['EZ-Bar Curl', 'ez_bar'],
    ['Dumbbell Bench Press', 'dumbbell'],
    ['Seated Cable Rows', 'cable'],
    ['Leg Press', 'machine'],
    ['Goblet Squat', 'kettlebell'],
    ['Band Pull Apart', 'band'],
    ['Medicine Ball Chest Pass', 'medicine_ball'],
    ['Ball Leg Curl', 'exercise_ball'],
    ['Calves-SMR', 'foam_roller'],
    ['Plank', 'bodyweight'],
    ['Inverted Row', 'bodyweight'],
    ["Farmer's Walk", 'other'],
  ])('%s → %s', (name, equipment) => {
    expect(mapEquipment(fedb(name))).toBe(equipment);
  });

  it('refuses equipment it does not know, so a changed source is noticed', () => {
    expect(() => mapEquipment({ ...fedb(BENCH), equipment: 'hover board' })).toThrow('hover board');
  });
});

describe('mapMuscles', () => {
  it('maps the bench press: chest, then front delts (a push) and triceps', () => {
    const bench = fedb(BENCH);
    expect(mapMuscles(bench.primaryMuscles, bench)).toEqual(['chest']);
    expect(mapMuscles(bench.secondaryMuscles, bench)).toEqual(['front_delts', 'triceps']);
  });

  it('maps abdominals to abs', () => {
    const plank = fedb('Plank');
    expect(mapMuscles(plank.primaryMuscles, plank)).toEqual(['abs']);
  });

  it.each([
    ['Side Lateral Raise', 'side_delts'],
    ['Cable Seated Lateral Raise', 'side_delts'],
    ['Standing Low-Pulley Deltoid Raise', 'side_delts'],
    ['Upright Barbell Row', 'side_delts'],
    ['Standing Military Press', 'front_delts'],
    ['Front Dumbbell Raise', 'front_delts'],
    ['Face Pull', 'rear_delts'],
    ['Reverse Flyes', 'rear_delts'],
    ['Dumbbell Lying Rear Lateral Raise', 'rear_delts'],
  ])('splits shoulders by the movement: %s → %s', (name, delt) => {
    const e = fedb(name);
    expect(mapMuscles(e.primaryMuscles, e)).toEqual([delt]);
  });

  it('gives a pull’s shoulders to the rear delts, and maps middle back and lats', () => {
    const row = fedb('Bent Over Barbell Row');
    expect(mapMuscles(row.primaryMuscles, row)).toEqual(['upper_back']);
    expect(mapMuscles(row.secondaryMuscles, row)).toEqual(['biceps', 'lats', 'rear_delts']);
  });

  it('maps every other free-exercise-db muscle by name', () => {
    const e = fedb(BENCH);
    expect(
      mapMuscles(
        ['quadriceps', 'hamstrings', 'adductors', 'calves', 'glutes', 'lower back', 'traps', 'forearms', 'biceps', 'triceps', 'lats', 'chest'],
        e,
      ),
    ).toEqual(['quads', 'hamstrings', 'adductors', 'calves', 'glutes', 'lower_back', 'traps', 'forearms', 'biceps', 'triceps', 'lats', 'chest']);
  });

  it('maps abductors to glutes and neck to traps, deduped in order', () => {
    const e = fedb(BENCH);
    expect(mapMuscles(['abductors', 'neck', 'glutes', 'traps', 'calves'], e)).toEqual(['glutes', 'traps', 'calves']);
  });

  it('refuses a muscle it does not know', () => {
    expect(() => mapMuscles(['spleen'], fedb(BENCH))).toThrow('spleen');
  });
});

describe('mapLoggingType', () => {
  it.each([
    [BENCH, 'weighted'],
    ['EZ-Bar Curl', 'weighted'],
    ['Atlas Stones', 'weighted'],
    ['Plank', 'timed'],
    ['Side Bridge', 'timed'],
    ['Calf Stretch Hands Against Wall', 'timed'],
    ['Calves-SMR', 'timed'],
    ['Crucifix', 'timed'],
    ['Running, Treadmill', 'distance_time'],
    ['Walking, Treadmill', 'distance_time'],
    ['Rowing, Stationary', 'distance_time'],
    ['Bicycling, Stationary', 'distance_time'],
    ['Elliptical Trainer', 'distance_time'],
    ['Trail Running/Walking', 'distance_time'],
    ['Stairmaster', 'timed'],
    ['Rope Jumping', 'timed'],
    ["Farmer's Walk", 'weighted_time'],
    ['Yoke Walk', 'weighted_time'],
    ['Sled Push', 'weighted_time'],
    ['Rickshaw Carry', 'weighted_time'],
    ["Conan's Wheel", 'weighted_time'],
    ['Prowler Sprint', 'weighted_time'],
    ['Sled Overhead Backward Walk', 'weighted_time'],
    ['Sled Row', 'weighted'],
    ['Sled Reverse Flye', 'weighted'],
    ['Sled Overhead Triceps Extension', 'weighted'],
    ['Monster Walk', 'weighted'],
    ['Sledgehammer Swings', 'bodyweight_plus'],
    ['Drag Curl', 'weighted'],
    ['Bodyweight Walking Lunge', 'bodyweight_plus'],
    ['Band Assisted Pull-Up', 'bodyweight_plus'],
    ['London Bridges', 'bodyweight_plus'],
    ['Single-Leg High Box Squat', 'bodyweight_plus'],
    ['Platform Hamstring Slides', 'bodyweight_plus'],
    ['Plyo Kettlebell Pushups', 'bodyweight_plus'],
    ['Pullups', 'bodyweight_plus'],
    ['Pushups', 'bodyweight_plus'],
    ['Inverted Row', 'bodyweight_plus'],
    ['Freehand Jump Squat', 'bodyweight_plus'],
    ['Ball Leg Curl', 'bodyweight_plus'],
    ['Ring Dips', 'bodyweight_plus'],
    ['Muscle Up', 'bodyweight_plus'],
    ['Front Box Jump', 'bodyweight_plus'],
    ['Weighted Pull Ups', 'bodyweight_plus'],
    ['Hyperextensions (Back Extensions)', 'bodyweight_plus'],
    ['Battling Ropes', 'timed'],
    ['Medicine Ball Chest Pass', 'weighted'],
    ['Machine Bench Press', 'weighted'],
  ])('%s → %s', (name, loggingType) => {
    expect(mapLoggingType(fedb(name))).toBe(loggingType);
  });

  it('logs a machine-assisted move as assisted (a band’s assistance can’t be weighed, so band-assisted is bodyweight plus)', () => {
    const machineAssisted: FedbExercise = {
      ...fedb('Pullups'),
      id: 'Machine-Assisted_Pull-Up',
      name: 'Machine-Assisted Pull-Up',
      equipment: 'machine',
    };
    expect(mapLoggingType(machineAssisted)).toBe('assisted');
  });
});

describe('mapPattern', () => {
  it.each([
    [BENCH, 'horizontal_push'],
    ['Pushups', 'horizontal_push'],
    ['Machine Bench Press', 'horizontal_push'],
    ['Smith Machine Overhead Shoulder Press', 'vertical_push'],
    ['Standing Military Press', 'vertical_push'],
    ['Seated Dumbbell Press', 'vertical_push'],
    ['Parallel Bar Dip', 'vertical_push'],
    ['Barbell Squat', 'squat'],
    ['Leg Press', 'squat'],
    ['Goblet Squat', 'squat'],
    ['Barbell Deadlift', 'hinge'],
    ['Romanian Deadlift', 'hinge'],
    ['Barbell Hip Thrust', 'hinge'],
    ['Butt Lift (Bridge)', 'hinge'],
    ['Box Jump (Multiple Response)', 'squat'],
    ['Dumbbell Lunges', 'lunge'],
    ['Split Squat with Dumbbells', 'lunge'],
    ['Barbell Step Ups', 'lunge'],
    ['Back Flyes - With Bands', 'horizontal_pull'],
    ['Bent Over Barbell Row', 'horizontal_pull'],
    ['Alternating Kettlebell Row', 'horizontal_pull'],
    ['Lying Cambered Barbell Row', 'horizontal_pull'],
    ['Seated Cable Rows', 'horizontal_pull'],
    ['Face Pull', 'horizontal_pull'],
    ['Wide-Grip Lat Pulldown', 'vertical_pull'],
    ['Pullups', 'vertical_pull'],
    ['Chin-Up', 'vertical_pull'],
    ["Farmer's Walk", 'carry'],
    ['Sled Push', 'carry'],
    ["Conan's Wheel", 'carry'],
    ['Prowler Sprint', 'carry'],
    ['Sled Overhead Backward Walk', 'carry'],
    ['Monster Walk', 'isolation'],
    ['Sled Row', 'horizontal_pull'],
    ['Sled Reverse Flye', 'isolation'],
    ['Sled Overhead Triceps Extension', 'isolation'],
    ['Lying Triceps Press', 'isolation'],
    ['Lying Close-Grip Barbell Triceps Press To Chin', 'isolation'],
    ['Reverse Flyes', 'isolation'],
    ['Plank', 'core'],
    ['Hanging Leg Raise', 'core'],
    ['Side Lateral Raise', 'isolation'],
    ['EZ-Bar Curl', 'isolation'],
    ['Calf Press On The Leg Press Machine', 'isolation'],
    ['Leg Extensions', 'isolation'],
    ['Calf Stretch Hands Against Wall', 'isolation'],
    ['Running, Treadmill', 'isolation'],
  ])('%s → %s', (name, pattern) => {
    expect(mapPattern(fedb(name))).toBe(pattern);
  });
});

describe('sentenceCase (R91)', () => {
  it.each([
    [BENCH, 'Barbell bench press - medium grip'],
    ['One-Arm Dumbbell Row', 'One-arm dumbbell row'],
    ['Wide-Grip Rear Pull-Up', 'Wide-grip rear pull-up'],
    ['Rocky Pull-Ups/Pulldowns', 'Rocky pull-ups/pulldowns'],
    ['3/4 Sit-Up', '3/4 sit-up'],
    ['Hug A Ball', 'Hug a ball'],
    ['Box Jump (Multiple Response)', 'Box jump (multiple response)'],
    ["Farmer's Walk", "Farmer's walk"],
    ["Conan's Wheel", "Conan's wheel"],
    ['EZ-Bar Curl', 'EZ-bar curl'],
    ['Close-Grip EZ-Bar Press', 'Close-grip EZ-bar press'],
    ['Hammer Grip Incline DB Bench Press', 'Hammer grip incline DB bench press'],
    ['IT Band and Glute Stretch', 'IT band and glute stretch'],
    ['JM Press', 'JM press'],
    ['Iliotibial Tract-SMR', 'Iliotibial tract-SMR'],
    ['T-Bar Row with Handle', 'T-bar row with handle'],
    ['Lying T-Bar Row', 'Lying T-bar row'],
    ['Triceps Pushdown - V-Bar Attachment', 'Triceps pushdown - V-bar attachment'],
    ['Smith Machine Squat', 'Smith machine squat'],
    ['Decline Smith Press', 'Decline Smith press'],
    ['Kettlebell Arnold Press', 'Kettlebell Arnold press'],
    ['Bradford/Rocky Presses', 'Bradford/Rocky presses'],
    ['Cable Russian Twists', 'Cable Russian twists'],
    ['Cable Judo Flip', 'Cable Judo flip'],
    ['Kettlebell Turkish Get-Up (Lunge style)', 'Kettlebell Turkish get-up (lunge style)'],
    ['Romanian Deadlift from Deficit', 'Romanian deadlift from deficit'],
    ['Pallof Press With Rotation', 'Pallof press with rotation'],
    ['Standing Olympic Plate Hand Squeeze', 'Standing Olympic plate hand squeeze'],
    ['Standing Soleus And Achilles Stretch', 'Standing soleus and Achilles stretch'],
    ['Otis-Up', 'Otis-up'],
    ['Landmine 180\'s', "Landmine 180's"],
  ])('%s → %s', (name, expected) => {
    expect(sentenceCase(name)).toBe(expected);
  });

  it('keeps the capital of every listed acronym and proper noun, each found in a real name', () => {
    for (const word of [...NAME_ACRONYMS, ...NAME_PROPER_NOUNS]) {
      const names = FEDB.map((e) => e.name).filter((n) => new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`).test(n));
      expect([word, names.length > 0]).toEqual([word, true]);
      for (const name of names) expect(sentenceCase(name)).toContain(word);
    }
  });
});

describe('libraryId', () => {
  it.each([
    ['Barbell_Bench_Press_-_Medium_Grip', 'fedb-barbell-bench-press-medium-grip'],
    ['3_4_Sit-Up', 'fedb-3-4-sit-up'],
    ['Dips_-_Chest_Version', 'fedb-dips-chest-version'],
    ['Farmers_Walk', 'fedb-farmers-walk'],
    ['_Odd__Name-_', 'fedb-odd-name'],
  ])('%s → %s', (source, id) => {
    expect(libraryId(source)).toBe(id);
  });
});

describe('LEGACY_SOURCE', () => {
  it('links each of the 55 existing exercises, and nothing else', () => {
    expect(Object.keys(LEGACY_SOURCE).sort()).toEqual(SEED_EXERCISES.map((e) => e.id).sort());
  });

  it('points only at real free-exercise-db entries, each used once', () => {
    const sources = Object.values(LEGACY_SOURCE).filter((s): s is string => s !== null);
    const ids = new Set(FEDB.map((e) => e.id));
    expect(sources.filter((s) => !ids.has(s))).toEqual([]);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('links the bench press to the medium-grip barbell bench press', () => {
    expect(LEGACY_SOURCE['barbell-bench-press']).toBe('Barbell_Bench_Press_-_Medium_Grip');
  });

  it('links the dumbbell walking lunge to a walking lunge, not the stationary dumbbell lunge', () => {
    expect(LEGACY_SOURCE['dumbbell-walking-lunge']).toBe('Barbell_Walking_Lunge');
  });
});

describe('LEGACY_STEPS (R95)', () => {
  it('holds steps only for existing exercises with no free-exercise-db source', () => {
    for (const id of Object.keys(LEGACY_STEPS)) {
      expect(SEED_EXERCISES.some((e) => e.id === id)).toBe(true);
      expect(LEGACY_SOURCE[id]).toBeNull();
    }
  });

  it('has the pike push-up lower the head to a point just in front of the hands, a tripod (review of R95)', () => {
    expect(LEGACY_STEPS['pike-push-up'][1]).toBe(
      'Bend your elbows to lower the top of your head to a point slightly in front of your hands, so your head and hands make a triangle.',
    );
  });
});

describe('buildLibrary', () => {
  let library: LibraryExercise[];
  let byId: Map<string, LibraryExercise>;
  const matches = Object.values(LEGACY_SOURCE).filter((s) => s !== null).length;

  beforeAll(() => {
    library = buildLibrary(FEDB, SEED_EXERCISES);
    byId = new Map(library.map((e) => [e.id, e]));
  });

  it('holds every free-exercise-db entry once: 876 − the legacy matches + the 55 existing', () => {
    expect(FEDB).toHaveLength(876);
    expect(library).toHaveLength(876 - matches + 55);
    expect(new Set(library.map((e) => e.id)).size).toBe(library.length);
    const sources = library.map((e) => e.sourceId).filter((s) => s !== null);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it('keeps an existing exercise’s id, name, aliases and logging type, with steps and source from free-exercise-db', () => {
    const bench = byId.get('barbell-bench-press')!;
    const legacy = SEED_EXERCISES.find((e) => e.id === 'barbell-bench-press')!;
    expect(bench).toEqual({
      ...legacy,
      sourceId: 'Barbell_Bench_Press_-_Medium_Grip',
      instructions: fedb(BENCH).instructions,
    });
    expect(byId.has('fedb-barbell-bench-press-medium-grip')).toBe(false);
  });

  it('keeps every existing exercise exactly as it was, plus its steps', () => {
    for (const legacy of SEED_EXERCISES) {
      const { sourceId, instructions, ...kept } = byId.get(legacy.id)!;
      expect(kept).toEqual(legacy);
      expect(sourceId).toBe(LEGACY_SOURCE[legacy.id]);
      expect(instructions).toEqual(sourceId === null ? LEGACY_STEPS[legacy.id] : FEDB.find((e) => e.id === sourceId)!.instructions);
    }
  });

  it('gives an existing exercise with no match no source and its hand-written steps (R95)', () => {
    const unmatched = Object.entries(LEGACY_SOURCE).filter(([, s]) => s === null).map(([id]) => id);
    expect(unmatched.length).toBeGreaterThan(0);
    for (const id of unmatched) {
      expect(byId.get(id)).toMatchObject({ sourceId: null, instructions: LEGACY_STEPS[id] });
      expect(LEGACY_STEPS[id]!.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('maps every other entry under a fedb- id', () => {
    expect(byId.get('fedb-ez-bar-curl')).toEqual({
      id: 'fedb-ez-bar-curl',
      sourceId: 'EZ-Bar_Curl',
      name: 'EZ-bar curl',
      aliases: [],
      equipment: 'ez_bar',
      loggingType: 'weighted',
      pattern: 'isolation',
      primaryMuscles: ['biceps'],
      secondaryMuscles: [],
      instructions: fedb('EZ-Bar Curl').instructions,
    });
  });

  it('never lists a muscle as both primary and secondary', () => {
    for (const e of library) {
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      expect(e.primaryMuscles.filter((m) => e.secondaryMuscles.includes(m))).toEqual([]);
    }
  });

  it('has no two exercises with the same name, ignoring case', () => {
    const names = library.map((e) => e.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('is sorted by name, ignoring case', () => {
    const names = library.map((e) => e.name.toLowerCase());
    expect(names).toEqual([...names].sort());
  });

  it('names every imported exercise in sentence case, like the existing ones (R91)', () => {
    const sources = new Map(FEDB.map((e) => [e.id, e]));
    for (const e of library.filter((x) => x.id.startsWith('fedb-'))) {
      expect(e.name).toBe(sentenceCase(sources.get(e.sourceId!)!.name));
    }
  });
});

describe('nextLibraryIds', () => {
  const lib = (...ids: string[]) => ids.map((id) => ({ id }) as LibraryExercise);

  it('keeps the listed ids in their order and appends the new ones, sorted', () => {
    expect(nextLibraryIds(['b', 'a'], lib('a', 'd', 'b', 'c'))).toEqual(['b', 'a', 'c', 'd']);
  });

  it('starts an empty list with every id, sorted', () => {
    expect(nextLibraryIds([], lib('fedb-z', 'plank', 'fedb-a'))).toEqual(['fedb-a', 'fedb-z', 'plank']);
  });

  it('refuses a library that has lost a listed id, since history may point at it', () => {
    expect(() => nextLibraryIds(['a', 'gone', 'b'], lib('a', 'b'))).toThrow('gone');
  });
});
