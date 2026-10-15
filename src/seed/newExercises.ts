// The Program Library v2's 107 new exercises (spec §18.29, R602–R606) with their form demo steps: the rows of
// src/seed/newExerciseData.ts plus the steps of src/seed/steps/ (Tasks 3 and 4). Seed version 9 adds them, and they
// join libraryIds.json so they can never be dropped (R604).
import type { LibraryExercise } from './libraryMapping';
import { CATALOG_NEW, RUNG_NEW, type NewExerciseRow } from './newExerciseData';
import { CATALOG_STEPS } from './steps/catalogSteps';
import { RUNG_STEPS } from './steps/rungSteps';

export { CATALOG_NEW_IDS, NEW_ALIASES, PHOTO_ALIAS, RUNG_NEW_IDS } from './newExerciseData';

function withSteps(e: NewExerciseRow, steps: Readonly<Record<string, readonly string[]>>): LibraryExercise {
  return {
    id: e.id,
    sourceId: null,
    name: e.name,
    aliases: [],
    equipment: e.equipment,
    loggingType: e.loggingType,
    pattern: e.pattern,
    primaryMuscles: [...e.primaryMuscles],
    secondaryMuscles: [...e.secondaryMuscles],
    instructions: [...(steps[e.id] ?? [])],
  };
}

/** Appendix A's 48 then Appendix B's 59, each with no free-exercise-db source. */
export const NEW_EXERCISES: readonly LibraryExercise[] = [
  ...CATALOG_NEW.map((e) => withSteps(e, CATALOG_STEPS)),
  ...RUNG_NEW.map((e) => withSteps(e, RUNG_STEPS)),
];
