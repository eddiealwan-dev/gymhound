const MINUS_15_MS = 15_000;

/**
 * Whole seconds left on the rest timer, rounded up so it never shows 0:00 while still running.
 * Null when no timer is set or its end time has passed, so a timer that expired while the app
 * was closed shows nothing (Review Focus 1).
 */
export function restRemainingSeconds(endsAt: number | null, now: number): number | null {
  if (endsAt === null || endsAt <= now) return null;
  return Math.ceil((endsAt - now) / 1000);
}

/** The new end time after tapping -15s, or null when that would end the timer. */
export function minus15(endsAt: number, now: number): number | null {
  const shortened = endsAt - MINUS_15_MS;
  return shortened > now ? shortened : null;
}

/**
 * Whether ticking a set starts the rest timer (spec 8.4): always, unless the exercise is in a
 * superset and is not the last member of its round.
 */
export function shouldStartRestAfterTick(
  exercises: { id: string; position: number; supersetGroup: number | null }[],
  workoutExerciseId: string,
): boolean {
  const ticked = exercises.find((e) => e.id === workoutExerciseId);
  if (!ticked || ticked.supersetGroup === null) return true;
  return exercises.every((e) => e.supersetGroup !== ticked.supersetGroup || e.position <= ticked.position);
}
