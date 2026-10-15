import type { RuleKind } from '../seed/programTypes';
import type { Equipment, LoggingType, Pattern } from './types';

/**
 * The rest a program slot gets after a tick (R639): a heavy compound, another compound, an isolation move, or none
 * after a metcon or a run. The JSON gives the lengths by kind (heavy compound 2–3 min, upper compound 1.5–2 min,
 * isolation 60–90 s); the app takes the middle of each.
 */
export type RestKind = 'heavy' | 'compound' | 'isolation' | 'none';

/** The rest by kind, in seconds (R639). */
export const REST_BY_KIND: Record<RestKind, number> = { heavy: 150, compound: 105, isolation: 75, none: 0 };

/** The runs, rides, rows and walks of the programs, by exercise id: no lifting rest after any of them (R639). */
export const TIMED_RUN_IDS: ReadonlySet<string> = new Set([
  'easy-run',
  'interval-run',
  'tempo-run',
  'long-run',
  'bike-intervals',
  'rower-intervals',
  'incline-treadmill-walk',
]);

/** What `restKindOf` reads of a program slot and its exercise. */
export type RestKindInput = {
  exerciseId: string;
  ruleKind: RuleKind | null;
  loggingType: LoggingType;
  /** The slot is the day's main lift. */
  isMain: boolean;
  /** The slot opens its day. */
  firstOfDay: boolean;
  equipment: Equipment;
  pattern: Pattern;
};

const COMPOUND: readonly Pattern[] = ['squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'carry'];

/**
 * The rest kind of a program slot (R639): none after a metcon (its rule kind or score type) or a run (by id); heavy for
 * the day's main or first slot, an event (a carry, yoke or sled) and a barbell compound; compound for any other
 * multi-joint move; isolation for the rest, core and holds included.
 */
export function restKindOf(s: RestKindInput): RestKind {
  if (TIMED_RUN_IDS.has(s.exerciseId)) return 'none';
  if (s.ruleKind === 'metcon' || s.ruleKind === 'weekly_seconds' || s.loggingType === 'rounds' || s.loggingType === 'for_time') return 'none';
  if (s.isMain || s.firstOfDay || s.loggingType === 'weighted_distance') return 'heavy';
  const compound = COMPOUND.includes(s.pattern);
  if (compound && s.equipment === 'barbell') return 'heavy';
  return compound ? 'compound' : 'isolation';
}

/**
 * How long the rest after a tick is, in seconds (0 is none). A program slot never rests after a metcon or a run; after
 * anything else the lifter's own rest for the exercise wins, else its kind's (R639). Anything that is not a program slot
 * keeps the exercise's own rest, else the rest in Settings, as before (R100, R101).
 */
export function restLengthOf(ex: { restSeconds: number | null; program?: { restKind: RestKind } | null }, settingsRest: number): number {
  const kind = ex.program?.restKind ?? null;
  if (kind === 'none') return 0;
  if (ex.restSeconds !== null) return ex.restSeconds;
  return kind === null ? settingsRest : REST_BY_KIND[kind];
}
