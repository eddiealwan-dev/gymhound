/**
 * The rule test (§18.28, R581–R584): three still screens of one exercise that a lifter sees for five seconds each, then
 * five questions, to check that the rule and the Something off hold are understood before the store copy is locked.
 * Every line on the screens comes from the app's own rule functions (`ruleSentence`, `todaysRead`, `computeOutcome`,
 * `finishLine`), so a change to the rule's words changes the test with it.
 */

import { MARK_LABELS } from './labels';
import { gearFor } from './plates';
import { computeOutcome } from './progression';
import { finishLine, ruleSentence, todaysRead, type Rule } from './ruleLine';
import type { ExerciseMark } from './types';
import { formatWeight } from './units';

/** How long each screen shows (R582). */
export const RULE_TEST_SECONDS = 5;

/** The questions, asked after the three screens, in order (R583). */
export const RULE_TEST_QUESTIONS = [
  'What will happen next time?',
  'Why?',
  'What does "Something off" mean here?',
  'What would you do if you disagreed?',
  'Who decided to hold the weight, you or the app?',
] as const;

/** One set as the screen draws it: last time's numbers, today's, and whether it is complete. */
export type RuleTestSet = { previous: string; weight: number; reps: number; done: boolean };

/** One still screen (R581). */
export type RuleTestScreen = {
  key: 'rule' | 'hold' | 'miss';
  /** The exercise's name, as in the session. */
  name: string;
  /** What the name row's Something off control shows: the reason when marked. */
  markLabel: string;
  /** The muted line under the name: the rule, then today's read. */
  ruleLine: string;
  sets: RuleTestSet[];
  /** The finish summary's line for the exercise. */
  finish: string;
};

const NAME = 'Bench press';
const RULE: Rule = { setCount: 3, repMin: 6, repMax: 8, increment: 5, incrementUnit: 'lb' };
const PLANNED = 135;
const LAST_TIME = '135 × 7';
/** The default bar and plates in lb (Settings' defaults), for the barbell rounding. */
const GEAR = gearFor('lb', { barLb: 45, barKg: 20, platesLb: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 }, platesKg: {} });

function screen(key: RuleTestScreen['key'], mark: ExerciseMark | null, today: { weight: number; reps: number }[]): RuleTestScreen {
  const sets = today.map((s) => ({ previous: LAST_TIME, weight: s.weight, reps: s.reps, done: true }));
  const sentence = ruleSentence({
    rule: RULE,
    loggingType: 'weighted',
    unit: 'lb',
    last: { sets: 3, reps: 7, weight: PLANNED, weightUnit: 'lb', durationS: null, distance: null, distanceUnit: null },
  });
  const read = todaysRead({
    rule: RULE,
    loggingType: 'weighted',
    planned: { weight: PLANNED, unit: 'lb' },
    override: null,
    mark,
    equipment: 'barbell',
    gear: GEAR,
  });
  const outcome = computeOutcome({
    rule: RULE,
    plannedWeight: PLANNED,
    plannedUnit: 'lb',
    loggingType: 'weighted',
    equipment: 'barbell',
    marked: mark !== null,
    sets: sets.map((s) => ({ setType: 'working', done: true, weight: s.weight, weightUnit: 'lb', reps: s.reps, durationS: null })),
    gear: { lb: GEAR, kg: GEAR },
  });
  const finish = finishLine({
    workoutExerciseId: key,
    name: NAME,
    loggingType: 'weighted',
    outcome: outcome.outcome,
    nextWeight: outcome.nextWeight ?? PLANNED,
    nextUnit: outcome.nextUnit ?? 'lb',
    mark,
  });
  return {
    key,
    name: NAME,
    markLabel: mark === null ? 'Something off' : MARK_LABELS[mark],
    ruleLine: read === null ? sentence : `${sentence} ${read}`,
    sets,
    finish,
  };
}

/**
 * The three screens, in the order shown (R581): every set hits 8 on a normal day (next time goes up); the same exercise
 * marked Rough sleep and lifted lighter (it holds at the planned weight); a normal day one rep short (it holds too, so a
 * lifter who can't tell this from the hold hasn't seen what Something off adds).
 */
export function ruleTestScreens(): RuleTestScreen[] {
  return [
    screen('rule', null, [
      { weight: 135, reps: 8 },
      { weight: 135, reps: 8 },
      { weight: 135, reps: 8 },
    ]),
    screen('hold', 'rough_sleep', [
      { weight: 125, reps: 8 },
      { weight: 125, reps: 8 },
      { weight: 125, reps: 8 },
    ]),
    screen('miss', null, [
      { weight: 135, reps: 8 },
      { weight: 135, reps: 8 },
      { weight: 135, reps: 7 },
    ]),
  ];
}

/** A set's weight as the table shows it. */
export const ruleTestWeight = (weight: number): string => formatWeight(weight, 'lb');

/** One person's answers (R584). */
export type RuleTestEntry = { who: string; at: number; answers: string[] };

/** The stored list, read loosely: anything that isn't an entry is dropped. */
export function readRuleTestEntries(stored: unknown): RuleTestEntry[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (e): e is RuleTestEntry =>
      typeof e === 'object' &&
      e !== null &&
      typeof (e as RuleTestEntry).who === 'string' &&
      typeof (e as RuleTestEntry).at === 'number' &&
      Array.isArray((e as RuleTestEntry).answers) &&
      (e as RuleTestEntry).answers.every((a) => typeof a === 'string'),
  );
}

/** Every entry as plain text to share (R584): who, the date, then each question and its answer. */
export function ruleTestText(entries: readonly RuleTestEntry[], locale?: string): string {
  const blocks = entries.map((e) => {
    const date = new Date(e.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const lines = RULE_TEST_QUESTIONS.map((q, i) => `${q}\n${e.answers[i]?.trim() || '(no answer)'}`);
    return [`${e.who} · ${date}`, ...lines].join('\n\n');
  });
  return ['GymHound rule test', ...blocks].join('\n\n---\n\n');
}
