import { liftMetric, liftPoints, liftRecords, sessionText, type LiftSession, type LiftSet } from './liftStats';
import type { Outcome } from './progression';
import type { ExerciseMark, SetType, WeightUnit } from './types';

/** A done working set: `weight` (in `unit`, lb by default) × `reps`. */
const w = (weight: number | null, reps: number, unit: WeightUnit = 'lb', setType: SetType = 'working'): LiftSet => ({
  setType,
  done: true,
  weight,
  weightUnit: weight === null ? null : unit,
  reps,
  durationS: null,
  distance: null,
  distanceUnit: null,
});
/** A done hold of `durationS` seconds, with an optional load in lb. */
const hold = (durationS: number, weight: number | null = null, setType: SetType = 'working'): LiftSet => ({
  setType,
  done: true,
  weight,
  weightUnit: weight === null ? null : 'lb',
  reps: null,
  durationS,
  distance: null,
  distanceUnit: null,
});
const run = (distance: number, unit: 'km' | 'mi' | 'm', durationS: number): LiftSet => ({
  setType: 'working',
  done: true,
  weight: null,
  weightUnit: null,
  reps: null,
  durationS,
  distance,
  distanceUnit: unit,
});

let seq = 0;
function sess(
  localDate: string,
  sets: LiftSet[],
  o: { mark?: ExerciseMark; outcome?: Outcome; ww?: number | null; wu?: WeightUnit; rule?: boolean; inc?: number } = {},
): LiftSession {
  seq += 1;
  const ww = o.ww === undefined ? null : o.ww;
  return {
    workoutId: `w${seq}`,
    localDate,
    startedAt: seq,
    mark: o.mark ?? null,
    hasRule: o.rule ?? true,
    ruleIncrement: (o.rule ?? true) ? (o.inc ?? 5) : null,
    outcome: o.outcome ?? 'held',
    workingWeight: ww,
    workingUnit: ww === null ? null : (o.wu ?? 'lb'),
    sets,
  };
}

describe('liftMetric (R173)', () => {
  const loaded = [sess('2026-10-01', [w(25, 8)], { ww: 25 })];
  const unloaded = [sess('2026-10-01', [w(null, 8)], { ww: 0 }), sess('2026-10-03', [w(null, 9)])];

  it('charts the working weight for weighted, assisted, weight and time, and loaded bodyweight plus', () => {
    expect(liftMetric('weighted', loaded)).toBe('working_weight');
    expect(liftMetric('assisted', loaded)).toBe('working_weight');
    expect(liftMetric('weighted_time', loaded)).toBe('working_weight');
    expect(liftMetric('bodyweight_plus', [...unloaded, ...loaded])).toBe('working_weight');
  });

  it('charts the most reps for bodyweight plus never loaded, the longest hold for timed, nothing for distance', () => {
    expect(liftMetric('bodyweight_plus', unloaded)).toBe('best_reps');
    expect(liftMetric('bodyweight_plus', [])).toBe('best_reps');
    // Only a loaded warmup, or a working weight with no loaded set: never loaded.
    expect(liftMetric('bodyweight_plus', [sess('2026-10-01', [w(25, 5, 'lb', 'warmup'), w(null, 8)], { ww: 25 })])).toBe('best_reps');
    expect(liftMetric('timed', loaded)).toBe('longest_hold');
    expect(liftMetric('distance_time', loaded)).toBe('none');
  });
});

describe('liftPoints', () => {
  it('converts the working weight to the display unit, rounded to 0.1, and skips sessions with none', () => {
    const sessions = [
      sess('2026-10-01', [w(135, 5)], { ww: 135, outcome: 'raised' }),
      sess('2026-10-03', [w(60, 5, 'kg')], { ww: 60, wu: 'kg', outcome: 'raised' }),
      sess('2026-10-05', [w(null, 5)], { ww: null, outcome: 'no_sets' }),
    ];
    expect(liftPoints('weighted', sessions, 'kg')).toEqual([
      { localDate: '2026-10-01', value: 61.2, hollow: false, label: null, workoutId: sessions[0].workoutId },
      { localDate: '2026-10-03', value: 60, hollow: false, label: null, workoutId: sessions[1].workoutId },
    ]);
  });

  it('a marked session is hollow and carries its reason', () => {
    const sessions = [sess('2026-10-01', [w(135, 5)], { ww: 135, mark: 'rough_sleep', outcome: 'held_marked' })];
    expect(liftPoints('weighted', sessions, 'lb')).toEqual([
      { localDate: '2026-10-01', value: 135, hollow: true, label: 'Rough sleep', workoutId: sessions[0].workoutId },
    ]);
  });

  it('a stalled session is labelled "Stall"; a marked one between keeps its own label', () => {
    const sessions = [
      sess('2026-10-01', [w(135, 5)], { ww: 135 }),
      sess('2026-10-03', [w(135, 5)], { ww: 135 }),
      sess('2026-10-05', [w(135, 4)], { ww: 135, mark: 'sick', outcome: 'held_marked' }),
      sess('2026-10-07', [w(135, 5)], { ww: 135 }),
    ];
    expect(liftPoints('weighted', sessions, 'lb').map((p) => [p.hollow, p.label])).toEqual([
      [false, null],
      [false, null],
      [true, 'Sick'],
      [false, 'Stall'],
    ]);
  });

  it('a rule with an increment of 0 never stalls (R190)', () => {
    const sessions = [1, 3, 5].map((d) => sess(`2026-10-0${d}`, [w(135, 8)], { ww: 135, inc: 0 }));
    expect(liftPoints('weighted', sessions, 'lb').map((p) => p.label)).toEqual([null, null, null]);
  });

  it('charts the most reps of a done non-warmup set for bodyweight plus never loaded, with no stall', () => {
    const sessions = [
      sess('2026-10-01', [w(null, 20, 'lb', 'warmup'), w(null, 8), w(null, 10)], { ww: 0 }),
      sess('2026-10-03', [w(null, 10)], { ww: 0 }),
      sess('2026-10-05', [w(null, 11)], { ww: 0 }),
    ];
    expect(liftPoints('bodyweight_plus', sessions, 'lb').map((p) => [p.value, p.label])).toEqual([
      [10, null],
      [10, null],
      [11, null],
    ]);
  });

  it('charts the longest done non-warmup hold for timed', () => {
    const sessions = [sess('2026-10-01', [hold(90, null, 'warmup'), hold(45), hold(60)], { rule: false, outcome: 'no_rule' })];
    expect(liftPoints('timed', sessions, 'lb').map((p) => p.value)).toEqual([60]);
  });

  it('charts nothing for distance and time', () => {
    expect(liftPoints('distance_time', [sess('2026-10-01', [run(5, 'km', 1800)])], 'lb')).toEqual([]);
  });
});

describe('sessionText', () => {
  it('joins the sets as the Previous column reads them', () => {
    const s = sess('2026-10-01', [w(185, 5), w(185, 5), w(175, 8)], { ww: 175 });
    expect(sessionText('weighted', s, 'lb')).toBe('185 × 5, 185 × 5, 175 × 8');
    expect(sessionText('weighted', sess('2026-10-01', [w(84, 12, 'kg')]), 'lb')).toBe('84 kg × 12');
    expect(sessionText('bodyweight_plus', sess('2026-10-01', [w(null, 8), w(25, 6)]), 'lb')).toBe('BW × 8, +25 × 6');
    expect(sessionText('timed', sess('2026-10-01', [hold(40), hold(90)]), 'lb')).toBe('40s, 1:30');
  });

  it('leaves warmups out', () => {
    expect(sessionText('weighted', sess('2026-10-01', [w(95, 10, 'lb', 'warmup'), w(185, 5)]), 'lb')).toBe('185 × 5');
  });
});

describe('liftRecords (R174)', () => {
  it('weighted: heaviest and best estimated 1RM in the unit logged, each with its date and workout', () => {
    const a = sess('2026-09-01', [w(185, 5), w(175, 8, 'lb', 'warmup')]);
    const b = sess('2026-09-08', [w(100, 1, 'kg'), w(180, 8)]);
    expect(liftRecords('weighted', [a, b])).toEqual([
      { kind: 'heaviest', title: 'Heaviest', value: '100 kg × 1', localDate: '2026-09-08', workoutId: b.workoutId },
      // 180 × (1 + 8/30) = 228 lb (103.4 kg) beats 100 kg and 185 × 5 (216.8 lb)
      { kind: 'e1rm', title: 'Best estimated 1RM', value: '228 lb', localDate: '2026-09-08', workoutId: b.workoutId },
    ]);
  });

  it('the earliest set wins a tie; the same load with more reps is heavier', () => {
    const a = sess('2026-09-01', [w(185, 5)]);
    const b = sess('2026-09-08', [w(185, 5)]);
    expect(liftRecords('weighted', [a, b]).map((r) => [r.kind, r.value, r.localDate])).toEqual([
      ['heaviest', '185 lb × 5', '2026-09-01'],
      ['e1rm', '216 lb', '2026-09-01'],
    ]);
    const c = sess('2026-09-15', [w(185, 6)]);
    expect(liftRecords('weighted', [a, b, c])[0]).toMatchObject({ value: '185 lb × 6', localDate: '2026-09-15' });
  });

  it('ignores sets that are not done, warmups and sets with no reps', () => {
    const notDone = { ...w(300, 5), done: false };
    const a = sess('2026-09-01', [notDone, w(400, 5, 'lb', 'warmup'), w(135, 5)]);
    expect(liftRecords('weighted', [a]).map((r) => r.value)).toEqual(['135 lb × 5', '158 lb']);
    expect(liftRecords('weighted', [])).toEqual([]);
  });

  it('bodyweight plus: added weight reads with a plus, no load reads Bodyweight and has no 1RM', () => {
    const a = sess('2026-09-01', [w(null, 15)]);
    const b = sess('2026-09-08', [w(25, 8)]);
    expect(liftRecords('bodyweight_plus', [a, b]).map((r) => [r.title, r.value, r.localDate])).toEqual([
      ['Heaviest', '+25 lb × 8', '2026-09-08'],
      ['Best estimated 1RM', '+32 lb', '2026-09-08'],
    ]);
  });

  it('bodyweight plus never loaded: Most reps instead of Heaviest and 1RM', () => {
    const a = sess('2026-09-01', [w(null, 15), w(0, 12)]);
    const b = sess('2026-09-08', [w(null, 15)]);
    expect(liftRecords('bodyweight_plus', [a, b])).toEqual([
      { kind: 'most_reps', title: 'Most reps', value: '15', localDate: '2026-09-01', workoutId: a.workoutId },
    ]);
  });

  it('weight and time: Heaviest with the hold, and Longest hold', () => {
    const a = sess('2026-09-01', [hold(40, 70), hold(90, 50), hold(120, 0)]);
    expect(liftRecords('weighted_time', [a]).map((r) => [r.kind, r.title, r.value])).toEqual([
      ['heaviest', 'Heaviest', '70 lb × 40s'],
      ['longest_hold', 'Longest hold', '2:00'],
    ]);
    // Only 0-weight holds: no Heaviest.
    expect(liftRecords('weighted_time', [sess('2026-09-01', [hold(60, 0)])]).map((r) => r.kind)).toEqual(['longest_hold']);
  });

  it('timed: Longest hold', () => {
    const a = sess('2026-09-01', [hold(60)]);
    const b = sess('2026-09-08', [hold(90)]);
    const c = sess('2026-09-15', [hold(90)]);
    expect(liftRecords('timed', [a, b, c])).toEqual([
      { kind: 'longest_hold', title: 'Longest hold', value: '1:30', localDate: '2026-09-08', workoutId: b.workoutId },
    ]);
  });

  it('assisted: Least assistance, the lowest assistance with reps', () => {
    const a = sess('2026-09-01', [w(40, 8), w(20, 0)]);
    const b = sess('2026-09-08', [w(20, 8), w(8, 6, 'kg')]);
    expect(liftRecords('assisted', [a, b])).toEqual([
      { kind: 'least_assistance', title: 'Least assistance', value: '−8 kg × 6', localDate: '2026-09-08', workoutId: b.workoutId },
    ]);
  });

  it('assisted: no assistance reads Bodyweight', () => {
    const a = sess('2026-09-01', [w(20, 8), w(0, 8)]);
    expect(liftRecords('assisted', [a]).map((r) => r.value)).toEqual(['Bodyweight × 8']);
  });

  it('distance and time: Longest distance and Longest time', () => {
    const a = sess('2026-09-01', [run(5, 'km', 1930)]);
    const b = sess('2026-09-08', [run(4, 'mi', 1800)]);
    expect(liftRecords('distance_time', [a, b]).map((r) => [r.kind, r.title, r.value, r.localDate])).toEqual([
      ['longest_distance', 'Longest distance', '4 mi', '2026-09-08'],
      ['longest_time', 'Longest time', '32:10', '2026-09-01'],
    ]);
  });
});
