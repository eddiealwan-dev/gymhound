// The shapes of the Program Library v2 (spec §18.29, R596–R638): the twenty programs, built from the vendored
// gymhound_programs.json by scripts/build-programs.mjs into src/seed/programs.generated.ts. Types only, so the build
// script can import this file straight into Node (type stripping).

export type ProgramLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/** The rule in a slot (R610), from the JSON's `increment_rule` (Appendix C transcribes the custom ones). */
export type RuleKind = 'load' | 'reps_only' | 'hold' | 'ladder' | 'add_set' | 'weekly_seconds' | 'metcon' | 'manual';

/** A special week (R617, Appendix D). `note` weeks show their note and run the normal rules. */
export type WeekKind = 'deload' | 'taper' | 'lighter' | 'transition' | 'test' | 'mock_meet' | 'meet' | 'note';

/**
 * One special week of a program (R617). `halfSets`: each slot's sets are halved, rounded up, at least 1. `holds`: no
 * progression and no miss (`held_week`). `runShare`: the share of a run's planned time (1, or 0.6 on Hybrid
 * Athlete's lighter weeks).
 */
export type ProgramWeek = { week: number; kind: WeekKind; halfSets: boolean; holds: boolean; runShare: number; note: string };

/** Muscle credit for the volume check only (R603, R629), in the catalog's own vocabulary ("front delts"). */
export type Credit = { primary: readonly string[]; secondary: readonly string[] };

/** One rung of a ladder (R618, Appendix B). A weighted top rung has its increment in lb; the rest have none. */
export type LadderRung = {
  exerciseId: string;
  timed: boolean;
  repMin: number;
  repMax: number;
  weightedIncrementLb: number | null;
  note: string | null;
};

/** Added sets (R619): +1 set when all are done, up to the cap, then a heavier bell (back to a set count) or +seconds. */
export type AddSetRule = {
  capSets: number;
  then: { kind: 'load'; lb: number; backToSets: number } | { kind: 'seconds'; step: number };
};

/** Runs (R620): targets follow the program week, not performance. */
export type WeeklyRule =
  | { kind: 'seconds'; startS: number; stepS: number; capS: number }
  | { kind: 'sets_then_seconds'; startSets: number; capSets: number; seconds: number; stepS: number }
  | { kind: 'fixed' };

/** A metcon (R622): its format, its work minutes (for volume) and elements, and the cap where it has one. */
export type MetconRule = { format: 'AMRAP' | 'For Time'; workMinutes: number; elements: readonly string[]; capMinutes: number | null };

/** One exercise of a program day. */
export type ProgramSlot = {
  /** `${programId}:${daySlug}:${exerciseId}`, with `@2`… for a repeat of one exercise on a day (R625). */
  id: string;
  exerciseId: string;
  /** The catalog name in the JSON; where it differs from the exercise's name it is the slot's note (R606). */
  catalogName: string;
  note: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetUnit: 'reps' | 'seconds' | 'rounds' | 'minutes' | 'feet' | 'yards';
  ruleKind: RuleKind;
  incrementLb: number;
  halveAfterFirstMiss: boolean;
  /** The reset's multiplier (R613): 0.9, or 0.95 for Strength Peaking's top sets. */
  resetMultiplier: number;
  /** Normal sessions in a row with every set hit before a raise: 2 for Atlas stone load (R623), else 1. */
  sessionsToRaise: 1 | 2;
  ladder: readonly LadderRung[] | null;
  addSet: AddSetRule | null;
  weekly: WeeklyRule | null;
  metcon: MetconRule | null;
  manualText: string | null;
  countsTowardVolume: boolean;
  credits: readonly Credit[];
  creditPerSet: number;
  deloadExempt: boolean;
  /** Each day's first slot: the main lift (R627). */
  isMain: boolean;
  /** The warm-up line under each day's first slot (R626). */
  warmUpLine: boolean;
};

export type ProgramDay = { slug: string; name: string; slots: readonly ProgramSlot[] };

export type Program = {
  /** `program-{json id}` (R598). */
  id: string;
  jsonId: string;
  number: number;
  name: string;
  level: ProgramLevel;
  goal: string;
  daysPerWeek: number;
  weeks: number;
  equipment: string;
  /** Free or Pro by the owner's list (R597), not the JSON's `access`. */
  free: boolean;
  schedule: string;
  specialWeeksText: string;
  lineage: string;
  whyItWorks: readonly string[];
  progressionNotes: string;
  afterThisProgram: string;
  volumeChecked: boolean;
  volumeBandExempt: readonly string[];
  expectedVolume: Readonly<Record<string, { hardSets: number; daysPerWeek: number }>>;
  expectedDelts: { side: number; rear: number; front: number };
  sourceIds: readonly number[];
  weekPlan: readonly ProgramWeek[];
  /** Misses in a row before a reset (R613): 3 for Beginner, 2 for Intermediate and Advanced. */
  missesToReset: 2 | 3;
  /** The reactive deload (R627), #11 only. */
  reactiveDeload: boolean;
  picture: { exerciseId: string; frame: 0 | 1; label: string };
  days: readonly ProgramDay[];
};

/** One of the 88 bundled sources (R631). */
export type ProgramSource = { id: number; citation: string; url: string };
