const PACE_START_MINUTES = 6 * 60;
const PACE_SPAN_MINUTES = 16 * 60;

/**
 * How much of the day's protein should be eaten by `atMs`: clamp((local time − 06:00) ÷ 16 h, 0, 1) (§7.10). 0 until
 * 06:00, 0.5 at 14:00, 1 from 22:00.
 */
export function proteinPace(atMs: number): number {
  const d = new Date(atMs);
  const minutes = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60_000;
  return Math.min(1, Math.max(0, (minutes - PACE_START_MINUTES) / PACE_SPAN_MINUTES));
}

/**
 * Whether a session offers "Short on food" (§7.10, R152), judged as of the workout's start: Pro is on, the workout
 * hasn't shown the offer, food was logged that day, a training-day protein target above 0 is set, no exercise is already
 * Short on food, and the protein logged by the start is below the target × `proteinPace(startedAt)`.
 */
export function shouldOfferShortOnFood(input: {
  isPro: boolean;
  offerShown: boolean;
  anyFoodToday: boolean;
  proteinSoFar: number;
  trainingProteinTarget: number | null;
  anyExerciseShortOnFood: boolean;
  startedAt: number;
}): boolean {
  const target = input.trainingProteinTarget;
  return (
    input.isPro &&
    !input.offerShown &&
    input.anyFoodToday &&
    target !== null &&
    target > 0 &&
    !input.anyExerciseShortOnFood &&
    input.proteinSoFar < target * proteinPace(input.startedAt)
  );
}
