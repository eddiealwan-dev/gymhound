/**
 * The tester questions (§18.28, R593): in a tester build (TestFlight), the finish summary of the 2nd finished workout
 * asks the stage 2 questions, and the 3rd asks the stage 3 ones, before any paywall. The answers stay on the phone until
 * the tester shares them from Settings.
 */

/** After the 2nd finished workout: did the loop work? */
const AFTER_SECOND = ['Did you lift the weight it showed today?', 'If not, why not?', 'Did anything about the rule confuse you?'] as const;

/** After the 3rd: did the rule earn trust? */
const AFTER_THIRD = [
  'Did the rule help you? How?',
  'Was there a time it held or raised the weight and you thought it was wrong?',
  'Would you pay to set your own rule on your own routines?',
] as const;

/** The questions to ask after this many finished workouts, or null for none. */
export function testerQuestionsFor(finishedWorkouts: number): readonly string[] | null {
  if (finishedWorkouts === 2) return AFTER_SECOND;
  if (finishedWorkouts === 3) return AFTER_THIRD;
  return null;
}

/** One set of answers: after which finished workout, when, and each question with its answer. */
export type TesterEntry = { workout: number; at: number; answers: { question: string; answer: string }[] };

/** The stored list, read loosely: anything that isn't an entry is dropped. */
export function readTesterEntries(stored: unknown): TesterEntry[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (e): e is TesterEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as TesterEntry).workout === 'number' &&
      typeof (e as TesterEntry).at === 'number' &&
      Array.isArray((e as TesterEntry).answers) &&
      (e as TesterEntry).answers.every((a) => typeof a?.question === 'string' && typeof a?.answer === 'string'),
  );
}

/** Whether the questions for this many finished workouts still need answers. */
export function testerQuestionsDue(finishedWorkouts: number, entries: readonly TesterEntry[]): boolean {
  return testerQuestionsFor(finishedWorkouts) !== null && !entries.some((e) => e.workout === finishedWorkouts);
}

const ordinal = (n: number) => (n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** Every entry as plain text to share (R594). */
export function testerText(entries: readonly TesterEntry[], locale?: string): string {
  const blocks = entries.map((e) => {
    const date = new Date(e.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const lines = e.answers.map((a) => `${a.question}\n${a.answer.trim() || '(no answer)'}`);
    return [`After the ${ordinal(e.workout)} workout · ${date}`, ...lines].join('\n\n');
  });
  return ['GymHound test answers', ...(blocks.length > 0 ? blocks : ['No answers yet.'])].join('\n\n---\n\n');
}
