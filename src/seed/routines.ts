/**
 * `default` is the settings default increment for the unit (5 lb or 2.5 kg), `double` is twice that
 * (10 lb or 5 kg) and `none` is 0, progression by reps only.
 */
export type SeedIncrement = 'default' | 'double' | 'none';

export type SeedRoutineExercise = {
  /** The id of a bundled exercise. For timed exercises `reps` is a range in seconds. */
  exercise: string;
  sets: number;
  reps: [number, number];
  inc: SeedIncrement;
};

export type SeedRoutine = {
  id: string;
  name: string;
  /** Day id is `${routine.id}:${slug}`. A routine exercise id is `${dayId}:${exercise}`. */
  days: { slug: string; name: string; exercises: SeedRoutineExercise[] }[];
};

const ex = (
  exercise: string,
  sets: number,
  repMin: number,
  repMax: number,
  inc: SeedIncrement = 'default',
): SeedRoutineExercise => ({ exercise, sets, reps: [repMin, repMax], inc });

/** The six premade routines (spec §10.2), in display order. */
export const SEED_ROUTINES: SeedRoutine[] = [
  {
    id: 'premade-fullbody-3',
    name: 'Full body',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          ex('barbell-back-squat', 3, 6, 10),
          ex('barbell-bench-press', 3, 6, 10),
          ex('barbell-row', 3, 8, 12),
          ex('dumbbell-lateral-raise', 2, 12, 15),
          ex('plank', 3, 30, 60, 'none'),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          ex('barbell-deadlift', 3, 5, 8),
          ex('barbell-overhead-press', 3, 6, 10),
          ex('lat-pulldown', 3, 8, 12),
          ex('dumbbell-walking-lunge', 2, 8, 12),
          ex('cable-triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          ex('leg-press', 3, 10, 15),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('seated-cable-row', 3, 10, 12),
          ex('barbell-hip-thrust', 3, 8, 12),
          ex('dumbbell-curl', 2, 10, 15),
        ],
      },
    ],
  },
  {
    id: 'premade-upperlower-4',
    name: 'Upper/lower',
    days: [
      {
        slug: 'upper-a',
        name: 'Upper A',
        exercises: [
          ex('barbell-bench-press', 4, 5, 8),
          ex('barbell-row', 4, 6, 10),
          ex('barbell-overhead-press', 3, 8, 12),
          ex('lat-pulldown', 3, 8, 12),
          ex('dumbbell-curl', 2, 10, 15),
          ex('cable-triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        slug: 'lower-a',
        name: 'Lower A',
        exercises: [
          ex('barbell-back-squat', 4, 5, 8),
          ex('barbell-romanian-deadlift', 3, 8, 12),
          ex('leg-press', 3, 10, 15),
          ex('lying-leg-curl', 3, 10, 15),
          ex('standing-calf-raise', 3, 10, 15),
        ],
      },
      {
        slug: 'upper-b',
        name: 'Upper B',
        exercises: [
          ex('barbell-overhead-press', 4, 5, 8),
          ex('pull-up', 3, 6, 10),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('seated-cable-row', 3, 10, 12),
          ex('dumbbell-lateral-raise', 3, 12, 15),
          ex('face-pull', 2, 12, 15),
        ],
      },
      {
        slug: 'lower-b',
        name: 'Lower B',
        exercises: [
          ex('barbell-deadlift', 3, 4, 6),
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          ex('barbell-hip-thrust', 3, 8, 12),
          ex('leg-extension', 3, 10, 15),
          ex('seated-calf-raise', 3, 12, 15),
          ex('hanging-leg-raise', 3, 10, 15, 'none'),
        ],
      },
    ],
  },
  {
    id: 'premade-ppl-6',
    name: 'Push/pull/legs',
    days: [
      {
        slug: 'push-a',
        name: 'Push A',
        exercises: [
          ex('barbell-bench-press', 4, 5, 8),
          ex('barbell-overhead-press', 3, 8, 12),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('dumbbell-lateral-raise', 3, 12, 15),
          ex('cable-triceps-pushdown', 3, 10, 15),
        ],
      },
      {
        slug: 'pull-a',
        name: 'Pull A',
        exercises: [
          ex('barbell-deadlift', 3, 4, 6),
          ex('pull-up', 3, 6, 10),
          ex('barbell-row', 3, 8, 12),
          ex('face-pull', 3, 12, 15),
          ex('barbell-curl', 3, 8, 12),
        ],
      },
      {
        slug: 'legs-a',
        name: 'Legs A',
        exercises: [
          ex('barbell-back-squat', 4, 5, 8),
          ex('barbell-romanian-deadlift', 3, 8, 12),
          ex('leg-press', 3, 10, 15),
          ex('lying-leg-curl', 3, 10, 15),
          ex('standing-calf-raise', 4, 10, 15),
        ],
      },
      {
        slug: 'push-b',
        name: 'Push B',
        exercises: [
          ex('barbell-overhead-press', 4, 5, 8),
          ex('barbell-incline-bench-press', 3, 6, 10),
          ex('dip', 3, 8, 12),
          ex('cable-lateral-raise', 3, 12, 15),
          ex('cable-overhead-triceps-extension', 3, 10, 15),
        ],
      },
      {
        slug: 'pull-b',
        name: 'Pull B',
        exercises: [
          ex('barbell-row', 4, 6, 10),
          ex('lat-pulldown', 3, 8, 12),
          ex('seated-cable-row', 3, 10, 12),
          ex('dumbbell-reverse-fly', 3, 12, 15),
          ex('dumbbell-hammer-curl', 3, 10, 15),
        ],
      },
      {
        slug: 'legs-b',
        name: 'Legs B',
        exercises: [
          ex('barbell-front-squat', 3, 6, 10),
          ex('barbell-hip-thrust', 3, 8, 12),
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          ex('leg-extension', 3, 10, 15),
          ex('seated-calf-raise', 4, 12, 15),
        ],
      },
    ],
  },
  {
    id: 'premade-5x5-3',
    name: '5×5',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          ex('barbell-back-squat', 5, 5, 5),
          ex('barbell-bench-press', 5, 5, 5),
          ex('barbell-row', 5, 5, 5),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          ex('barbell-back-squat', 5, 5, 5),
          ex('barbell-overhead-press', 5, 5, 5),
          ex('barbell-deadlift', 1, 5, 5, 'double'),
        ],
      },
    ],
  },
  {
    id: 'premade-dumbbell-3',
    name: 'Dumbbell only',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          ex('dumbbell-goblet-squat', 3, 8, 12),
          ex('dumbbell-bench-press', 3, 8, 12),
          ex('dumbbell-one-arm-row', 3, 8, 12),
          ex('dumbbell-lateral-raise', 2, 12, 15),
          ex('dumbbell-curl', 2, 10, 15),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          ex('dumbbell-romanian-deadlift', 3, 8, 12),
          ex('dumbbell-seated-shoulder-press', 3, 8, 12),
          ex('dumbbell-reverse-lunge', 3, 8, 12),
          ex('dumbbell-chest-supported-row', 3, 10, 12),
          ex('dumbbell-overhead-triceps-extension', 2, 10, 15),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('dumbbell-reverse-fly', 3, 12, 15),
          ex('dumbbell-hammer-curl', 2, 10, 15),
          ex('dumbbell-standing-calf-raise', 3, 12, 15),
        ],
      },
    ],
  },
  {
    id: 'premade-noequipment-3',
    name: 'No equipment',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          ex('bodyweight-squat', 3, 15, 25, 'none'),
          ex('push-up', 3, 8, 20, 'none'),
          ex('glute-bridge', 3, 12, 20, 'none'),
          ex('superman', 3, 12, 20, 'none'),
          ex('plank', 3, 30, 60, 'none'),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          ex('bodyweight-reverse-lunge', 3, 10, 15, 'none'),
          ex('pike-push-up', 3, 6, 12, 'none'),
          ex('single-leg-glute-bridge', 3, 10, 15, 'none'),
          ex('dead-bug', 3, 10, 15, 'none'),
          ex('side-plank', 3, 20, 45, 'none'),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          ex('bodyweight-split-squat', 3, 10, 15, 'none'),
          ex('close-grip-push-up', 3, 6, 15, 'none'),
          ex('bird-dog', 3, 10, 15, 'none'),
          ex('wall-sit', 3, 30, 60, 'none'),
          ex('hollow-body-hold', 3, 20, 40, 'none'),
        ],
      },
    ],
  },
];

/** The premade routine ids in display order. */
export const PREMADE_ORDER: string[] = SEED_ROUTINES.map((r) => r.id);
