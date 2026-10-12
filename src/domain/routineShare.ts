import LIBRARY_IDS from '../seed/libraryIds.json';
import type { CustomExerciseInput } from './customExercise';
import { MAX_NAME_LENGTH } from './customExercise';
import { REST_CHOICES } from './rest';
import { MAX_SETS, MIN_SETS } from './routineDraft';
import type { Equipment, LoggingType, Muscle, WeightUnit } from './types';

/**
 * Routine sharing (§18.18, R460–R474): a routine travels inside a short code, so sharing works with no server, account
 * or network. A code reads `GH1.<payload>.<check>`:
 *
 * - `GH1` names the format's version. A phone that only knows version 1 says a `GH2` code is from a newer GymHound.
 * - The payload is the routine as JSON in positional arrays (no field names), UTF-8, then base64url (R461).
 * - The check is 4 base64url characters: 24 bits of FNV-1a over `GH1.<payload>`, so a changed character is caught.
 *
 * Version 1's payload: `[name, unit, days, customs?]`
 * - `unit`: 0 for lb, 1 for kg: the routine's usual increment unit.
 * - each day: `[name, ...slots]`
 * - each slot: `[exercise, sets, repMin, repMax, increment, link?, rest?]`
 *   - `exercise`: an integer ≥ 0 is the exercise at that place in `src/seed/libraryIds.json`, which only ever grows
 *     (new ids are appended), so a place means the same exercise on every version (R462). A negative integer `-n` is
 *     the n-th entry of `customs`.
 *   - `increment`: a number in the routine's unit, or `[number, unit]` when this slot's unit is the other one.
 *   - `link`: 1 when the slot forms a superset with the next one. `rest`: the exercise's own rest in seconds, one of
 *     `REST_CHOICES`. Trailing defaults (no link, no rest) are left off.
 * - each custom: `[name, loggingType, equipment, primaryMuscles, secondaryMuscles?]`, each an index into the frozen
 *   version-1 tables below.
 *
 * Nothing else travels: no history, next weights, notes, photos or anything about the person (R460).
 * Decoding never trusts its input: every field is checked against the bounds below, and anything off is refused.
 */

export const SHARE_VERSION = 1;
/** The longest code (its characters, prefix and check included) that is read at all. */
export const MAX_CODE_LENGTH = 12_000;
/** The most text searched for a code, so a huge paste can't stall the field. */
const MAX_TEXT_LENGTH = 50_000;
export const MAX_ROUTINE_NAME = 100;
export const MAX_DAY_NAME = 60;
export const MAX_DAYS = 14;
export const MAX_SLOTS_PER_DAY = 40;
export const MAX_CUSTOMS = 60;
/** The rep range's top: seconds for timed exercises, so up to an hour. */
export const MAX_REPS = 3600;
export const MAX_INCREMENT = 100;

/**
 * The version-1 tables. They are frozen: a value added to GymHound later is appended, never inserted, so a code keeps
 * its meaning. A value missing here can't be shared as a custom exercise's field, and `encodeRoutine` throws for it.
 */
const LOGGING_TYPES_V1: readonly LoggingType[] = ['weighted', 'bodyweight_plus', 'assisted', 'timed', 'weighted_time', 'distance_time'];
const EQUIPMENT_V1: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'bodyweight',
  'ez_bar',
  'band',
  'medicine_ball',
  'exercise_ball',
  'foam_roller',
  'other',
];
const MUSCLES_V1: readonly Muscle[] = [
  'chest',
  'front_delts',
  'side_delts',
  'rear_delts',
  'lats',
  'upper_back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'calves',
];
const UNITS_V1: readonly WeightUnit[] = ['lb', 'kg'];

/** An exercise of your own that travels with the routine: what the receiving phone needs to create it. */
export type SharedCustomExercise = CustomExerciseInput;

/**
 * Which exercise a slot holds: a library exercise by id, the routine's `customs[n]`, or, only when decoding, a library
 * place this phone's list doesn't reach (`missing`, from a newer GymHound).
 */
export type SharedExerciseRef = { library: string } | { custom: number } | { missing: number };

export type SharedSlot = {
  exercise: SharedExerciseRef;
  setCount: number;
  /** Seconds for timed exercises. */
  repMin: number;
  repMax: number;
  /** 0 means reps only. */
  increment: number;
  incrementUnit: WeightUnit;
  /** Forms a superset with the next slot. Never true on a day's last slot. */
  supersetWithNext: boolean;
  /** The exercise's own rest on the sharing phone: seconds, 0 for Off, null for none (Settings' rest). */
  restSeconds: number | null;
};

export type SharedDay = { name: string; slots: SharedSlot[] };
export type SharedRoutine = { name: string; days: SharedDay[]; customs: SharedCustomExercise[] };

export type ShareCodeError = 'not_routine' | 'newer_version' | 'cut_short';
export type DecodeResult = { ok: true; code: string; routine: SharedRoutine } | { ok: false; error: ShareCodeError };

/** What each refusal says (R470). */
export const SHARE_CODE_ERRORS: Record<ShareCodeError, string> = {
  not_routine: "That code isn't a GymHound routine.",
  newer_version: 'That code is from a newer version of GymHound. Update the app and try again.',
  cut_short: 'That code is cut short. Copy the whole code and try again.',
};

/** Raised by `encodeRoutine` for a routine outside the bounds a code can carry. */
export class RoutineNotShareable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RoutineNotShareable';
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bytes: UTF-8 and base64url, written out so they behave the same in Hermes, Node and the browser.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return bytes;
}

/** Strict UTF-8: an overlong form, a surrogate, a value past U+10FFFF or a cut sequence gives null. */
function utf8Decode(bytes: number[]): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let need: number;
    let cp: number;
    let min: number;
    if (b < 0x80) {
      out += String.fromCharCode(b);
      i++;
      continue;
    } else if (b >= 0xc2 && b <= 0xdf) [need, cp, min] = [1, b & 31, 0x80];
    else if (b >= 0xe0 && b <= 0xef) [need, cp, min] = [2, b & 15, 0x800];
    else if (b >= 0xf0 && b <= 0xf4) [need, cp, min] = [3, b & 7, 0x10000];
    else return null;
    for (let k = 1; k <= need; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 63);
    }
    if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += need + 1;
  }
  return out;
}

function base64urlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/** Unpadded base64url to bytes; null for a character outside the alphabet, an impossible length or stray low bits. */
function base64urlDecode(text: string): number[] | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = k < chunk.length ? B64_INDEX.get(chunk[k]) : 0;
      if (v === undefined) return null;
      n = (n << 6) | v;
    }
    const count = chunk.length - 1;
    // The bits past the last whole byte must be zero, so each code has one spelling.
    if (count === 1 && (n & 0xffff) !== 0) return null;
    if (count === 2 && (n & 0xff) !== 0) return null;
    for (let k = 0; k < count; k++) bytes.push((n >> (16 - 8 * k)) & 0xff);
  }
  return bytes;
}

/** 24 bits of 32-bit FNV-1a over an ASCII string, as 4 base64url characters. */
function checkOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const n = h & 0xffffff;
  return [18, 12, 6, 0].map((s) => B64[(n >> s) & 63]).join('');
}

/**
 * Any JSON value packed and signed as a version-1 code, with no checks at all: `encodeRoutine` builds the body, and
 * the tests use it to make codes whose content is wrong but whose check is right.
 */
export function signBody(body: unknown, version: number = SHARE_VERSION): string {
  const head = `GH${version}.${base64urlEncode(utf8Encode(JSON.stringify(body)))}`;
  return `${head}.${checkOf(head)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Encoding.

const LIBRARY_LIST: readonly string[] = LIBRARY_IDS;

/** Whether `id` is a library exercise a code can name by its place: every id the library has ever had. */
export function isShareableLibraryId(id: string, libraryIds: readonly string[] = LIBRARY_LIST): boolean {
  return libraryIds.includes(id);
}

/** A name as it travels: trimmed, and cut to `max` characters (counted as the phone counts them, by code point). */
function clip(name: string, max: number): string {
  return [...name.trim()].slice(0, max).join('').trim();
}

/** A number as short as JSON writes it: an increment of 2.50000001 travels as 2.5. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function tableIndex<T>(table: readonly T[], value: T, what: string): number {
  const i = table.indexOf(value);
  if (i === -1) throw new RoutineNotShareable(`${what} ${String(value)} can't be shared.`);
  return i;
}

/** The routine's usual unit: the one most of its increments are in (lb on a tie). */
function usualUnit(routine: SharedRoutine): WeightUnit {
  let kg = 0;
  let lb = 0;
  for (const day of routine.days) for (const slot of day.slots) slot.incrementUnit === 'kg' ? kg++ : lb++;
  return kg > lb ? 'kg' : 'lb';
}

/**
 * The routine as a code, `GH1.<payload>.<check>`. Names are trimmed and cut to the bounds; a routine with no days, a
 * day with no slots, more days, slots or custom exercises than a code carries, or a value out of bounds throws
 * `RoutineNotShareable`. A slot's library id must be in `libraryIds`: anything else travels as a custom exercise.
 */
export function encodeRoutine(routine: SharedRoutine, libraryIds: readonly string[] = LIBRARY_LIST): string {
  const name = clip(routine.name, MAX_ROUTINE_NAME);
  if (name === '') throw new RoutineNotShareable('The routine has no name.');
  if (routine.days.length === 0 || routine.days.length > MAX_DAYS) throw new RoutineNotShareable('Too many or no days.');
  if (routine.customs.length > MAX_CUSTOMS) throw new RoutineNotShareable('Too many exercises of your own.');
  const unit = usualUnit(routine);
  const indexOf = new Map(libraryIds.map((id, i) => [id, i]));

  const customs = routine.customs.map((c) => {
    const primary = [...new Set(c.primaryMuscles)].map((m) => tableIndex(MUSCLES_V1, m, 'Muscle'));
    const secondary = [...new Set(c.secondaryMuscles)].filter((m) => !c.primaryMuscles.includes(m)).map((m) => tableIndex(MUSCLES_V1, m, 'Muscle'));
    const customName = clip(c.name, MAX_NAME_LENGTH);
    if (customName === '' || primary.length === 0) throw new RoutineNotShareable('An exercise of your own is incomplete.');
    const row: unknown[] = [customName, tableIndex(LOGGING_TYPES_V1, c.loggingType, 'Logging type'), tableIndex(EQUIPMENT_V1, c.equipment, 'Equipment'), primary];
    if (secondary.length > 0) row.push(secondary);
    return row;
  });

  const days = routine.days.map((day) => {
    if (day.slots.length === 0 || day.slots.length > MAX_SLOTS_PER_DAY) throw new RoutineNotShareable('A day has too many or no exercises.');
    const slots = day.slots.map((slot, i) => {
      let ref: number;
      const e = slot.exercise;
      if ('library' in e) {
        const at = indexOf.get(e.library);
        if (at === undefined) throw new RoutineNotShareable(`${e.library} isn't in the library.`);
        ref = at;
      } else if ('custom' in e) {
        if (!Number.isInteger(e.custom) || e.custom < 0 || e.custom >= customs.length) throw new RoutineNotShareable('A slot names a missing exercise.');
        ref = -(e.custom + 1);
      } else {
        throw new RoutineNotShareable('A slot names a missing exercise.');
      }
      const { setCount, repMin, repMax } = slot;
      const increment = round3(slot.increment);
      const whole = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
      if (!whole(setCount, MIN_SETS, MAX_SETS) || !whole(repMin, 1, MAX_REPS) || !whole(repMax, repMin, MAX_REPS)) {
        throw new RoutineNotShareable('Sets or reps are out of bounds.');
      }
      if (!Number.isFinite(increment) || increment < 0 || increment > MAX_INCREMENT) throw new RoutineNotShareable('The increment is out of bounds.');
      if (slot.restSeconds !== null && !REST_CHOICES.includes(slot.restSeconds)) throw new RoutineNotShareable('The rest is out of bounds.');
      const link = slot.supersetWithNext && i < day.slots.length - 1 ? 1 : 0;
      const row: unknown[] = [ref, setCount, repMin, repMax, slot.incrementUnit === unit ? increment : [increment, tableIndex(UNITS_V1, slot.incrementUnit, 'Unit')]];
      if (slot.restSeconds !== null) row.push(link, slot.restSeconds);
      else if (link === 1) row.push(1);
      return row;
    });
    return [clip(day.name, MAX_DAY_NAME), ...slots];
  });

  const body: unknown[] = [name, tableIndex(UNITS_V1, unit, 'Unit'), days];
  if (customs.length > 0) body.push(customs);
  const code = signBody(body);
  if (code.length > MAX_CODE_LENGTH) throw new RoutineNotShareable('The routine is too big for a code.');
  return code;
}

// ---------------------------------------------------------------------------------------------------------------
// Decoding.

/** Thrown inside `parseBody` for anything off; caught and turned into `not_routine`. */
class Refused extends Error {}

function refuse(): never {
  throw new Refused();
}

/** True when every surrogate in `s` is half of a pair. */
function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

/** A name from a code: a string with no control characters, at most `max` code points once trimmed, and not blank unless `blankOk`. */
function text(v: unknown, max: number, blankOk: boolean): string {
  if (typeof v !== 'string' || !wellFormed(v)) refuse();
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(v)) refuse();
  const trimmed = v.trim();
  if ([...trimmed].length > max || (!blankOk && trimmed === '')) refuse();
  return trimmed;
}

function int(v: unknown, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) refuse();
  return v;
}

function list(v: unknown, lo: number, hi: number): unknown[] {
  if (!Array.isArray(v) || v.length < lo || v.length > hi) refuse();
  return v;
}

function fromTable<T>(table: readonly T[], v: unknown): T {
  return table[int(v, 0, table.length - 1)];
}

function muscles(v: unknown, lo: number): Muscle[] {
  const items = list(v, lo, MUSCLES_V1.length).map((m) => fromTable(MUSCLES_V1, m));
  if (new Set(items).size !== items.length) refuse();
  return items;
}

function parseBody(body: unknown, libraryIds: readonly string[]): SharedRoutine {
  const top = list(body, 3, 4);
  const name = text(top[0], MAX_ROUTINE_NAME, false);
  const unit = fromTable(UNITS_V1, top[1]);
  const customs: SharedCustomExercise[] = (top.length === 4 ? list(top[3], 1, MAX_CUSTOMS) : []).map((raw) => {
    const c = list(raw, 4, 5);
    const primaryMuscles = muscles(c[3], 1);
    const secondaryMuscles = c.length === 5 ? muscles(c[4], 1) : [];
    if (secondaryMuscles.some((m) => primaryMuscles.includes(m))) refuse();
    return {
      name: text(c[0], MAX_NAME_LENGTH, false),
      loggingType: fromTable(LOGGING_TYPES_V1, c[1]),
      equipment: fromTable(EQUIPMENT_V1, c[2]),
      primaryMuscles,
      secondaryMuscles,
    };
  });

  const days: SharedDay[] = list(top[2], 1, MAX_DAYS).map((rawDay) => {
    const day = list(rawDay, 2, MAX_SLOTS_PER_DAY + 1);
    const slots = day.slice(1).map((rawSlot, i, all): SharedSlot => {
      const s = list(rawSlot, 5, 7);
      const ref = int(s[0], -customs.length, 99_999);
      const exercise: SharedExerciseRef =
        ref < 0 ? { custom: -ref - 1 } : ref < libraryIds.length ? { library: libraryIds[ref] } : { missing: ref };
      const setCount = int(s[1], MIN_SETS, MAX_SETS);
      const repMin = int(s[2], 1, MAX_REPS);
      const repMax = int(s[3], repMin, MAX_REPS);
      let increment: unknown = s[4];
      let incrementUnit = unit;
      if (Array.isArray(increment)) {
        const pair = list(increment, 2, 2);
        increment = pair[0];
        incrementUnit = fromTable(UNITS_V1, pair[1]);
        // The other unit is written only when it differs.
        if (incrementUnit === unit) refuse();
      }
      if (typeof increment !== 'number' || !Number.isFinite(increment) || increment < 0 || increment > MAX_INCREMENT) refuse();
      const link = s.length >= 6 ? int(s[5], 0, 1) : 0;
      // A day's last slot never links onward, and a trailing default is never written.
      if (link === 1 && i === all.length - 1) refuse();
      if (s.length === 6 && link === 0) refuse();
      let restSeconds: number | null = null;
      if (s.length === 7) {
        const rest = int(s[6], 0, 3600);
        if (!REST_CHOICES.includes(rest)) refuse();
        restSeconds = rest;
      }
      return { exercise, setCount, repMin, repMax, increment, incrementUnit, supersetWithNext: link === 1, restSeconds };
    });
    return { name: text(day[0], MAX_DAY_NAME, true), slots };
  });

  return { name, days, customs };
}

type Found = { version: string; payload: string; check: string | undefined };

/** Every `GH<version>.<payload>[.<check>]` in the text, in order. */
function findCodes(text: string): Found[] {
  const found: Found[] = [];
  for (const m of text.matchAll(/\bGH(\d{1,3})\.([A-Za-z0-9_-]*)(?:\.([A-Za-z0-9_-]*))?/g)) {
    found.push({ version: m[1], payload: m[2], check: m[3] });
  }
  return found;
}

function decodeOne(f: Found, libraryIds: readonly string[]): DecodeResult {
  const version = Number(f.version);
  if (version > SHARE_VERSION) return { ok: false, error: 'newer_version' };
  if (version !== SHARE_VERSION) return { ok: false, error: 'not_routine' };
  // The check comes last, so a code copied short has lost it, or part of it (R469).
  if (f.check === undefined || f.check.length < 4 || f.payload === '') return { ok: false, error: 'cut_short' };
  const head = `GH${f.version}.${f.payload}`;
  // Text run on after the code ("…AbCdThanks") is not part of it.
  const check = f.check.slice(0, 4);
  if (head.length + 5 > MAX_CODE_LENGTH || checkOf(head) !== check) return { ok: false, error: 'not_routine' };
  const bytes = base64urlDecode(f.payload);
  const json = bytes === null ? null : utf8Decode(bytes);
  if (json === null) return { ok: false, error: 'not_routine' };
  try {
    return { ok: true, code: `${head}.${check}`, routine: parseBody(JSON.parse(json), libraryIds) };
  } catch {
    return { ok: false, error: 'not_routine' };
  }
}

const ERROR_RANK: Record<ShareCodeError, number> = { newer_version: 3, cut_short: 2, not_routine: 1 };

/**
 * The routine in a code, or why it can't be read. `text` can be the code alone, the link, or a whole message holding
 * either (R467): the first code in it that reads wins. When none reads, the most telling refusal comes back (newer
 * version, then cut short, then not a routine). A code a mail app broke over lines is tried again with the spaces and
 * line breaks taken out. `libraryIds` is this phone's list; a place past its end comes back as `{ missing }`.
 */
export function decodeRoutine(text: string, libraryIds: readonly string[] = LIBRARY_LIST): DecodeResult {
  const input = text.slice(0, MAX_TEXT_LENGTH);
  let best: ShareCodeError = 'not_routine';
  const tryAll = (t: string): DecodeResult | null => {
    for (const found of findCodes(t)) {
      const result = decodeOne(found, libraryIds);
      if (result.ok) return result;
      if (ERROR_RANK[result.error] > ERROR_RANK[best]) best = result.error;
    }
    return null;
  };
  const direct = tryAll(input);
  if (direct) return direct;
  const joined = input.replace(/\s+/g, '');
  if (joined !== input) {
    const rejoined = tryAll(joined);
    if (rejoined) return rejoined;
  }
  return { ok: false, error: best };
}

// ---------------------------------------------------------------------------------------------------------------
// The link and the message.

/** The app's own link (R464): `gymhound://routine/<code>`. The scheme is app.json's `scheme`. */
export function shareLink(code: string): string {
  return `gymhound://routine/${code}`;
}

/**
 * What the share sheet sends (R465): what it is, how to open it, the link, and the code on its own line for a phone
 * where the link doesn't open the app (Expo Go, or an app that won't follow custom links).
 */
export function shareMessage(routineName: string, code: string): string {
  return (
    `My ${routineName.trim()} routine on GymHound. Open this link on your phone, or paste the code in Routines → Add from code: ` +
    `${shareLink(code)}\n\nCode: ${code}`
  );
}
