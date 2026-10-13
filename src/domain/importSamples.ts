/**
 * The sample files Settings → Import data offers (R565): the plainest form of each kind GymHound reads, to copy from
 * or fill in. One row per set, per day's measurements, or per thing eaten. Other apps' exports (Strong, Hevy, FitNotes,
 * food trackers) don't need changing first; these are for anyone building a file by hand.
 */
export const IMPORT_SAMPLES = {
  workouts: [
    'date,workout,exercise,set_type,weight,weight_unit,reps,rpe,duration_s,distance,distance_unit,notes',
    '2026-09-01,Push A,Barbell bench press,warmup,95,lb,10,,,,,',
    '2026-09-01,Push A,Barbell bench press,working,185,lb,5,8,,,,',
    '2026-09-01,Push A,Barbell bench press,working,185,lb,5,8.5,,,,Paused the first rep',
    '2026-09-01,Push A,Overhead press,working,115,lb,8,,,,,',
    '2026-09-01,Push A,Plank,working,,,,,60,,,',
    '2026-09-03,Easy run,Running,working,,,,,1800,5,km,',
  ].join('\r\n'),
  body: [
    'date,bodyweight,unit,body_fat,waist,chest,hips,arms,thighs,neck',
    '2026-09-01,182.4,lb,18.5,34,42,40,15,24,16',
    '2026-09-08,181.6,lb,,33.75,,,,,',
  ].join('\r\n'),
  food: [
    'date,name,servings,calories,protein,carbs,fat',
    '2026-09-01,Greek yogurt,1,150,20,8,4',
    '2026-09-01,Chicken breast,1.5,248,46,0,5.4',
    '2026-09-01,Rice,1,205,4.3,45,0.4',
  ].join('\r\n'),
} as const;

export type SampleKind = keyof typeof IMPORT_SAMPLES;
