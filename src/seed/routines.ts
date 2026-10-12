/**
 * `default` is the settings default increment for the unit (5 lb or 2.5 kg), `double` is twice that
 * (10 lb or 5 kg) and `none` is 0, progression by reps only.
 */
export type SeedIncrement = 'default' | 'double' | 'none';

export type SeedRoutineExercise = {
  /** The id of a library exercise. For timed exercises `reps` is a range in seconds. */
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

/** Lower-body barbell lifts rise by twice the default increment. */
const lowerBarbell = (exercise: string, sets: number, repMin: number, repMax: number) => ex(exercise, sets, repMin, repMax, 'double');

/** Bodyweight and timed work progresses by reps (or seconds) only. */
const reps = (exercise: string, sets: number, repMin: number, repMax: number) => ex(exercise, sets, repMin, repMax, 'none');

/**
 * The nine built-in programs (§18.3, §18.8 R87, §18.21 R520), in display order, written as a coach would: compounds first, a real
 * press on every pressing day. Each is built on current evidence: about 10–20 working sets per major muscle a week
 * (held to 8–24, shoulders capped on side and rear delts, R93) and each trained at least twice (the bro split once;
 * Mobility is stretches), checked by `routines.test.ts` with `src/domain/programVolume.ts`. Main lifts work 5–8
 * reps, accessories 8–12 or 10–15, calves and lateral raises 12–20. Programs that continue keep their ids, day slugs and exercise ids, so their
 * next weights survive: Push/pull/legs, Upper/lower (now 4-day upper/lower), Full body (now Beginner full body) and
 * Dumbbell only (now Dumbbell full body). No equipment is retired (`runSeed`); 5×5 came back after Round 8 (R520).
 */
export const SEED_ROUTINES: SeedRoutine[] = [
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
          ex('dumbbell-lateral-raise', 3, 12, 20),
          ex('cable-triceps-pushdown', 3, 10, 15),
        ],
      },
      {
        slug: 'pull-a',
        name: 'Pull A',
        exercises: [
          lowerBarbell('barbell-deadlift', 3, 5, 8),
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
          lowerBarbell('barbell-back-squat', 4, 5, 8),
          lowerBarbell('barbell-romanian-deadlift', 3, 8, 12),
          ex('leg-press', 3, 10, 15),
          ex('lying-leg-curl', 3, 10, 15),
          ex('standing-calf-raise', 4, 12, 20),
        ],
      },
      {
        slug: 'push-b',
        name: 'Push B',
        exercises: [
          ex('barbell-overhead-press', 4, 5, 8),
          ex('barbell-incline-bench-press', 3, 6, 10),
          ex('dip', 3, 8, 12),
          ex('cable-lateral-raise', 3, 12, 20),
          ex('cable-overhead-triceps-extension', 3, 10, 15),
        ],
      },
      {
        slug: 'pull-b',
        name: 'Pull B',
        exercises: [
          ex('barbell-row', 4, 6, 10),
          ex('lat-pulldown', 3, 8, 12),
          ex('seated-cable-row', 3, 8, 12),
          ex('dumbbell-reverse-fly', 3, 12, 15),
          ex('dumbbell-hammer-curl', 3, 10, 15),
        ],
      },
      {
        slug: 'legs-b',
        name: 'Legs B',
        exercises: [
          lowerBarbell('barbell-front-squat', 3, 5, 8),
          lowerBarbell('barbell-hip-thrust', 3, 8, 12),
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          ex('leg-extension', 3, 10, 15),
          ex('fedb-seated-leg-curl', 3, 10, 15),
          ex('seated-calf-raise', 4, 12, 20),
        ],
      },
    ],
  },
  {
    id: 'premade-upperlower-4',
    name: '4-day upper/lower',
    days: [
      {
        slug: 'upper-a',
        name: 'Upper A',
        exercises: [
          ex('barbell-bench-press', 5, 5, 8),
          ex('barbell-row', 4, 6, 10),
          ex('barbell-overhead-press', 3, 8, 12),
          ex('lat-pulldown', 3, 8, 12),
          ex('cable-lateral-raise', 3, 12, 20),
          ex('dumbbell-curl', 2, 10, 15),
          ex('cable-triceps-pushdown', 2, 10, 15),
        ],
      },
      {
        slug: 'lower-a',
        name: 'Lower A',
        exercises: [
          lowerBarbell('barbell-back-squat', 4, 5, 8),
          lowerBarbell('barbell-romanian-deadlift', 3, 6, 10),
          ex('leg-press', 3, 10, 15),
          ex('lying-leg-curl', 3, 10, 15),
          ex('standing-calf-raise', 4, 12, 20),
        ],
      },
      {
        slug: 'upper-b',
        name: 'Upper B',
        exercises: [
          ex('barbell-overhead-press', 4, 5, 8),
          ex('pull-up', 3, 6, 10),
          ex('incline-dumbbell-press', 4, 8, 12),
          ex('seated-cable-row', 3, 8, 12),
          ex('face-pull', 2, 12, 15),
          ex('dumbbell-lateral-raise', 3, 12, 20),
          ex('dumbbell-hammer-curl', 2, 10, 15),
          ex('cable-overhead-triceps-extension', 2, 10, 15),
        ],
      },
      {
        slug: 'lower-b',
        name: 'Lower B',
        exercises: [
          lowerBarbell('barbell-deadlift', 3, 5, 8),
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          lowerBarbell('barbell-hip-thrust', 3, 8, 12),
          ex('leg-extension', 3, 10, 15),
          ex('seated-calf-raise', 4, 12, 20),
          reps('hanging-leg-raise', 3, 10, 15),
        ],
      },
    ],
  },
  {
    id: 'premade-fullbody-3',
    name: 'Beginner full body',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          lowerBarbell('barbell-back-squat', 3, 5, 8),
          ex('barbell-bench-press', 3, 5, 8),
          ex('barbell-row', 3, 6, 10),
          ex('lying-leg-curl', 3, 10, 15),
          ex('dumbbell-lateral-raise', 2, 12, 20),
          ex('dumbbell-hammer-curl', 2, 10, 15),
          reps('plank', 3, 30, 60),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          lowerBarbell('barbell-deadlift', 3, 5, 8),
          ex('barbell-overhead-press', 3, 5, 8),
          ex('lat-pulldown', 3, 8, 12),
          ex('dumbbell-walking-lunge', 3, 8, 12),
          ex('dumbbell-bench-press', 3, 8, 12),
          ex('cable-triceps-pushdown', 3, 10, 15),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          ex('leg-press', 3, 10, 15),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('seated-cable-row', 3, 8, 12),
          lowerBarbell('barbell-hip-thrust', 3, 8, 12),
          ex('dumbbell-curl', 3, 10, 15),
          ex('dumbbell-overhead-triceps-extension', 3, 10, 15),
        ],
      },
    ],
  },
  {
    id: 'premade-advancedfullbody-4',
    name: 'Advanced full body',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          lowerBarbell('barbell-back-squat', 4, 5, 8),
          ex('barbell-bench-press', 4, 5, 8),
          ex('barbell-row', 3, 6, 10),
          ex('lying-leg-curl', 3, 10, 15),
          ex('dumbbell-lateral-raise', 3, 12, 20),
          ex('cable-triceps-pushdown', 3, 10, 15),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          lowerBarbell('barbell-deadlift', 3, 5, 8),
          ex('barbell-overhead-press', 3, 5, 8),
          ex('pull-up', 4, 6, 10),
          ex('dumbbell-walking-lunge', 3, 8, 12),
          ex('dumbbell-curl', 3, 10, 15),
          ex('standing-calf-raise', 4, 12, 20),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          lowerBarbell('barbell-front-squat', 3, 5, 8),
          ex('incline-dumbbell-press', 4, 8, 12),
          ex('seated-cable-row', 3, 8, 12),
          lowerBarbell('barbell-hip-thrust', 3, 8, 12),
          ex('face-pull', 3, 12, 15),
          ex('dumbbell-hammer-curl', 3, 10, 15),
        ],
      },
      {
        slug: 'd',
        name: 'D',
        exercises: [
          lowerBarbell('barbell-romanian-deadlift', 3, 8, 12),
          ex('dumbbell-bench-press', 3, 8, 12),
          ex('lat-pulldown', 3, 8, 12),
          ex('leg-extension', 3, 10, 15),
          ex('cable-lateral-raise', 3, 12, 20),
          ex('cable-overhead-triceps-extension', 3, 10, 15),
          ex('seated-calf-raise', 4, 12, 20),
        ],
      },
    ],
  },
  {
    id: 'premade-brosplit-5',
    name: 'Bro split',
    days: [
      {
        slug: 'chest',
        name: 'Chest',
        exercises: [
          ex('barbell-bench-press', 4, 5, 8),
          ex('incline-dumbbell-press', 4, 8, 12),
          ex('fedb-dumbbell-flyes', 3, 10, 15),
          ex('fedb-cable-crossover', 3, 10, 15),
        ],
      },
      {
        slug: 'back',
        name: 'Back',
        exercises: [
          ex('pull-up', 4, 6, 10),
          ex('barbell-row', 4, 6, 10),
          ex('lat-pulldown', 3, 8, 12),
          ex('seated-cable-row', 3, 8, 12),
        ],
      },
      {
        slug: 'shoulders',
        name: 'Shoulders',
        exercises: [
          ex('barbell-overhead-press', 4, 5, 8),
          ex('dumbbell-lateral-raise', 4, 12, 20),
          ex('cable-lateral-raise', 3, 12, 20),
          ex('dumbbell-reverse-fly', 4, 12, 15),
        ],
      },
      {
        slug: 'legs',
        name: 'Legs',
        exercises: [
          lowerBarbell('barbell-back-squat', 4, 5, 8),
          lowerBarbell('barbell-romanian-deadlift', 4, 6, 10),
          ex('leg-press', 4, 10, 15),
          ex('leg-extension', 3, 10, 15),
          ex('lying-leg-curl', 4, 10, 15),
          ex('standing-calf-raise', 4, 12, 20),
        ],
      },
      {
        slug: 'arms',
        name: 'Arms',
        exercises: [
          ex('barbell-curl', 4, 8, 12),
          ex('cable-triceps-pushdown', 4, 10, 15),
          ex('dumbbell-hammer-curl', 3, 10, 15),
          ex('fedb-ez-bar-skullcrusher', 3, 8, 12),
          ex('fedb-incline-dumbbell-curl', 3, 10, 15),
          ex('cable-overhead-triceps-extension', 3, 10, 15),
        ],
      },
    ],
  },
  {
    // The classic 5×5 (§18.21, R520): back by the owner's choice after Round 8 as one of free's four programs, with its
    // first ids, so a lifter who ran it before phase 3 picks up where they left off. Three main lifts a day, A and B
    // alternating; it is exempt from the volume check (R527), being the program people know by name.
    id: 'premade-5x5-3',
    name: '5×5',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [lowerBarbell('barbell-back-squat', 5, 5, 5), ex('barbell-bench-press', 5, 5, 5), ex('barbell-row', 5, 5, 5)],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [lowerBarbell('barbell-back-squat', 5, 5, 5), ex('barbell-overhead-press', 5, 5, 5), lowerBarbell('barbell-deadlift', 1, 5, 5)],
      },
    ],
  },
  {
    id: 'premade-dumbbell-3',
    name: 'Dumbbell full body',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          ex('dumbbell-goblet-squat', 4, 8, 12),
          ex('dumbbell-bench-press', 4, 8, 12),
          ex('dumbbell-one-arm-row', 4, 8, 12),
          ex('dumbbell-romanian-deadlift', 3, 8, 12),
          ex('dumbbell-lateral-raise', 3, 12, 20),
          ex('dumbbell-curl', 3, 10, 15),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          ex('dumbbell-reverse-lunge', 3, 8, 12),
          ex('dumbbell-seated-shoulder-press', 3, 8, 12),
          ex('dumbbell-chest-supported-row', 3, 8, 12),
          ex('dumbbell-romanian-deadlift', 4, 8, 12),
          ex('fedb-dumbbell-flyes', 3, 10, 15),
          ex('dumbbell-overhead-triceps-extension', 3, 10, 15),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          ex('dumbbell-bulgarian-split-squat', 3, 8, 12),
          ex('incline-dumbbell-press', 3, 8, 12),
          ex('fedb-bent-over-two-dumbbell-row', 3, 8, 12),
          ex('dumbbell-reverse-fly', 3, 12, 15),
          ex('dumbbell-hammer-curl', 3, 10, 15),
          ex('fedb-tricep-dumbbell-kickback', 3, 10, 15),
          ex('dumbbell-standing-calf-raise', 3, 12, 20),
        ],
      },
    ],
  },
  {
    id: 'premade-calisthenics-3',
    name: 'Calisthenics',
    days: [
      {
        slug: 'a',
        name: 'A',
        exercises: [
          reps('pull-up', 4, 5, 10),
          reps('fedb-inverted-row-with-straps', 3, 8, 15),
          reps('push-up', 4, 8, 20),
          reps('bodyweight-split-squat', 3, 8, 15),
          reps('fedb-floor-glute-ham-raise', 3, 3, 8),
          reps('pike-push-up', 3, 6, 12),
          reps('plank', 3, 30, 60),
        ],
      },
      {
        slug: 'b',
        name: 'B',
        exercises: [
          reps('fedb-chin-up', 4, 5, 10),
          reps('fedb-inverted-row-with-straps', 3, 8, 15),
          reps('dip', 4, 6, 12),
          reps('bodyweight-reverse-lunge', 3, 8, 15),
          reps('single-leg-glute-bridge', 3, 10, 15),
          reps('hanging-leg-raise', 3, 8, 15),
        ],
      },
      {
        slug: 'c',
        name: 'C',
        exercises: [
          reps('fedb-chin-up', 3, 5, 10),
          reps('fedb-inverted-row-with-straps', 3, 8, 15),
          reps('close-grip-push-up', 4, 6, 15),
          reps('pike-push-up', 3, 6, 12),
          reps('bodyweight-squat', 4, 15, 25),
          reps('fedb-platform-hamstring-slides', 3, 8, 12),
          reps('side-plank', 3, 20, 45),
        ],
      },
    ],
  },
  {
    id: 'premade-mobility-3',
    name: 'Mobility',
    days: [
      {
        slug: 'hips-and-legs',
        name: 'Hips and legs',
        exercises: [
          reps('fedb-kneeling-hip-flexor', 2, 30, 60),
          reps('fedb-hamstring-stretch', 2, 30, 60),
          reps('fedb-knee-across-the-body', 2, 30, 60),
          reps('fedb-side-lying-groin-stretch', 2, 30, 60),
          reps('fedb-all-fours-quad-stretch', 2, 30, 60),
          reps('fedb-calf-stretch-hands-against-wall', 2, 30, 60),
        ],
      },
      {
        slug: 'back-and-shoulders',
        name: 'Back and shoulders',
        exercises: [
          reps('fedb-cat-stretch', 2, 20, 40),
          reps('fedb-childs-pose', 2, 30, 60),
          reps('fedb-chest-and-front-of-shoulder-stretch', 2, 30, 60),
          reps('fedb-shoulder-stretch', 2, 30, 60),
          reps('fedb-triceps-stretch', 2, 30, 60),
          reps('fedb-spinal-stretch', 2, 30, 60),
        ],
      },
      {
        slug: 'full-body',
        name: 'Full body',
        exercises: [
          reps('fedb-worlds-greatest-stretch', 2, 30, 60),
          reps('fedb-runners-stretch', 2, 30, 60),
          reps('fedb-the-straddle', 2, 30, 60),
          reps('fedb-dancers-stretch', 2, 30, 60),
          reps('fedb-one-knee-to-chest', 2, 30, 60),
          reps('fedb-upward-stretch', 2, 20, 40),
        ],
      },
    ],
  },
];

/** The premade routine ids in display order. */
/**
 * The order Routines lists the premades (§18.21): free's four first (Beginner full body, 5×5, Dumbbell full body,
 * Mobility), then the Pro programs.
 */
export const PREMADE_ORDER: string[] = [
  'premade-fullbody-3',
  'premade-5x5-3',
  'premade-dumbbell-3',
  'premade-mobility-3',
  'premade-ppl-6',
  'premade-upperlower-4',
  'premade-advancedfullbody-4',
  'premade-brosplit-5',
  'premade-calisthenics-3',
];
