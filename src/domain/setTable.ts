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
  setName,
  weightText,
  type PrevSet,
  type TickValues,
} from './setEntry';
import type { DistanceUnit, Equipment, LoggingType, SetType, WeightUnit } from './types';
import { convertWeight } from './units';

/**
 * What the session screen shows for an exercise's set table, as plain functions: the columns, the text in each
 * input, reading what was typed, and the previous result on each row. The components only draw it.
 */

/** The fields a set stores that the user types in. An AMRAP score's rounds are `reps`, its extra reps `extraReps`. */
export type FieldKey = 'weight' | 'reps' | 'durationS' | 'distance' | 'extraReps';
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
  // R607, for programs: a carry's load and distance, then its time, which is optional; an AMRAP score's rounds and
  // extra reps; a For Time score's time.
  weighted_distance: ['weight', 'distance', 'durationS'],
  rounds: ['reps', 'extraReps'],
  for_time: ['durationS'],
};

/** Types whose weight is a load that today's target applies to. */
export const HAS_LOAD: LoggingType[] = ['weighted', 'bodyweight_plus', 'assisted', 'weighted_time', 'weighted_distance'];

function loadHeader(loggingType: LoggingType, unit: WeightUnit): string {
  const label = unit.toUpperCase();
  if (loggingType === 'bodyweight_plus') return `+${label}`;
  if (loggingType === 'assisted') return `${MINUS}${label}`;
  return label;
}

function fieldHeader(key: FieldKey, loggingType: LoggingType, unit: WeightUnit, carryUnit: DistanceUnit | undefined): string {
  switch (key) {
    case 'weight':
      return loadHeader(loggingType, unit);
    case 'reps':
      return loggingType === 'rounds' ? 'ROUNDS' : 'REPS';
    case 'extraReps':
      return '+REPS';
    case 'durationS':
      return 'TIME';
    case 'distance':
      // A carry's distance is in its own unit (ft or yd, R607), so the header names it, as LB names the load.
      return loggingType === 'weighted_distance' && carryUnit !== undefined ? carryUnit.toUpperCase() : 'DIST';
  }
}

/**
 * The columns of a set table, left to right: SET, PREVIOUS, the inputs for the logging type, RPE when the exercise
 * shows it, and the tick. The header row and every set row are drawn from this one list, so they cannot misalign.
 * `carryUnit` is the unit a carry's distance is entered in, which heads its column ("FT"); without it, "DIST".
 */
export function tableColumns(loggingType: LoggingType, unit: WeightUnit, showRpe: boolean, carryUnit?: DistanceUnit): Column[] {
  return [
    { key: 'set', header: 'SET' },
    { key: 'previous', header: 'PREVIOUS' },
    ...FIELDS[loggingType].map((key): Column => ({ key, header: fieldHeader(key, loggingType, unit, carryUnit) })),
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
  extraReps: parseReps,
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
  extraReps: number | null;
}>;

export function fieldPatch(key: InputKey, value: number | null, unit: WeightUnit, distanceUnit: DistanceUnit): FieldPatch {
  switch (key) {
    case 'weight':
      return { weight: value, weightUnit: value === null ? null : unit };
    case 'distance':
      return { distance: value, distanceUnit: value === null ? null : distanceUnit };
    case 'reps':
      return { reps: value };
    case 'extraReps':
      return { extraReps: value };
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
  /**
   * The distance unit of the program slot, for `weighted_distance` (R607: ft or yd, else m; `slotDistanceUnit`).
   * Optional: without it a carry is entered in last time's unit, else m.
   */
  slotDistanceUnit?: DistanceUnit | null;
};

export type RowModel = {
  set: SetInput;
  loggingType: LoggingType;
  /**
   * The unit a distance is entered in on this row when it is not the distance unit in Settings: a carry's (R607,
   * `entryDistanceUnit`). Absent for the other types, which enter in the unit in Settings.
   */
  distanceUnit?: DistanceUnit;
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
  /** The same set from last time (`matchPrevious`), or null: a block may say it its own way (`blockRows`). */
  matched: PrevSet | null;
  /** What VoiceOver reads for `previous` when the short text would not say it all (an event's time, its units). */
  previousLabel?: string;
  /** What VoiceOver calls the set when it is not "Set 1": a metcon's "Score", a run's "Run" (Task 7b). */
  spokenAs?: string;
  /** The inputs that may stay empty: drawn with a faint dash and read as optional (an event's time). */
  optional?: InputKey[];
  /** The tick's VoiceOver label when "Set 1 done" is not what it means ("Set 1 carried drop-free"). */
  tickLabel?: string;
};

/** A number to 2 decimals, as the set rows show it: 254.60000000000002 is 254.6. */
export const round2 = (n: number) => Number(n.toFixed(2));

/**
 * Today's target weight, in the entry unit (`TickInput.target` must be). The override wins over the planned weight.
 * One in the other unit (the display unit was switched mid-workout) converts as a workout start does (spec 7.1,
 * `planInUnit`): a barbell to the nearest weight `gear` loads, anything else to the nearest 0.5. Today's weight sheet
 * starts from it too (R71), so it shows what the set rows show.
 */
export function targetFor(ex: ExerciseInput, unit: WeightUnit, gear: Gear): number | null {
  if (!HAS_LOAD.includes(ex.loggingType)) return null;
  const overridden = ex.overrideWeight !== null;
  const weight = overridden ? ex.overrideWeight : ex.plannedWeight;
  if (weight === null) return null;
  const from = (overridden ? ex.overrideUnit : ex.plannedUnit) ?? unit;
  return planInUnit(weight, from, unit, ex.equipment === 'barbell', gear.bar, gear.plates);
}

/** A program slot's distance unit (R607): ft for a slot counted in feet, yd in yards, else m. */
export function slotDistanceUnit(targetUnit: string): DistanceUnit {
  if (targetUnit === 'feet') return 'ft';
  if (targetUnit === 'yards') return 'yd';
  return 'm';
}

/**
 * The unit an exercise's distances are entered in. A carry (`weighted_distance`) is in its slot's unit, else last
 * time's, else m: ft and yd are for sets only, and the Settings distance unit stays mi or km (R607). Every other type
 * enters in `settingsUnit`, the distance unit in Settings.
 */
export function entryDistanceUnit(
  ex: Pick<ExerciseInput, 'loggingType' | 'previous' | 'slotDistanceUnit'>,
  settingsUnit?: DistanceUnit,
): DistanceUnit | undefined {
  if (ex.loggingType !== 'weighted_distance') return settingsUnit;
  return ex.slotDistanceUnit ?? ex.previous.find((p) => p.distanceUnit !== null)?.distanceUnit ?? 'm';
}

/**
 * One row per set. Each row's previous is the same set from last time: the previous set with the same type and the
 * same number within that type (`matchPrevious`, computed once here), so a warmup is never the previous result for a
 * working set. Only working sets start from today's target (spec 8.4); a warmup starts from its own previous.
 * A set with no previous takes today's own values from the nearest set above of its type (`carryAbove`, spec 18.6) as
 * placeholders, except a carried weight under a target: the target wins. The Previous column never shows a carry.
 * What a row shows is what its tick records, so a set with a value above it ticks in one tap (R48).
 * `gear` is the bar and plates in Settings for `unit`, which a barbell target in the other unit rounds to.
 * `distanceUnit` is the distance unit in Settings, which a previous or carried distance in another unit converts to; a
 * carry's rows enter in its own unit instead (`entryDistanceUnit`), which each row then carries.
 */
export function buildRows(ex: ExerciseInput, unit: WeightUnit, gear: Gear, distanceUnit?: DistanceUnit): RowModel[] {
  const matched = matchPrevious(ex.sets, ex.previous);
  const labels = setLabels(ex.sets.map((s) => s.setType));
  const target = targetFor(ex, unit, gear);
  const entryUnit = entryDistanceUnit(ex, distanceUnit);
  const ownUnit = ex.loggingType === 'weighted_distance' && entryUnit !== undefined ? { distanceUnit: entryUnit } : {};
  return ex.sets.map((set, i) => {
    const rowTarget = set.setType === 'working' ? target : null;
    const carried = matched[i] === null ? carryAbove(ex.sets, i) : null;
    return {
      set,
      loggingType: ex.loggingType,
      ...ownUnit,
      label: labels[i],
      previous: formatPrevious(matched[i], ex.loggingType, unit),
      target: rowTarget,
      matched: matched[i],
      placeholders: placeholdersFor({
        previous: matched[i],
        ruleRepMax: ex.rule?.repMax ?? null,
        loggingType: ex.loggingType,
        unit,
        distanceUnit: entryUnit,
        carried: carried !== null && rowTarget !== null ? { ...carried, weight: null } : carried,
      }),
    };
  });
}

const numberText = (n: number) => String(round2(n));

/** A time as typed: "40" under a minute, "1:30" from a minute up. Both read back through `parseDuration`. */
const durationText = (seconds: number) => (seconds < 60 ? String(seconds) : formatRest(seconds));

/**
 * A distance with its unit only when that differs from the display distance unit, as `weightText` does a weight:
 * "5" or "5 km".
 */
function distanceText(distance: number, unit: DistanceUnit, displayUnit: DistanceUnit): string {
  return unit === displayUnit ? numberText(distance) : `${numberText(distance)} ${unit}`;
}

/**
 * The stored value of a field, as it was logged: a weight is in its own unit (`set.weightUnit`) and a distance in its
 * own (`set.distanceUnit`), either of which may not be the display unit.
 */
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
    case 'extraReps':
      return set.extraReps ?? null;
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
 * logged, done or not, with its unit when that is not the display unit ("135 lb" while in kg, spec 7.1), and a stored
 * distance likewise ("5 km" while in mi). Either reads as invalid if edited in part, so the field selects it all on
 * focus and what is typed replaces it, in the display unit. An open row's load falls back to today's target; a done
 * row never does, so it cannot show a weight that was not saved. `unit` and `distanceUnit` are the display units in
 * Settings.
 */
export function valueText(row: RowModel, key: InputKey, unit: WeightUnit, distanceUnit: DistanceUnit): string {
  const { set } = row;
  if (key === 'weight') {
    if (set.weight !== null) return weightText(set.weight, set.weightUnit ?? unit, unit);
    return row.target !== null && isTargetValue(row, key) ? numberText(row.target) : '';
  }
  const value = storedValue(set, key);
  if (value === null) return '';
  if (key === 'distance') return distanceText(value, set.distanceUnit ?? distanceUnit, distanceUnit);
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
    case 'extraReps':
      return placeholders.extraReps === null || placeholders.extraReps === undefined ? '' : String(placeholders.extraReps);
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
   * (weight only) or the placeholder; null when every needed field has one. Bodyweight plus needs only reps; a carry
   * its weight and distance (the time is optional); an AMRAP score its rounds (the extra reps are optional).
   */
  missing: FieldKey | null;
};

const ORDER: InputKey[] = ['weight', 'reps', 'extraReps', 'durationS', 'distance', 'rpe'];

/**
 * The fields a tick needs a value for: the type's fields, except bodyweight plus, where no load means none added, and
 * the optional fields of the program types (R607): a carry's time and an AMRAP score's extra reps.
 */
function neededFields(loggingType: LoggingType): FieldKey[] {
  switch (loggingType) {
    case 'bodyweight_plus':
    case 'rounds':
      return ['reps'];
    case 'weighted_distance':
      return ['weight', 'distance'];
    default:
      return FIELDS[loggingType];
  }
}

/** The line above a row's inputs once its tick was tapped before it was ready (spec 18.6, R82): in the type's words. */
export function needLine(key: FieldKey, loggingType: LoggingType): string {
  switch (key) {
    case 'weight':
      return 'Add weight to complete set';
    case 'reps':
      return loggingType === 'rounds' ? 'Add rounds to complete set' : 'Add reps to complete set';
    case 'extraReps':
      return 'Add reps to complete set';
    case 'durationS':
      return 'Add time to complete set';
    case 'distance':
      return 'Add distance to complete set';
  }
}

const WEIGHT_WORDS: Record<WeightUnit, string> = { lb: 'pounds', kg: 'kilograms' };
const DISTANCE_WORDS: Record<DistanceUnit, string> = { m: 'metres', km: 'kilometres', mi: 'miles', ft: 'feet', yd: 'yards' };
const PROGRAM_TYPES: readonly LoggingType[] = ['weighted_distance', 'rounds', 'for_time'];

/**
 * What VoiceOver calls a set's input. The program types (R607) name the set first, then the field and its unit in
 * words: "Set 1 distance, feet", "Set 1 weight, pounds", "Set 1 rounds", "Set 1 extra reps", "Warmup time". The other
 * types keep the header and the set they have always had: "LB, set 1". `label` is the set's label ("1", "W"),
 * `header` the column's, `unit` the weight unit and `distanceUnit` the unit the row's distance is entered in.
 */
export function fieldVoiceLabel(
  key: InputKey,
  loggingType: LoggingType,
  label: string,
  header: string,
  unit: WeightUnit,
  distanceUnit: DistanceUnit,
): string {
  if (!PROGRAM_TYPES.includes(loggingType)) return `${header}, set ${label}`;
  const set = setName(label);
  switch (key) {
    case 'weight':
      return `${set} weight, ${WEIGHT_WORDS[unit]}`;
    case 'distance':
      return `${set} distance, ${DISTANCE_WORDS[distanceUnit]}`;
    case 'reps':
      return loggingType === 'rounds' ? `${set} rounds` : `${set} reps`;
    case 'extraReps':
      return `${set} extra reps`;
    case 'durationS':
      return `${set} time`;
    case 'rpe':
      return `${set} RPE`;
  }
}

/**
 * What VoiceOver calls a row's input: `fieldVoiceLabel`, unless a block names the row ("Score rounds", "Run time"), and
 * with ", optional" after a field that may stay empty ("Set 1 time, optional").
 */
export function rowFieldVoiceLabel(row: RowModel, key: InputKey, header: string, unit: WeightUnit, distanceUnit: DistanceUnit): string {
  const optional = row.optional?.includes(key) ? ', optional' : '';
  if (row.spokenAs === undefined) return `${fieldVoiceLabel(key, row.loggingType, row.label, header, unit, distanceUnit)}${optional}`;
  const field = fieldVoiceLabel(key, 'rounds', '1', header, unit, distanceUnit).replace(/^Set 1 /, '');
  return `${row.spokenAs} ${key === 'reps' && row.loggingType !== 'rounds' ? 'reps' : field}${optional}`;
}

/** What VoiceOver calls a row's tick: "Set 1 done", or the block's own words ("Score done", "Set 1 carried drop-free"). */
export function rowTickLabel(row: RowModel): string {
  if (row.tickLabel !== undefined) return row.tickLabel;
  return row.spokenAs === undefined ? `Set ${row.label} done` : `${row.spokenAs} done`;
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
  const entered: TickValues = {
    weight: values.weight,
    reps: values.reps,
    durationS: values.durationS,
    distance: values.distance,
    // Only an AMRAP score has extra reps.
    ...(row.loggingType === 'rounds' ? { extraReps: values.extraReps } : {}),
  };
  const resolved = resolveTick({ loggingType: row.loggingType, entered, target: row.target, placeholders: row.placeholders });
  const weightUnit = drafts.weight === undefined ? (row.set.weightUnit ?? unit) : unit;
  const enteredDistanceUnit = drafts.distance === undefined ? (row.set.distanceUnit ?? distanceUnit) : distanceUnit;
  const filled: TickValues = {
    weight: entered.weight ?? row.target ?? row.placeholders.weight,
    reps: entered.reps ?? row.placeholders.reps,
    durationS: entered.durationS ?? row.placeholders.durationS,
    distance: entered.distance ?? row.placeholders.distance,
    extraReps: entered.extraReps ?? row.placeholders.extraReps ?? null,
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

/** The heaviest weight an exercise has logged, in the unit it was logged in (`WorkoutExerciseView.bestWeight`). */
export type BestWeight = { value: number; unit: WeightUnit };

/** R422: a weight above this, in its unit, is unlikely whatever the history. */
const UNLIKELY_WEIGHT: Record<WeightUnit, number> = { lb: 1000, kg: 450 };
/** R422: a jump past 1.5 times the best must also be at least this much heavier, so a light lift's normal step is not flagged. */
const UNLIKELY_JUMP: Record<WeightUnit, number> = { lb: 20, kg: 10 };
const UNLIKELY_RATIO = 1.5;
/** R422: more reps than this in one set is unlikely. */
const UNLIKELY_REPS = 100;

/**
 * Whether a value left in a set field is unlikely enough to ask for a second look (R422): a weight above 1,000 lb or
 * 450 kg, or one more than 1.5 times the exercise's best and at least 20 lb or 10 kg heavier than it; or more than 100
 * reps. `value` is in `unit` (the display unit, as typed). A warmup is never flagged, nor a time, a distance or RPE.
 * It only adds the "Check this number" line: the tick still logs what the row shows (R48).
 */
export function looksUnlikely(
  key: InputKey,
  value: number | null,
  setType: SetType,
  unit: WeightUnit,
  best: BestWeight | null | undefined,
): boolean {
  if (value === null || setType === 'warmup') return false;
  if (key === 'reps') return value > UNLIKELY_REPS;
  if (key !== 'weight') return false;
  if (value > UNLIKELY_WEIGHT[unit]) return true;
  if (!best || best.value <= 0) return false;
  const bestInUnit = convertWeight(best.value, best.unit, unit);
  return value > UNLIKELY_RATIO * bestInUnit && value - bestInUnit >= UNLIKELY_JUMP[unit];
}
