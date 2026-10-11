// Weekly working sets and training frequency of a program (§18.3, §18.8 R87): the numbers each built-in program is
// checked against, about 10–20 hard sets per major muscle a week, each trained at least twice where the split allows.
// Pure: a program is a week of days, and `muscles` says what each exercise trains.
import type { Muscle } from './types';

type ProgramDays = readonly { exercises: readonly { exerciseId: string; sets: number }[] }[];
type MusclesOf = (exerciseId: string) => { primary: Muscle[]; secondary: Muscle[] };

const ALL_MUSCLES: readonly Muscle[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
];

export type MajorGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes';

/** The major muscle groups the programs are checked against: shoulders are all three delts, back is lats and upper back. */
export const MAJOR_GROUPS: Readonly<Record<MajorGroup, readonly Muscle[]>> = {
  chest: ['chest'],
  back: ['lats', 'upper_back'],
  shoulders: ['front_delts', 'side_delts', 'rear_delts'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  quads: ['quads'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
};

/** Every muscle as a target of its own. */
const EACH_MUSCLE = {} as Record<Muscle, readonly Muscle[]>;
for (const m of ALL_MUSCLES) EACH_MUSCLE[m] = [m];

/**
 * Per target: weekly sets (a set counts once per target, 1 when it trains any of the target's muscles as primary, else
 * ½ when as secondary) and frequency (the days on which some exercise trains one of them as primary).
 */
function tally<K extends string>(days: ProgramDays, muscles: MusclesOf, targets: Readonly<Record<K, readonly Muscle[]>>) {
  const keys = Object.keys(targets) as K[];
  const sets = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  const frequency = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const day of days) {
    const trainedToday = new Set<K>();
    for (const { exerciseId, sets: count } of day.exercises) {
      const { primary, secondary } = muscles(exerciseId);
      for (const key of keys) {
        const target = targets[key];
        if (primary.some((m) => target.includes(m))) {
          sets[key] += count;
          trainedToday.add(key);
        } else if (secondary.some((m) => target.includes(m))) {
          sets[key] += count / 2;
        }
      }
    }
    for (const key of trainedToday) frequency[key] += 1;
  }
  return { sets, frequency };
}

/** Working sets a week per muscle: each set counts 1 for a primary muscle and ½ for a secondary; each day runs once a week. */
export function weeklySetsByMuscle(days: ProgramDays, muscles: MusclesOf): Record<Muscle, number> {
  return tally(days, muscles, EACH_MUSCLE).sets;
}

/** The days a week that train each muscle as primary. */
export function weeklyFrequency(days: ProgramDays, muscles: MusclesOf): Record<Muscle, number> {
  return tally(days, muscles, EACH_MUSCLE).frequency;
}

/** Working sets a week per major group; a set counts once per group (1 as primary, else ½ as secondary). */
export function weeklySetsByGroup(days: ProgramDays, muscles: MusclesOf): Record<MajorGroup, number> {
  return tally(days, muscles, MAJOR_GROUPS).sets;
}

/** The days a week that train any muscle of each major group as primary. */
export function weeklyFrequencyByGroup(days: ProgramDays, muscles: MusclesOf): Record<MajorGroup, number> {
  return tally(days, muscles, MAJOR_GROUPS).frequency;
}
