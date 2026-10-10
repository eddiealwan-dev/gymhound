import type { PrevSet } from './setEntry';
import {
  buildRows,
  fieldPatch,
  hintText,
  isComplete,
  parseField,
  readRow,
  tableColumns,
  valueText,
  type ExerciseInput,
  type InputKey,
  type SetInput,
} from './setTable';
import type { LoggingType, SetType } from './types';

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

const exercise = (extra: Partial<ExerciseInput> = {}): ExerciseInput => ({
  loggingType: 'weighted',
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
    const rows = buildRows(exercise(), 'lb');
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
    );
    expect(rows.map((r) => r.label)).toEqual(['W', '1', '2', '3']);
    expect(rows.map((r) => r.previous)).toEqual(['45 × 10', '135 × 8', '140 × 7', '']);
  });

  it('leaves a warmup row empty when last time had no warmup', () => {
    const rows = buildRows(
      exercise({ sets: [set('warmup'), set('working')], previous: [prev(0, 'working', 135, 8)] }),
      'lb',
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
    );
    expect(rows.map((r) => r.previous)).toEqual(['135 × 8', '145 × 6', '']);
  });

  it('shows the unit only when last time was in the other unit', () => {
    const rows = buildRows(
      exercise({ sets: [set('working')], previous: [prev(0, 'working', 84, 12, { weightUnit: 'kg' })] }),
      'lb',
    );
    expect(rows[0].previous).toBe('84 kg × 12');
  });

  it('follows the logging type: timed, weighted time, distance and time, bodyweight plus, assisted', () => {
    const one = (loggingType: LoggingType, p: PrevSet) => buildRows(exercise({ loggingType, sets: [set('working')], previous: [p] }), 'lb')[0].previous;
    expect(one('timed', prev(0, 'working', null, null, { durationS: 40 }))).toBe('40s');
    expect(one('timed', prev(0, 'working', null, null, { durationS: 90 }))).toBe('1:30');
    expect(one('weighted_time', prev(0, 'working', 70, null, { durationS: 40 }))).toBe('70 lb × 40s');
    expect(one('distance_time', prev(0, 'working', null, null, { distance: 2, distanceUnit: 'km', durationS: 750 }))).toBe('2 km · 12:30');
    expect(one('bodyweight_plus', prev(0, 'working', 25, 8))).toBe('+25 × 8');
    expect(one('assisted', prev(0, 'working', 40, 8))).toBe('−40 × 8');
  });

  it('follows the row when its type changes', () => {
    const previous = [prev(0, 'warmup', 45, 10), prev(1, 'working', 135, 8)];
    const before = buildRows(exercise({ sets: [set('working'), set('working')], previous }), 'lb');
    const after = buildRows(exercise({ sets: [set('warmup'), set('working')], previous }), 'lb');
    expect(before.map((r) => r.previous)).toEqual(['135 × 8', '']);
    expect(after.map((r) => r.previous)).toEqual(['45 × 10', '135 × 8']);
  });
});

describe('buildRows: the target and the placeholders', () => {
  it('uses the override over the planned weight, in the entry unit', () => {
    const rows = buildRows(
      exercise({ plannedWeight: 130, plannedUnit: 'lb', overrideWeight: 135, overrideUnit: 'lb' }),
      'lb',
    );
    expect(rows.map((r) => r.target)).toEqual([135, 135, 135, 135]);
  });

  it('converts a target logged in the other unit into the entry unit, to 2 decimals', () => {
    expect(buildRows(exercise({ plannedWeight: 100, plannedUnit: 'kg' }), 'lb')[0].target).toBe(220.46);
    expect(buildRows(exercise({ plannedWeight: 225, plannedUnit: 'lb' }), 'kg')[0].target).toBe(102.06);
  });

  it('treats a target with no unit as already in the entry unit', () => {
    expect(buildRows(exercise({ plannedWeight: 100, plannedUnit: null }), 'kg')[0].target).toBe(100);
  });

  it('has no target when the exercise has none', () => {
    expect(buildRows(exercise(), 'lb').map((r) => r.target)).toEqual([null, null, null, null]);
  });

  it('only working sets start from the target; a warmup does not', () => {
    const rows = buildRows(
      exercise({ sets: [set('warmup'), set('working'), set('drop'), set('failure')], plannedWeight: 225, plannedUnit: 'lb' }),
      'lb',
    );
    expect(rows.map((r) => r.target)).toEqual([null, 225, null, null]);
  });

  it('has no target for the types that carry no load', () => {
    expect(buildRows(exercise({ loggingType: 'timed', plannedWeight: 50, plannedUnit: 'lb' }), 'lb')[0].target).toBeNull();
    expect(buildRows(exercise({ loggingType: 'distance_time', plannedWeight: 50, plannedUnit: 'lb' }), 'lb')[0].target).toBeNull();
    expect(buildRows(exercise({ loggingType: 'weighted_time', plannedWeight: 50, plannedUnit: 'lb' }), 'lb')[0].target).toBe(50);
  });

  it('takes placeholders from the matched previous set, converted into the entry unit, else the rule', () => {
    const rows = buildRows(
      exercise({
        sets: [set('working'), set('working')],
        previous: [prev(0, 'working', 100, 6, { weightUnit: 'kg' })],
        rule: { repMax: 12 },
      }),
      'lb',
    );
    expect(rows[0].placeholders).toEqual({ weight: 220.46, reps: 6, durationS: null, distance: null });
    expect(rows[1].placeholders).toEqual({ weight: null, reps: 12, durationS: null, distance: null });
  });

  it('feeds the rule into the time placeholder for timed sets', () => {
    const rows = buildRows(exercise({ loggingType: 'timed', sets: [set('working')], rule: { repMax: 45 } }), 'lb');
    expect(rows[0].placeholders).toMatchObject({ reps: null, durationS: 45 });
  });
});

describe('valueText and hintText', () => {
  it('shows the target as the load until a weight is stored', () => {
    const [row] = buildRows(exercise({ sets: [set('working')], plannedWeight: 135, plannedUnit: 'lb' }), 'lb');
    expect(valueText(row, 'weight', 'lb')).toBe('135');
    const [stored] = buildRows(exercise({ sets: [set('working', { weight: 140, weightUnit: 'lb' })], plannedWeight: 135, plannedUnit: 'lb' }), 'lb');
    expect(valueText(stored, 'weight', 'lb')).toBe('140');
  });

  it('never shows an unsaved target on a done row (R29)', () => {
    // A done set with no stored weight (it was cleared after the tick) must not borrow today's target.
    const plan = { plannedWeight: 135, plannedUnit: 'lb' as const };
    const [done] = buildRows(exercise({ sets: [set('working', { done: true, reps: 8 })], ...plan }), 'lb');
    expect(valueText(done, 'weight', 'lb')).toBe('');
    const [open] = buildRows(exercise({ sets: [set('working', { reps: 8 })], ...plan }), 'lb');
    expect(valueText(open, 'weight', 'lb')).toBe('135');
    const [stored] = buildRows(exercise({ sets: [set('working', { done: true, weight: 140, weightUnit: 'lb', reps: 8 })], ...plan }), 'lb');
    expect(valueText(stored, 'weight', 'lb')).toBe('140');
  });

  it('is empty for a field with no value and no target', () => {
    const [row] = buildRows(exercise({ sets: [set('working')] }), 'lb');
    expect(valueText(row, 'weight', 'lb')).toBe('');
    expect(valueText(row, 'reps', 'lb')).toBe('');
    expect(valueText(row, 'durationS', 'lb')).toBe('');
    expect(valueText(row, 'distance', 'lb')).toBe('');
    expect(valueText(row, 'rpe', 'lb')).toBe('');
  });

  it('converts a stored weight logged in the other unit into the unit on the column', () => {
    const [row] = buildRows(exercise({ sets: [set('working', { weight: 100, weightUnit: 'kg' })] }), 'lb');
    expect(valueText(row, 'weight', 'lb')).toBe('220.46');
  });

  it('writes stored values in a form the parsers read back', () => {
    const [row] = buildRows(
      exercise({ sets: [set('working', { weight: 82.5, weightUnit: 'kg', reps: 8, durationS: 90, distance: 2.5, rpe: 8.5 })] }),
      'kg',
    );
    expect(valueText(row, 'weight', 'kg')).toBe('82.5');
    expect(valueText(row, 'reps', 'kg')).toBe('8');
    expect(valueText(row, 'durationS', 'kg')).toBe('1:30');
    expect(valueText(row, 'distance', 'kg')).toBe('2.5');
    expect(valueText(row, 'rpe', 'kg')).toBe('8.5');
    const [short] = buildRows(exercise({ sets: [set('working', { durationS: 40 })] }), 'kg');
    expect(valueText(short, 'durationS', 'kg')).toBe('40');
  });

  it('formats placeholders: reps as a number, time as "40s" or "1:30", and nothing when there is none', () => {
    const [row] = buildRows(
      exercise({ loggingType: 'weighted_time', sets: [set('working')], previous: [prev(0, 'working', 70, null, { durationS: 40 })] }),
      'lb',
    );
    expect(hintText(row, 'weight')).toBe('70');
    expect(hintText(row, 'durationS')).toBe('40s');
    expect(hintText(row, 'reps')).toBe('');
    expect(hintText(row, 'distance')).toBe('');
    expect(hintText(row, 'rpe')).toBe('');
    const [long] = buildRows(
      exercise({ loggingType: 'timed', sets: [set('working')], previous: [prev(0, 'working', null, null, { durationS: 90 })] }),
      'lb',
    );
    expect(hintText(long, 'durationS')).toBe('1:30');
    const [reps] = buildRows(exercise({ sets: [set('working')], rule: { repMax: 12 } }), 'lb');
    expect(hintText(reps, 'reps')).toBe('12');
  });
});

describe('readRow: what the row holds while it is being typed into', () => {
  const row = (extra: Partial<ExerciseInput> = {}, ...sets: SetInput[]) =>
    buildRows(exercise({ sets: sets.length ? sets : [set('working')], ...extra }), 'lb')[0];

  it('with nothing typed, reads the stored values; with no target, placeholder or value the row cannot tick', () => {
    const r = readRow(row({ rule: null }), {}, 'lb');
    expect(r.entered).toEqual({ weight: null, reps: null, durationS: null, distance: null });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(false);
  });

  it('can tick on the placeholders alone (spec 8.4: ticking with empty fields accepts them)', () => {
    const r = readRow(row({ previous: [prev(0, 'working', 135, 8)] }), {}, 'lb');
    expect(r.entered).toEqual({ weight: null, reps: null, durationS: null, distance: null });
    expect(r.tickable).toBe(true);
  });

  it('can tick on the target and the rule\'s reps', () => {
    expect(readRow(row({ plannedWeight: 135, plannedUnit: 'lb' }), {}, 'lb').tickable).toBe(true);
  });

  it('overlays what is typed on the stored values', () => {
    const r = readRow(row({}, set('working', { weight: 100, weightUnit: 'lb', reps: 5 })), { weight: '135', reps: '8' }, 'lb');
    expect(r.entered).toMatchObject({ weight: 135, reps: 8 });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(true);
  });

  it('reads stored weight in the other unit as the entry unit', () => {
    const r = readRow(row({}, set('working', { weight: 100, weightUnit: 'kg', reps: 5 })), {}, 'lb');
    expect(r.entered.weight).toBe(220.46);
  });

  it('treats a cleared input as no value, not as an error', () => {
    const r = readRow(row({ plannedWeight: 135, plannedUnit: 'lb' }, set('working', { weight: 100, weightUnit: 'lb', reps: 5 })), { weight: '', reps: '  ' }, 'lb');
    expect(r.entered).toMatchObject({ weight: null, reps: null });
    expect(r.invalid).toEqual([]);
    expect(r.tickable).toBe(true);
  });

  it('flags only non-blank text that does not parse, and then cannot tick', () => {
    const r = readRow(row({ previous: [prev(0, 'working', 135, 8)] }), { weight: 'abc', reps: '8.5', rpe: '' }, 'lb');
    expect(r.invalid).toEqual(['weight', 'reps']);
    expect(r.tickable).toBe(false);
  });

  it('reads RPE from the draft, else from the set', () => {
    expect(readRow(row({}, set('working', { rpe: 7 })), {}, 'lb').rpe).toBe(7);
    expect(readRow(row({}, set('working', { rpe: 7 })), { rpe: '8.5' }, 'lb').rpe).toBe(8.5);
    expect(readRow(row({}, set('working', { rpe: 7 })), { rpe: '' }, 'lb').rpe).toBeNull();
    expect(readRow(row(), { rpe: '11' }, 'lb').invalid).toEqual(['rpe']);
  });

  it('needs both fields for distance and time', () => {
    const r = (drafts: Record<string, string>) =>
      readRow(row({ loggingType: 'distance_time', rule: null }), drafts, 'lb');
    expect(r({ distance: '5' }).tickable).toBe(false);
    expect(r({ distance: '5', durationS: '25:00' }).tickable).toBe(true);
    expect(r({ distance: '5', durationS: '25:00' }).entered).toMatchObject({ distance: 5, durationS: 1500 });
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
