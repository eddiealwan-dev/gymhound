import type { PrHighlight } from './prs';
import { nameInSentence, pbCardModel, pbShareLabel, splitValue, streakText, weekCardModel, weekRange, type PbHistorySet, type WeekSet } from './shareCards';

const bench = (over: Partial<PrHighlight> = {}): PrHighlight => ({
  exerciseId: 'barbell-bench-press',
  name: 'Barbell bench press',
  loggingType: 'weighted',
  kind: 'heaviest',
  weight: 140,
  weightUnit: 'kg',
  reps: 5,
  durationS: null,
  localDate: '2026-10-11',
  ...over,
});

let n = 0;
const set = (workoutId: string, localDate: string, weight: number, reps: number, over: Partial<PbHistorySet> = {}): PbHistorySet => ({
  id: `s${n++}`,
  workoutId,
  setType: 'working',
  done: true,
  weight,
  weightUnit: 'kg',
  reps,
  durationS: null,
  localDate,
  ...over,
});

describe('the personal record card (§18.17)', () => {
  it('splits the figure from its unit for the big number, and keeps words whole', () => {
    expect(splitValue('185 lb × 5')).toEqual({ main: '185', rest: 'lb × 5' });
    expect(splitValue('1:30')).toEqual({ main: '1:30', rest: '' });
    expect(splitValue('bodyweight × 8')).toEqual({ main: 'bodyweight × 8', rest: '' });
  });

  it('says how far it beat the best before, and counts the sessions up to it (R445, R446)', () => {
    const history = [
      set('w1', '2026-09-02', 130, 5),
      set('w1', '2026-09-02', 135, 3, { setType: 'warmup' }),
      set('w2', '2026-09-20', 135, 5),
      set('w3', '2026-10-11', 140, 5),
      set('w4', '2026-10-15', 145, 5),
    ];
    const model = pbCardModel(bench(), 'w3', history, 'en-GB');
    expect(model.comparison).toBe('Up 5 kg from 135 kg on 20 Sept.');
    // w1, w2 and the personal record's own workout; a later workout (w4) is left out.
    expect(model.sessions).toBe(3);
    expect(model.value).toEqual({ main: '140', rest: 'kg × 5' });
  });

  it('has no comparison on a lift with nothing before it', () => {
    expect(pbCardModel(bench(), 'w1', [set('w1', '2026-10-11', 140, 5)], 'en-GB').comparison).toBeNull();
  });

  it('names the lift in a sentence for VoiceOver, keeping an abbreviation', () => {
    expect(nameInSentence('Barbell bench press')).toBe('barbell bench press');
    expect(nameInSentence('RDL')).toBe('RDL');
    expect(pbShareLabel(bench())).toMatch(/^Share your barbell bench press personal record as an image\. /);
  });
});

describe('the weekly summary card (§18.17)', () => {
  const ws = (workoutId: string, name: string, weight: number, reps: number): WeekSet => ({
    workoutId,
    exerciseId: name,
    name,
    loggingType: 'weighted',
    setType: 'working',
    done: true,
    weight,
    weightUnit: 'kg',
    reps,
  });
  const at = (date: string, h: number) => new Date(`${date}T${String(h).padStart(2, '0')}:00:00`).getTime();

  const input = {
    monday: '2026-10-12',
    today: '2026-10-15',
    unit: 'kg' as const,
    locale: 'en-GB',
    workouts: [
      { id: 'a', localDate: '2026-10-12', startedAt: at('2026-10-12', 18), finishedAt: at('2026-10-12', 19) },
      { id: 'b', localDate: '2026-10-14', startedAt: at('2026-10-14', 18), finishedAt: at('2026-10-14', 19) + 30 * 60_000 },
    ],
    sets: [ws('a', 'Squat', 100, 5), ws('a', 'Squat', 100, 5), ws('b', 'Bench', 80, 5), ws('b', 'Row', 60, 10)],
    prs: [] as PrHighlight[],
    prCount: 0,
    trainingDates: ['2026-10-12', '2026-10-14'],
  };

  it('counts the week: dots for the days trained, workouts, sets, volume and time', () => {
    const model = weekCardModel(input);
    expect(model.kicker).toBe('THIS WEEK');
    expect(model.days.map((d) => d.trained)).toEqual([true, false, true, false, false, false, false]);
    expect(model.workouts).toBe(2);
    expect(model.sets).toBe(4);
    // Squat 2 × 100 × 5, bench 80 × 5, row 60 × 10.
    expect(model.volume).toBe('2,000 kg');
    expect(model.time).toBe('2 h 30 min');
  });

  it('lists the top lifts by volume when the week set no personal record, and the PRs when it did (R450)', () => {
    expect(weekCardModel(input).list).toEqual({
      kind: 'top',
      rows: [
        { name: 'Squat', value: '1,000 kg' },
        { name: 'Row', value: '600 kg' },
        { name: 'Bench', value: '400 kg' },
      ],
    });
    const withPr = weekCardModel({ ...input, prs: [bench({ localDate: '2026-10-14' })], prCount: 1 });
    expect(withPr.list).toEqual({ kind: 'prs', count: 1, rows: [{ name: 'Barbell bench press', value: '140 kg × 5' }] });
  });

  it('names last week and an older week, with no streak on them', () => {
    expect(weekCardModel({ ...input, today: '2026-10-21' })).toMatchObject({ kicker: 'LAST WEEK', streak: 0 });
    expect(weekCardModel({ ...input, today: '2026-11-21' })).toMatchObject({ kicker: 'WEEK', streak: 0 });
  });

  it('writes the range and the streak in plain words', () => {
    expect(weekRange('2026-10-12', 'en-GB')).toBe('12 Oct – 18 Oct 2026');
    expect(streakText(1)).toBe('1-day streak');
    expect(streakText(12)).toBe('12-day streak');
  });
});
