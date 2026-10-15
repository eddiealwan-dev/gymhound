import type { MetconRule, RuleKind } from '../seed/programTypes';
import { formatRest } from './dates';
import { TIMED_RUN_IDS } from './restKind';
import { metconText } from './ruleLine';
import type { LoggingType, SetType } from './types';
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
      const load = /\(([^)]*\b(?:lb|kg)\b[^)]*)\)/.exec(rest)?.[1] ?? null;
      return { amount, rest: rest.toLowerCase(), load, used: false };
    });
  const elements = rule.elements.map((element): MetconElement => {
    const name = element.replace(/\s*\(metcon\)\s*$/i, '').trim();
    const stem = name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
    const part = parts.find((p) => !p.used && p.rest.startsWith(stem));
    if (!part) return { amount: null, name, load: null };
    part.used = true;
    return { amount: part.amount, name, load: part.load };
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
      const target = ex.rule?.repMin ?? 0;
      return target > 0 ? { kind: 'run', noun: runNoun(ex.exerciseId), steps: [{ kind: 'work', seconds: target, set: 1 }] } : null;
    }
    case 'intervals': {
      const work = ex.rule?.repMin ?? 0;
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
