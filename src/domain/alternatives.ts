import type { Equipment, LoggingType, Muscle, Pattern } from './types';

/** What Modify knows about an exercise to compare it with another (R553). */
export type SwapCandidate = {
  id: string;
  name: string;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  pattern: Pattern;
  equipment: Equipment;
  loggingType: LoggingType;
  isCustom: boolean;
};

/** How many alternatives Modify lists. */
export const ALTERNATIVES_SHOWN = 8;

/**
 * Logged by time, by distance, by load and reps, by load and distance (a program's carry), or as a score (a program's
 * AMRAP or For Time, R607): a swap keeps to the same kind, so its sets still make sense.
 */
function logKind(type: LoggingType): 'time' | 'distance' | 'reps' | 'carry' | 'score' {
  if (type === 'timed' || type === 'weighted_time') return 'time';
  if (type === 'distance_time') return 'distance';
  if (type === 'weighted_distance') return 'carry';
  if (type === 'rounds' || type === 'for_time') return 'score';
  return 'reps';
}

/**
 * Names that are rarely what someone swapping a lift wants: stretches and mobility drills, Olympic lifts, and gymnastic
 * or strongman feats. They are offered only for an exercise that is one of them.
 */
const SPECIALTY = /stretch|vacuum|\bsmr\b|snatch|\bclean\b|\bjerk\b|balance|muscle[- ]?up|kipping|rope climb|london bridge|neck press|bradford|halo|jammer|toe touch|scissor/i;

/** Movements close enough to stand in for each other: knee-dominant legs, presses, pulls. */
function patternFamily(p: Pattern): string {
  if (p === 'squat' || p === 'lunge') return 'knee';
  if (p === 'horizontal_push' || p === 'vertical_push') return 'push';
  if (p === 'horizontal_pull' || p === 'vertical_pull') return 'pull';
  return p;
}

/** Free weights, machines and cables, and the body: equipment a gym puts near each other, for "closest equipment". */
function equipmentFamily(e: Equipment): string {
  if (e === 'barbell' || e === 'ez_bar' || e === 'dumbbell' || e === 'kettlebell') return 'free';
  if (e === 'machine' || e === 'cable') return 'station';
  if (e === 'bodyweight' || e === 'band') return 'body';
  return e;
}

/**
 * Exercises that work the same muscles as `target`, best first (R553, the owner's Modify): each must share its main
 * muscle (the first primary) and how its sets are logged. They rank by: the same movement (a squat for a squat), or a close one (a lunge for a squat), how
 * many muscles they share, the library's everyday staples before the long tail and your own exercises, the same
 * equipment, then equipment of the same kind, then name. `exclude` leaves out the exercise itself and any already in
 * the day. At most `ALTERNATIVES_SHOWN`.
 */
export function alternativesFor(target: SwapCandidate, candidates: readonly SwapCandidate[], exclude: ReadonlySet<string>): SwapCandidate[] {
  const main = target.primaryMuscles[0];
  if (main === undefined) return [];
  const targetMuscles = new Set([...target.primaryMuscles, ...target.secondaryMuscles]);
  const specialtyOk = SPECIALTY.test(target.name);
  const scored = candidates
    .filter(
      (c) =>
        c.id !== target.id &&
        !exclude.has(c.id) &&
        c.primaryMuscles[0] === main &&
        logKind(c.loggingType) === logKind(target.loggingType) &&
        (specialtyOk || !SPECIALTY.test(c.name)),
    )
    .map((c) => {
      const shared = [...c.primaryMuscles, ...c.secondaryMuscles].filter((m) => targetMuscles.has(m)).length;
      // The library's own ids (not fedb-, not yours) are the everyday staples the programs use.
      const staple = !c.isCustom && !c.id.startsWith('fedb-');
      const score =
        (c.pattern === target.pattern ? 8 : patternFamily(c.pattern) === patternFamily(target.pattern) ? 4 : 0) +
        Math.min(shared, 4) +
        (staple ? 3 : 0) +
        (c.equipment === target.equipment ? 2 : equipmentFamily(c.equipment) === equipmentFamily(target.equipment) ? 1 : 0);
      return { c, score };
    });
  scored.sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name));
  return scored.slice(0, ALTERNATIVES_SHOWN).map((s) => s.c);
}

/**
 * For a program's exercise, the exercise the program itself has there: its id ends in it (`{routine}:{day}:{exercise}`,
 * as the seed writes it). Null for a routine of your own, whose ids say nothing about it.
 */
export function programExerciseId(routineExerciseId: string, isPremade: boolean): string | null {
  if (!isPremade) return null;
  const at = routineExerciseId.lastIndexOf(':');
  return at === -1 ? null : routineExerciseId.slice(at + 1);
}
