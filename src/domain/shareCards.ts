import { formatEntryDate, formatTrainDate, fromLocalDate, mondayOf, shiftDay } from './dates';
import { formatWorkoutDuration } from './history';
import { dateFormat } from './intl';
import {
  estimatedOneRm,
  prCard,
  prE1rmText,
  prLine,
  prLoadText,
  prSetText,
  sameLoggedWeight,
  type PrCandidate,
  type PrHighlight,
  type PrKind,
} from './prs';
import { formatDuration } from './setEntry';
import { computeStreak } from './streak';
import type { LoggingType, WeightUnit } from './types';
import { convertWeight, formatWeight, isZeroWeight, toKg } from './units';
import { formatVolume, totalVolume, type VolumeSet } from './volume';

// The share cards (§18.17, R440–R453): the personal best card and the weekly summary card. Everything here is pure: the
// repository reads the rows, these functions turn them into the plain words and numbers the card views draw.

/**
 * The quiet line at the foot of every share card (R443). One constant, so a store link can be added in one place once
 * there is a listing. No URL today: there is nowhere to send anyone yet.
 */
export const SHARE_CARD_FOOTER = 'GymHound · gym log';

// ---------------------------------------------------------------------------------------------------------------------
// The personal best card

/** One set of a lift's history from finished workouts, in time order (as `recomputePrFlags` orders it). */
export type PbHistorySet = PrCandidate & { localDate: string };

/** The big number split for the card: the figure in display size, then the rest of the value smaller beside it. */
export type CardValue = { main: string; rest: string };

export type PbCardModel = {
  name: string;
  value: CardValue;
  /** What kind of personal best: "Heaviest set", "Most reps at 185 lb", "Best estimated 1RM", "Longest hold". */
  caption: string;
  /** "Up 5 kg from 135 kg on 2 Sep.", or null when no earlier workout has a value to compare. */
  comparison: string | null;
  /** The day of the personal best: "SUN 11 OCT 2026" (laid out for the locale). */
  date: string;
  /** Workouts with this lift up to and including the one that set the personal best. */
  sessions: number;
};

/**
 * Splits "185 lb × 5" into "185" and "lb × 5": the first word is the figure the card draws large. A value whose first
 * word is not a figure ("bodyweight × 8") stays whole.
 */
export function splitValue(value: string): CardValue {
  const space = value.indexOf(' ');
  const head = space === -1 ? value : value.slice(0, space);
  if (!/^[+−-]?\d/.test(head)) return { main: value, rest: '' };
  return space === -1 ? { main: value, rest: '' } : { main: head, rest: value.slice(space + 1) };
}

/** A set counts toward a lift's sessions and bests when it is done and not a warm-up (spec 7.6). */
const eligible = (s: { done: boolean; setType: PrCandidate['setType'] }) => s.done && s.setType !== 'warmup';

/** A logged load in kg: bodyweight plus with no added weight is 0; any other set without a weight has none. */
function loadKg(loggingType: LoggingType, s: PrCandidate): number | null {
  if (s.weight === null || s.weightUnit === null) return loggingType === 'bodyweight_plus' ? 0 : null;
  return toKg(s.weight, s.weightUnit);
}

/** A load as the finish summary writes it: "135 kg", "+15 lb", "bodyweight" (bodyweight plus with nothing added). */
function loadWords(loggingType: LoggingType, weight: number | null, unit: WeightUnit | null): string {
  const bodyweightPlus = loggingType === 'bodyweight_plus';
  if (weight === null || unit === null) return bodyweightPlus ? 'bodyweight' : '';
  if (bodyweightPlus && isZeroWeight(weight, unit)) return 'bodyweight';
  return bodyweightPlus ? `+${formatWeight(weight, unit)}` : formatWeight(weight, unit);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Previous = { text: string; up: string | null; localDate: string };

/** The best earlier value of `kind`, its words, and how far the personal best beat it (null when it rounds to nothing). */
function previousBest(h: PrHighlight, prior: readonly PbHistorySet[]): Previous | null {
  const type = h.loggingType;
  const unit: WeightUnit | null = h.weightUnit;
  switch (h.kind) {
    case 'heaviest': {
      let best: PbHistorySet | null = null;
      let bestKg = -Infinity;
      for (const s of prior) {
        const kg = loadKg(type, s);
        if (kg === null || kg <= bestKg) continue;
        best = s;
        bestKg = kg;
      }
      if (best === null) return null;
      const text = loadWords(type, best.weight, best.weightUnit);
      if (unit === null || h.weight === null) return { text, up: null, localDate: best.localDate };
      // Exact to 0.01 in one unit; to 0.1 once converted, as a conversion is never exact.
      const converted = best.weightUnit !== null && best.weightUnit !== unit;
      const before = best.weight === null || best.weightUnit === null ? 0 : convertWeight(best.weight, best.weightUnit, unit);
      const gap = Number((h.weight - before).toFixed(converted ? 1 : 2));
      return { text, up: gap > 0 ? formatWeight(gap, unit) : null, localDate: best.localDate };
    }
    case 'reps_at_weight': {
      const prLoad = { value: h.weight ?? 0, unit: h.weightUnit ?? 'kg' };
      let best: PbHistorySet | null = null;
      for (const s of prior) {
        if (s.reps === null || s.reps <= 0) continue;
        const load = { value: s.weight ?? 0, unit: s.weightUnit ?? 'kg' };
        if (!sameLoggedWeight(load, prLoad)) continue;
        if (best === null || s.reps > (best.reps ?? 0)) best = s;
      }
      if (best === null || best.reps === null) return null;
      const gap = (h.reps ?? 0) - best.reps;
      return { text: plural(best.reps, 'rep', 'reps'), up: gap > 0 ? plural(gap, 'rep', 'reps') : null, localDate: best.localDate };
    }
    case 'e1rm': {
      if (unit === null || h.weight === null || h.reps === null) return null;
      let best: PbHistorySet | null = null;
      let bestKg = -Infinity;
      for (const s of prior) {
        const kg = loadKg(type, s);
        const e = kg === null || s.reps === null ? null : estimatedOneRm(kg, s.reps);
        if (e === null || e <= bestKg) continue;
        best = s;
        bestKg = e;
      }
      if (best === null) return null;
      // Both rounded to a whole number in the personal best's unit, as the card shows them.
      const before = Math.round(convertWeight(bestKg, 'kg', unit));
      const now = Math.round(estimatedOneRm(h.weight, h.reps) ?? 0);
      return { text: loadWords(type, before, unit), up: now > before ? formatWeight(now - before, unit) : null, localDate: best.localDate };
    }
    case 'longest_hold': {
      let best: PbHistorySet | null = null;
      for (const s of prior) {
        if (s.durationS === null || s.durationS <= 0) continue;
        if (best === null || s.durationS > (best.durationS ?? 0)) best = s;
      }
      if (best === null || best.durationS === null) return null;
      const gap = (h.durationS ?? 0) - best.durationS;
      return { text: formatDuration(best.durationS), up: gap > 0 ? formatDuration(gap) : null, localDate: best.localDate };
    }
  }
}

/**
 * "Up 5 kg from 135 kg on 2 Sep." — how far the personal best beat the best of the workouts before it (R445). When the
 * gap rounds to nothing (two units, an e1RM rounded to whole numbers) it says "Previous best 135 kg on 2 Sep." instead.
 * The previous date carries its year only when it is not the personal best's year.
 */
function comparisonLine(h: PrHighlight, prior: readonly PbHistorySet[], locale: string): string | null {
  const prev = previousBest(h, prior);
  if (prev === null) return null;
  const on = formatEntryDate(prev.localDate, h.localDate, locale);
  return prev.up === null ? `Previous best ${prev.text} on ${on}.` : `Up ${prev.up} from ${prev.text} on ${on}.`;
}

/** The card's value, split for display: the same value as R106's card ("185 lb × 5", "8 reps", "210 lb", "1:30"). */
function pbValue(h: PrHighlight): CardValue {
  return splitValue(prCard(h).value);
}

/**
 * The personal best card's words and numbers (R444–R446). `history` is every set of the lift from finished workouts in
 * time order; `workoutId` is the workout that set the personal best. Earlier workouts give the previous best and the
 * session count; later ones (sharing an old personal best from History) are left out, so the card says what was true
 * that day. A set counts when it is done and not a warm-up.
 */
export function pbCardModel(h: PrHighlight, workoutId: string, history: readonly PbHistorySet[], locale: string): PbCardModel {
  const sets = history.filter(eligible);
  const at = sets.findIndex((s) => s.workoutId === workoutId);
  const prior = at === -1 ? sets.filter((s) => s.localDate < h.localDate) : sets.slice(0, at);
  return {
    name: h.name,
    value: pbValue(h),
    caption: prCard(h).caption,
    comparison: comparisonLine(h, prior, locale),
    date: formatTrainDate(fromLocalDate(h.localDate), locale, { year: true }),
    sessions: new Set(prior.map((s) => s.workoutId)).size + 1,
  };
}

/** A lift's name inside a sentence: "bench press", leaving a leading abbreviation alone ("RDL", "EZ bar curl"). */
export function nameInSentence(name: string): string {
  const first = name.split(' ')[0];
  if (first.length > 1 && first === first.toUpperCase() && /[A-Z]/.test(first)) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/**
 * The Share pill's VoiceOver label on a personal best (R448): "Share your bench press personal best as an image.
 * Heaviest: 185 lb × 5". The second sentence tells two rows of one lift apart.
 */
export function pbShareLabel(h: PrHighlight): string {
  const line = prLine(h);
  const detail = line.slice(line.indexOf(' — ') + 3);
  return `Share your ${nameInSentence(h.name)} personal record as an image. ${detail.charAt(0).toUpperCase()}${detail.slice(1)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The weekly summary card

export type WeekWorkout = { id: string; localDate: string; startedAt: number; finishedAt: number };
export type WeekSet = VolumeSet & { workoutId: string; exerciseId: string; name: string };

export type WeekCardInput = {
  /** The Monday that starts the week. */
  monday: string;
  /** Today's local date: says whether this is this week, and the streak. */
  today: string;
  unit: WeightUnit;
  locale: string;
  /** The finished workouts dated in the week, earliest first. */
  workouts: readonly WeekWorkout[];
  /** Every set of those workouts, in workout, exercise and set order. */
  sets: readonly WeekSet[];
  /** The personal bests those workouts set (R105), earliest workout first. */
  prs: readonly PrHighlight[];
  /** How many personal bests the week set, counted as Stats counts them (R178). */
  prCount: number;
  /** Every finished workout's date, for the streak (spec 7.8). */
  trainingDates: readonly string[];
};

export type WeekRow = { name: string; value: string };

export type WeekCardModel = {
  /** "THIS WEEK", "LAST WEEK" or "WEEK". */
  kicker: string;
  /** "12 Oct – 18 Oct 2026", laid out for the locale. */
  range: string;
  /** Monday to Sunday: the locale's narrow weekday letter, whether a finished workout is dated that day, and its name. */
  days: { letter: string; trained: boolean; name: string }[];
  workouts: number;
  /** Done sets, warm-ups left out (spec 7.9). */
  sets: number;
  /** Total volume in the display unit: "12,480 kg". */
  volume: string;
  /** Time trained, start to finish of each workout: "4 h 10 min". */
  time: string;
  /** The personal bests (up to three lifts, red PR marks), else the top three lifts by volume, else nothing. */
  list: { kind: 'prs'; count: number; rows: WeekRow[] } | { kind: 'top'; rows: WeekRow[] } | null;
  /** The streak in days (spec 7.8) on this week's card; 0 hides it and is always 0 on an earlier week. */
  streak: number;
};

/** How many rows the card's list holds. */
export const WEEK_LIST_ROWS = 3;

/** The order a lift's personal bests are picked in for the card: the R105 order. */
const KIND_ORDER: PrKind[] = ['heaviest', 'e1rm', 'reps_at_weight', 'longest_hold'];

/** A personal best in a few words for a row: "140 kg × 5", "8 reps at 185 lb", "Est. 1RM 210 lb", "1:30 hold". */
export function prShort(h: PrHighlight): string {
  switch (h.kind) {
    case 'heaviest':
      return prSetText(h);
    case 'reps_at_weight':
      return `${plural(h.reps ?? 0, 'rep', 'reps')} at ${prLoadText(h)}`;
    case 'e1rm':
      return `Est. 1RM ${prE1rmText(h)}`;
    case 'longest_hold':
      return `${formatDuration(h.durationS ?? 0)} hold`;
  }
}

/**
 * The week's personal bests as rows (R450): one per lift, in the order the lifts first set one that week. A lift with
 * several shows its first kind in the R105 order (heaviest, then estimated 1RM, then reps, then hold), and of that kind
 * the latest, which beat any before it.
 */
export function weekPrRows(prs: readonly PrHighlight[]): WeekRow[] {
  const byLift = new Map<string, PrHighlight>();
  for (const h of prs) {
    const held = byLift.get(h.exerciseId);
    if (held === undefined || KIND_ORDER.indexOf(h.kind) <= KIND_ORDER.indexOf(held.kind)) byLift.set(h.exerciseId, h);
  }
  return [...byLift.values()].map((h) => ({ name: h.name, value: prShort(h) }));
}

/** The lifts with the most volume in the week, most first (ties by name), each "4,200 kg"; lifts without volume left out. */
export function topLiftRows(sets: readonly WeekSet[], unit: WeightUnit, locale: string): WeekRow[] {
  const byLift = new Map<string, { name: string; sets: WeekSet[] }>();
  for (const s of sets) {
    const lift = byLift.get(s.exerciseId);
    if (lift) lift.sets.push(s);
    else byLift.set(s.exerciseId, { name: s.name, sets: [s] });
  }
  return [...byLift.values()]
    .map((l) => ({ name: l.name, volume: totalVolume(l.sets, unit) }))
    .filter((l) => l.volume > 0)
    .sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name))
    .map((l) => ({ name: l.name, value: formatVolume(l.volume, unit, locale) }));
}

/** "12 Oct – 18 Oct 2026" ("Oct 12 – Oct 18, 2026"): both days in the locale's order, the year once, on the last. */
export function weekRange(monday: string, locale: string): string {
  const sunday = shiftDay(monday, 6);
  const start = dateFormat(locale, { day: 'numeric', month: 'short' }).format(fromLocalDate(monday));
  const end = dateFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(fromLocalDate(sunday));
  return `${start} – ${end}`;
}

/** The weekly summary card's words and numbers (R449–R452), for the Monday-first week starting `monday`. */
export function weekCardModel(input: WeekCardInput): WeekCardModel {
  const { monday, today, unit, locale } = input;
  const sunday = shiftDay(monday, 6);
  const thisWeek = mondayOf(today) === monday;
  const kicker = thisWeek ? 'THIS WEEK' : shiftDay(mondayOf(today), -7) === monday ? 'LAST WEEK' : 'WEEK';
  const inWeek = input.workouts.filter((w) => w.localDate >= monday && w.localDate <= sunday);
  const ids = new Set(inWeek.map((w) => w.id));
  const sets = input.sets.filter((s) => ids.has(s.workoutId));
  const trained = new Set(inWeek.map((w) => w.localDate));
  const letter = dateFormat(locale, { weekday: 'narrow' });
  const dayName = dateFormat(locale, { weekday: 'long' });

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDay(monday, i);
    return { letter: letter.format(fromLocalDate(date)), trained: trained.has(date), name: dayName.format(fromLocalDate(date)) };
  });

  const prRows = weekPrRows(input.prs.filter((h) => h.localDate >= monday && h.localDate <= sunday));
  const topRows = topLiftRows(sets, unit, locale);
  const list: WeekCardModel['list'] =
    prRows.length > 0
      ? { kind: 'prs', count: Math.max(input.prCount, prRows.length), rows: prRows.slice(0, WEEK_LIST_ROWS) }
      : topRows.length > 0
        ? { kind: 'top', rows: topRows.slice(0, WEEK_LIST_ROWS) }
        : null;

  return {
    kicker,
    range: weekRange(monday, locale),
    days,
    workouts: inWeek.length,
    sets: sets.filter(eligible).length,
    volume: formatVolume(totalVolume(sets, unit), unit, locale),
    time: inWeek.length === 0 ? '0 min' : formatWorkoutDuration(inWeek.reduce((sum, w) => sum + Math.max(0, w.finishedAt - w.startedAt), 0)),
    list,
    streak: thisWeek ? computeStreak([...input.trainingDates], today) : 0,
  };
}

/** The Share button's VoiceOver label on a week (R448). */
export function weekShareLabel(kicker: 'THIS WEEK' | 'LAST WEEK'): string {
  return kicker === 'THIS WEEK' ? 'Share this week as an image' : 'Share last week as an image';
}

/** "12-day streak": the streak as the weekly card writes it. */
export function streakText(days: number): string {
  return days === 1 ? '1-day streak' : `${days}-day streak`;
}
