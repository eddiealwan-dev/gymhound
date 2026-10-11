import type { Equipment, LoggingType, Muscle, Pattern } from './types';

/** What the custom exercise editor saves (R108). The pattern is derived (`customPattern`); there is no steps editor. */
export type CustomExerciseInput = {
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  equipment: Equipment;
  loggingType: LoggingType;
};

/** The editor's draft: a new exercise starts with no equipment chosen, so none is ever turned on unseen (R128). */
export type CustomExerciseDraft = Omit<CustomExerciseInput, 'equipment'> & { equipment: Equipment | null };

/** The longest name, in characters, once trimmed. */
export const MAX_NAME_LENGTH = 60;

/** The input as it is saved: the name trimmed, each muscle once, and a muscle chosen as primary dropped from secondary. */
export function normalizeCustomExercise<T extends CustomExerciseDraft>(input: T): T {
  const primaryMuscles = [...new Set(input.primaryMuscles)];
  const secondaryMuscles = [...new Set(input.secondaryMuscles)].filter((m) => !primaryMuscles.includes(m));
  return { ...input, name: input.name.trim(), primaryMuscles, secondaryMuscles };
}

/**
 * What stops the exercise being saved, in the order the editor lists it (R108): no name, a name over 60 characters, a
 * name you already have (ignoring case; `otherNames` are the exercises you can see, without this one), no primary
 * muscle, no equipment (R128). Empty when it can be saved.
 */
export function validateCustomExercise(input: CustomExerciseDraft, otherNames: readonly string[]): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (name === '') problems.push('Give the exercise a name.');
  else if ([...name].length > MAX_NAME_LENGTH) problems.push(`Keep the name to ${MAX_NAME_LENGTH} characters.`);
  else {
    const same = otherNames.find((other) => other.trim().toLowerCase() === name.toLowerCase());
    if (same !== undefined) problems.push(`You already have an exercise called ${same.trim()}.`);
  }
  if (input.primaryMuscles.length === 0) problems.push('Pick at least one primary muscle.');
  if (input.equipment === null) problems.push('Pick the equipment.');
  return problems;
}

/** The pattern of an exercise you made: weight and time is a carry; abs or obliques first is core; anything else isolation. */
export function customPattern(input: Pick<CustomExerciseInput, 'loggingType' | 'primaryMuscles'>): Pattern {
  if (input.loggingType === 'weighted_time') return 'carry';
  const first = input.primaryMuscles[0];
  if (first === 'abs' || first === 'obliques') return 'core';
  return 'isolation';
}
