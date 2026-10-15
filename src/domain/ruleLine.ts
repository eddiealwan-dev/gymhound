/**
 * The line above an exercise's sets (spec 7.4, with 18.7): the rule as a sentence, then today's read. A flagged
 * exercise (Something off) is a marked day, and its read names the reason (R61). Also the finish summary's line for
 * each exercise (spec 8.5, R64).
 */

import type { AddSetRule, ProgramWeek, RuleKind, WeekKind, WeeklyRule } from '../seed/programTypes';
import { formatRest } from './dates';
import { MARK_LABELS } from './labels';
import type { Gear } from './plates';
import { raiseLoadable, type Outcome, type OutcomeInput } from './progression';
import type { PrevSet } from './setEntry';
import type { DistanceUnit, Equipment, ExerciseMark, LoggingType, WeightUnit } from './types';
import { convertIncrement, formatWeight, isZeroWeight } from './units';

export type Rule = NonNullable<OutcomeInput['rule']>;

/** Last time's sets of an exercise, for the rule line: how many, and the first one's values. */
export type LastSummary = {
  sets: number;
  reps: number | null;
  weight: number | null;
  weightUnit: WeightUnit | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  /** An AMRAP score's extra reps (R607). Absent reads as none. */
  extraReps?: number | null;
};

type Load = { weight: number; unit: WeightUnit };

const TIMES = '×';

/**
 * Summarises last time's done sets (`WorkoutExerciseView.previous`): the working and failure sets, counted, with the
 * values of the first by position. Warmups and drops are left out unless they are all there was. Null for no last time.
 */
export function lastSummary(previous: readonly PrevSet[]): LastSummary | null {
  const counted = previous.filter((p) => p.setType === 'working' || p.setType === 'failure');
  const pool = [...(counted.length > 0 ? counted : previous)].sort((a, b) => a.position - b.position);
  const first = pool[0];
  if (!first) return null;
  const { reps, weight, weightUnit, durationS, distance, distanceUnit } = first;
  const extra = first.extraReps === undefined || first.extraReps === null ? {} : { extraReps: first.extraReps };
  return { sets: pool.length, reps, weight, weightUnit, durationS, distance, distanceUnit, ...extra };
}

/** The types with no load for a rule to raise: timed, distance and time, and the two scores of programs (R607). */
const UNLOADED: readonly LoggingType[] = ['timed', 'distance_time', 'rounds', 'for_time'];

/** Whether the rule raises this type's load: not timed, distance and time, or a score. */
const isLoaded = (loggingType: LoggingType): boolean => !UNLOADED.includes(loggingType);

/** An AMRAP score as "6 + 4", or "6" with no extra reps; a For Time score as "7:42" (R607). Null with no score. */
function lastScore(last: LastSummary, loggingType: LoggingType): string | null {
  if (loggingType === 'for_time') return last.durationS === null ? null : formatRest(last.durationS);
  if (last.reps === null) return null;
  return last.extraReps === undefined || last.extraReps === null ? `${last.reps}` : `${last.reps} + ${last.extraReps}`;
}

/** "5 km in 25:30", or whichever of the two was logged; null for neither. */
function lastDistance(last: LastSummary): string | null {
  const distance = last.distance !== null && last.distanceUnit !== null ? `${last.distance} ${last.distanceUnit}` : null;
  const time = last.durationS !== null ? formatRest(last.durationS) : null;
  if (distance && time) return `${distance} in ${time}`;
  return distance ?? time;
}

/**
 * Last time in this type's terms: "3 × 60 s" (timed), "5 km in 25:30" (distance_time), else "3 × 8 at 135 lb", with
 * seconds for reps for weighted_time. The weight keeps the unit it was logged in; an empty load (none or 0) leaves it
 * out. Null when the sets lack the value this type logs, so no number is invented.
 */
function lastTime(last: LastSummary, loggingType: LoggingType): string | null {
  if (loggingType === 'distance_time') return lastDistance(last);
  if (loggingType === 'rounds' || loggingType === 'for_time') return lastScore(last, loggingType);
  if (loggingType === 'weighted_distance') {
    if (last.distance === null || last.distanceUnit === null) return null;
    const at = last.weight && last.weightUnit ? ` at ${formatWeight(last.weight, last.weightUnit)}` : '';
    return `${last.sets} ${TIMES} ${last.distance} ${last.distanceUnit}${at}`;
  }
  const seconds = last.durationS === null ? null : `${last.durationS} s`;
  if (loggingType === 'timed') return seconds && `${last.sets} ${TIMES} ${seconds}`;
  const each = loggingType === 'weighted_time' ? seconds : last.reps === null ? null : `${last.reps}`;
  if (each === null) return null;
  const at = last.weight && last.weightUnit ? ` at ${formatWeight(last.weight, last.weightUnit)}` : '';
  return `${last.sets} ${TIMES} ${each}${at}`;
}

/**
 * The rule as a sentence (spec 7.4, the rule table). Timed and distance holds say last time; an exercise with no rule
 * says last time; either says it is the first time when there is no last time to tell. An increment of 0 says to beat
 * last time's reps. `{inc}` is the rule's increment in `unit` (the display unit) by the gym convention.
 */
export function ruleSentence(a: { rule: Rule | null; loggingType: LoggingType; unit: WeightUnit; last: LastSummary | null }): string {
  const { rule, loggingType, unit, last } = a;
  const done = last && lastTime(last, loggingType);
  const firstTime = 'First time logging this.';
  if (loggingType === 'timed') return done ? `Last time: ${done}. Timed holds don't go up automatically.` : firstTime;
  // Distance and time, and a program's score (R622's metcon line is the program's own), say last time.
  if (loggingType === 'distance_time' || loggingType === 'rounds' || loggingType === 'for_time') return done ? `Last time: ${done}.` : firstTime;
  if (!rule) return done ? `No rule here. Last time: ${done}.` : firstTime;
  if (rule.increment <= 0) return "No weight to add. Beat last time's reps.";

  const inc = formatWeight(convertIncrement(rule.increment, rule.incrementUnit, unit), unit);
  if (loggingType === 'assisted') {
    return `If every working set hits ${rule.repMax} on a normal day, take ${inc} of assistance off. A marked day holds it.`;
  }
  const hits = loggingType === 'weighted_time' ? `reaches ${rule.repMax}s` : `hits ${rule.repMax}`;
  return `If every working set ${hits} on a normal day, add ${inc}. A marked day holds the weight.`;
}

/**
 * The planned weight plus the increment, rounded as at finish (spec 7.3 step 6): assisted takes assistance off, never
 * below 0; a barbell goes to the loadable weight nearest the raise that is heavier than the plan, or holds the plan
 * when nothing heavier loads. In the plan's unit, with `gear` the bar and plates for it.
 */
function raisedFrom(planned: Load, rule: Rule, loggingType: LoggingType, equipment: Equipment, gear: Gear): Load {
  const increment = convertIncrement(rule.increment, rule.incrementUnit, planned.unit);
  if (loggingType === 'assisted') return { weight: Math.max(0, planned.weight - increment), unit: planned.unit };
  const raised = planned.weight + increment;
  if (equipment !== 'barbell') return { weight: raised, unit: planned.unit };
  return { weight: raiseLoadable(raised, planned.weight, gear) ?? planned.weight, unit: planned.unit };
}

/**
 * Today's read (spec 7.4, the read table), after the rule for the types it raises with an increment above 0; null
 * for the rest. A flagged exercise reads "{Reason} today, so {planned} holds." (R61). `planned` and `override` are
 * shown in their own units, except a bodyweight-plus plan of 0, which reads "bodyweight" (R75); `gear` is the bar and
 * plates for the plan's unit.
 */
export function todaysRead(a: {
  rule: Rule | null;
  loggingType: LoggingType;
  planned: Load | null;
  override: Load | null;
  mark: ExerciseMark | null;
  equipment: Equipment;
  gear: Gear;
}): string | null {
  const { rule, loggingType, planned, override, mark } = a;
  if (!rule || !isLoaded(loggingType) || rule.increment <= 0) return null;
  if (!planned) return 'Pick a starting weight. Next time builds from it.';

  // A bodyweight-plus plan of 0 added load is just bodyweight (R75); the raise from it is still a weight.
  const atBodyweight = loggingType === 'bodyweight_plus' && isZeroWeight(planned.weight, planned.unit);
  const plan = atBodyweight ? 'bodyweight' : formatWeight(planned.weight, planned.unit);
  const holds = mark ? `${MARK_LABELS[mark]} today, so ${plan} holds.` : null;
  if (override) {
    return `Today is set to ${formatWeight(override.weight, override.unit)} by you. ${holds ?? `The rule still says ${plan}.`}`;
  }
  const raised = raisedFrom(planned, rule, loggingType, a.equipment, a.gear);
  const verb = loggingType === 'weighted_time' ? 'Reach' : 'Hit';
  const normal = `${verb} ${rule.repMax}s on a normal day and next time is ${formatWeight(raised.weight, raised.unit)}.`;
  return holds ? `${normal} ${holds}` : normal;
}

/** What the rule left for one exercise at finish: next time's weight, in the unit it was set in, and why. */
export type NextTime = {
  /** The workout exercise (block) the line belongs to, so a screen can put it under that block. */
  workoutExerciseId: string;
  name: string;
  loggingType: LoggingType;
  outcome: Outcome;
  nextWeight: number;
  nextUnit: WeightUnit;
  mark: ExerciseMark | null;
  /** The program week a held_week outcome held for (R617), named after the weight. */
  weekKind?: WeekKind | null;
};

/**
 * The finish summary's line for one exercise (spec 8.5, R64): "Bench press — next time 185 lb ↑" when the rule
 * raised it, else "Bench press — holds at 180 lb", with " · {Reason}" when a Something off flag held it. A raised
 * assisted exercise takes assistance off, so its arrow points down (R72). A bodyweight-plus exercise with 0 added load
 * "holds at bodyweight" (R75).
 */
export function finishLine(n: NextTime): string {
  const weight = formatWeight(n.nextWeight, n.nextUnit);
  if (n.outcome === 'raised') return `${n.name} — next time ${weight} ${n.loggingType === 'assisted' ? '↓' : '↑'}`;
  // R613: a reset drops the weight; `resetWhy` says why under the line.
  if (n.outcome === 'reset') return `${n.name} — next time ${weight} ↓`;
  const reason =
    n.outcome === 'held_marked' && n.mark
      ? ` · ${MARK_LABELS[n.mark]}`
      : n.outcome === 'held_week' && n.weekKind && n.weekKind !== 'note'
        ? ` · ${WEEK_LABELS[n.weekKind]}`
        : '';
  const at = n.loggingType === 'bodyweight_plus' && isZeroWeight(n.nextWeight, n.nextUnit) ? 'bodyweight' : weight;
  return `${n.name} — holds at ${at}${reason}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The rule's words for every program slot (spec §18.29, R610–R622, R626). The rule is shown as a sentence that says
// exactly what will happen and why (CLAUDE.md): the lifter marks Something off and the weight holds; nothing here says
// the app notices or decides an off day.

/** One rung of a ladder as its line names it (R618): the exercise's name ("Weighted pull-up" on a weighted top rung). */
export type RungWords = { name: string; timed: boolean; repMin: number; repMax: number; weighted: boolean };

/** What a program slot's line needs besides the workout's rule snapshot (§18.29). */
export type ProgramRule = {
  kind: RuleKind;
  /** A carry's distance unit (R607), ft or yd; null for any other slot. */
  carryUnit: 'ft' | 'yd' | null;
  /** Normal sessions in a row with every set hit before a raise: 2 for Atlas stone load (R623). */
  sessionsToRaise: 1 | 2;
  /** The increment was halved after the slot's first miss in this run (R612). */
  halved: boolean;
  /** Misses in a row before this workout (R613), for today's read. */
  missesBefore: number;
  missesToReset: number;
  /** The reset's multiplier: 0.9, or 0.95 for Strength Peaking's top sets. */
  resetMultiplier: number;
  /** The program week the workout is in (R616). */
  week: number;
  /** That week's special kind (R617), null on a normal week. */
  weekInfo: ProgramWeek | null;
  /** The slot's sets, for a ladder's next rung ("at 3 × 5"). */
  sets: number;
  /** A ladder's rung (0-based) and its rungs (R618); null for any other slot. */
  rung: number | null;
  rungs: readonly RungWords[] | null;
  addSet: AddSetRule | null;
  weekly: WeeklyRule | null;
  /** A metcon's format and elements ("AMRAP 10 min: 10 goblet squats, …", R622). */
  metconText: string | null;
  /** A manual rule's words, as the documents write them (R610). */
  manualText: string | null;
};

/** The special weeks by name (R617). */
export const WEEK_LABELS: Record<Exclude<WeekKind, 'note'>, string> = {
  deload: 'Deload week',
  lighter: 'Lighter week',
  taper: 'Taper week',
  transition: 'Transition week',
  test: 'Test week',
  mock_meet: 'Mock meet week',
  meet: 'Meet week',
};

/** The muted line under each lifting day's first exercise (R626). */
export const WARM_UP_LINE =
  '5 min easy cardio or dynamic prep, then about 40% × 8, 60% × 5, 80% × 3 before work sets. One light feeder set before each later compound.';

/** The finish summary's line when a metcon score beat the last one, which beat the one before (R622). */
export const BEAT_TWICE = 'You beat your score twice in a row.';

/** Why a ladder went back a rung (R618), for a rung counted in reps. */
export const LADDER_DOWN_WHY = 'Under 5 reps on two normal days in a row, so back one rung.';

/** Why a ladder went back a rung (R618): under 5 reps, or under the bottom of a hold rung's range. */
export function ladderDownWhy(timed: boolean, repMin: number): string {
  return timed ? `Under ${repMin} s on two normal days in a row, so back one rung.` : LADDER_DOWN_WHY;
}

const pct = (share: number): number => Math.round(share * 100);

/** What every holding week ends with (R617). */
const NOTHING_GOES_UP = 'Nothing goes up or counts as a miss.';

/**
 * What a holding week means (R617), on Up next, at the top of the session and under each slot that progresses. A week
 * with no note of its own is worded by its kind: "Deload week: half the sets, same weight. Nothing goes up or counts as
 * a miss." A week with a note never says "same weight", since its note may say otherwise (a test, a taper, a
 * time trial): a note that names the week is shown as the documents write it, any other follows the week's label, and
 * both end "Nothing goes up or counts as a miss." The runs of a lighter week are a share of their time.
 */
function heldWeekLine(info: ProgramWeek): string {
  const label = info.kind === 'note' ? 'This week' : WEEK_LABELS[info.kind];
  const runs = info.runShare < 1 ? `runs at ${pct(info.runShare)}% of the time` : '';
  const note = info.note.trim();
  if (note === '') {
    const parts = [info.halfSets ? 'half the sets' : null, 'same weight', runs || null].filter((x): x is string => x !== null);
    return `${label}: ${parts.join(', ')}. ${NOTHING_GOES_UP}`;
  }
  if (info.kind !== 'note' && note.startsWith(OWN_WORDS[info.kind])) return `${note} ${NOTHING_GOES_UP}`;
  const facts = [info.halfSets ? 'half the sets' : null, runs || null].filter((x): x is string => x !== null);
  return facts.length === 0 ? `${label}: ${note} ${NOTHING_GOES_UP}` : `${label}: ${facts.join(', ')}. ${note} ${NOTHING_GOES_UP}`;
}

/** The words a special week's own note starts with when it names the week ("Taper: …", "Test week: …"). */
const OWN_WORDS: Record<Exclude<WeekKind, 'note'>, string> = {
  deload: 'Deload',
  lighter: 'Lighter',
  taper: 'Taper',
  transition: 'Transition',
  test: 'Test',
  mock_meet: 'Mock meet',
  meet: 'Meet',
};

/**
 * The week's line on Up next and at the top of the session (R616, R617, Appendix D): a note week is its note; a special
 * week is `heldWeekLine`. Null for a normal week.
 */
export function weekLine(info: ProgramWeek | null): string | null {
  if (info === null) return null;
  if (info.kind === 'note') return info.note.trim() === '' ? null : info.note.trim();
  return heldWeekLine(info);
}

/** A metcon's format and elements from its catalog name, without the "Metcon A ·" label (R622). */
export function metconText(catalogName: string): string {
  return catalogName.replace(/^Metcon(?: [A-Z0-9]+)? · /, '');
}

/** Names that start with a proper adjective, which keeps its capital: the weighted rung is "… with weight". */
const PROPER_FIRST = /^(Bulgarian|Romanian|Nordic|Turkish|Russian|Copenhagen|Zercher|Arnold) /;

/**
 * A weighted top rung is the same movement with load (R618), its name said once: "Pull-up" → "Weighted pull-up",
 * "Bulgarian split squat" → "Bulgarian split squat with weight".
 */
export function rungName(name: string, weighted: boolean): string {
  if (!weighted) return name;
  if (PROPER_FIRST.test(name)) return `${name} with weight`;
  return `Weighted ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
}

/**
 * The slot's note as the session shows it, muted under the rule (R606, R626): the documents' words, with the program's
 * name for the exercise first where it differs (the build writes it). "(see Appendix A)" reads "(Change rung lists
 * them)", since the app has no appendix (ruling R-t2c); a metcon's note leaves out the format its rule line says. Null
 * for none.
 */
export function slotNoteText(note: string, catalogName: string, kind: RuleKind): string | null {
  let text = note.replace(/\((?:see )?Appendix A\)/g, '(Change rung lists them)').trim();
  if (kind === 'metcon' && text.startsWith(catalogName)) text = text.slice(catalogName.length).replace(/^[.\s]+/, '');
  return text === '' ? null : text;
}

/**
 * What Change rung on the program's page says (R618): the slot moves from the next workout and starts at the bottom of
 * the rung's range; only a weighted rung has a weight, which starts fresh.
 */
export function changeRungNote(rungs: readonly RungWords[]): string {
  const head = 'Changes it from the next workout. It starts at the bottom of its range';
  return rungs.some((r) => r.weighted) ? `${head}; a weighted rung's weight starts fresh.` : `${head}.`;
}

/** "One miss so far. One more and next time drops 10%." (R613): today's warning before a reset. */
function missWarning(p: ProgramRule): string | null {
  if (p.missesBefore < 1 || p.missesToReset <= p.missesBefore) return null;
  const word = (n: number) => (n === 1 ? 'One' : n === 2 ? 'Two' : `${n}`);
  const so = `${word(p.missesBefore)} ${p.missesBefore === 1 ? 'miss' : 'misses'} so far.`;
  return `${so} ${word(p.missesToReset - p.missesBefore)} more and next time drops ${pct(1 - p.resetMultiplier)}%.`;
}

/**
 * Today's plan and the bar and plates it is loaded with, so the rule line can say when the plates can't load the raise
 * (ruling R-w2). `planned` is in the display unit, as the read shows it.
 */
export type LoadContext = { planned: Load | null; equipment: Equipment; gear: Gear };

/** A plate's size, which may be a fraction of a pound or kilo: "1.25 lb", "0.625 kg". */
const plateSize = (v: number, u: WeightUnit): string => `${Number(v.toFixed(3))} ${u}`;

/**
 * When a barbell raise can't be loaded with the plates you own (ruling R-w2): "Your plates make 140 lb; add 1.25 lb
 * plates in Settings to load 137.5 lb." Its number is the read's next weight (`raisedFrom`, as the finish rounds it).
 * Null when the plates load the raise, off a barbell, for assistance, or with no plan yet.
 */
function unloadableRaise(rule: Rule, loggingType: LoggingType, load: LoadContext | undefined): string | null {
  const planned = load?.planned ?? null;
  if (!load || !planned || load.equipment !== 'barbell' || loggingType === 'assisted') return null;
  const increment = convertIncrement(rule.increment, rule.incrementUnit, planned.unit);
  const wanted = planned.weight + increment;
  const loads = raisedFrom(planned, rule, loggingType, load.equipment, load.gear).weight;
  if (Math.abs(loads - wanted) < 1e-6) return null;
  return `Your plates make ${formatWeight(loads, planned.unit)}; add ${plateSize(increment / 2, planned.unit)} plates in Settings to load ${formatWeight(wanted, planned.unit)}.`;
}

/** The types whose sets have a weight column (LB, +LB, −LB). */
const WEIGHT_COLUMN: readonly LoggingType[] = ['weighted', 'bodyweight_plus', 'assisted', 'weighted_time', 'weighted_distance'];

/**
 * A program slot whose rule adds no weight: over a weight column the weight is the lifter's to add or not, so the line
 * doesn't say "No weight to add" over it (the walkthrough's calisthenics day).
 */
function noLoadSentence(loggingType: LoggingType): string {
  return WEIGHT_COLUMN.includes(loggingType) ? "Beat last time's reps. Add weight only if you want to." : "No weight to add. Beat last time's reps.";
}

/** The load rule's sentence (§7.3 with R612, R623 and R607's carries), with what the plates load (ruling R-w2). */
function loadSentence(p: ProgramRule, rule: Rule, loggingType: LoggingType, unit: WeightUnit, load?: LoadContext): string {
  if (rule.increment <= 0) return noLoadSentence(loggingType);
  const inc = formatWeight(convertIncrement(rule.increment, rule.incrementUnit, unit), unit);
  const halved = p.halved ? ' (halved after the first miss)' : '';
  const plates = unloadableRaise(rule, loggingType, load);
  const add = `add ${inc}${halved}.${plates === null ? '' : ` ${plates}`}`;
  if (loggingType === 'weighted_distance') {
    return `If every run covers ${rule.repMax} ${p.carryUnit ?? 'm'} on a normal day, ${add} A marked day holds the weight.`;
  }
  if (loggingType === 'assisted') {
    return `If every working set hits ${rule.repMax} on a normal day, take ${inc} of assistance off${halved}. A marked day holds it.`;
  }
  const hits = loggingType === 'weighted_time' ? `reaches ${rule.repMax} s` : `hits ${rule.repMax}`;
  const days = p.sessionsToRaise === 2 ? 'on two normal days in a row' : 'on a normal day';
  return `If every working set ${hits} ${days}, ${add} A marked day holds the weight.`;
}

/** A ladder's line (R618): its rung and what comes next, or the top rung. */
function ladderSentence(p: ProgramRule, rule: Rule | null, loggingType: LoggingType, unit: WeightUnit, load?: LoadContext): string {
  const rungs = p.rungs ?? [];
  const at = Math.min(Math.max(0, p.rung ?? 0), Math.max(0, rungs.length - 1));
  const rung = rungs[at];
  if (!rung) return "No weight to add. Beat last time's reps.";
  const head = `Rung ${at + 1} of ${rungs.length}: ${rung.name}.`;
  if (rung.weighted && rule) return `${head} ${loadSentence({ ...p, halved: false }, rule, loggingType, unit, load)}`;
  const next = rungs[at + 1];
  if (!next) return `${head} Top rung. Keep adding ${rung.timed ? 'time' : 'reps'}.`;
  const top = rule?.repMax ?? rung.repMax;
  const hit = rung.timed ? `Hold ${top} s` : `Hit ${top}`;
  return `${head} ${hit} on every set on a normal day and next time is ${next.name} at ${p.sets} × ${next.repMin}${next.timed ? ' s' : ''}.`;
}

/** A run's line (R620): the week's target, which follows the program week, not performance. */
function runSentence(p: ProgramRule, rule: Rule): string {
  const weekly = p.weekly;
  if (!weekly || weekly.kind === 'fixed') return `${formatRest(rule.repMin)}, the same every week.`;
  const share = p.weekInfo?.runShare ?? 1;
  const lighter = share < 1 ? ` That's ${pct(share)}% on this lighter week.` : '';
  if (weekly.kind === 'seconds') {
    return `Week ${p.week}: ${formatRest(rule.repMin)}.${lighter} Adds ${formatRest(weekly.stepS)} a week up to ${formatRest(weekly.capS)}.`;
  }
  return `Week ${p.week}: ${rule.setCount} × ${formatRest(rule.repMin)}.${lighter} Adds a set a week up to ${weekly.capSets}, then ${weekly.stepS} s a set.`;
}

/** Added sets (R619): a set a session to the cap, then a heavier bell (back to a set count) or longer sets. */
function addSetSentence(p: ProgramRule, rule: Rule | null, unit: WeightUnit): string {
  const addSet = p.addSet;
  if (!addSet) return "No weight to add. Beat last time's reps.";
  const head = `Every set done on a normal day adds a set next time, up to ${addSet.capSets}.`;
  if (addSet.then.kind === 'seconds') return `${head} Then ${addSet.then.step} s more a set each time.`;
  const inc = rule ? convertIncrement(rule.increment, rule.incrementUnit, unit) : convertIncrement(addSet.then.lb, 'lb', unit);
  return `${head} Then ${formatWeight(inc, unit)} heavier and back to ${addSet.then.backToSets} sets.`;
}

/** The kinds whose weight, rung or sets go up, so a holding week holds them (R617). */
const progresses = (p: ProgramRule): boolean => p.kind === 'load' || p.kind === 'ladder' || p.kind === 'add_set';

/**
 * The rule as a sentence for a program slot (R610–R622), by its rule kind, not by an outcome: the load rule with
 * halving and carries, a ladder's rung, a hold's step, a run's week, a metcon's format, added sets and the manual
 * rules' own words. On a holding week (R617) the slots that progress say the week holds them.
 */
export function programRuleSentence(a: {
  program: ProgramRule;
  rule: Rule | null;
  loggingType: LoggingType;
  unit: WeightUnit;
  last: LastSummary | null;
  /** Today's plan and gear, so a raise the plates can't load says so (ruling R-w2). */
  load?: LoadContext;
}): string {
  const { program: p, rule, loggingType, unit, load } = a;
  if (progresses(p) && p.weekInfo?.holds) return heldWeekLine(p.weekInfo);
  switch (p.kind) {
    case 'load':
      return rule ? loadSentence(p, rule, loggingType, unit, load) : ruleSentence(a);
    case 'reps_only':
      return noLoadSentence(loggingType);
    case 'hold':
      return `Add 5 s a session up to ${rule?.repMax ?? 60} s.`;
    case 'ladder':
      return ladderSentence(p, rule, loggingType, unit, load);
    case 'add_set':
      return addSetSentence(p, rule, unit);
    case 'weekly_seconds':
      return rule ? runSentence(p, rule) : ruleSentence(a);
    case 'metcon':
      return `${p.metconText ?? 'Score it'}. Beat your score twice in a row, then go heavier or take the next scaling step.`;
    case 'manual': {
      const text = (p.manualText ?? '').trim();
      if (text === '') return ruleSentence(a);
      return /[.?]$/.test(text) ? text : `${text}.`;
    }
  }
}

/** The step a hold adds a session (R610). */
const HOLD_STEP_S = 5;

type ProgramReadInput = {
  program: ProgramRule;
  rule: Rule | null;
  loggingType: LoggingType;
  planned: Load | null;
  override: Load | null;
  mark: ExerciseMark | null;
  equipment: Equipment;
  gear: Gear;
  last: LastSummary | null;
};

/**
 * Today's read for a program slot (R610–R622), after its rule; null for none. The load rule (and a weighted top rung)
 * reads as §7.4 does, a carry by its distance, the Atlas stone by its two sessions, with a warning before a reset
 * (R613); a hold suggests last time plus 5 s; a metcon says last time's score; added sets ask for a starting weight.
 * A holding week has none: the rule line says the week holds.
 */
export function programTodaysRead(a: ProgramReadInput): string | null {
  const { program: p, rule, loggingType, last } = a;
  if (progresses(p) && p.weekInfo?.holds) return null;
  switch (p.kind) {
    case 'load':
      return loadRead(a);
    case 'ladder':
      return p.rungs?.[p.rung ?? 0]?.weighted ? loadRead(a) : null;
    case 'add_set':
      return rule && rule.increment > 0 && isLoaded(loggingType) && !a.planned ? 'Pick a starting weight. Next time builds from it.' : null;
    case 'hold': {
      const done = last?.durationS ?? null;
      if (done === null || !rule) return null;
      if (done >= rule.repMax) return `Last time ${done} s, the top. Stay at ${rule.repMax} s.`;
      return `Last time ${done} s. Try ${Math.min(done + HOLD_STEP_S, rule.repMax)} s today.`;
    }
    case 'metcon': {
      const score = last && lastTime(last, loggingType);
      return score ? `Last time: ${score}.` : null;
    }
    default:
      return null;
  }
}

/** The load rule's read: §7.4's, worded for a carry or for two sessions in a row, then any warning before a reset. */
function loadRead(a: ProgramReadInput): string | null {
  const { program: p, rule, loggingType, planned, override, mark } = a;
  if (!rule || !isLoaded(loggingType) || rule.increment <= 0) return null;
  if (!planned) return 'Pick a starting weight. Next time builds from it.';
  const atBodyweight = loggingType === 'bodyweight_plus' && isZeroWeight(planned.weight, planned.unit);
  const plan = atBodyweight ? 'bodyweight' : formatWeight(planned.weight, planned.unit);
  const holds = mark ? `${MARK_LABELS[mark]} today, so ${plan} holds.` : null;
  if (override) return `Today is set to ${formatWeight(override.weight, override.unit)} by you. ${holds ?? `The rule still says ${plan}.`}`;
  const raised = raisedFrom(planned, rule, loggingType, a.equipment, a.gear);
  const to = formatWeight(raised.weight, raised.unit);
  let normal: string;
  if (loggingType === 'weighted_distance') normal = `Cover ${rule.repMax} ${p.carryUnit ?? 'm'} on every run on a normal day and next time is ${to}.`;
  else if (p.sessionsToRaise === 2) {
    const every = rule.repMax === 1 ? 'Do every single' : `Hit ${rule.repMax} on every set`;
    normal = `${every} on two normal days in a row and the weight goes to ${to}.`;
  } else if (loggingType === 'weighted_time') normal = `Reach ${rule.repMax} s on a normal day and next time is ${to}.`;
  else normal = `Hit ${rule.repMax}s on a normal day and next time is ${to}.`;
  const after = holds ?? missWarning(p);
  return after === null ? normal : `${normal} ${after}`;
}

/** The finish summary's why under a reset (R613), in the rule's words. */
export function resetWhy(misses: number, multiplier: number, nextWeight: number, unit: WeightUnit): string {
  return `Missed the bottom of the range ${misses} times in a row, so next time drops ${pct(1 - multiplier)}% to ${formatWeight(nextWeight, unit)}.`;
}

/** The finish summary's line for a ladder that moved (R618): "Pull-up — next time Weighted pull-up, rung 6 of 6 ↑". */
export function ladderMoveLine(name: string, toName: string, toRung: number, rungCount: number, moved: 'up' | 'down'): string {
  const where = `rung ${toRung + 1} of ${rungCount}`;
  return moved === 'up' ? `${name} — next time ${toName}, ${where} ↑` : `${name} — next time back to ${toName}, ${where}`;
}

/** The finish summary's line for an added set (R619). */
export function addSetLine(name: string, sets: number): string {
  return `${name} — next time ${sets} sets ↑`;
}

/** The finish summary's line for intervals that got longer at their cap (R619). */
export function secondsUpLine(name: string, seconds: number): string {
  return `${name} — next time ${seconds} s a set ↑`;
}
