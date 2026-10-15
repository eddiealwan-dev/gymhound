import { matchExercise, guessOwnExercise, nameWords, type MatchCandidate } from './exerciseMatch';
import { EMPTY_FILE, middayOf, parseCsv, planImport, readDate, readHeader, readNumber, readSeconds, UNKNOWN_FILE, type ImportPlan } from './importCsv';
import { IMPORT_SAMPLES } from './importSamples';

const OPTIONS = { weightUnit: 'lb' as const, distanceUnit: 'mi' as const, dayFirst: false };
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function workoutsOf(plan: ImportPlan) {
  if (plan.kind !== 'workouts') throw new Error(`Expected workouts, got ${plan.kind}`);
  return plan;
}

describe('reading CSV (R565)', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks, and drops a BOM and blank lines', () => {
    const { rows, separator } = parseCsv('﻿a,b,c\r\n1,"two, three","say ""hi"""\n\n4,"line\nbreak",6\n');
    expect(separator).toBe(',');
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, three', 'say "hi"'],
      ['4', 'line\nbreak', '6'],
    ]);
  });

  it('reads semicolon and tab files', () => {
    expect(parseCsv('a;b\n1,5;2').rows).toEqual([
      ['a', 'b'],
      ['1,5', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2').separator).toBe('\t');
  });

  it('reads headers loosely, with the unit they name', () => {
    expect(readHeader('Weight (kgs)')).toEqual({ base: 'weight', unit: 'kg' });
    expect(readHeader('weight_lbs')).toEqual({ base: 'weight', unit: 'lb' });
    expect(readHeader('duration_seconds')).toEqual({ base: 'duration', unit: 's' });
    expect(readHeader('Exercise Name')).toEqual({ base: 'exercise name', unit: null });
    expect(readHeader('Body Fat (%)')).toEqual({ base: 'body fat', unit: '%' });
    expect(readHeader('protein_g')).toEqual({ base: 'protein', unit: 'g' });
  });

  it('reads numbers as files write them', () => {
    expect(readNumber('82.5', false)).toBe(82.5);
    expect(readNumber('82,5', true)).toBe(82.5);
    expect(readNumber('82,5', false)).toBe(82.5);
    expect(readNumber('1,234', false)).toBe(1234);
    expect(readNumber('1.234,5', true)).toBe(1234.5);
    expect(readNumber('1,234.5', false)).toBe(1234.5);
    expect(readNumber('185 lb', false)).toBe(185);
    expect(readNumber('', false)).toBeNull();
    expect(readNumber('n/a', false)).toBeNull();
  });

  it('reads lengths of time', () => {
    expect(readSeconds('90')).toBe(90);
    expect(readSeconds('1:30')).toBe(90);
    expect(readSeconds('0:01:30')).toBe(90);
    expect(readSeconds('1h 5m')).toBe(3900);
    expect(readSeconds('45m')).toBe(2700);
    expect(readSeconds('30s')).toBe(30);
    expect(readSeconds('soon')).toBeNull();
  });

  it('reads dates in the usual forms, and refuses days that do not exist', () => {
    expect(readDate('2025-03-04', false)).toEqual({ localDate: '2025-03-04', at: null });
    expect(readDate('2025-03-04 18:30:00', false)).toEqual({ localDate: '2025-03-04', at: local(2025, 3, 4, 18, 30) });
    expect(readDate('2025-03-04T18:30:00.000-05:00', false)).toEqual({ localDate: '2025-03-04', at: Date.parse('2025-03-04T23:30:00Z') });
    expect(readDate('03/04/2025', false)?.localDate).toBe('2025-03-04');
    expect(readDate('03/04/2025', true)?.localDate).toBe('2025-04-03');
    expect(readDate('4 Mar 2025, 18:30', false)).toEqual({ localDate: '2025-03-04', at: local(2025, 3, 4, 18, 30) });
    expect(readDate('Mar 4, 2025', false)?.localDate).toBe('2025-03-04');
    expect(readDate('3/4/25 6:30 PM', false)).toEqual({ localDate: '2025-03-04', at: local(2025, 3, 4, 18, 30) });
    expect(readDate('2025-02-30', false)).toBeNull();
    expect(readDate('yesterday', false)).toBeNull();
  });
});

describe('workout files (R565)', () => {
  it("reads GymHound's own sample: sets in order, units, RPE, time and distance", () => {
    const plan = workoutsOf(planImport(IMPORT_SAMPLES.workouts, OPTIONS));
    expect(plan.skipped).toEqual([]);
    expect(plan.weightUnitKnown).toBe(true);
    expect(plan.workouts.map((w) => [w.name, w.localDate, w.exercises.length])).toEqual([
      ['Push A', '2026-09-01', 3],
      ['Easy run', '2026-09-03', 1],
    ]);
    const [push, run] = plan.workouts;
    expect(push.startedAt).toBe(middayOf('2026-09-01'));
    expect(push.exercises[0]).toMatchObject({ name: 'Barbell bench press', note: 'Paused the first rep' });
    expect(push.exercises[0].sets.map((s) => [s.setType, s.weight, s.weightUnit, s.reps, s.rpe])).toEqual([
      ['warmup', 95, 'lb', 10, null],
      ['working', 185, 'lb', 5, 8],
      ['working', 185, 'lb', 5, 8.5],
    ]);
    expect(push.exercises[2].sets[0]).toMatchObject({ durationS: 60, weight: null, reps: null });
    expect(run.exercises[0].sets[0]).toMatchObject({ durationS: 1800, distance: 5, distanceUnit: 'km' });
  });

  it("reads a Strong export: workout times and length, set order letters, and no weight unit (the phone's is used)", () => {
    const strong = [
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2024-01-15 07:30:00,Morning Push,1h 5m,Bench Press (Barbell),W,95,10,0,0,,,',
      '2024-01-15 07:30:00,Morning Push,1h 5m,Bench Press (Barbell),1,185,5,0,0,,,8',
      '2024-01-15 07:30:00,Morning Push,1h 5m,Bench Press (Barbell),2,185,5,0,0,,,',
      '2024-01-15 07:30:00,Morning Push,1h 5m,Plank,1,0,0,0,60,,,',
      '2024-01-17 07:30:00,Pull,45m,Pull Up,1,0,8,0,0,,,',
    ].join('\n');
    const plan = workoutsOf(planImport(strong, OPTIONS));
    expect(plan.weightUnitKnown).toBe(false);
    expect(plan.workouts).toHaveLength(2);
    const [push, pull] = plan.workouts;
    expect(push).toMatchObject({ name: 'Morning Push', startedAt: local(2024, 1, 15, 7, 30), finishedAt: local(2024, 1, 15, 8, 35) });
    expect(push.exercises[0].sets.map((s) => [s.setType, s.weight, s.weightUnit])).toEqual([
      ['warmup', 95, 'lb'],
      ['working', 185, 'lb'],
      ['working', 185, 'lb'],
    ]);
    expect(push.exercises[1].sets[0]).toMatchObject({ durationS: 60, weight: null, reps: null });
    expect(pull.exercises[0].sets[0]).toMatchObject({ reps: 8, weight: null });
    // Chosen on the import screen when the file doesn't say.
    expect(workoutsOf(planImport(strong, { ...OPTIONS, weightUnit: 'kg' })).workouts[0].exercises[0].sets[1].weightUnit).toBe('kg');
  });

  it('reads a Hevy export: day-month dates, kg in the header, set types and seconds', () => {
    const hevy = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      'Legs,"15 Jan 2024, 18:00","15 Jan 2024, 19:10",,Squat (Barbell),,Felt strong,0,warmup,60,8,,,',
      'Legs,"15 Jan 2024, 18:00","15 Jan 2024, 19:10",,Squat (Barbell),,,1,normal,120,5,,,8',
      'Legs,"15 Jan 2024, 18:00","15 Jan 2024, 19:10",,Treadmill,,,0,normal,,,2.5,900,',
    ].join('\n');
    const plan = workoutsOf(planImport(hevy, OPTIONS));
    expect(plan.weightUnitKnown).toBe(true);
    const [legs] = plan.workouts;
    expect(legs).toMatchObject({ name: 'Legs', localDate: '2024-01-15', startedAt: local(2024, 1, 15, 18), finishedAt: local(2024, 1, 15, 19, 10) });
    expect(legs.exercises[0]).toMatchObject({ name: 'Squat (Barbell)', note: 'Felt strong' });
    expect(legs.exercises[0].sets.map((s) => [s.setType, s.weight, s.weightUnit, s.reps, s.rpe])).toEqual([
      ['warmup', 60, 'kg', 8, null],
      ['working', 120, 'kg', 5, 8],
    ]);
    expect(legs.exercises[1].sets[0]).toMatchObject({ distance: 2.5, distanceUnit: 'km', durationS: 900 });
  });

  it('reads a FitNotes export, and a file with a sets count per row', () => {
    const fitnotes = ['Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time,Comment', '2024-02-01,Flat Barbell Bench Press,Chest,100.0,5,,,0:00:00,'].join('\n');
    const plan = workoutsOf(planImport(fitnotes, OPTIONS));
    expect(plan.workouts[0].exercises[0].sets[0]).toMatchObject({ weight: 100, weightUnit: 'kg', reps: 5, durationS: null });

    const simple = ['date,exercise,sets,reps,weight', '01/02/2024,Leg press,3,10,300'].join('\n');
    const sets = workoutsOf(planImport(simple, OPTIONS)).workouts[0];
    expect(sets.localDate).toBe('2024-01-02');
    expect(sets.exercises[0].sets).toHaveLength(3);
  });

  it('says which rows it could not read, numbered as a spreadsheet numbers them', () => {
    const file = ['date,exercise,weight,reps', ',Squat,100,5', '31/31/2024,Squat,100,5', '2024-01-01,,100,5', '2024-01-01,Squat,,', '2024-01-01,Squat,100,5'].join('\n');
    const plan = workoutsOf(planImport(file, OPTIONS));
    expect(plan.skipped).toEqual([
      { row: 2, reason: 'No date' },
      { row: 3, reason: 'Date not understood: 31/31/2024' },
      { row: 4, reason: 'No exercise' },
      { row: 5, reason: 'Nothing logged for Squat' },
    ]);
    expect(plan.workouts).toHaveLength(1);
  });

  it('works out day-first dates from the file itself', () => {
    const file = ['date,exercise,weight,reps', '13/01/2024,Squat,100,5', '03/02/2024,Squat,100,5'].join('\n');
    expect(workoutsOf(planImport(file, OPTIONS)).workouts.map((w) => w.localDate)).toEqual(['2024-01-13', '2024-02-03']);
  });

  it('reads ft and yd distances, in the unit column or the header, and keeps the weight beside them (R609)', () => {
    const file = [
      'date,workout,exercise,weight,weight_unit,distance,distance_unit',
      '2026-10-01,Strongman,Yoke carry,315,lb,50,ft',
      '2026-10-01,Strongman,Sandbag carry,150,lb,40,yd',
      '2026-10-01,Strongman,Sled push for distance,90,lb,20,yards',
      '2026-10-01,Strongman,Farmer carry,100,lb,60,feet',
    ].join('\n');
    const [w] = workoutsOf(planImport(file, OPTIONS)).workouts;
    expect(w.exercises.map((e) => [e.sets[0].weight, e.sets[0].distance, e.sets[0].distanceUnit])).toEqual([
      [315, 50, 'ft'],
      [150, 40, 'yd'],
      [90, 20, 'yd'],
      [100, 60, 'ft'],
    ]);
    const header = ['date,exercise,weight,distance (ft)', '2026-10-01,Yoke carry,315,50'].join('\n');
    expect(workoutsOf(planImport(header, OPTIONS)).workouts[0].exercises[0].sets[0]).toMatchObject({ distance: 50, distanceUnit: 'ft' });
  });

  it("reads GymHound's extra_reps column: an AMRAP score's rounds and extra reps (R609)", () => {
    const file = [
      'date,workout,exercise,set_type,weight,weight_unit,reps,rpe,duration_s,distance,distance_unit,pr,exercise_note,extra_reps',
      '2026-10-01,Metcon,AMRAP 10,working,,,6,,,,,,,4',
      '2026-10-02,Metcon,AMRAP 10,working,,,0,,,,,,,12',
      '2026-10-03,Metcon,AMRAP 10,working,,,7,,,,,,,',
    ].join('\n');
    const plan = workoutsOf(planImport(file, OPTIONS));
    expect(plan.skipped).toEqual([]);
    expect(plan.workouts.map((w) => [w.exercises[0].sets[0].reps, w.exercises[0].sets[0].extraReps])).toEqual([
      [6, 4],
      [0, 12],
      [7, null],
    ]);
  });

  it('a file from an older GymHound, with no extra_reps column, still imports, with no extra reps', () => {
    const plan = workoutsOf(planImport(IMPORT_SAMPLES.workouts, OPTIONS));
    expect(plan.skipped).toEqual([]);
    expect(plan.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets.map((s) => s.extraReps ?? null)))).toEqual(Array(6).fill(null));
  });
});

describe('body and food files (R565)', () => {
  it("reads GymHound's body sample: one column per measurement, lengths in the weight unit's", () => {
    const plan = planImport(IMPORT_SAMPLES.body, OPTIONS);
    if (plan.kind !== 'body') throw new Error(plan.kind);
    expect(plan.skipped).toEqual([]);
    expect(plan.entries.map((e) => [e.localDate, e.kind, e.value, e.unit])).toEqual([
      ['2026-09-01', 'bodyweight', 182.4, 'lb'],
      ['2026-09-01', 'waist', 34, 'in'],
      ['2026-09-01', 'chest', 42, 'in'],
      ['2026-09-01', 'hips', 40, 'in'],
      ['2026-09-01', 'arms', 15, 'in'],
      ['2026-09-01', 'thighs', 24, 'in'],
      ['2026-09-01', 'neck', 16, 'in'],
      ['2026-09-01', 'body_fat', 18.5, '%'],
      ['2026-09-08', 'bodyweight', 181.6, 'lb'],
      ['2026-09-08', 'waist', 33.75, 'in'],
    ]);
  });

  it("reads GymHound's body export (a kind and a value per row), and a weight log with kg in the header", () => {
    const own = ['date,measured_at,kind,value,unit', '2026-10-01,2026-10-01T07:00:00.000-05:00,bodyweight,82.5,kg', '2026-10-01,2026-10-01T07:00:00.000-05:00,waist,84,cm', '2026-10-01,,shoe size,10,'].join('\n');
    const plan = planImport(own, OPTIONS);
    if (plan.kind !== 'body') throw new Error(plan.kind);
    expect(plan.entries.map((e) => [e.kind, e.value, e.unit, e.measuredAt])).toEqual([
      ['bodyweight', 82.5, 'kg', Date.parse('2026-10-01T12:00:00Z')],
      ['waist', 84, 'cm', Date.parse('2026-10-01T12:00:00Z')],
    ]);
    expect(plan.skipped).toEqual([{ row: 4, reason: 'Not a measurement GymHound keeps: shoe size' }]);

    const log = planImport(['Date,Weight (kg)', '2026-01-02,80.1'].join('\n'), OPTIONS);
    expect(log).toMatchObject({ kind: 'body', weightUnitKnown: true, entries: [{ kind: 'bodyweight', value: 80.1, unit: 'kg' }] });
  });

  it("reads GymHound's food sample and a tracker's daily totals by meal", () => {
    const plan = planImport(IMPORT_SAMPLES.food, OPTIONS);
    if (plan.kind !== 'food') throw new Error(plan.kind);
    expect(plan.entries.map((e) => [e.name, e.servings, e.kcal, e.proteinG])).toEqual([
      ['Greek yogurt', 1, 150, 20],
      ['Chicken breast', 1.5, 248, 46],
      ['Rice', 1, 205, 4.3],
    ]);
    const tracker = ['Date,Meal,Calories,Fat (g),Carbohydrates (g),Protein (g)', '2026-09-01,Breakfast,420,12,50,25', '2026-09-01,Snacks,0,0,0,0'].join('\n');
    const meals = planImport(tracker, OPTIONS);
    expect(meals).toMatchObject({ kind: 'food', entries: [{ name: 'Breakfast', kcal: 420, fatG: 12, carbsG: 50, proteinG: 25 }], skipped: [{ row: 3, reason: 'No calories or macros' }] });
  });

  it("says when it can't tell what a file holds, or it's empty", () => {
    expect(planImport('', OPTIONS)).toEqual({ kind: 'unknown', reason: UNKNOWN_FILE });
    expect(planImport('name,colour\nkiwi,green', OPTIONS)).toEqual({ kind: 'unknown', reason: UNKNOWN_FILE });
    expect(planImport('date,exercise,weight,reps', OPTIONS)).toEqual({ kind: 'unknown', reason: EMPTY_FILE });
  });
});

describe('matching exercise names to the library (R565)', () => {
  const lib: MatchCandidate[] = [
    { id: 'barbell-back-squat', name: 'Barbell back squat', aliases: ['squat', 'back squat'], equipment: 'barbell', isCustom: false },
    { id: 'barbell-front-squat', name: 'Front squat', aliases: [], equipment: 'barbell', isCustom: false },
    { id: 'barbell-bench-press', name: 'Barbell bench press', aliases: ['bench', 'bench press', 'flat bench'], equipment: 'barbell', isCustom: false },
    { id: 'dumbbell-bench-press', name: 'Dumbbell bench press', aliases: ['DB bench'], equipment: 'dumbbell', isCustom: false },
    { id: 'barbell-deadlift', name: 'Deadlift', aliases: ['conventional deadlift', 'DL'], equipment: 'barbell', isCustom: false },
    { id: 'barbell-romanian-deadlift', name: 'Romanian deadlift', aliases: ['RDL'], equipment: 'barbell', isCustom: false },
    { id: 'dumbbell-curl', name: 'Dumbbell curl', aliases: ['DB curl', 'bicep curl'], equipment: 'dumbbell', isCustom: false },
    { id: 'barbell-curl', name: 'Barbell curl', aliases: ['BB curl'], equipment: 'barbell', isCustom: false },
    { id: 'lat-pulldown', name: 'Lat pulldown', aliases: ['pulldown', 'lat pull-down'], equipment: 'machine', isCustom: false },
    { id: 'pull-up', name: 'Pull-up', aliases: ['pullup', 'weighted pull-up'], equipment: 'bodyweight', isCustom: false },
    { id: 'plank', name: 'Plank', aliases: ['front plank'], equipment: 'bodyweight', isCustom: false },
    { id: 'fedb-barbell-full-squat', name: 'Barbell full squat', aliases: [], equipment: 'barbell', isCustom: false },
    { id: 'mine', name: 'Sled push', aliases: [], equipment: 'other', isCustom: true },
  ];
  const to = (name: string) => matchExercise(name, lib)?.id ?? null;

  it('writes names out the same way on both sides', () => {
    expect(nameWords('Bench Press (Barbell)')).toEqual(['bench', 'press', 'barbell']);
    expect(nameWords('DB Curls')).toEqual(['dumbbell', 'curl']);
    expect(nameWords('Pull Ups')).toEqual(['pullup']);
  });

  it("matches other apps' names to the right lift", () => {
    expect(to('Bench Press (Barbell)')).toBe('barbell-bench-press');
    expect(to('Bench Press (Dumbbell)')).toBe('dumbbell-bench-press');
    expect(to('Flat Barbell Bench Press')).toBe('barbell-bench-press');
    expect(to('Squat (Barbell)')).toBe('barbell-back-squat');
    expect(to('Deadlift (Barbell)')).toBe('barbell-deadlift');
    expect(to('Romanian Deadlift (Barbell)')).toBe('barbell-romanian-deadlift');
    expect(to('Bicep Curl (Dumbbell)')).toBe('dumbbell-curl');
    expect(to('Bicep Curl (Barbell)')).toBe('barbell-curl');
    expect(to('Lat Pulldown (Cable)')).toBe('lat-pulldown');
    expect(to('Pull Up')).toBe('pull-up');
    expect(to('plank')).toBe('plank');
    expect(to('Sled Push')).toBe('mine');
  });

  it("leaves a different lift unmatched rather than guessing", () => {
    expect(to('Romanian Deadlift (Dumbbell)')).toBeNull();
    expect(to('Hack Squat (Machine)')).toBeNull();
    expect(to('Zercher squat')).toBeNull();
  });

  it('guesses an unmatched exercise from its name and sets, to keep it as your own', () => {
    const set = { setType: 'working' as const, weight: null, weightUnit: null, reps: null, rpe: null, durationS: null, distance: null, distanceUnit: null };
    expect(guessOwnExercise('Hack Squat (Machine)', [{ ...set, weight: 200, weightUnit: 'lb', reps: 10 }])).toEqual({ equipment: 'machine', primaryMuscles: ['quads'], loggingType: 'weighted' });
    expect(guessOwnExercise('Running', [{ ...set, distance: 5, distanceUnit: 'km', durationS: 1800 }])).toEqual({ equipment: 'other', primaryMuscles: [], loggingType: 'distance_time' });
    expect(guessOwnExercise('L-sit', [{ ...set, durationS: 20 }])).toEqual({ equipment: 'other', primaryMuscles: [], loggingType: 'timed' });
    expect(guessOwnExercise('Muscle-up', [{ ...set, reps: 3 }])).toMatchObject({ equipment: 'bodyweight', loggingType: 'bodyweight_plus' });
  });

  it('keeps a guessed exercise to the six types your own can have, never a program type (R607)', () => {
    const set = { setType: 'working' as const, weight: null, weightUnit: null, reps: null, rpe: null, durationS: null, distance: null, distanceUnit: null };
    // A carry from another app: weight and feet. Your own exercise logs it by distance; the weight stays on each set.
    expect(guessOwnExercise('Keg carry', [{ ...set, weight: 150, weightUnit: 'lb', distance: 50, distanceUnit: 'ft' }]).loggingType).toBe('distance_time');
    // A score: rounds and extra reps read as reps.
    expect(guessOwnExercise('Murph AMRAP', [{ ...set, reps: 6, extraReps: 4 }]).loggingType).toBe('bodyweight_plus');
  });
});
