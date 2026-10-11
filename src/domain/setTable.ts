import { formatRest } from './dates';
import { parseDecimal, parseDuration, parseReps, parseRpe } from './input';
import { planInUnit, type Gear } from './plates';
import {
  carryAbove,
  formatDuration,
  formatPrevious,
  matchPrevious,
  placeholdersFor,
  resolveTick,
  setLabels,
  weightText,
  type PrevSet,
  type TickValues,
} from './setEntry';
import type { DistanceUnit, Equipment, LoggingType, WeightUnit } from './types';

/**
 * What the session screen shows for an exercise's set table, as plain functions: the columns, the text in each
 * input, reading what was typed, and the previous result on each row. The components only draw it.
 */

/** The fields a set stores that the user types in. */
export type FieldKey = 'weight' | 'reps' | 'durationS' | 'distance';
/** Every input a row can have: the fields, plus RPE. */
export type InputKey = FieldKey | 'rpe';
export type ColumnKey = 'set' | 'previous' | InputKey | 'tick';
export type Column = { key: ColumnKey; header: string };

const MINUS = '−';

const FIELDS: Record<LoggingType, FieldKey[]> = {
  weighted: ['weight', 'reps'],
  bodyweight_plus: ['weight', 'reps'],
  assisted: ['weight', 'reps'],
  weighted_time: ['weight', 'durationS'],
  timed: ['durationS'],
  distance_time: ['distance', 'durationS'],
};

/** Types whose weight is a load that today's target applies to. */
const HAS_LOAD: LoggingType[] = ['weighted', 'bodyweight_plus', 'assisted', 'weighted_time'];

function loadHeader(loggingType: LoggingType, unit: WeightUnit): string {
  const label = unit.toUpperCase();
  if (loggingType === 'bodyweight_plus') return `+${label}`;
  if (loggingType === 'assisted') return `${MINUS}${label}`;
  return label;
}

function fieldHeader(key: FieldKey, loggingType: LoggingType, unit: WeightUnit): string {
  switch (key) {
    case 'weight':
      return loadHeader(loggingType, unit);
    case 'reps':
      return 'REPS';
    case 'durationS':
      return 'TIME';
    case 'distance':
      return 'DIST';
  }
}

/**
 * The columns of a set table, left to right: SET, PREVIOUS, the inputs for the logging type, RPE when the exercise
 * shows it, and the tick. The header row and every set row are drawn from this one list, so they cannot misalign.
 */
export function tableColumns(loggingType: LoggingType, unit: WeightUnit, showRpe: boolean): Column[] {
  return [
    { key: 'set', header: 'SET' },
    { key: 'previous', header: 'PREVIOUS' },
    ...FIELDS[loggingType].map((key): Column => ({ key, header: fieldHeader(key, loggingType, unit) })),
    ...(showRpe ? [{ key: 'rpe', header: 'RPE' } as const] : []),
    { key: 'tick', header: '✓' },
  ];
}

/** Typed text read as a number. Blank is "no value" (valid, null); only non-blank text that does not parse is invalid. */
export type Parsed = { valid: true; value: number | null } | { valid: false; value: null };

const PARSERS: Record<InputKey, (text: string) => number | null> = {
  weight: parseDecimal,
  distance: parseDecimal,
  reps: parseReps,
  durationS: parseDuration,
  rpe: parseRpe,
};

/** The parsers return null for blank and for bad text alike, so blank is settled here first. */
export function parseField(key: InputKey, text: string): Parsed {
  if (text.trim() === '') return { valid: true, value: null };
  const value = PARSERS[key](text);
  return value === null ? { valid: false, value: null } : { valid: true, value };
}

/** What `updateSet` takes for one field. A weight or a distance is stored with the unit it was entered in, and cleared with it. */
export type FieldPatch = Partial<{
  weight: number | null;
  weightUnit: WeightUnit | null;
  reps: number | null;
  rpe: number | null;
  durationS: number | null;
  distance: number | null;
  distanceUnit: DistanceUnit | null;
}>;

export function fieldPatch(key: InputKey, value: number | null, unit: WeightUnit, distanceUnit: DistanceUnit): FieldPatch {
  switch (key) {
    case 'weight':
      return { weight: value, weightUnit: value === null ? null : unit };
    case 'distance':
      return { distance: value, distanceUnit: value === null ? null : distanceUnit };
    case 'reps':
      return { reps: value };
    case 'durationS':
      return { durationS: value };
    case 'rpe':
      return { rpe: value };
  }
}

// ---- rows ----

/** A set as the session view holds it (the same shape as `SetView`). */
export type SetInput = PrevSet & { id: string; rpe: number | null; done: boolean };

/** The parts of a workout exercise the set table reads (`WorkoutExerciseView` fits). */
export type ExerciseInput = {
  loggingType: LoggingType;
  equipment: Equipment;
  rule: { repMax: number } | null;
  plannedWeight: number | null;
  plannedUnit: WeightUnit | null;
  overrideWeight: number | null;
  overrideUnit: WeightUnit | null;
  sets: SetInput[];
  previous: PrevSet[];
};

export type RowModel = {
  set: SetInput;
  loggingType: LoggingType;
  /** "1", "2", "3" for working sets; W, D or F for the others. */
  label: string;
  /** The same set from last time, as text. Empty when there is none. */
  previous: string;
  /** Today's target weight in the entry unit, for a working set of a type with a load. */
  target: number | null;
  /**
   * The greyed-out values, in the entry units (a weight in the other unit rounds to the nearest 0.5, a distance in
   * another unit to 2 decimals): last time's set, else today's own values from the set above (spec 18.6), with the rule
   * filling the reps or time.
   */
  placeholders: ReturnType<typeof placeholdersFor>;
};

const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Today's target weight, in the entry unit (`TickInput.target` must be). The override wins over the planned weight.
 * One in the other unit (the display unit was switched mid-workout) converts as a workout start does (spec 7.1,
 * `planInUnit`): a barbell to the nearest weight `gear` loads, anything else to the nearest 0.5.
 */
function targetFor(ex: ExerciseInput, unit: WeightUnit, gear: Gear): number | null {
  if (!HAS_LOAD.includes(ex.loggingType)) return null;
  const overridden = ex.overrideWeight !== null;
  const weight = overridden ? ex.overrideWeight : ex.plannedWeight;
  if (weight === null) return null;
  const from = (overridden ? ex.overrideUnit : ex.plannedUnit) ?? unit;
  return planInUnit(weight, from, unit, ex.equipment === 'barbell', gear.bar, gear.plates);
}

/**
 * One row per set. Each row's previous is the same set from last time: the previous set with the same type and the
 * same number within that type (`matchPrevious`, computed once here), so a warmup is never the previous result for a
 * working set. Only working sets start from today's target (spec 8.4); a warmup starts from its own previous.
 * A set with no previous takes today's own values from the nearest set above of its type (`carryAbove`, spec 18.6) as
 * placeholders, except a carried weight under a target: the target wins. The Previous column never shows a carry.
 * What a row shows is what its tick records, so a set with a value above it ticks in one tap (R48).
 * `gear` is the bar and plates in Settings for `unit`, which a barbell target in the other unit rounds to.
 * `distanceUnit` is the distance unit in Settings, which a previous or carried distance in another unit converts to.
 */
export function buildRows(ex: ExerciseInput, unit: WeightUnit, gear: Gear, distanceUnit?: DistanceUnit): RowModel[] {
  const matched = matchPrevious(ex.sets, ex.previous);
  const labels = setLabels(ex.sets.map((s) => s.setType));
  const target = targetFor(ex, unit, gear);
  return ex.sets.map((set, i) => {
    const rowTarget = set.setType === 'working' ? target : null;
    const carried = matched[i] === null ? carryAbove(ex.sets, i) : null;
    return {
      set,
      loggingType: ex.loggingType,
      label: labels[i],
      previous: formatPrevious(matched[i], ex.loggingType, unit),
      target: rowTarget,
      placeholders: placeholdersFor({
        previous: matched[i],
        ruleRepMax: ex.rule?.repMax ?? null,
        loggingType: ex.loggingType,
        unit,
        distanceUnit,
        carried: carried !== null && rowTarget !== null ? { ...carried, weight: null } : carried,
      }),
    };
  });
}

const numberText = (n: number) => String(round2(n));

/** A time as typed: "40" under a minute, "1:30" from a minute up. Both read back through `parseDuration`. */
const durationText = (seconds: number) => (seconds < 60 ? String(seconds) : formatRest(seconds));

/** The stored value of a field, as it was logged: a weight is in its own unit (`set.weightUnit`), which may not be the display unit. */
function storedValue(set: SetInput, key: InputKey): number | null {
  switch (key) {
    case 'weight':
      return set.weight;
    case 'reps':
      return set.reps;
    case 'durationS':
      return set.durationS;
    case 'distance':
      return set.distance;
    case 'rpe':
      return set.rpe;
  }
}

/**
 * Whether an input shows today's target rather than a value: the load of an open row with a target and no stored
 * weight. It is a suggestion until it is typed over or ticked (spec 18.6).
 */
export function isTargetValue(row: RowModel, key: InputKey): boolean {
  return key === 'weight' && row.set.weight === null && !row.set.done && row.target !== null;
}

/**
 * What an input holds when nothing is being typed: the stored value, else empty. A stored weight shows as it was
 * logged, done or not, with its unit when that is not the display unit ("135 lb" while in kg, spec 7.1). An open row's
 * load falls back to today's target; a done row never does, so it cannot show a weight that was not saved.
 */
export function valueText(row: RowModel, key: InputKey, unit: WeightUnit): string {
  const { set } = row;
  if (key === 'weight') {
    if (set.weight !== null) return weightText(set.weight, set.weightUnit ?? unit, unit);
    return row.target !== null && isTargetValue(row, key) ? numberText(row.target) : '';
  }
  const value = storedValue(set, key);
  if (value === null) return '';
  return key === 'durationS' ? durationText(value) : numberText(value);
}

/**
 * The greyed-out hint for an input: "135", "8", "40s" or "1:30". Empty when there is none. RPE has none. A row with
 * a target hints it over last time's weight (R49): a cleared weight shows what its tick logs. A ticked row too (B2):
 * clearing its weight takes the tick off, and the open row then shows the target.
 */
export function hintText(row: RowModel, key: InputKey): string {
  const { placeholders } = row;
  switch (key) {
    case 'weight':
      if (row.target !== null) return numberText(row.target);
      return placeholders.weight === null ? '' : numberText(placeholders.weight);
    case 'reps':
      return placeholders.reps === null ? '' : String(placeholders.reps);
    case 'durationS':
      return placeholders.durationS === null ? '' : formatDuration(placeholders.durationS);
    case 'distance':
      return placeholders.distance === null ? '' : numberText(placeholders.distance);
    case 'rpe':
      return '';
  }
}

/** What has been typed into a row's inputs and not yet saved, by input. An input with no entry shows its stored value. */
export type Drafts = Partial<Record<InputKey, string>>;

/** How an input is drawn: a value typed or saved, a suggestion (a target or a placeholder), or nothing (spec 18.6). */
export type FieldLook = 'entered' | 'suggested' | 'empty';

/** With a draft: non-blank (after trim) is 'entered', invalid text included; blank is 'suggested' when hintText(row, key) !== '', else 'empty'.
 *  Without one: a stored value is 'entered'; isTargetValue or a non-empty hintText is 'suggested'; else 'empty'. */
export function fieldLook(row: RowModel, key: InputKey, draft: string | undefined): FieldLook {
  if (draft !== undefined) {
    if (draft.trim() !== '') return 'entered';
    return hintText(row, key) !== '' ? 'suggested' : 'empty';
  }
  if (storedValue(row.set, key) !== null) return 'entered';
  return isTargetValue(row, key) || hintText(row, key) !== '' ? 'suggested' : 'empty';
}

export type RowReading = {
  /** What was typed or stored, before the target and placeholders fill in: null for a field with no value. */
  entered: TickValues;
  /**
   * The unit `entered.weight` is in: the display unit for a typed weight (or none), else the unit the stored weight
   * was logged in. A tick keeps it, so a weight logged before a unit switch is never re-saved converted (spec 7.1).
   */
  weightUnit: WeightUnit;
  /**
   * The unit `entered.distance` is in, as for the weight: the display distance unit for a typed distance (or none),
   * else the unit the stored distance was logged in. A tick keeps it, so a distance logged before a unit switch is
   * recorded as it shows.
   */
  distanceUnit: DistanceUnit;
  rpe: number | null;
  /** The inputs whose non-blank text does not parse. */
  invalid: InputKey[];
  /**
   * Whether a tick would record something: nothing invalid and every field the type needs has a value. A tick that
   * is not ready still takes a tap: it records nothing and says why (spec 18.6).
   */
  tickable: boolean;
  /**
   * The first field (in column order) the logging type needs that has no value from what was entered, the target
   * (weight only) or the placeholder; null when every needed field has one. Bodyweight plus needs only reps.
   */
  missing: FieldKey | null;
};

const ORDER: InputKey[] = ['weight', 'reps', 'durationS', 'distance', 'rpe'];

/** The fields a tick needs a value for: the type's fields, except bodyweight plus, where no load means none added. */
function neededFields(loggingType: LoggingType): FieldKey[] {
  return loggingType === 'bodyweight_plus' ? ['reps'] : FIELDS[loggingType];
}

/**
 * The row as it stands: the stored values overlaid with what is being typed. Typed text counts before it is saved.
 * `unit` and `distanceUnit` are the display units in Settings, which a typed weight or distance is in.
 */
export function readRow(row: RowModel, drafts: Drafts, unit: WeightUnit, distanceUnit: DistanceUnit): RowReading {
  const values = {} as Record<InputKey, number | null>;
  const invalid: InputKey[] = [];
  for (const key of ORDER) {
    const draft = drafts[key];
    if (draft === undefined) {
      values[key] = storedValue(row.set, key);
      continue;
    }
    const parsed = parseField(key, draft);
    if (!parsed.valid) invalid.push(key);
    values[key] = parsed.value;
  }
  const entered: TickValues = { weight: values.weight, reps: values.reps, durationS: values.durationS, distance: values.distance };
  const resolved = resolveTick({ loggingType: row.loggingType, entered, target: row.target, placeholders: row.placeholders });
  const weightUnit = drafts.weight === undefined ? (row.set.weightUnit ?? unit) : unit;
  const enteredDistanceUnit = drafts.distance === undefined ? (row.set.distanceUnit ?? distanceUnit) : distanceUnit;
  const filled: TickValues = {
    weight: entered.weight ?? row.target ?? row.placeholders.weight,
    reps: entered.reps ?? row.placeholders.reps,
    durationS: entered.durationS ?? row.placeholders.durationS,
    distance: entered.distance ?? row.placeholders.distance,
  };
  const missing = neededFields(row.loggingType).find((key) => filled[key] === null) ?? null;
  return {
    entered,
    weightUnit,
    distanceUnit: enteredDistanceUnit,
    rpe: values.rpe,
    invalid,
    tickable: invalid.length === 0 && resolved !== null,
    missing,
  };
}

/**
 * Whether stored values hold everything the logging type needs, with no target or placeholder to lean on. A ticked
 * set must: clearing a field it needs takes the tick off, so a ticked set never reads as a value nobody saved.
 */
export function isComplete(loggingType: LoggingType, values: TickValues): boolean {
  const none = { weight: null, reps: null, durationS: null, distance: null };
  return resolveTick({ loggingType, entered: values, target: null, placeholders: none }) !== null;
}
