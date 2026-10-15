import { PROGRAM_ORDER, PROGRAMS } from './programs.generated';

export type SeedRoutineExercise = {
  /** The routine exercise's id: the program slot's id, `${dayId}:${exercise}` (with `@2`… for a repeat, R625). */
  id: string;
  /** The id of a library exercise: a ladder slot's first rung (R618). For timed exercises `reps` is a range in seconds. */
  exercise: string;
  sets: number;
  reps: [number, number];
  /** The slot's increment in lb; the seed writes it in the lifter's unit, kg being half (R611). 0 is reps only. */
  incrementLb: number;
};

export type SeedRoutine = {
  id: string;
  name: string;
  /** Day id is `${routine.id}:${slug}`. */
  days: { slug: string; name: string; exercises: SeedRoutineExercise[] }[];
};

/**
 * The twenty programs (§18.29, R596), as the seed writes them: each from the bundled program data
 * (`programs.generated.ts`), by program number. The rest of a slot's rule (ladders, added sets, runs, weeks, misses)
 * is read from that data when a workout runs; the database holds only what §7.3 needs and the lifter's progress.
 */
export const SEED_ROUTINES: readonly SeedRoutine[] = PROGRAMS.map((program) => ({
  id: program.id,
  name: program.name,
  days: program.days.map((day) => ({
    slug: day.slug,
    name: day.name,
    exercises: day.slots.map((slot) => ({
      id: slot.id,
      exercise: slot.exerciseId,
      sets: slot.sets,
      reps: [slot.repMin, slot.repMax],
      incrementLb: slot.incrementLb,
    })),
  })),
}));

/** The order Routines lists the programs: the free five first, then the Pro fifteen by number (R597). */
export const PREMADE_ORDER: readonly string[] = PROGRAM_ORDER;

/**
 * The nine old programs seed version 9 retired (R598), in the order Routines listed them, which Earlier programs keeps.
 * Retired, never deleted: whoever has one keeps it whole, and it keeps running.
 */
export const RETIRED_PREMADES: readonly string[] = [
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
