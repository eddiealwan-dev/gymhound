import type { DayMark, DistanceUnit, SetType, WeightUnit } from './types';

/** One CSV field before quoting. Null is an empty field. */
export type CsvValue = string | number | null;

/** A field as RFC 4180 writes it: quoted, with `"` doubled, when it holds a comma, a quote, a CR or an LF. */
export function csvField(value: CsvValue): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Free text with an apostrophe in front when it starts with `=` `+` `-` `@`, a tab or a CR, which Excel and Google
 * Sheets would read as a formula (OWASP's CSV injection advice). Other text is returned as it is.
 */
export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** A whole CSV file: a UTF-8 BOM (so Excel reads it as UTF-8), then the header and the rows, joined with CRLF. */
export function toCsv(header: readonly string[], rows: CsvValue[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n')}`;
}

/** The columns of `gymhound-workouts-YYYY-MM-DD.csv`, in order (spec §11). */
export const WORKOUT_CSV_COLUMNS = [
  'workout_id',
  'date',
  'started_at',
  'finished_at',
  'workout',
  'routine',
  'routine_day',
  'day_mark',
  'exercise',
  'exercise_id',
  'set_number',
  'set_type',
  'weight',
  'weight_unit',
  'reps',
  'rpe',
  'duration_s',
  'distance',
  'distance_unit',
  'pr',
  'exercise_note',
] as const;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/**
 * An instant as ISO 8601 local time with its offset, for example `2026-10-10T17:57:59.401-05:00`. `offsetMinutes` is
 * how far local time is ahead of UTC at that instant (the device's is `-new Date(ms).getTimezoneOffset()`).
 */
export function isoWithOffset(epochMs: number, offsetMinutes: number): string {
  const d = new Date(epochMs + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** The bits of `sets.pr_flags` and the names the export gives them (spec §5). */
const PR_KINDS: [bit: number, name: string][] = [
  [1, 'heaviest'],
  [2, 'reps'],
  [4, 'e1rm'],
  [8, 'hold'],
];

/** The PR kinds a set's flags hold, joined with `|`; empty when there are none. */
export function prKinds(flags: number): string {
  return PR_KINDS.filter(([bit]) => (flags & bit) !== 0)
    .map(([, name]) => name)
    .join('|');
}

/** The device's offset from UTC, in minutes ahead, at an instant. */
export function deviceOffsetMinutes(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}

/** One done set of a finished workout, with what the export needs from its workout and exercise. */
export type WorkoutCsvSet = {
  workoutId: string;
  localDate: string;
  startedAt: number;
  finishedAt: number | null;
  workoutName: string;
  /** Null when the workout was not started from a routine (or the routine is gone). */
  routineName: string | null;
  routineDayName: string | null;
  dayMark: DayMark;
  workoutExerciseId: string;
  exerciseName: string;
  exerciseId: string;
  setType: SetType;
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
  prFlags: number;
  /** The exercise's note as it was saved with the workout. */
  exerciseNote: string | null;
};

/**
 * The CSV rows for done sets, in the order given (by start time, then exercise position, then set position), with
 * one value per `WORKOUT_CSV_COLUMNS` entry. `set_number` is the set's 1-based rank among the sets of its own type in
 * that workout exercise, the rule the previous result matches by. Each time is written at the offset `offsetAt`
 * gives for that instant. The free text (workout, routine, routine day, exercise and note) goes through
 * `neutraliseFormula`; numbers, ids, codes and times are left as they are.
 */
export function buildWorkoutCsvRows(sets: readonly WorkoutCsvSet[], offsetAt: (epochMs: number) => number): CsvValue[][] {
  const seen = new Map<string, number>();
  const iso = (ms: number | null) => (ms === null ? null : isoWithOffset(ms, offsetAt(ms)));
  const text = (value: string | null) => (value === null ? null : neutraliseFormula(value));
  return sets.map((s) => {
    const key = `${s.workoutExerciseId}\u0000${s.setType}`;
    const setNumber = (seen.get(key) ?? 0) + 1;
    seen.set(key, setNumber);
    return [
      s.workoutId,
      s.localDate,
      iso(s.startedAt),
      iso(s.finishedAt),
      text(s.workoutName),
      text(s.routineName),
      text(s.routineDayName),
      s.dayMark,
      text(s.exerciseName),
      s.exerciseId,
      setNumber,
      s.setType,
      s.weight,
      s.weightUnit,
      s.reps,
      s.rpe,
      s.durationS,
      s.distance,
      s.distanceUnit,
      prKinds(s.prFlags),
      text(s.exerciseNote),
    ];
  });
}
