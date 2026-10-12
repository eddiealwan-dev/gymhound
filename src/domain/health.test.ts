import {
  asleepMs,
  healthWeightLine,
  healthWeightOffer,
  latestRestingHr,
  RHR_BASELINE_DAYS,
  RHR_MIN_DAYS,
  RHR_RISE_BPM,
  roughSleepOffer,
  restingHrBaseline,
  SHORT_SLEEP_MS,
  sleepOfferLine,
  sleepWindow,
  toHealthWorkout,
} from './health';

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const spaced = (text: string) => text.replace(/\s/g, ' '); // newer ICU puts a narrow no-break space before AM/PM

describe('constants (§17.1, R210)', () => {
  it('are the owner-confirmed thresholds', () => {
    expect(SHORT_SLEEP_MS).toBe(6 * HOUR);
    expect(RHR_RISE_BPM).toBe(10);
    expect(RHR_BASELINE_DAYS).toBe(28);
    expect(RHR_MIN_DAYS).toBe(7);
  });
});

describe('sleepWindow (R210)', () => {
  it('runs from 18:00 the day before to the start of a 07:00 workout', () => {
    expect(sleepWindow('2026-10-11', at(2026, 10, 11, 7))).toEqual({ start: at(2026, 10, 10, 18), end: at(2026, 10, 11, 7) });
  });

  it('runs from 18:00 the day before to the start of a 19:00 workout', () => {
    expect(sleepWindow('2026-10-11', at(2026, 10, 11, 19))).toEqual({ start: at(2026, 10, 10, 18), end: at(2026, 10, 11, 19) });
  });

  it('starts at local 18:00 across a DST change night (spring forward and fall back)', () => {
    // US DST: 2026-03-08 springs forward, 2026-11-01 falls back; local construction keeps 18:00 local either way.
    expect(sleepWindow('2026-03-08', at(2026, 3, 8, 7))).toEqual({ start: at(2026, 3, 7, 18), end: at(2026, 3, 8, 7) });
    expect(sleepWindow('2026-11-01', at(2026, 11, 1, 7))).toEqual({ start: at(2026, 10, 31, 18), end: at(2026, 11, 1, 7) });
  });

  it('crosses a month and a year end', () => {
    expect(sleepWindow('2027-01-01', at(2027, 1, 1, 8)).start).toBe(at(2026, 12, 31, 18));
  });

  it('never ends before it starts', () => {
    const w = sleepWindow('2026-10-11', at(2026, 10, 10, 12));
    expect(w.end).toBeGreaterThanOrEqual(w.start);
  });
});

describe('asleepMs (R210)', () => {
  const window = { start: at(2026, 10, 10, 18), end: at(2026, 10, 11, 7) };

  it('is 0 with no intervals', () => {
    expect(asleepMs([], window)).toBe(0);
  });

  it('sums separate intervals', () => {
    expect(
      asleepMs(
        [
          { start: at(2026, 10, 10, 23), end: at(2026, 10, 11, 2) },
          { start: at(2026, 10, 11, 3), end: at(2026, 10, 11, 5) },
        ],
        window,
      ),
    ).toBe(5 * HOUR);
  });

  it('counts overlapping watch and phone intervals once', () => {
    const watch = [{ start: at(2026, 10, 10, 23), end: at(2026, 10, 11, 5) }];
    const phone = [
      { start: at(2026, 10, 10, 22, 30), end: at(2026, 10, 11, 1) },
      { start: at(2026, 10, 11, 4), end: at(2026, 10, 11, 6) },
    ];
    expect(asleepMs([...watch, ...phone], window)).toBe(7.5 * HOUR);
  });

  it('counts a duplicate interval once and an interval inside another not at all', () => {
    const night = { start: at(2026, 10, 10, 23), end: at(2026, 10, 11, 5) };
    expect(asleepMs([night, { ...night }, { start: at(2026, 10, 11, 1), end: at(2026, 10, 11, 2) }], window)).toBe(6 * HOUR);
  });

  it('counts sleep across midnight', () => {
    expect(asleepMs([{ start: at(2026, 10, 10, 22), end: at(2026, 10, 11, 6) }], window)).toBe(8 * HOUR);
  });

  it('clips intervals that cross the window edges and drops those outside it', () => {
    expect(
      asleepMs(
        [
          { start: at(2026, 10, 10, 17), end: at(2026, 10, 10, 19) }, // 1 h inside
          { start: at(2026, 10, 11, 6), end: at(2026, 10, 11, 9) }, // 1 h inside
          { start: at(2026, 10, 10, 13), end: at(2026, 10, 10, 15) }, // outside
          { start: at(2026, 10, 11, 8), end: at(2026, 10, 11, 9) }, // outside
        ],
        window,
      ),
    ).toBe(2 * HOUR);
  });

  it('ignores an interval that ends before it starts', () => {
    expect(asleepMs([{ start: at(2026, 10, 11, 5), end: at(2026, 10, 11, 1) }], window)).toBe(0);
  });

  it('measures a DST night in real elapsed time', () => {
    const w = sleepWindow('2026-03-08', at(2026, 3, 8, 7));
    const night = { start: at(2026, 3, 7, 23), end: at(2026, 3, 8, 6) };
    expect(asleepMs([night], w)).toBe(night.end - night.start);
  });
});

describe('latestRestingHr', () => {
  const start = at(2026, 10, 11, 7);

  it('is the newest sample in the 24 h before the start', () => {
    expect(
      latestRestingHr(
        [
          { at: start - 3 * HOUR, value: 58 },
          { at: start - 1 * HOUR, value: 64 },
          { at: start - 10 * HOUR, value: 55 },
        ],
        start,
      ),
    ).toBe(64);
  });

  it('ignores samples after the start and older than 24 h', () => {
    expect(latestRestingHr([{ at: start + MIN, value: 70 }, { at: start - 25 * HOUR, value: 60 }], start)).toBeNull();
  });

  it('is null with no samples', () => {
    expect(latestRestingHr([], start)).toBeNull();
  });
});

describe('restingHrBaseline', () => {
  const day = (localDay: number, h: number, value: number) => ({ at: at(2026, 10, localDay, h), value });

  it('is the mean of per-day means over the days before the workout date', () => {
    const samples = [
      day(1, 6, 50),
      day(1, 20, 60), // day mean 55
      day(2, 6, 56),
      day(3, 6, 56),
      day(4, 6, 56),
      day(5, 6, 56),
      day(6, 6, 56),
      day(7, 6, 55),
    ];
    // (55 + 56*5 + 55) / 7 = 390 / 7
    expect(restingHrBaseline(samples, '2026-10-11')).toBeCloseTo(390 / 7, 10);
  });

  it('is null with fewer than 7 days of samples', () => {
    const samples = [1, 2, 3, 4, 5, 6].map((d) => day(d, 6, 55));
    expect(restingHrBaseline(samples, '2026-10-11')).toBeNull();
  });

  it('leaves out the workout day itself and days older than 28 days', () => {
    const samples = [
      ...[4, 5, 6, 7, 8, 9, 10].map((d) => day(d, 6, 60)),
      day(11, 5, 90), // the workout day
      { at: at(2026, 9, 12, 6), value: 30 }, // 29 days before 2026-10-11
    ];
    expect(restingHrBaseline(samples, '2026-10-11')).toBe(60);
  });

  it('takes the 28th day before', () => {
    const samples = [...[4, 5, 6, 7, 8, 9].map((d) => day(d, 6, 60)), { at: at(2026, 9, 13, 6), value: 53 }];
    expect(restingHrBaseline(samples, '2026-10-11')).toBe(59);
  });
});

describe('roughSleepOffer (§17.1, R210)', () => {
  const none = { asleepMs: null, latestBpm: null, baselineBpm: null };

  it('offers short sleep under 6 h', () => {
    expect(roughSleepOffer({ ...none, asleepMs: 5 * HOUR + 59 * MIN })).toEqual({ reason: 'short_sleep', asleepMs: 5 * HOUR + 59 * MIN });
  });

  it('offers nothing at 6 h', () => {
    expect(roughSleepOffer({ ...none, asleepMs: 6 * HOUR })).toBeNull();
  });

  it('offers nothing with no sleep data', () => {
    expect(roughSleepOffer(none)).toBeNull();
  });

  it('offers on a resting heart rate 10 above the baseline', () => {
    expect(roughSleepOffer({ ...none, latestBpm: 65, baselineBpm: 55 })).toEqual({ reason: 'heart_rate', riseBpm: 10 });
  });

  it('offers nothing 9 above', () => {
    expect(roughSleepOffer({ ...none, latestBpm: 64, baselineBpm: 55 })).toBeNull();
  });

  it('offers nothing 9.6 above, and rounds the rise it shows', () => {
    expect(roughSleepOffer({ ...none, latestBpm: 64.6, baselineBpm: 55 })).toBeNull();
    expect(roughSleepOffer({ ...none, latestBpm: 66.6, baselineBpm: 55 })).toEqual({ reason: 'heart_rate', riseBpm: 12 });
  });

  it('offers nothing without a baseline (fewer than 7 days) or a latest reading', () => {
    expect(roughSleepOffer({ ...none, latestBpm: 80, baselineBpm: null })).toBeNull();
    expect(roughSleepOffer({ ...none, latestBpm: null, baselineBpm: 55 })).toBeNull();
  });

  it('gives one short-sleep offer when both conditions hold', () => {
    expect(roughSleepOffer({ asleepMs: 4 * HOUR, latestBpm: 70, baselineBpm: 55 })).toEqual({ reason: 'short_sleep', asleepMs: 4 * HOUR });
  });

  it('offers on heart rate when sleep was long enough', () => {
    expect(roughSleepOffer({ asleepMs: 8 * HOUR, latestBpm: 70, baselineBpm: 55 })).toEqual({ reason: 'heart_rate', riseBpm: 15 });
  });
});

describe('sleepOfferLine', () => {
  it('says hours and minutes', () => {
    expect(sleepOfferLine({ reason: 'short_sleep', asleepMs: 5 * HOUR + 10 * MIN })).toBe('You slept 5 h 10 min last night. Mark this session Rough sleep?');
  });

  it('says whole hours alone', () => {
    expect(sleepOfferLine({ reason: 'short_sleep', asleepMs: 5 * HOUR })).toBe('You slept 5 h last night. Mark this session Rough sleep?');
  });

  it('says minutes alone under an hour', () => {
    expect(sleepOfferLine({ reason: 'short_sleep', asleepMs: 45 * MIN })).toBe('You slept 45 min last night. Mark this session Rough sleep?');
  });

  it('counts whole minutes down, so under 6 h never reads 6 h', () => {
    expect(sleepOfferLine({ reason: 'short_sleep', asleepMs: 6 * HOUR - 1 })).toBe('You slept 5 h 59 min last night. Mark this session Rough sleep?');
  });

  it('says the heart-rate rise', () => {
    expect(sleepOfferLine({ reason: 'heart_rate', riseBpm: 11 })).toBe('Your resting heart rate is 11 above your usual. Mark this session Rough sleep?');
  });
});

describe('healthWeightOffer (R211)', () => {
  const reading = { at: at(2026, 10, 11, 7, 2), value: 82.74 };

  it('offers a reading from today newer than the app, in kg to 0.1', () => {
    expect(healthWeightOffer({ reading, latestAppAt: at(2026, 10, 10, 7), today: '2026-10-11', unit: 'kg' })).toEqual({ value: 82.7, unit: 'kg', at: reading.at });
  });

  it('converts to lb, to 0.1', () => {
    // 82.74 kg = 182.408... lb
    expect(healthWeightOffer({ reading, latestAppAt: null, today: '2026-10-11', unit: 'lb' })).toEqual({ value: 182.4, unit: 'lb', at: reading.at });
  });

  it('offers nothing for a reading from yesterday', () => {
    expect(healthWeightOffer({ reading: { ...reading, at: at(2026, 10, 10, 22) }, latestAppAt: null, today: '2026-10-11', unit: 'kg' })).toBeNull();
  });

  it('offers nothing when the app already has a newer or same-time entry', () => {
    expect(healthWeightOffer({ reading, latestAppAt: at(2026, 10, 11, 8), today: '2026-10-11', unit: 'kg' })).toBeNull();
    expect(healthWeightOffer({ reading, latestAppAt: reading.at, today: '2026-10-11', unit: 'kg' })).toBeNull();
  });

  it('offers nothing with no reading or a non-positive one', () => {
    expect(healthWeightOffer({ reading: null, latestAppAt: null, today: '2026-10-11', unit: 'kg' })).toBeNull();
    expect(healthWeightOffer({ reading: { ...reading, value: 0 }, latestAppAt: null, today: '2026-10-11', unit: 'kg' })).toBeNull();
  });
});

describe('healthWeightLine', () => {
  const when = at(2026, 10, 11, 7, 2);

  it('names Apple Health and shows the time in the locale', () => {
    expect(spaced(healthWeightLine('apple', { value: 182.4, unit: 'lb', at: when }, 'en-US'))).toBe('Apple Health: 182.4 lb at 7:02 AM.');
  });

  it('names Health Connect, 24-hour in en-GB', () => {
    expect(spaced(healthWeightLine('health_connect', { value: 82.7, unit: 'kg', at: when }, 'en-GB'))).toMatch(/^Health Connect: 82\.7 kg at 0?7:02\.$/);
  });

  it('drops a trailing .0', () => {
    expect(spaced(healthWeightLine('apple', { value: 82, unit: 'kg', at: when }, 'en-US'))).toBe('Apple Health: 82 kg at 7:02 AM.');
  });
});

describe('toHealthWorkout (R206, open question 11)', () => {
  it('keeps the id, name and times', () => {
    const w = { id: 'w1', name: 'Push A', startedAt: at(2026, 10, 11, 7), finishedAt: at(2026, 10, 11, 8) };
    expect(toHealthWorkout(w)).toEqual(w);
  });

  it('ends a 10 s workout 60 s after its start', () => {
    const start = at(2026, 10, 11, 7);
    expect(toHealthWorkout({ id: 'w2', name: 'Test', startedAt: start, finishedAt: start + 10_000 })).toEqual({ id: 'w2', name: 'Test', startedAt: start, finishedAt: start + 60_000 });
  });

  it('writes a workout longer than a day as it is', () => {
    const start = at(2026, 10, 10, 7);
    expect(toHealthWorkout({ id: 'w3', name: 'Long', startedAt: start, finishedAt: start + 30 * HOUR }).finishedAt).toBe(start + 30 * HOUR);
  });
});
