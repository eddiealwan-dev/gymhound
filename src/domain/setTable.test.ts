import { resolveTick, type PrevSet } from './setEntry';
import {
  buildRows,
  entryDistanceUnit,
  fieldLook,
  fieldPatch,
  fieldVoiceLabel,
  hintText,
  isComplete,
  isTargetValue,
  looksUnlikely,
  needLine,
  parseField,
  readRow,
  slotDistanceUnit,
  tableColumns,
  valueText,
  type ExerciseInput,
  type InputKey,
  type SetInput,
} from './setTable';
import type { DistanceUnit, LoggingType, SetType } from './types';

const keys = (loggingType: LoggingType, unit: 'lb' | 'kg' = 'lb', showRpe = false) =>
  tableColumns(loggingType, unit, showRpe).map((c) => c.key);
const headers = (loggingType: LoggingType, unit: 'lb' | 'kg' = 'lb', showRpe = false) =>
  tableColumns(loggingType, unit, showRpe).map((c) => c.header);

describe('tableColumns (brief Step 2)', () => {
  it('weighted: load in the unit, then reps', () => {
    expect(keys('weighted')).toEqual(['set', 'previous', 'weight', 'reps', 'tick']);
    expect(headers('weighted', 'lb')).toEqual(['SET', 'PREVIOUS', 'LB', 'REPS', '✓']);
    expect(headers('weighted', 'kg')).toEqual(['SET', 'PREVIOUS', 'KG', 'REPS', '✓']);
  });

  it('bodyweight plus: +LB or +KG, then reps', () => {
    expect(headers('bodyweight_plus', 'lb')).toEqual(['SET', 'PREVIOUS', '+LB', 'REPS', '✓']);
    expect(headers('bodyweight_plus', 'kg')).toEqual(['SET', 'PREVIOUS', '+KG', 'REPS', '✓']);
    expect(keys('bodyweight_plus')).toEqual(['set', 'previous', 'weight', 'reps', 'tick']);
  });

  it('assisted: a true minus sign (U+2212) before the unit, then reps', () => {
    expect(headers('assisted', 'lb')).toEqual(['SET', 'PREVIOUS', '−LB', 'REPS', '✓']);
    expect(headers('assisted', 'kg')).toEqual(['SET', 'PREVIOUS', '−KG', 'REPS', '✓']);
  });

  it('weighted time: load, then time, no reps', () => {
    expect(keys('weighted_time')).toEqual(['set', 'previous', 'weight', 'durationS', 'tick']);
    expect(headers('weighted_time', 'kg')).toEqual(['SET', 'PREVIOUS', 'KG', 'TIME', '✓']);
  });

  it('timed: time only', () => {
    expect(keys('timed')).toEqual(['set', 'previous', 'durationS', 'tick']);
    expect(headers('timed')).toEqual(['SET', 'PREVIOUS', 'TIME', '✓']);
  });

  it('distance and time: DIST, then TIME', () => {
    expect(keys('distance_time')).toEqual(['set', 'previous', 'distance', 'durationS', 'tick']);
    expect(headers('distance_time')).toEqual(['SET', 'PREVIOUS', 'DIST', 'TIME', '✓']);
  });

  it('adds RPE after the inputs and before the tick only when it is shown', () => {
    expect(keys('weighted', 'lb', true)).toEqual(['set', 'previous', 'weight', 'reps', 'rpe', 'tick']);
    expect(headers('timed', 'lb', true)).toEqual(['SET', 'PREVIOUS', 'TIME', 'RPE', '✓']);
    expect(keys('weighted', 'lb', false)).not.toContain('rpe');
  });
});

describe('parseField (Review Focus 2: blank is no value, never an error)', () => {
  const ALL: InputKey[] = ['weight', 'reps', 'durationS', 'distance', 'rpe'];

  it.each(ALL)('%s: blank text is no value and is valid', (key) => {
    expect(parseField(key, '')).toEqual({ valid: true, value: null });
    expect(parseField(key, '   ')).toEqual({ valid: true, value: null });
  });

  it('weight and distance read a decimal, with a comma as the point', () => {
    expect(parseField('weight', '135')).toEqual({ valid: true, value: 135 });
    expect(parseField('weight', '82,5')).toEqual({ valid: true, value: 82.5 });
    expect(parseField('distance', '2,5')).toEqual({ valid: true, value: 2.5 });
    expect(parseField('weight', '0')).toEqual({ valid: true, value: 0 });
  });

  it.each(['abc', '-5', '1.2.3', '1e3', '8.'])('weight rejects non-blank text %j', (text) => {
    expect(parseField('weight', text)).toEqual({ valid: false, value: null });
  });

  it('reps are whole numbers', () => {
    expect(parseField('reps', '8')).toEqual({ valid: true, value: 8 });
    expect(parseField('reps', '8.5')).toEqual({ valid: false, value: null });
    expect(parseField('reps', 'x')).toEqual({ valid: false, value: null });
  });

  it('time reads seconds or m:ss', () => {
    expect(parseField('durationS', '90')).toEqual({ valid: true, value: 90 });
    expect(parseField('durationS', '1:30')).toEqual({ valid: true, value: 90 });
    expect(parseField('durationS', '1:75')).toEqual({ valid: false, value: null });
    expect(parseField('durationS', '40s')).toEqual({ valid: false, value: null });
  });

  it('RPE is 6 to 10 in halves', () => {
    expect(parseField('rpe', '8.5')).toEqual({ valid: true, value: 8.5 });
    expect(parseField('rpe', '10')).toEqual({ valid: true, value: 10 });
    expect(parseField('rpe', '5')).toEqual({ valid: false, value: null });
    expect(parseField('rpe', '8.3')).toEqual({ valid: false, value: null });
  });
});

describe('fieldPatch', () => {
  it('stores a weight with the unit it was entered in, and clears both together', () => {
    expect(fieldPatch('weight', 135, 'lb', 'km')).toEqual({ weight: 135, weightUnit: 'lb' });
    expect(fieldPatch('weight', null, 'lb', 'km')).toEqual({ weight: null, weightUnit: null });
  });

  it('stores a distance with the distance unit, and clears both together', () => {
    expect(fieldPatch('distance', 2.5, 'kg', 'km')).toEqual({ distance: 2.5, distanceUnit: 'km' });
    expect(fieldPatch('distance', null, 'kg', 'km')).toEqual({ distance: null, distanceUnit: null });
  });

  it('writes reps, time and RPE as they are', () => {
    expect(fieldPatch('reps', 8, 'lb', 'km')).toEqual({ reps: 8 });
    expect(fieldPatch('durationS', 90, 'lb', 'km')).toEqual({ durationS: 90 });
    expect(fieldPatch('rpe', 8.5, 'lb', 'km')).toEqual({ rpe: 8.5 });
    expect(fieldPatch('reps', null, 'lb', 'km')).toEqual({ reps: null });
  });
});

// ---- rows ----

const prev = (position: number, setType: SetType, weight: number | null, reps: number | null, extra: Partial<PrevSet> = {}): PrevSet => ({
  position,
  setType,
  weight,
  weightUnit: 'lb',
  reps,
  durationS: null,
  distance: null,
  distanceUnit: null,
  ...extra,
});

let nextId = 0;
const set = (setType: SetType, extra: Partial<SetInput> = {}): SetInput => ({
  id: `s${nextId++}`,
  position: 0,
  setType,
  weight: null,
  weightUnit: null,
  reps: null,
  durationS: null,
  distance: null,
  distanceUnit: null,
  rpe: null,
  done: false,
  ...extra,
});

/** The bar and plates in Settings by default, for each unit. */
const LB_GEAR = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };
const KG_GEAR = { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } };

const exercise = (extra: Partial<ExerciseInput> = {}): ExerciseInput => ({
  loggingType: 'weighted',
  equipment: 'barbell',
  rule: { repMax: 8 },
  plannedWeight: null,
  plannedUnit: null,
  overrideWeight: null,
  overrideUnit: null,
  sets: [set('working'), set('working'), set('working'), set('working')],
  previous: [],
  ...extra,
});

describe('buildRows: the previous result (spec 8.4, Review Focus 7)', () => {
  it('is empty on every row when the exercise has no history, and invents nothing', () => {
    const rows = buildRows(exercise(), 'lb', LB_GEAR);
    expect(rows.map((r) => r.previous)).toEqual(['', '', '', '']);
    expect(rows.map((r) => r.label)).toEqual(['1', '2', '3', '4']);
    expect(rows[0].placeholders).toEqual({ weight: null, reps: 8, durationS: null, distance: null });
  });

  it('shows each set the same set from last time, row by row', () => {
    const rows = buildRows(
      exercise({
        previous: [prev(0, 'working', 135, 8), prev(1, 'working', 140, 7), prev(2, 'working', 145, 6), prev(3, 'working', 150, 5)],
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.previous)).toEqual(['135 × 8', '140 × 7', '145 × 6', '150 × 5']);
  });

  it('never shows a warmup as the previous result for a working set', () => {
    const rows = buildRows(
      exercise({
        sets: [set('working'), set('working')],
        previous: [prev(0, 'warmup', 45, 10), prev(1, 'working', 135, 8)],
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.previous)).toEqual(['135 × 8', '']);
  });

  it('matches a warmup row to last time\'s warmup and shifts the working rows with the labels', () => {
    const rows = buildRows(
      exercise({
        sets: [set('warmup'), set('working'), set('working'), set('working')],
        previous: [prev(0, 'warmup', 45, 10), prev(1, 'working', 135, 8), prev(2, 'working', 140, 7)],
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.label)).toEqual(['W', '1', '2', '3']);
    expect(rows.map((r) => r.previous)).toEqual(['45 × 10', '135 × 8', '140 × 7', '']);
  });

  it('leaves a warmup row empty when last time had no warmup', () => {
    const rows = buildRows(
      exercise({ sets: [set('warmup'), set('working')], previous: [prev(0, 'working', 135, 8)] }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.previous)).toEqual(['', '135 × 8']);
  });

  it('matches by number within the type when last time\'s unticked sets left gaps', () => {
    const rows = buildRows(
      exercise({
        sets: [set('working'), set('working'), set('working')],
        previous: [prev(0, 'working', 135, 8), prev(2, 'working', 145, 6)],
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.previous)).toEqual(['135 × 8', '145 × 6', '']);
  });

  it('shows the unit only when last time was in the other unit', () => {
    const rows = buildRows(
      exercise({ sets: [set('working')], previous: [prev(0, 'working', 84, 12, { weightUnit: 'kg' })] }),
      'lb',
      LB_GEAR,
    );
    expect(rows[0].previous).toBe('84 kg × 12');
  });

  it('follows the logging type: timed, weighted time, distance and time, bodyweight plus, assisted', () => {
    const one = (loggingType: LoggingType, p: PrevSet) => buildRows(exercise({ loggingType, sets: [set('working')], previous: [p] }), 'lb', LB_GEAR)[0].previous;
    expect(one('timed', prev(0, 'working', null, null, { durationS: 40 }))).toBe('40s');
    expect(one('timed', prev(0, 'working', null, null, { durationS: 90 }))).toBe('1:30');
    expect(one('weighted_time', prev(0, 'working', 70, null, { durationS: 40 }))).toBe('70 lb × 40s');
    expect(one('distance_time', prev(0, 'working', null, null, { distance: 2, distanceUnit: 'km', durationS: 750 }))).toBe('2 km · 12:30');
    expect(one('bodyweight_plus', prev(0, 'working', 25, 8))).toBe('+25 × 8');
    expect(one('assisted', prev(0, 'working', 40, 8))).toBe('−40 × 8');
  });

  it('follows the row when its type changes', () => {
    const previous = [prev(0, 'warmup', 45, 10), prev(1, 'working', 135, 8)];
    const before = buildRows(exercise({ sets: [set('working'), set('working')], previous }), 'lb', LB_GEAR);
    const after = buildRows(exercise({ sets: [set('warmup'), set('working')], previous }), 'lb', LB_GEAR);
    expect(before.map((r) => r.previous)).toEqual(['135 × 8', '']);
    expect(after.map((r) => r.previous)).toEqual(['45 × 10', '135 × 8']);
  });
});

describe('buildRows: the target and the placeholders', () => {
  it('uses the override over the planned weight, in the entry unit', () => {
    const rows = buildRows(
      exercise({ plannedWeight: 130, plannedUnit: 'lb', overrideWeight: 135, overrideUnit: 'lb' }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.target)).toEqual([135, 135, 135, 135]);
  });

  it('converts a target in the other unit as a workout start does (planInUnit, R36): a barbell to a loadable weight', () => {
    expect(buildRows(exercise({ plannedWeight: 135, plannedUnit: 'lb' }), 'kg', KG_GEAR)[0].target).toBe(60);
    expect(buildRows(exercise({ plannedWeight: 100, plannedUnit: 'kg' }), 'lb', LB_GEAR)[0].target).toBe(220);
    expect(buildRows(exercise({ overrideWeight: 225, overrideUnit: 'lb' }), 'kg', KG_GEAR)[0].target).toBe(102.5);
  });

  it('converts a target in the other unit to the nearest 0.5 for anything but a barbell', () => {
    expect(buildRows(exercise({ equipment: 'dumbbell', plannedWeight: 100, plannedUnit: 'kg' }), 'lb', LB_GEAR)[0].target).toBe(220.5);
    expect(buildRows(exercise({ equipment: 'dumbbell', plannedWeight: 225, plannedUnit: 'lb' }), 'kg', KG_GEAR)[0].target).toBe(102);
  });

  it('prefills a 135 lb barbell target viewed in kg as 60, not 61.23 (F4)', () => {
    const [row] = buildRows(exercise({ sets: [set('working')], plannedWeight: 135, plannedUnit: 'lb' }), 'kg', KG_GEAR);
    expect(valueText(row, 'weight', 'kg', 'km')).toBe('60');
  });

  it('treats a target with no unit as already in the entry unit', () => {
    expect(buildRows(exercise({ plannedWeight: 100, plannedUnit: null }), 'kg', KG_GEAR)[0].target).toBe(100);
  });

  it('has no target when the exercise has none', () => {
    expect(buildRows(exercise(), 'lb', LB_GEAR).map((r) => r.target)).toEqual([null, null, null, null]);
  });

  it('only working sets start from the target; a warmup does not', () => {
    const rows = buildRows(
      exercise({ sets: [set('warmup'), set('working'), set('drop'), set('failure')], plannedWeight: 225, plannedUnit: 'lb' }),
      'lb',
      LB_GEAR,
    );
    expect(rows.map((r) => r.target)).toEqual([null, 225, null, null]);
  });

  it('has no target for the types that carry no load', () => {
    expect(buildRows(exercise({ loggingType: 'timed', plannedWeight: 50, plannedUnit: 'lb' }), 'lb', LB_GEAR)[0].target).toBeNull();
    expect(buildRows(exercise({ loggingType: 'distance_time', plannedWeight: 50, plannedUnit: 'lb' }), 'lb', LB_GEAR)[0].target).toBeNull();
    expect(buildRows(exercise({ loggingType: 'weighted_time', plannedWeight: 50, plannedUnit: 'lb' }), 'lb', LB_GEAR)[0].target).toBe(50);
  });

  it('takes placeholders from the matched previous set, converted into the entry unit to the nearest 0.5, else the rule', () => {
    const rows = buildRows(
      exercise({
        sets: [set('working'), set('working')],
        previous: [prev(0, 'working', 100, 6, { weightUnit: 'kg' })],
        rule: { repMax: 12 },
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows[0].placeholders).toEqual({ weight: 220.5, reps: 6, durationS: null, distance: null });
    expect(rows[1].placeholders).toEqual({ weight: null, reps: 12, durationS: null, distance: null });
  });

  it('feeds the rule into the time placeholder for timed sets', () => {
    const rows = buildRows(exercise({ loggingType: 'timed', sets: [set('working')], rule: { repMax: 45 } }), 'lb', LB_GEAR);
    expect(rows[0].placeholders).toMatchObject({ reps: null, durationS: 45 });
  });
});

describe("buildRows: carrying today's values (spec 18.6)", () => {
  const done = (weight: number, reps: number, weightUnit: 'lb' | 'kg' = 'kg', setType: SetType = 'working') =>
    set(setType, { done: true, weight, weightUnit, reps });

  it('first run: set 1 ticked at 60 × 8 gives sets 2-4 a 60 / 8 ghost and a one-tap tick', () => {
    const rows = buildRows(exercise({ rule: null, sets: [done(60, 8), set('working'), set('working'), set('working')] }), 'kg', KG_GEAR);
    for (const row of rows.slice(1)) expect(row.placeholders).toEqual({ weight: 60, reps: 8, durationS: null, distance: null });
    expect(hintText(rows[1], 'weight')).toBe('60');
    expect(readRow(rows[1], {}, 'kg', 'km').tickable).toBe(true);
    expect(rows.map((r) => r.previous)).toEqual(['', '', '', '']);
  });

  it('typed 62.5 on set 3 carries to set 4, not up to set 2', () => {
    const rows = buildRows(
      exercise({ rule: null, sets: [done(60, 8), set('working'), set('working', { weight: 62.5, weightUnit: 'kg' }), set('working')] }),
      'kg',
      KG_GEAR,
    );
    expect(rows[3].placeholders.weight).toBe(62.5);
    expect(rows[1].placeholders.weight).toBe(60);
    expect(rows[3].placeholders.reps).toBe(8);
  });

  it("the rule's reps win over today's reps", () => {
    const rows = buildRows(exercise({ rule: { repMax: 12 }, sets: [done(60, 8), set('working')] }), 'kg', KG_GEAR);
    expect(rows[1].placeholders).toEqual({ weight: 60, reps: 12, durationS: null, distance: null });
  });

  it('real history wins row by row; only a set with no match carries', () => {
    const rows = buildRows(
      exercise({
        rule: null,
        previous: [prev(0, 'working', 135, 8), prev(1, 'working', 140, 7)],
        sets: [done(150, 5, 'lb'), set('working'), set('working')],
      }),
      'lb',
      LB_GEAR,
    );
    expect(rows[1].placeholders).toEqual({ weight: 140, reps: 7, durationS: null, distance: null });
    expect(rows[2].placeholders).toEqual({ weight: 150, reps: 5, durationS: null, distance: null });
  });

  it('a target wins: no carried weight under it', () => {
    const rows = buildRows(
      exercise({ rule: { repMax: 10 }, plannedWeight: 135, plannedUnit: 'lb', sets: [done(140, 8, 'lb'), set('working')] }),
      'lb',
      LB_GEAR,
    );
    expect(rows[1].placeholders.weight).toBeNull();
    // The rule's reps, not the 8 carried from the set above.
    expect(rows[1].placeholders.reps).toBe(10);
    expect(valueText(rows[1], 'weight', 'lb', 'mi')).toBe('135');
  });

  it('a warmup carries from the warmup above, never from a working set', () => {
    const rows = buildRows(
      exercise({ rule: null, sets: [done(45, 10, 'lb', 'warmup'), set('warmup'), done(135, 8, 'lb'), set('working')] }),
      'lb',
      LB_GEAR,
    );
    expect(rows[1].placeholders).toEqual({ weight: 45, reps: 10, durationS: null, distance: null });
    expect(rows[3].placeholders).toEqual({ weight: 135, reps: 8, durationS: null, distance: null });
    const after = buildRows(exercise({ rule: null, sets: [done(135, 8, 'lb'), set('warmup')] }), 'lb', LB_GEAR);
    expect(after[1].placeholders).toEqual({ weight: null, reps: null, durationS: null, distance: null });
  });

  it('a carried distance logged in another distance unit converts to the entry distance unit', () => {
    const run = set('working', { done: true, distance: 5, distanceUnit: 'km', durationS: 1500 });
    const rows = buildRows(exercise({ loggingType: 'distance_time', rule: null, sets: [run, set('working')] }), 'lb', LB_GEAR, 'mi');
    expect(rows[1].placeholders).toEqual({ weight: null, reps: null, durationS: 1500, distance: 3.11 });
  });

  it('a carried weight logged in the other unit converts to the entry unit', () => {
    const rows = buildRows(exercise({ rule: null, sets: [done(60, 8, 'kg'), set('working')] }), 'lb', LB_GEAR);
    expect(rows[1].placeholders.weight).toBe(132.5);
  });

  it('invents nothing with nothing above', () => {
    const rows = buildRows(exercise({ rule: null }), 'lb', LB_GEAR);
    for (const row of rows) expect(row.placeholders).toEqual({ weight: null, reps: null, durationS: null, distance: null });
    expect(readRow(rows[1], {}, 'lb', 'mi').tickable).toBe(false);
  });
});

describe('valueText and hintText', () => {
  it('shows the target as the load until a weight is stored', () => {
    const [row] = buildRows(exercise({ sets: [set('working')], plannedWeight: 135, plannedUnit: 'lb' }), 'lb', LB_GEAR);
    expect(valueText(row, 'weight', 'lb', 'mi')).toBe('135');
    const [stored] = buildRows(exercise({ sets: [set('working', { weight: 140, weightUnit: 'lb' })], plannedWeight: 135, plannedUnit: 'lb' }), 'lb', LB_GEAR);
    expect(valueText(stored, 'weight', 'lb', 'mi')).toBe('140');
  });

  it('never shows an unsaved target on a done row (R29)', () => {
    // A done set with no stored weight (it was cleared after the tick) must not borrow today's target.
    const plan = { plannedWeight: 135, plannedUnit: 'lb' as const };
    const [done] = buildRows(exercise({ sets: [set('working', { done: true, reps: 8 })], ...plan }), 'lb', LB_GEAR);
    expect(valueText(done, 'weight', 'lb', 'mi')).toBe('');
    const [open] = buildRows(exercise({ sets: [set('working', { reps: 8 })], ...plan }), 'lb', LB_GEAR);
    expect(valueText(open, 'weight', 'lb', 'mi')).toBe('135');
    const [stored] = buildRows(exercise({ sets: [set('working', { done: true, weight: 140, weightUnit: 'lb', reps: 8 })], ...plan }), 'lb', LB_GEAR);
    expect(valueText(stored, 'weight', 'lb', 'mi')).toBe('140');
  });

  it('is empty for a field with no value and no target', () => {
    const [row] = buildRows(exercise({ sets: [set('working')] }), 'lb', LB_GEAR);
    expect(valueText(row, 'weight', 'lb', 'mi')).toBe('');
    expect(valueText(row, 'reps', 'lb', 'mi')).toBe('');
    expect(valueText(row, 'durationS', 'lb', 'mi')).toBe('');
    expect(valueText(row, 'distance', 'lb', 'mi')).toBe('');
    expect(valueText(row, 'rpe', 'lb', 'mi')).toBe('');
  });

  it('shows a stored weight as it was logged, with its unit when that is not the display unit (spec 7.1, F4)', () => {
    const [open] = buildRows(exercise({ sets: [set('working', { weight: 135, weightUnit: 'lb' })] }), 'kg', KG_GEAR);
    expect(valueText(open, 'weight', 'kg', 'km')).toBe('135 lb');
    const [done] = buildRows(exercise({ sets: [set('working', { done: true, weight: 100, weightUnit: 'kg', reps: 5 })] }), 'lb', LB_GEAR);
    expect(valueText(done, 'weight', 'lb', 'mi')).toBe('100 kg');
    const [same] = buildRows(exercise({ sets: [set('working', { done: true, weight: 100, weightUnit: 'kg', reps: 5 })] }), 'kg', KG_GEAR);
    expect(valueText(same, 'weight', 'kg', 'km')).toBe('100');
  });

  it('shows a stored distance as it was logged, with its unit when that is not the display distance unit, as a weight does', () => {
    const run = (extra: Partial<SetInput>, distanceUnit: DistanceUnit) =>
      valueText(buildRows(exercise({ loggingType: 'distance_time', rule: null, sets: [set('working', extra)] }), 'lb', LB_GEAR, distanceUnit)[0], 'distance', 'lb', distanceUnit);
    expect(run({ distance: 5, distanceUnit: 'km', durationS: 1500 }, 'mi')).toBe('5 km');
    expect(run({ done: true, distance: 3.1, distanceUnit: 'mi', durationS: 1500 }, 'km')).toBe('3.1 mi');
    expect(run({ distance: 5, distanceUnit: 'km', durationS: 1500 }, 'km')).toBe('5');
    // A distance stored with no unit is read as in the display distance unit, as a weight with none is.
    expect(run({ distance: 5, durationS: 1500 }, 'mi')).toBe('5');
    // What is typed over it replaces it, in the display distance unit (the field selects its text on focus, as the weight's does).
    const [row] = buildRows(exercise({ loggingType: 'distance_time', rule: null, sets: [set('working', { distance: 5, distanceUnit: 'km', durationS: 1500 })] }), 'lb', LB_GEAR, 'mi');
    expect(readRow(row, { distance: '3' }, 'lb', 'mi')).toMatchObject({ entered: { distance: 3 }, distanceUnit: 'mi', invalid: [] });
  });

  it('writes stored values in a form the parsers read back', () => {
    const [row] = buildRows(
      exercise({ sets: [set('working', { weight: 82.5, weightUnit: 'kg', reps: 8, durationS: 90, distance: 2.5, rpe: 8.5 })] }),
      'kg',
      KG_GEAR,
    );
    expect(valueText(row, 'weight', 'kg', 'km')).toBe('82.5');
    expect(valueText(row, 'reps', 'kg', 'km')).toBe('8');
    expect(valueText(row, 'durationS', 'kg', 'km')).toBe('1:30');
    expect(valueText(row, 'distance', 'kg', 'km')).toBe('2.5');
    expect(valueText(row, 'rpe', 'kg', 'km')).toBe('8.5');
    const [short] = buildRows(exercise({ sets: [set('working', { durationS: 40 })] }), 'kg', KG_GEAR);
    expect(valueText(short, 'durationS', 'kg', 'km')).toBe('40');
  });

  it('formats placeholders: reps as a number, time as "40s" or "1:30", and nothing when there is none', () => {
    const [row] = buildRows(
      exercise({ loggingType: 'weighted_time', sets: [set('working')], previous: [prev(0, 'working', 70, null, { durationS: 40 })] }),
      'lb',
      LB_GEAR,
    );
    expect(hintText(row, 'weight')).toBe('70');
    expect(hintText(row, 'durationS')).toBe('40s');
    expect(hintText(row, 'reps')).toBe('');
    expect(hintText(row, 'distance')).toBe('');
    expect(hintText(row, 'rpe')).toBe('');
    const [long] = buildRows(
      exercise({ loggingType: 'timed', sets: [set('working')], previous: [prev(0, 'working', null, null, { durationS: 90 })] }),
      'lb',
      LB_GEAR,
    );
    expect(hintText(long, 'durationS')).toBe('1:30');
    const [reps] = buildRows(exercise({ sets: [set('working')], rule: { repMax: 12 } }), 'lb', LB_GEAR);
    expect(hintText(reps, 'reps')).toBe('12');
  });
});

describe('readRow: what the row holds while it is being typed into', () => {
  const row = (extra: Partial<ExerciseInput> = {}, ...sets: SetInput[]) =>
    buildRows(exercise({ sets: sets.length ? sets : [set('working')], ...extra }), 'lb', LB_GEAR)[0];

  it('with nothing typed, reads the stored values; with no target, placeholder or value the row cannot tick', () => {
    const r = readRow(row({ rule: null }), {}, 'lb', 'mi');
    expect(r.entered).toEqual({ weight: null, reps: null, durationS: null, distance: null });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(false);
  });

  it('can tick on the placeholders alone (spec 8.4: ticking with empty fields accepts them)', () => {
    const r = readRow(row({ previous: [prev(0, 'working', 135, 8)] }), {}, 'lb', 'mi');
    expect(r.entered).toEqual({ weight: null, reps: null, durationS: null, distance: null });
    expect(r.tickable).toBe(true);
  });

  it('can tick on the target and the rule\'s reps', () => {
    expect(readRow(row({ plannedWeight: 135, plannedUnit: 'lb' }), {}, 'lb', 'mi').tickable).toBe(true);
  });

  it('overlays what is typed on the stored values', () => {
    const r = readRow(row({}, set('working', { weight: 100, weightUnit: 'lb', reps: 5 })), { weight: '135', reps: '8' }, 'lb', 'mi');
    expect(r.entered).toMatchObject({ weight: 135, reps: 8 });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(true);
  });

  it('reads a stored weight as it was logged, in its own unit, and a typed one in the display unit (F4)', () => {
    const stored = readRow(row({}, set('working', { weight: 100, weightUnit: 'kg', reps: 5 })), {}, 'lb', 'mi');
    expect(stored.entered.weight).toBe(100);
    expect(stored.weightUnit).toBe('kg');
    const typed = readRow(row({}, set('working', { weight: 100, weightUnit: 'kg', reps: 5 })), { weight: '225' }, 'lb', 'mi');
    expect(typed.entered.weight).toBe(225);
    expect(typed.weightUnit).toBe('lb');
    expect(readRow(row(), {}, 'lb', 'mi').weightUnit).toBe('lb');
  });

  it('reads a stored distance as it was logged, in its own unit, and a typed one in the display distance unit', () => {
    const run = (drafts: Record<string, string>) =>
      readRow(row({ loggingType: 'distance_time', rule: null }, set('working', { distance: 5, distanceUnit: 'km', durationS: 1500 })), drafts, 'lb', 'mi');
    expect(run({}).entered.distance).toBe(5);
    expect(run({}).distanceUnit).toBe('km');
    expect(run({ distance: '3' }).entered.distance).toBe(3);
    expect(run({ distance: '3' }).distanceUnit).toBe('mi');
    // No stored distance: a placeholder is already in the display distance unit.
    expect(readRow(row({ loggingType: 'distance_time', rule: null }), {}, 'lb', 'mi').distanceUnit).toBe('mi');
  });

  it('treats a cleared input as no value, not as an error', () => {
    const r = readRow(row({ plannedWeight: 135, plannedUnit: 'lb' }, set('working', { weight: 100, weightUnit: 'lb', reps: 5 })), { weight: '', reps: '  ' }, 'lb', 'mi');
    expect(r.entered).toMatchObject({ weight: null, reps: null });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(true);
  });

  it('flags only non-blank text that does not parse, and then cannot tick', () => {
    const r = readRow(row({ previous: [prev(0, 'working', 135, 8)] }), { weight: 'abc', reps: '8.5', rpe: '' }, 'lb', 'mi');
    expect(r.invalid).toEqual(['weight', 'reps']);
    expect(r.tickable).toBe(false);
  });

  it('reads RPE from the draft, else from the set', () => {
    expect(readRow(row({}, set('working', { rpe: 7 })), {}, 'lb', 'mi').rpe).toBe(7);
    expect(readRow(row({}, set('working', { rpe: 7 })), { rpe: '8.5' }, 'lb', 'mi').rpe).toBe(8.5);
    expect(readRow(row({}, set('working', { rpe: 7 })), { rpe: '' }, 'lb', 'mi').rpe).toBeNull();
    expect(readRow(row(), { rpe: '11' }, 'lb', 'mi').invalid).toEqual(['rpe']);
  });

  it('needs both fields for distance and time', () => {
    const r = (drafts: Record<string, string>) =>
      readRow(row({ loggingType: 'distance_time', rule: null }), drafts, 'lb', 'mi');
    expect(r({ distance: '5' }).tickable).toBe(false);
    expect(r({ distance: '5', durationS: '25:00' }).tickable).toBe(true);
    expect(r({ distance: '5', durationS: '25:00' }).entered).toMatchObject({ distance: 5, durationS: 1500 });
  });
});

describe('readRow: missing (spec 18.6: a tick that is not ready says why)', () => {
  const row = (extra: Partial<ExerciseInput> = {}) => buildRows(exercise({ sets: [set('working')], ...extra }), 'lb', LB_GEAR)[0];

  it('is the first field the type needs that has no value, typed, target or placeholder', () => {
    expect(readRow(row({ rule: null }), {}, 'lb', 'mi').missing).toBe('weight');
    expect(readRow(row({ rule: null }), { weight: '60' }, 'lb', 'mi').missing).toBe('reps');
    expect(readRow(row({ previous: [prev(0, 'working', 135, 8)] }), {}, 'lb', 'mi').missing).toBeNull();
  });

  it('needs only reps for bodyweight plus, and the time after the distance for distance and time', () => {
    expect(readRow(row({ loggingType: 'bodyweight_plus', rule: null }), {}, 'lb', 'mi').missing).toBe('reps');
    expect(readRow(row({ loggingType: 'distance_time', rule: null }), { distance: '5' }, 'lb', 'mi').missing).toBe('durationS');
  });
});

describe('isComplete: a ticked set must hold what its type needs', () => {
  const values = (v: Partial<{ weight: number | null; reps: number | null; durationS: number | null; distance: number | null }>) => ({
    weight: null,
    reps: null,
    durationS: null,
    distance: null,
    ...v,
  });

  it('needs the load and the reps for a weighted set, with no target or placeholder to lean on', () => {
    expect(isComplete('weighted', values({ weight: 135, reps: 8 }))).toBe(true);
    expect(isComplete('weighted', values({ reps: 8 }))).toBe(false);
    expect(isComplete('weighted', values({ weight: 135 }))).toBe(false);
    expect(isComplete('assisted', values({ weight: 40 }))).toBe(false);
  });

  it('needs only the reps for bodyweight plus, where no load means none added', () => {
    expect(isComplete('bodyweight_plus', values({ reps: 8 }))).toBe(true);
    expect(isComplete('bodyweight_plus', values({ weight: 10 }))).toBe(false);
  });

  it('needs the time for timed, and the other field too for weighted time and distance', () => {
    expect(isComplete('timed', values({ durationS: 40 }))).toBe(true);
    expect(isComplete('timed', values({}))).toBe(false);
    expect(isComplete('weighted_time', values({ durationS: 40 }))).toBe(false);
    expect(isComplete('weighted_time', values({ weight: 20, durationS: 40 }))).toBe(true);
    expect(isComplete('distance_time', values({ distance: 5 }))).toBe(false);
    expect(isComplete('distance_time', values({ distance: 5, durationS: 1500 }))).toBe(true);
  });
});

describe('isTargetValue and fieldLook (spec 18.6: suggested values look like suggestions)', () => {
  const row = (extra: Partial<ExerciseInput> = {}, ...sets: SetInput[]) =>
    buildRows(exercise({ sets: sets.length ? sets : [set('working')], ...extra }), 'lb', LB_GEAR)[0];
  const plan = { plannedWeight: 135, plannedUnit: 'lb' as const };

  it('a target is a suggestion until it is typed over or ticked', () => {
    const r = row(plan);
    expect(isTargetValue(r, 'weight')).toBe(true);
    expect(fieldLook(r, 'weight', undefined)).toBe('suggested');
    expect(fieldLook(r, 'weight', '140')).toBe('entered');
    expect(fieldLook(r, 'reps', undefined)).toBe('suggested');
    expect(isTargetValue(r, 'reps')).toBe(false);
  });

  it('a stored or ticked value is entered', () => {
    const stored = row(plan, set('working', { weight: 140, weightUnit: 'lb', reps: 6 }));
    expect(isTargetValue(stored, 'weight')).toBe(false);
    expect(fieldLook(stored, 'weight', undefined)).toBe('entered');
    expect(fieldLook(stored, 'reps', undefined)).toBe('entered');
    const ticked = row({}, set('working', { done: true, weight: 135, weightUnit: 'lb', reps: 8 }));
    expect(fieldLook(ticked, 'weight', undefined)).toBe('entered');
    expect(fieldLook(ticked, 'reps', undefined)).toBe('entered');
  });

  it('a done row never takes the target as its value (R29); with its weight cleared, the target is only its ghost (B2)', () => {
    const r = row({ ...plan, rule: null }, set('working', { done: true, reps: 8 }));
    expect(isTargetValue(r, 'weight')).toBe(false);
    expect(valueText(r, 'weight', 'lb', 'mi')).toBe('');
    expect(hintText(r, 'weight')).toBe('135');
    expect(fieldLook(r, 'weight', undefined)).toBe('suggested');
  });

  it('placeholders from last time are suggestions', () => {
    const r = row({ previous: [prev(0, 'working', 135, 8)] });
    expect(fieldLook(r, 'weight', undefined)).toBe('suggested');
    expect(fieldLook(r, 'reps', undefined)).toBe('suggested');
    expect(fieldLook(r, 'rpe', undefined)).toBe('empty');
  });

  it('a blank draft falls back to the suggestion or empty', () => {
    const r = row({ previous: [prev(0, 'working', 135, 8)] });
    expect(fieldLook(r, 'weight', '')).toBe('suggested');
    expect(fieldLook(r, 'weight', '   ')).toBe('suggested');
    const bare = row({ rule: null });
    expect(fieldLook(bare, 'weight', '')).toBe('empty');
    expect(fieldLook(bare, 'reps', undefined)).toBe('empty');
    expect(fieldLook(bare, 'weight', 'abc')).toBe('entered');
  });

  it('no target for a warmup', () => {
    const r = row({ ...plan, rule: null }, set('warmup'));
    expect(isTargetValue(r, 'weight')).toBe(false);
    expect(fieldLook(r, 'weight', undefined)).toBe('empty');
  });

  it("a ticked set's cleared weight field shows the target as its ghost, not last time's weight (B2)", () => {
    // Leaving it blank takes the tick off, and the open row then shows the target: the ghost says so first.
    const r = row({ ...plan, previous: [prev(0, 'working', 130, 8)] }, set('working', { done: true, weight: 135, weightUnit: 'lb', reps: 8 }));
    expect(hintText(r, 'weight')).toBe('135');
    expect(fieldLook(r, 'weight', '')).toBe('suggested');
    // The value is still only what was saved (R29).
    expect(valueText(r, 'weight', 'lb', 'mi')).toBe('135');
  });

  it('a cleared target field shows the target as its ghost (R49)', () => {
    const r = row({ ...plan, previous: [prev(0, 'working', 130, 8)] });
    expect(hintText(r, 'weight')).toBe('135');
    const reading = readRow(r, { weight: '' }, 'lb', 'mi');
    expect(reading.tickable).toBe(true);
    const logged = resolveTick({ loggingType: r.loggingType, entered: reading.entered, target: r.target, placeholders: r.placeholders });
    expect(logged?.weight).toBe(135);
  });
});

describe('looksUnlikely: the soft check on a set field once it is left (R422)', () => {
  it('flags a weight above 1,000 lb or 450 kg, with no history', () => {
    expect(looksUnlikely('weight', 1000, 'working', 'lb', null)).toBe(false);
    expect(looksUnlikely('weight', 1000.5, 'working', 'lb', null)).toBe(true);
    expect(looksUnlikely('weight', 450, 'working', 'kg', null)).toBe(false);
    expect(looksUnlikely('weight', 451, 'working', 'kg', undefined)).toBe(true);
  });

  it("flags a weight more than 1.5 times the exercise's best and at least 20 lb more", () => {
    const best = { value: 100, unit: 'lb' as const };
    expect(looksUnlikely('weight', 150, 'working', 'lb', best)).toBe(false);
    expect(looksUnlikely('weight', 151, 'working', 'lb', best)).toBe(true);
    // 31 lb is over 1.5 times 20 lb, but only 11 lb more: a light lift moves in big steps.
    expect(looksUnlikely('weight', 31, 'working', 'lb', { value: 20, unit: 'lb' })).toBe(false);
    expect(looksUnlikely('weight', 40, 'working', 'lb', { value: 20, unit: 'lb' })).toBe(true);
  });

  it('needs at least 10 kg more in kg, and compares a best logged in the other unit', () => {
    expect(looksUnlikely('weight', 16, 'working', 'kg', { value: 10, unit: 'kg' })).toBe(false);
    expect(looksUnlikely('weight', 20, 'working', 'kg', { value: 10, unit: 'kg' })).toBe(true);
    // 100 kg is 220.46 lb; 1.5 times that is 330.69 lb.
    expect(looksUnlikely('weight', 330, 'working', 'lb', { value: 100, unit: 'kg' })).toBe(false);
    expect(looksUnlikely('weight', 331, 'working', 'lb', { value: 100, unit: 'kg' })).toBe(true);
  });

  it('ignores a best of 0, as no history', () => {
    expect(looksUnlikely('weight', 60, 'working', 'lb', { value: 0, unit: 'lb' })).toBe(false);
  });

  it('flags reps above 100', () => {
    expect(looksUnlikely('reps', 100, 'working', 'lb', null)).toBe(false);
    expect(looksUnlikely('reps', 101, 'working', 'lb', null)).toBe(true);
  });

  it('never flags a warmup, an empty field, or a time, distance or RPE', () => {
    expect(looksUnlikely('weight', 2000, 'warmup', 'lb', null)).toBe(false);
    expect(looksUnlikely('reps', 500, 'warmup', 'lb', null)).toBe(false);
    expect(looksUnlikely('weight', null, 'working', 'lb', null)).toBe(false);
    expect(looksUnlikely('durationS', 99999, 'working', 'lb', null)).toBe(false);
    expect(looksUnlikely('distance', 5000, 'working', 'lb', null)).toBe(false);
    expect(looksUnlikely('rpe', 10, 'working', 'lb', null)).toBe(false);
  });

  it('flags drop and failure sets like working sets', () => {
    expect(looksUnlikely('weight', 1200, 'drop', 'lb', null)).toBe(true);
    expect(looksUnlikely('reps', 150, 'failure', 'lb', null)).toBe(true);
  });
});

describe('the three program logging types (R607)', () => {
  describe('column labels', () => {
    it('weight and distance: the load, DIST, then an optional TIME', () => {
      expect(keys('weighted_distance')).toEqual(['set', 'previous', 'weight', 'distance', 'durationS', 'tick']);
      expect(headers('weighted_distance', 'lb')).toEqual(['SET', 'PREVIOUS', 'LB', 'DIST', 'TIME', '✓']);
    });

    it('an AMRAP score: ROUNDS, then +REPS', () => {
      expect(keys('rounds')).toEqual(['set', 'previous', 'reps', 'extraReps', 'tick']);
      expect(headers('rounds')).toEqual(['SET', 'PREVIOUS', 'ROUNDS', '+REPS', '✓']);
    });

    it('a For Time score: TIME', () => {
      expect(keys('for_time')).toEqual(['set', 'previous', 'durationS', 'tick']);
      expect(headers('for_time')).toEqual(['SET', 'PREVIOUS', 'TIME', '✓']);
    });
  });

  describe("the distance unit of a set: the slot's ft or yd, else m (R607)", () => {
    it('reads a slot target unit', () => {
      expect(slotDistanceUnit('feet')).toBe('ft');
      expect(slotDistanceUnit('yards')).toBe('yd');
      expect(slotDistanceUnit('reps')).toBe('m');
    });

    it("weight and distance enters in the slot's unit, else last time's, else m; the other types in Settings' unit", () => {
      const carry = exercise({ loggingType: 'weighted_distance', rule: { repMax: 50 } });
      expect(entryDistanceUnit({ ...carry, slotDistanceUnit: 'ft' }, 'mi')).toBe('ft');
      expect(entryDistanceUnit({ ...carry, previous: [prev(0, 'working', 315, null, { distance: 40, distanceUnit: 'yd' })] }, 'mi')).toBe('yd');
      expect(entryDistanceUnit(carry, 'mi')).toBe('m');
      expect(entryDistanceUnit(exercise({ loggingType: 'distance_time' }), 'km')).toBe('km');
    });

    it("a row carries its entry unit, and the rule's distance is the hint", () => {
      const [row] = buildRows(
        exercise({ loggingType: 'weighted_distance', rule: { repMax: 50 }, sets: [set('working')], slotDistanceUnit: 'ft', plannedWeight: 315, plannedUnit: 'lb' }),
        'lb',
        LB_GEAR,
        'mi',
      );
      expect(row.distanceUnit).toBe('ft');
      expect(row.target).toBe(315);
      expect(hintText(row, 'distance')).toBe('50');
      expect(hintText(row, 'durationS')).toBe('');
      expect(readRow(row, {}, 'lb', 'ft')).toMatchObject({ tickable: true, missing: null, distanceUnit: 'ft' });
    });
  });

  describe('a tick that is not ready says why', () => {
    it('weight and distance needs the distance, never the time', () => {
      const [row] = buildRows(exercise({ loggingType: 'weighted_distance', rule: null, sets: [set('working')] }), 'lb', LB_GEAR, 'mi');
      expect(readRow(row, { weight: '315' }, 'lb', 'm').missing).toBe('distance');
      expect(readRow(row, { weight: '315', distance: '50' }, 'lb', 'm')).toMatchObject({ tickable: true, missing: null });
    });

    it('an AMRAP score needs the rounds, never the extra reps', () => {
      const [row] = buildRows(exercise({ loggingType: 'rounds', rule: { repMax: 1 }, sets: [set('working')] }), 'lb', LB_GEAR, 'mi');
      expect(readRow(row, { extraReps: '4' }, 'lb', 'mi').missing).toBe('reps');
      expect(readRow(row, { reps: '6' }, 'lb', 'mi')).toMatchObject({ tickable: true, missing: null });
      expect(readRow(row, { reps: '6', extraReps: '4' }, 'lb', 'mi').entered).toMatchObject({ reps: 6, extraReps: 4 });
    });

    it('a For Time score needs the time', () => {
      const [row] = buildRows(exercise({ loggingType: 'for_time', rule: { repMax: 12 }, sets: [set('working')] }), 'lb', LB_GEAR, 'mi');
      expect(readRow(row, {}, 'lb', 'mi').missing).toBe('durationS');
      expect(readRow(row, { durationS: '7:42' }, 'lb', 'mi')).toMatchObject({ tickable: true, entered: { durationS: 462 } });
    });

    it('says the line in the type\'s words: rounds for an AMRAP score', () => {
      expect(needLine('distance', 'weighted_distance')).toBe('Add distance to complete set');
      expect(needLine('reps', 'rounds')).toBe('Add rounds to complete set');
      expect(needLine('durationS', 'for_time')).toBe('Add time to complete set');
      expect(needLine('reps', 'weighted')).toBe('Add reps to complete set');
      expect(needLine('weight', 'weighted_distance')).toBe('Add weight to complete set');
    });
  });

  it('the extra reps read as whole numbers, 0 included, and patch their own field', () => {
    expect(parseField('extraReps', '0')).toEqual({ valid: true, value: 0 });
    expect(parseField('extraReps', '4.5')).toEqual({ valid: false, value: null });
    expect(fieldPatch('extraReps', 4, 'lb', 'mi')).toEqual({ extraReps: 4 });
    expect(fieldPatch('extraReps', null, 'lb', 'mi')).toEqual({ extraReps: null });
  });

  it("shows the stored score, else last time's as the hint", () => {
    const [stored] = buildRows(exercise({ loggingType: 'rounds', rule: null, sets: [set('working', { reps: 6, extraReps: 4 })] }), 'lb', LB_GEAR);
    expect(valueText(stored, 'reps', 'lb', 'mi')).toBe('6');
    expect(valueText(stored, 'extraReps', 'lb', 'mi')).toBe('4');
    const [hinted] = buildRows(
      exercise({ loggingType: 'rounds', rule: null, sets: [set('working')], previous: [prev(0, 'working', null, 5, { extraReps: 9 })] }),
      'lb',
      LB_GEAR,
    );
    expect(hintText(hinted, 'reps')).toBe('5');
    expect(hintText(hinted, 'extraReps')).toBe('9');
    expect(hinted.previous).toBe('5 + 9');
  });

  it('a ticked score must keep its rounds, a ticked carry its distance', () => {
    expect(isComplete('rounds', { weight: null, reps: 6, durationS: null, distance: null })).toBe(true);
    expect(isComplete('rounds', { weight: null, reps: null, durationS: null, distance: null, extraReps: 4 })).toBe(false);
    expect(isComplete('weighted_distance', { weight: 315, reps: null, durationS: null, distance: null })).toBe(false);
    expect(isComplete('weighted_distance', { weight: 315, reps: null, durationS: null, distance: 50 })).toBe(true);
  });

  describe('VoiceOver labels name the set first, then the field and its unit', () => {
    it('says "Set 1 distance, feet" and the other fields of the new types', () => {
      expect(fieldVoiceLabel('distance', 'weighted_distance', '1', 'LB', 'lb', 'ft')).toBe('Set 1 distance, feet');
      expect(fieldVoiceLabel('distance', 'weighted_distance', '2', 'DIST', 'lb', 'yd')).toBe('Set 2 distance, yards');
      expect(fieldVoiceLabel('distance', 'weighted_distance', '1', 'DIST', 'lb', 'm')).toBe('Set 1 distance, metres');
      expect(fieldVoiceLabel('weight', 'weighted_distance', '1', 'LB', 'lb', 'ft')).toBe('Set 1 weight, pounds');
      expect(fieldVoiceLabel('weight', 'weighted_distance', '1', 'KG', 'kg', 'ft')).toBe('Set 1 weight, kilograms');
      expect(fieldVoiceLabel('durationS', 'weighted_distance', 'W', 'TIME', 'lb', 'ft')).toBe('Warmup time');
      expect(fieldVoiceLabel('reps', 'rounds', '1', 'ROUNDS', 'lb', 'mi')).toBe('Set 1 rounds');
      expect(fieldVoiceLabel('extraReps', 'rounds', '1', '+REPS', 'lb', 'mi')).toBe('Set 1 extra reps');
      expect(fieldVoiceLabel('durationS', 'for_time', '1', 'TIME', 'lb', 'mi')).toBe('Set 1 time');
      expect(fieldVoiceLabel('rpe', 'for_time', '1', 'RPE', 'lb', 'mi')).toBe('Set 1 RPE');
    });

    it('keeps the labels the other types have always had', () => {
      expect(fieldVoiceLabel('weight', 'weighted', '1', 'LB', 'lb', 'mi')).toBe('LB, set 1');
      expect(fieldVoiceLabel('distance', 'distance_time', '1', 'DIST', 'lb', 'mi')).toBe('DIST, set 1');
    });
  });
});
