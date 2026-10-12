import { BODY_KINDS, isBodyKind, lengthUnitFor, type BodyKind, type BodyUnit } from './body';
import type { DistanceUnit, SetType, WeightUnit } from './types';

/**
 * Reading another app's export (R565, the owner's Round 11 request: "so people can leave another app without losing
 * their data"). One CSV file holds one kind of thing, told apart by its columns: workouts (one row per set, or per
 * exercise with a sets count), body (bodyweight and measurements, one column each or a kind and a value) or food (one
 * row per thing eaten, with its calories). Column names are matched loosely, so GymHound's own exports and the usual
 * ones from Strong, Hevy, FitNotes and food trackers read without any setting up. Pure: no database, no clock.
 */

export type ImportKind = 'workouts' | 'body' | 'food';

/** A row that could not be read, numbered as a spreadsheet numbers it (the header is row 1). */
export type SkippedRow = { row: number; reason: string };

export type ImportedSet = {
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
};

export type ImportedExercise = { name: string; note: string | null; sets: ImportedSet[] };

export type ImportedWorkout = {
  /** The file's own workout id, when it has one (GymHound's export), so importing it again finds it. */
  sourceId: string | null;
  name: string;
  localDate: string;
  startedAt: number;
  finishedAt: number;
  exercises: ImportedExercise[];
};

export type ImportedBody = { kind: BodyKind; localDate: string; measuredAt: number; value: number; unit: BodyUnit };

export type ImportedFood = {
  localDate: string;
  loggedAt: number;
  name: string;
  servings: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

type Read = { rows: number; skipped: SkippedRow[] };

export type ImportPlan =
  | (Read & { kind: 'workouts'; workouts: ImportedWorkout[]; /** The file says what its weights are in. */ weightUnitKnown: boolean })
  | (Read & { kind: 'body'; entries: ImportedBody[]; weightUnitKnown: boolean })
  | (Read & { kind: 'food'; entries: ImportedFood[] })
  | { kind: 'unknown'; reason: string };

export type ImportOptions = {
  /** The unit for weights a file doesn't name: the phone's setting, or the one chosen on the import screen. */
  weightUnit: WeightUnit;
  /** For distances a file doesn't give a unit for. */
  distanceUnit: DistanceUnit;
  /** For dates like 03/04/2025 that could be either way round, when nothing in the file settles it. */
  dayFirst: boolean;
};

/** Said when a file isn't one of the three kinds. */
export const UNKNOWN_FILE =
  "GymHound couldn't tell what this file holds. It needs a date column, and an exercise, a food with its calories, or bodyweight or measurements. The sample files show the columns it reads.";

/** Said for a file with a header and nothing under it. */
export const EMPTY_FILE = 'This file has no rows under its header.';

// ---------------------------------------------------------------------------------------------------------------------
// CSV

/** The separator a file uses: a comma, or a semicolon or tab when the header has more of those (European exports). */
function separatorOf(firstLine: string): string {
  const count = (c: string) => firstLine.split(c).length - 1;
  const counts: [string, number][] = [
    [',', count(',')],
    [';', count(';')],
    ['\t', count('\t')],
  ];
  return counts.reduce((best, next) => (next[1] > best[1] ? next : best))[0];
}

/** RFC 4180 rows: quoted fields may hold the separator, doubled quotes and line breaks. A leading BOM is dropped. */
export function parseCsv(text: string): { rows: string[][]; separator: string } {
  const src = text.replace(/^﻿/, '');
  const separator = separatorOf(src.split(/\r?\n/, 1)[0] ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return { rows: rows.filter((r) => r.some((f) => f.trim() !== '')), separator };
}

// ---------------------------------------------------------------------------------------------------------------------
// Columns

/** A header as matched: lower case, words only, and the unit it names in brackets or as its last word. */
type Header = { base: string; unit: string | null };

const UNIT_WORDS: Record<string, string> = {
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  kg: 'kg', kgs: 'kg', kilograms: 'kg',
  km: 'km', kilometers: 'km', kilometres: 'km',
  mi: 'mi', mile: 'mi', miles: 'mi',
  m: 'm', meters: 'm', metres: 'm',
  s: 's', sec: 's', secs: 's', seconds: 's',
  min: 'min', mins: 'min', minutes: 'min',
  g: 'g', grams: 'g',
  kcal: 'kcal', cal: 'kcal', kj: 'kj',
  cm: 'cm', in: 'in', inch: 'in', inches: 'in',
  '%': '%', percent: '%', pct: '%',
};

export function readHeader(raw: string): Header {
  let text = raw.replace(/^﻿/, '').trim().toLowerCase();
  let unit: string | null = null;
  const bracket = /\(([^)]*)\)|\[([^\]]*)\]/.exec(text);
  if (bracket) {
    const inside = (bracket[1] ?? bracket[2] ?? '').trim();
    if (inside in UNIT_WORDS) unit = UNIT_WORDS[inside];
    text = text.replace(bracket[0], ' ');
  }
  text = text.replace(/%/g, ' % ').replace(/[_\-./#]+/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ');
  const last = words[words.length - 1];
  if (unit === null && words.length > 1 && last in UNIT_WORDS) {
    unit = UNIT_WORDS[last];
    words.pop();
  }
  return { base: words.join(' '), unit };
}

/** The column whose header is one of `names` (first match in the order given), or -1. */
function findColumn(headers: readonly Header[], names: readonly string[], unless?: (h: Header) => boolean): number {
  for (const name of names) {
    const i = headers.findIndex((h) => h.base === name && !(unless?.(h) ?? false));
    if (i >= 0) return i;
  }
  return -1;
}

const COLUMNS = {
  date: ['date', 'workout date', 'day', 'start time', 'start', 'started at', 'start date', 'datetime', 'date time', 'timestamp', 'time stamp', 'logged at', 'measured at', 'created', 'created at'],
  startTime: ['started at', 'start time', 'start', 'start date', 'datetime', 'date time', 'timestamp'],
  endTime: ['finished at', 'end time', 'end', 'end date', 'finish time', 'finished'],
  workoutId: ['workout id'],
  workoutName: ['workout', 'workout name', 'title', 'session', 'session name', 'routine', 'routine name'],
  workoutDuration: ['duration', 'workout duration'],
  exercise: ['exercise', 'exercise name', 'exercise title', 'movement', 'lift', 'exercise type'],
  setNumber: ['set order', 'set', 'set number', 'set index', 'set no', 'set nr'],
  setType: ['set type', 'type'],
  weight: ['weight', 'load', 'weight lifted', 'kg', 'lb', 'lbs'],
  weightUnit: ['weight unit', 'unit', 'units'],
  reps: ['reps', 'rep', 'repetitions', 'rep count'],
  sets: ['sets', 'set count', 'number of sets', 'num sets'],
  rpe: ['rpe'],
  seconds: ['seconds', 'duration', 'time', 'set duration', 'hold', 'duration s'],
  distance: ['distance'],
  distanceUnit: ['distance unit'],
  note: ['exercise note', 'exercise notes', 'notes', 'note', 'comment', 'comments'],
  // Body
  kind: ['kind', 'measurement', 'metric'],
  value: ['value', 'amount'],
  bodyweight: ['bodyweight', 'body weight', 'weight', 'body mass', 'mass'],
  // Food
  foodName: ['name', 'food', 'food name', 'item', 'description', 'food item', 'product', 'product name'],
  meal: ['meal', 'meal name'],
  servings: ['servings', 'serving', 'quantity', 'qty', 'number of servings', 'no of servings', 'amount'],
  kcal: ['kcal', 'calories', 'energy', 'cals', 'calorie', 'energy kcal'],
  protein: ['protein', 'protein g', 'proteins'],
  carbs: ['carbs', 'carbohydrates', 'carbohydrate', 'carbs g', 'total carbohydrate', 'total carbohydrates', 'carbohydrates total'],
  fat: ['fat', 'total fat', 'fats', 'fat g', 'fat total'],
} as const;

/** Each measurement and the headers it goes by in a file with one column per measurement. */
const MEASUREMENT_COLUMNS: [BodyKind, string[]][] = [
  ['waist', ['waist']],
  ['chest', ['chest']],
  ['hips', ['hips', 'hip']],
  ['arms', ['arms', 'arm', 'biceps', 'bicep', 'upper arm']],
  ['thighs', ['thighs', 'thigh']],
  ['neck', ['neck']],
  ['body_fat', ['body fat', 'bodyfat', 'body fat %', 'body fat percentage', 'fat %', 'fat percentage', 'bf', 'bf %']],
];

/** Kind names a long-format body file may use, beyond GymHound's own. */
const KIND_NAMES: Record<string, BodyKind> = {
  'body weight': 'bodyweight',
  weight: 'bodyweight',
  hip: 'hips',
  arm: 'arms',
  biceps: 'arms',
  bicep: 'arms',
  thigh: 'thighs',
  'body fat': 'body_fat',
  bodyfat: 'body_fat',
  'body fat %': 'body_fat',
  'body fat percentage': 'body_fat',
};

// ---------------------------------------------------------------------------------------------------------------------
// Values

/** A number as files write it: "82.5", "82,5" (European), "1,234.5", "1.234,5" or with a unit after it ("82.5 kg"). */
export function readNumber(raw: string, decimalComma: boolean): number | null {
  let text = raw.trim().replace(/\s*[a-z%]+$/i, '').replace(/\s/g, '');
  if (text === '' || text === '-') return null;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,234" is a thousand in a comma file; "82,5" is a decimal in a semicolon one.
    text = decimalComma || !/^-?\d{1,3}(,\d{3})+$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '');
  }
  if (!/^-?\d*\.?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** A length of time in seconds: "90", "1:30", "0:01:30", "1h 5m", "45m", "30s" or "1h5m30s". */
export function readSeconds(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (text === '') return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.\d+)?$/.exec(text);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const parts = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?|s)?)?)?\s*(?:(\d+)\s*s(?:ec(?:onds?|s)?)?)?$/.exec(text);
  if (parts && (parts[1] ?? parts[2] ?? parts[3]) !== undefined) return Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A date and maybe a time, read from a file: its calendar day, and the instant when the file says one. */
export type ReadDate = { localDate: string; at: number | null };

const two = (n: number) => String(n).padStart(2, '0');

function validDay(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function hours(h: number, ampm: string | undefined): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === 'pm';
  return (h % 12) + (pm ? 12 : 0);
}

/**
 * A date as files write it: "2025-03-04", "2025-03-04 18:30:00", ISO 8601 with an offset, "03/04/2025" (day or month
 * first as `dayFirst` says), "4 Mar 2025, 18:30" (Hevy) or "Mar 4, 2025". A time without an offset is the phone's
 * local time. Null for anything else, or a day that doesn't exist.
 */
export function readDate(raw: string, dayFirst: boolean): ReadDate | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  if (text === '') return null;
  let y: number, m: number, d: number;
  let time: [number, number, number] | null = null;
  let offset: string | null = null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(z|[+-]\d{2}:?\d{2})?)?$/i.exec(text);
  const slash = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:,? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(text);
  const dayMonth = /^(\d{1,2}) ([a-z]{3})[a-z]*\.? (\d{4})(?:,? (\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(text);
  const monthDay = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:,? (?:at )?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(text);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    if (iso[4] !== undefined) time = [Number(iso[4]), Number(iso[5]), Number(iso[6] ?? 0)];
    offset = iso[7] ?? null;
  } else if (slash) {
    const [a, b] = [Number(slash[1]), Number(slash[2])];
    y = Number(slash[3]);
    if (y < 100) y += 2000;
    [d, m] = dayFirst ? [a, b] : [b, a];
    if (slash[4] !== undefined) time = [hours(Number(slash[4]), slash[7]), Number(slash[5]), Number(slash[6] ?? 0)];
  } else if (dayMonth) {
    m = MONTHS.indexOf(dayMonth[2].toLowerCase()) + 1;
    [d, y] = [Number(dayMonth[1]), Number(dayMonth[3])];
    if (dayMonth[4] !== undefined) time = [hours(Number(dayMonth[4]), dayMonth[7]), Number(dayMonth[5]), Number(dayMonth[6] ?? 0)];
  } else if (monthDay) {
    m = MONTHS.indexOf(monthDay[1].toLowerCase()) + 1;
    [d, y] = [Number(monthDay[2]), Number(monthDay[3])];
    if (monthDay[4] !== undefined) time = [hours(Number(monthDay[4]), monthDay[7]), Number(monthDay[5]), Number(monthDay[6] ?? 0)];
  } else return null;

  if (!validDay(y, m, d)) return null;
  const localDate = `${y}-${two(m)}-${two(d)}`;
  if (time === null) return { localDate, at: null };
  const [h, min, s] = time;
  if (h > 23 || min > 59 || s > 59) return null;
  if (offset !== null) {
    const at = Date.parse(`${localDate}T${two(h)}:${two(min)}:${two(s)}${offset.toUpperCase() === 'Z' ? 'Z' : offset.length === 5 ? `${offset.slice(0, 3)}:${offset.slice(3)}` : offset}`);
    return Number.isFinite(at) ? { localDate, at } : null;
  }
  return { localDate, at: new Date(y, m - 1, d, h, min, s).getTime() };
}

/** Whether dates like 03/04/2025 in a column are day first: settled by any part over 12, else `fallback`. */
function dayFirstIn(values: readonly string[], fallback: boolean): boolean {
  for (const v of values) {
    const match = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/.exec(v.trim());
    if (!match) continue;
    if (Number(match[1]) > 12) return true;
    if (Number(match[2]) > 12) return false;
  }
  return fallback;
}

/** Midday of a calendar day, local time: when a file gives a day but no time. */
export function middayOf(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

function weightUnitOf(raw: string | undefined): WeightUnit | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (/^(lb|lbs|pounds?)$/.test(t)) return 'lb';
  if (/^(kg|kgs|kilograms?|kilos?)$/.test(t)) return 'kg';
  return null;
}

function distanceUnitOf(raw: string | undefined): DistanceUnit | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (/^(km|kms|kilometers?|kilometres?)$/.test(t)) return 'km';
  if (/^(mi|miles?)$/.test(t)) return 'mi';
  if (/^(m|meters?|metres?)$/.test(t)) return 'm';
  return null;
}

/** A set type as apps write it ("W" in Strong, "warmup" in Hevy, GymHound's own words). */
function setTypeOf(raw: string | undefined): SetType | null {
  const t = (raw ?? '').trim().toLowerCase();
  if (t === '' || /^(normal|working|work|regular|n|\d+)$/.test(t)) return 'working';
  if (/^(w|warm ?up|warmup|warm-up)$/.test(t)) return 'warmup';
  if (/^(d|drop|drop ?set|dropset)$/.test(t)) return 'drop';
  if (/^(f|failure|fail)$/.test(t)) return 'failure';
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The plan

type Table = { headers: Header[]; rows: string[][]; decimalComma: boolean };

/** Reads a file into what importing it would add (R565). Nothing is written; `applyImport` does that. */
export function planImport(text: string, options: ImportOptions): ImportPlan {
  const { rows, separator } = parseCsv(text);
  if (rows.length === 0) return { kind: 'unknown', reason: UNKNOWN_FILE };
  const table: Table = { headers: rows[0].map(readHeader), rows: rows.slice(1), decimalComma: separator === ';' };
  const has = (names: readonly string[]) => findColumn(table.headers, names) >= 0;

  const kind: ImportKind | null = has(COLUMNS.exercise)
    ? 'workouts'
    : has(COLUMNS.kind) && has(COLUMNS.value)
      ? 'body'
      : has(COLUMNS.kcal) || has(COLUMNS.protein)
        ? 'food'
        : has(COLUMNS.bodyweight) || MEASUREMENT_COLUMNS.some(([, names]) => has(names))
          ? 'body'
          : null;
  if (kind === null || !has(COLUMNS.date)) return { kind: 'unknown', reason: UNKNOWN_FILE };
  if (table.rows.length === 0) return { kind: 'unknown', reason: EMPTY_FILE };

  const dateCol = findColumn(table.headers, COLUMNS.date);
  const dayFirst = dayFirstIn(
    table.rows.map((r) => r[dateCol] ?? ''),
    options.dayFirst,
  );
  if (kind === 'workouts') return planWorkouts(table, { ...options, dayFirst });
  if (kind === 'body') return planBody(table, { ...options, dayFirst });
  return planFood(table, { ...options, dayFirst });
}

function planWorkouts(t: Table, o: ImportOptions): ImportPlan {
  const col = (names: readonly string[], unless?: (h: Header) => boolean) => findColumn(t.headers, names, unless);
  const c = {
    date: col(COLUMNS.date),
    start: col(COLUMNS.startTime),
    end: col(COLUMNS.endTime),
    id: col(COLUMNS.workoutId),
    name: col(COLUMNS.workoutName),
    // A duration with no unit is the workout's ("1h 5m" in Strong); with seconds as its unit, the set's.
    workoutDuration: col(COLUMNS.workoutDuration, (h) => h.unit !== null),
    exercise: col(COLUMNS.exercise),
    setNumber: col(COLUMNS.setNumber),
    setType: col(COLUMNS.setType),
    weight: col(COLUMNS.weight),
    weightUnit: col(COLUMNS.weightUnit),
    reps: col(COLUMNS.reps),
    sets: col(COLUMNS.sets),
    rpe: col(COLUMNS.rpe),
    seconds: col(COLUMNS.seconds, (h) => h.base === 'duration' && h.unit === null),
    distance: col(COLUMNS.distance),
    distanceUnit: col(COLUMNS.distanceUnit),
    note: col(COLUMNS.note),
  };
  const headerWeightUnit = c.weight >= 0 ? weightUnitOf(t.headers[c.weight].unit ?? t.headers[c.weight].base) : null;
  const weightUnitKnown = headerWeightUnit !== null || c.weightUnit >= 0;
  const headerDistanceUnit = c.distance >= 0 ? distanceUnitOf(t.headers[c.distance].unit ?? undefined) : null;
  const secondsScale = c.seconds >= 0 && t.headers[c.seconds].unit === 'min' ? 60 : 1;

  const skipped: SkippedRow[] = [];
  const groups = new Map<string, ImportedWorkout & { order: { setNumber: number; row: number }[][] }>();
  t.rows.forEach((r, i) => {
    const row = i + 2;
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const num = (k: number) => readNumber(cell(k), t.decimalComma);
    const date = readDate(cell(c.date), o.dayFirst);
    if (date === null) {
      skipped.push({ row, reason: cell(c.date) === '' ? 'No date' : `Date not understood: ${cell(c.date)}` });
      return;
    }
    const exercise = cell(c.exercise);
    if (exercise === '') {
      skipped.push({ row, reason: 'No exercise' });
      return;
    }
    const type = setTypeOf(cell(c.setNumber) !== '' && /^[a-z]$/i.test(cell(c.setNumber)) ? cell(c.setNumber) : cell(c.setType));
    const weight = num(c.weight);
    const reps = num(c.reps);
    const seconds = c.seconds >= 0 ? readSeconds(cell(c.seconds)) : null;
    const distance = num(c.distance);
    const anything = (weight ?? 0) > 0 || (reps ?? 0) > 0 || (seconds ?? 0) > 0 || (distance ?? 0) > 0;
    if (!anything) {
      skipped.push({ row, reason: `Nothing logged for ${exercise}` });
      return;
    }
    if ([weight, reps, seconds, distance].some((v) => v !== null && v < 0)) {
      skipped.push({ row, reason: `A number below zero for ${exercise}` });
      return;
    }
    const unit = weightUnitOf(cell(c.weightUnit)) ?? headerWeightUnit ?? o.weightUnit;
    const set: ImportedSet = {
      setType: type ?? 'working',
      weight: weight !== null && weight > 0 ? weight : null,
      weightUnit: weight !== null && weight > 0 ? unit : null,
      reps: reps !== null && reps > 0 ? Math.round(reps) : null,
      rpe: (() => {
        const v = num(c.rpe);
        return v !== null && v >= 6 && v <= 10 ? Math.round(v * 2) / 2 : null;
      })(),
      durationS: seconds !== null && seconds > 0 ? seconds * secondsScale : null,
      distance: distance !== null && distance > 0 ? distance : null,
      distanceUnit: distance !== null && distance > 0 ? (distanceUnitOf(cell(c.distanceUnit)) ?? headerDistanceUnit ?? o.distanceUnit) : null,
    };
    const start = c.start >= 0 && c.start !== c.date ? readDate(cell(c.start), o.dayFirst) : date;
    const startedAt = start?.at ?? middayOf(date.localDate);
    const name = cell(c.name) || 'Imported workout';
    const sourceId = c.id >= 0 && cell(c.id) !== '' ? cell(c.id) : null;
    // One workout: the file's own id, else its start time, else its day and name.
    const key = sourceId ?? (start?.at != null ? `${start.at}|${name}` : `${date.localDate}|${name}`);
    let group = groups.get(key);
    if (!group) {
      const end = c.end >= 0 ? readDate(cell(c.end), o.dayFirst) : null;
      const length = c.workoutDuration >= 0 ? readSeconds(cell(c.workoutDuration)) : null;
      const finishedAt = end?.at != null && end.at >= startedAt ? end.at : length !== null ? startedAt + length * 1000 : startedAt;
      group = { sourceId, name, localDate: date.localDate, startedAt, finishedAt, exercises: [], order: [] };
      groups.set(key, group);
    }
    let at = group.exercises.findIndex((e) => e.name.toLowerCase() === exercise.toLowerCase());
    if (at < 0) {
      group.exercises.push({ name: exercise, note: null, sets: [] });
      group.order.push([]);
      at = group.exercises.length - 1;
    }
    const target = group.exercises[at];
    const note = cell(c.note);
    if (note !== '' && target.note === null) target.note = note;
    const count = Math.max(1, Math.min(50, Math.round(num(c.sets) ?? 1)));
    const setNumber = num(c.setNumber) ?? Number.MAX_SAFE_INTEGER;
    for (let k = 0; k < count; k++) {
      target.sets.push({ ...set });
      group.order[at].push({ setNumber, row: row * 100 + k });
    }
  });

  const workouts = [...groups.values()]
    .map(({ order, ...w }) => ({
      ...w,
      // Sets in the order the file numbers them, else the order of its rows; warm-ups first, as they were done.
      exercises: w.exercises.map((e, i) => {
        const ranked = e.sets.map((s, k) => ({ s, ...order[i][k] }));
        ranked.sort((a, b) => Number(b.s.setType === 'warmup') - Number(a.s.setType === 'warmup') || a.setNumber - b.setNumber || a.row - b.row);
        return { ...e, sets: ranked.map((x) => x.s) };
      }),
    }))
    .sort((a, b) => a.startedAt - b.startedAt);
  return { kind: 'workouts', rows: t.rows.length, skipped, workouts, weightUnitKnown };
}

function planBody(t: Table, o: ImportOptions): ImportPlan {
  const col = (names: readonly string[]) => findColumn(t.headers, names);
  const dateCol = col(COLUMNS.date);
  const timeCol = findColumn(t.headers, ['measured at', 'time', 'timestamp']);
  const kindCol = col(COLUMNS.kind);
  const valueCol = col(COLUMNS.value);
  const unitCol = col(COLUMNS.weightUnit);
  const skipped: SkippedRow[] = [];
  const entries: ImportedBody[] = [];
  const lengthUnit = lengthUnitFor(o.weightUnit);
  let weightUnitKnown = unitCol >= 0;

  /** The unit for a value of `kind`: the row's, the column's, or the phone's. */
  const unitFor = (kind: BodyKind, rowUnit: string, headerUnit: string | null): BodyUnit | null => {
    if (kind === 'body_fat') return '%';
    const named = (rowUnit || headerUnit || '').toLowerCase();
    if (kind === 'bodyweight') return weightUnitOf(named) ?? (named === '' ? o.weightUnit : null);
    if (/^(cm|centimeters?|centimetres?)$/.test(named)) return 'cm';
    if (/^(in|inch|inches|")$/.test(named)) return 'in';
    return named === '' || weightUnitOf(named) !== null ? lengthUnit : null;
  };

  const wide: [BodyKind, number][] =
    kindCol >= 0
      ? []
      : [
          ['bodyweight', col(COLUMNS.bodyweight)] as [BodyKind, number],
          ...MEASUREMENT_COLUMNS.map(([kind, names]) => [kind, col(names)] as [BodyKind, number]),
        ].filter(([, i]) => i >= 0);
  if (kindCol < 0 && wide.some(([kind, i]) => kind === 'bodyweight' && t.headers[i].unit !== null)) weightUnitKnown = true;

  t.rows.forEach((r, i) => {
    const row = i + 2;
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const date = readDate(cell(dateCol), o.dayFirst);
    if (date === null) {
      skipped.push({ row, reason: cell(dateCol) === '' ? 'No date' : `Date not understood: ${cell(dateCol)}` });
      return;
    }
    const at = (timeCol >= 0 && timeCol !== dateCol ? readDate(cell(timeCol), o.dayFirst)?.at : null) ?? date.at ?? middayOf(date.localDate);
    const add = (kind: BodyKind, raw: string, rowUnit: string, headerUnit: string | null) => {
      const value = readNumber(raw, t.decimalComma);
      if (value === null || value <= 0) return false;
      const unit = unitFor(kind, rowUnit, headerUnit);
      if (unit === null) {
        skipped.push({ row, reason: `Unit not understood: ${rowUnit || headerUnit}` });
        return true;
      }
      if (kind === 'body_fat' && value > 75) {
        skipped.push({ row, reason: `Body fat of ${value}% is out of range` });
        return true;
      }
      entries.push({ kind, localDate: date.localDate, measuredAt: at, value, unit });
      return true;
    };
    if (kindCol >= 0) {
      const name = readHeader(cell(kindCol)).base;
      const kind = isBodyKind(cell(kindCol).toLowerCase()) ? (cell(kindCol).toLowerCase() as BodyKind) : (KIND_NAMES[name] ?? (isBodyKind(name.replace(/ /g, '_')) ? (name.replace(/ /g, '_') as BodyKind) : null));
      if (kind === null) {
        skipped.push({ row, reason: `Not a measurement GymHound keeps: ${cell(kindCol)}` });
        return;
      }
      if (!add(kind, cell(valueCol), cell(unitCol), t.headers[valueCol]?.unit ?? null)) skipped.push({ row, reason: 'No value' });
      return;
    }
    let any = false;
    for (const [kind, k] of wide) any = add(kind, cell(k), kind === 'bodyweight' ? cell(unitCol) : '', t.headers[k].unit) || any;
    if (!any) skipped.push({ row, reason: 'No values' });
  });
  entries.sort((a, b) => a.measuredAt - b.measuredAt || BODY_KINDS.indexOf(a.kind) - BODY_KINDS.indexOf(b.kind));
  return { kind: 'body', rows: t.rows.length, skipped, entries, weightUnitKnown };
}

function planFood(t: Table, o: ImportOptions): ImportPlan {
  const col = (names: readonly string[]) => findColumn(t.headers, names);
  const c = {
    date: col(COLUMNS.date),
    time: findColumn(t.headers, ['logged at', 'time', 'timestamp']),
    name: col(COLUMNS.foodName),
    meal: col(COLUMNS.meal),
    servings: col(COLUMNS.servings),
    kcal: col(COLUMNS.kcal),
    protein: col(COLUMNS.protein),
    carbs: col(COLUMNS.carbs),
    fat: col(COLUMNS.fat),
  };
  const kilojoules = c.kcal >= 0 && t.headers[c.kcal].unit === 'kj';
  const skipped: SkippedRow[] = [];
  const entries: ImportedFood[] = [];
  t.rows.forEach((r, i) => {
    const row = i + 2;
    const cell = (k: number) => (k >= 0 ? (r[k] ?? '').trim() : '');
    const num = (k: number) => readNumber(cell(k), t.decimalComma);
    const date = readDate(cell(c.date), o.dayFirst);
    if (date === null) {
      skipped.push({ row, reason: cell(c.date) === '' ? 'No date' : `Date not understood: ${cell(c.date)}` });
      return;
    }
    const kcalRaw = num(c.kcal);
    const kcal = kcalRaw === null ? null : kilojoules ? kcalRaw / 4.184 : kcalRaw;
    const [protein, carbs, fat] = [num(c.protein), num(c.carbs), num(c.fat)];
    if ((kcal ?? 0) <= 0 && (protein ?? 0) <= 0 && (carbs ?? 0) <= 0 && (fat ?? 0) <= 0) {
      skipped.push({ row, reason: 'No calories or macros' });
      return;
    }
    if ([kcal, protein, carbs, fat].some((v) => v !== null && (v < 0 || v > 20000))) {
      skipped.push({ row, reason: 'A number out of range' });
      return;
    }
    const servings = num(c.servings);
    const at = (c.time >= 0 && c.time !== c.date ? readDate(cell(c.time), o.dayFirst)?.at : null) ?? date.at ?? middayOf(date.localDate);
    entries.push({
      localDate: date.localDate,
      loggedAt: at,
      name: (cell(c.name) || cell(c.meal) || 'Imported food').slice(0, 120),
      servings: servings !== null && servings > 0 && servings <= 100 ? servings : 1,
      // GymHound keeps an entry's own totals; protein, carbs or fat left out of a file count as 0.
      kcal: Math.round((kcal ?? 0) * 100) / 100,
      proteinG: protein ?? 0,
      carbsG: carbs ?? 0,
      fatG: fat ?? 0,
    });
  });
  entries.sort((a, b) => a.loggedAt - b.loggedAt);
  return { kind: 'food', rows: t.rows.length, skipped, entries };
}
