import type { MetconRule, RuleKind } from '../seed/programTypes';
import { formatRest } from './dates';
import { spokenRest } from './rest';
import { TIMED_RUN_IDS } from './restKind';
import { metconText } from './ruleLine';
import { weightText } from './setEntry';
import { DISTANCE_WORDS, type Column, type RowModel } from './setTable';
import type { DistanceUnit, LoggingType, SetType, WeightUnit } from './types';
import type { WorkPlan, WorkStep } from './workClock';

/**
 * How a program slot is drawn in the session (Task 7b, t7-design.md): a metcon as one block with its clock and one
 * score; a run or intervals with their clock; an event, a technique slot and everything else as set rows. Only the
 * twenty programs' slots take the new blocks; your own routines keep their set rows.
 */
export type BlockKind = 'metcon' | 'run' | 'intervals' | 'event' | 'technique' | 'sets';

/** What the block reads of a workout exercise (`WorkoutExerciseView` fits). */
export type BlockInput = {
  exerciseId: string;
  loggingType: LoggingType;
  rule: { setCount: number; repMin: number; repMax: number } | null;
  sets: readonly { setType: SetType }[];
  program?: {
    rule: { kind: RuleKind };
    metcon: MetconRule | null;
    countsTowardVolume: boolean;
    /** The slot's note as the session shows it. */
    note: string | null;
    /** The program's name for the slot ("Metcon A · AMRAP 10 min: …"). */
    catalogName: string;
  } | null;
};

/** The runs that are intervals: sets of hard work with easy between. */
export const INTERVAL_IDS: ReadonlySet<string> = new Set(['interval-run', 'bike-intervals', 'rower-intervals']);

/** The quiet line on a technique slot's block (the owner's words). */
export const TECHNIQUE_LINE = 'Technique · not counted';

export function blockKindOf(ex: BlockInput): BlockKind {
  const p = ex.program;
  if (!p) return 'sets';
  if (p.rule.kind === 'metcon' && p.metcon !== null) return 'metcon';
  if (ex.loggingType === 'timed' && TIMED_RUN_IDS.has(ex.exerciseId)) return INTERVAL_IDS.has(ex.exerciseId) ? 'intervals' : 'run';
  if (ex.loggingType === 'weighted_distance') return 'event';
  if (!p.countsTowardVolume && ex.loggingType === 'weighted') return 'technique';
  return 'sets';
}

export type MetconElement = { amount: string | null; name: string; load: string | null };

/**
 * A metcon's block (R-t7b2): the format line and the moves from the slot's structured rule, with each move's amount
 * ("10", "200 m", "12 cal") and load ("95/65 lb") read from the program's name for it where they match. When the list
 * can't say everything the name does (a move without an amount, rounds or a rep scheme), the name is the subtitle.
 */
export function metconParts(rule: MetconRule, catalogName: string): { format: string; elements: MetconElement[]; subtitle: string | null } {
  const format = rule.format === 'AMRAP' ? `AMRAP ${rule.workMinutes} min` : rule.capMinutes !== null ? `For Time · ${rule.capMinutes} min cap` : 'For Time';
  const text = metconText(catalogName);
  const colon = text.indexOf(':');
  const scheme = colon < 0 ? '' : text.slice(0, colon).trim().toLowerCase();
  const body = colon < 0 ? '' : text.slice(colon + 1).replace(/\s*\(cap \d+ min\)\s*$/i, '');
  const parts = body
    .split(/,\s*|\s+and\s+/)
    .map((p) => p.trim())
    .filter((p) => p !== '')
    .map((p) => {
      const m = /^(\d+(?:\s?m|-cal|\s?cal)?)\s+(.+)$/.exec(p);
      const amount = m ? m[1].replace('-cal', ' cal').replace(/(\d)m$/, '$1 m') : null;
      const rest = m ? m[2] : p;
      const loadMatch = /\s*\(([^)]*\b(?:lb|kg)\b[^)]*)\)/.exec(rest);
      // The program's own words for the move, without the load its column shows: "goblet squats", "push-ups (scaled)".
      const words = (loadMatch ? rest.replace(loadMatch[0], '') : rest).trim();
      return { amount, rest: rest.toLowerCase(), words, load: loadMatch?.[1] ?? null, used: false };
    });
  const elements = rule.elements.map((element): MetconElement => {
    const name = element.replace(/\s*\(metcon\)\s*$/i, '').trim();
    const stem = name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
    const part = parts.find((p) => !p.used && p.rest.startsWith(stem));
    if (!part) return { amount: null, name, load: null };
    part.used = true;
    // The move as the program writes it (plural where written, "(scaled)" kept), with the rule's own asides it lacks.
    const asides = (name.match(/\([^)]*\)/g) ?? []).filter((a) => !part.words.toLowerCase().includes(a.toLowerCase()));
    const own = `${part.words.charAt(0).toUpperCase()}${part.words.slice(1)}`;
    return { amount: part.amount, name: [own, ...asides].join(' '), load: part.load };
  });
  const plain = scheme === `amrap ${rule.workMinutes} min` || scheme === 'for time';
  const complete = plain && elements.every((e) => e.amount !== null);
  return { format, elements, subtitle: complete || text === '' ? null : text };
}

/** The word a timed slot is called by: a walk, a ride, a row, else a run. */
export function runNoun(exerciseId: string): string {
  if (exerciseId === 'incline-treadmill-walk') return 'Walk';
  if (exerciseId === 'bike-intervals') return 'Ride';
  if (exerciseId === 'rower-intervals') return 'Row';
  return 'Run';
}

/** A run's format line: "Run 29:00". */
export function runFormat(exerciseId: string, targetS: number): string {
  return `${runNoun(exerciseId)} ${formatRest(targetS)}`;
}

/** Intervals' format line: "6 × 3:00 hard / 2:00 easy", or "8 × 1:00 hard" with no easy part. */
export function intervalFormat(sets: number, workS: number, easyS: number | null): string {
  const hard = `${sets} × ${formatRest(workS)} hard`;
  return easyS === null ? hard : `${hard} / ${formatRest(easyS)} easy`;
}

/** The easy part of intervals, from the slot's note ("with 120 s easy jog between", "30 s hard / 90 s easy"). */
export function easySecondsOf(note: string | null): number | null {
  const m = note ? /(\d+)\s*s\s+easy/i.exec(note) : null;
  return m ? Number(m[1]) : null;
}

/** An EMOM's minutes, from a note that starts "EMOM 10". */
export function emomMinutesOf(note: string | null): number | null {
  const m = note ? /^EMOM\s+(\d+)/i.exec(note.trim()) : null;
  return m ? Number(m[1]) : null;
}

/** How many working sets intervals have today: each is one hard part. */
const workingSets = (ex: BlockInput) => ex.sets.filter((s) => s.setType === 'working').length;

/**
 * A run's or an interval's target in seconds, the week's (R620): the rule's repMin, the one field its rule line, its
 * clock, its format line and its suggested time all read, so they can't disagree. 0 for none.
 */
export function targetSecondsOf(ex: Pick<BlockInput, 'rule'>): number {
  return ex.rule?.repMin ?? 0;
}

/** The clock a block runs, or null for a block with none (events, plain sets, technique sets without an EMOM). */
export function workPlanFor(ex: BlockInput): WorkPlan | null {
  const p = ex.program;
  switch (blockKindOf(ex)) {
    case 'metcon': {
      const m = p?.metcon;
      if (!m) return null;
      if (m.format === 'AMRAP') return { kind: 'amrap', noun: 'AMRAP', steps: [{ kind: 'work', seconds: m.workMinutes * 60, set: 1 }] };
      return { kind: 'for_time', noun: 'For Time', steps: [{ kind: 'work', seconds: (m.capMinutes ?? m.workMinutes) * 60, set: 1 }] };
    }
    case 'run': {
      const target = targetSecondsOf(ex);
      return target > 0 ? { kind: 'run', noun: runNoun(ex.exerciseId), steps: [{ kind: 'work', seconds: target, set: 1 }] } : null;
    }
    case 'intervals': {
      const work = targetSecondsOf(ex);
      const sets = workingSets(ex);
      if (work <= 0 || sets === 0) return null;
      const easy = easySecondsOf(p?.note ?? null);
      const steps: WorkStep[] = [];
      for (let set = 1; set <= sets; set++) {
        const last = set === sets;
        steps.push(easy === null && !last ? { kind: 'work', seconds: work, set, holdAfter: true } : { kind: 'work', seconds: work, set });
        if (easy !== null && !last) steps.push({ kind: 'easy', seconds: easy, set });
      }
      return { kind: 'intervals', noun: 'Intervals', steps };
    }
    case 'technique': {
      const minutes = emomMinutesOf(p?.note ?? null);
      if (minutes === null || minutes <= 0) return null;
      return { kind: 'emom', noun: 'EMOM', steps: Array.from({ length: minutes }, (_, i) => ({ kind: 'minute' as const, seconds: 60, set: i + 1 })) };
    }
    default:
      return null;
  }
}

/** The line an event's rule adds (t7-design.md): what a tick means on a carry, a yoke or a sled. */
export const EVENT_LINE = 'A drop ends the set: log what you carried unbroken.';

const WEIGHT_WORDS: Record<WeightUnit, string> = { lb: 'pounds', kg: 'kilograms' };

/** What a block's rows read beyond the set rows': the weight unit shown, a run's target and its noun ("Run", "Walk"). */
export type BlockRowOptions = { unit: WeightUnit; targetS?: number | null; noun?: string };

/**
 * A block's own take on its set rows (t7-design.md). A metcon's score suggests nothing (last time stays beside it) and
 * is spoken as "Score"; a run's row and each working set of intervals suggest the week's target, a run's row spoken as
 * "Run"; an event's last time reads "315 × 50" (its time and units said in words), its time may stay empty, and its tick
 * means drop-free. Plain sets and technique sets keep their rows.
 */
export function blockRows(kind: BlockKind, rows: RowModel[], o: BlockRowOptions): RowModel[] {
  switch (kind) {
    case 'metcon':
      return rows.map((row) => ({
        ...row,
        spokenAs: 'Score',
        placeholders: { weight: null, reps: null, durationS: null, distance: null, ...(row.loggingType === 'rounds' ? { extraReps: null } : {}) },
      }));
    case 'run':
    case 'intervals': {
      const target = o.targetS ?? null;
      return rows.map((row) => {
        const suggested = row.set.setType === 'working' && target !== null ? { ...row, placeholders: { ...row.placeholders, durationS: target } } : row;
        return kind === 'run' ? { ...suggested, spokenAs: o.noun ?? 'Run' } : suggested;
      });
    }
    case 'event':
      return rows.map((row) => ({ ...row, ...eventPrevious(row, o.unit), optional: ['durationS'], tickLabel: `Set ${row.label} carried drop-free` }));
    default:
      return rows;
  }
}

/** An event's last time: "315 × 50", with a unit only where it isn't the one shown, and every unit and the time in words. */
function eventPrevious(row: RowModel, unit: WeightUnit): Pick<RowModel, 'previous' | 'previousLabel'> {
  const p = row.matched;
  if (p === null || p.weight === null || p.distance === null || p.distanceUnit === null) return { previous: row.previous };
  const weightUnit = p.weightUnit ?? unit;
  const distance = p.distanceUnit === (row.distanceUnit ?? p.distanceUnit) ? `${p.distance}` : `${p.distance} ${p.distanceUnit}`;
  const said = `${p.weight} ${WEIGHT_WORDS[weightUnit]} for ${p.distance} ${DISTANCE_WORDS[p.distanceUnit]}`;
  return {
    previous: `${weightText(p.weight, weightUnit, unit)} × ${distance}`,
    previousLabel: p.durationS === null ? said : `${said} in ${spokenRest(p.durationS)}`,
  };
}

/**
 * A block's columns: a metcon's score and a run have one row, so no SET chip; an event heads its distance with its
 * unit ("FT", "YD"). The rest keep the set table's.
 */
export function blockColumns(kind: BlockKind, columns: Column[], eventDistanceUnit: DistanceUnit): Column[] {
  if (kind === 'metcon' || kind === 'run') return columns.filter((c) => c.key !== 'set');
  if (kind === 'event') return columns.map((c) => (c.key === 'distance' ? { ...c, header: eventDistanceUnit.toUpperCase() } : c));
  return columns;
}

/** A metcon's name in the session: the program's label for it ("Metcon A"), else the exercise's own name. */
export function metconTitle(catalogName: string, exerciseName: string): string {
  const dot = catalogName.indexOf(' · ');
  return dot > 0 ? catalogName.slice(0, dot) : exerciseName;
}

/** Units in words, for VoiceOver: "200 m" is 200 metres, "12 cal" 12 calories, "95/65 lb" 95 or 65 pounds. */
function spokenAmount(text: string): string {
  return text
    .replace(/(\d)\s*\/\s*(\d)/g, '$1 or $2')
    .replace(/\b(\d+(?: or \d+)?) ?m\b/g, '$1 metres')
    .replace(/\b(\d+) ?cal\b/g, '$1 calories')
    .replace(/\blb\b/g, 'pounds')
    .replace(/\bkg\b/g, 'kilograms');
}

/** A metcon's format and moves as one sentence for VoiceOver: "AMRAP 10 minutes: 10 Goblet squat, 200 metres Run." */
export function metconVoice(parts: { format: string; elements: MetconElement[] }): string {
  const format = parts.format.replace(/ min cap$/, ' minute cap').replace(/ min$/, ' minutes').replace(' · ', ', ');
  const moves = parts.elements.map((e) => [e.amount === null ? null : spokenAmount(e.amount), e.name].filter((x) => x !== null).join(' ') + (e.load === null ? '' : `, ${spokenAmount(e.load)}`));
  return moves.length === 0 ? `${format}.` : `${format}: ${moves.join(', ')}.`;
}

/** A metcon's rule line without its format and moves, which the block lists above it (R622's second half). */
export function metconRuleLine(sentence: string, catalogName: string): string {
  const lead = `${metconText(catalogName)}. `;
  return sentence.startsWith(lead) ? sentence.slice(lead.length) : sentence;
}
