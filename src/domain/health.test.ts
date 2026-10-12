import {
  healthWritesDue,
  lastNightWindow,
  MAX_HEALTH_WRITES_PER_PASS,
  newerHealthBodyweight,
  restingHeartRateRise,
  roughSleepOfferLine,
  roughSleepReason,
  sleepMinutes,
  toHealthWorkout,
  type HealthDueRow,
  type SleepSample,
} from './health';

/** Local time, so the tests read the same in any time zone. */
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('toHealthWorkout (§17.1)', () => {
  it('is one strength session with the start and end times and the workout name', () => {
    expect(toHealthWorkout({ id: 'w1', name: 'Push A', startedAt: at(12, 7), finishedAt: at(12, 8, 5) })).toEqual({
      workoutId: 'w1',
      title: 'Push A',
      start: at(12, 7),
      end: at(12, 8, 5),
    });
  });

  it('is nothing for a workout still in progress', () => {
    expect(toHealthWorkout({ id: 'w1', name: 'Workout', startedAt: 1, finishedAt: null })).toBeNull();
  });

  it('never ends at or before its start, which both stores refuse', () => {
    expect(toHealthWorkout({ id: 'w1', name: 'Workout', startedAt: 5_000, finishedAt: 5_000 })?.end).toBe(6_000);
    expect(toHealthWorkout({ id: 'w1', name: 'Workout', startedAt: 5_000, finishedAt: 4_000 })?.end).toBe(6_000);
  });
});

describe('healthWritesDue (R308)', () => {
  const row = (id: string, finishedAt: number | null, healthStatus: HealthDueRow['healthStatus'] = null): HealthDueRow => ({
    id,
    status: finishedAt === null ? 'active' : 'finished',
    finishedAt,
    healthStatus,
  });

  it('is nothing while the write-out is off', () => {
    expect(healthWritesDue([row('a', 10)], null)).toEqual([]);
  });

  it('writes workouts finished since it was turned on, not yet written, oldest first; a failed one is tried again', () => {
    const rows = [row('old', 50), row('done', 200, 'done'), row('failed', 150, 'failed'), row('new', 120), row('active', null)];
    expect(healthWritesDue(rows, 100)).toEqual(['new', 'failed']);
  });

  it('counts a workout finished at the moment it was turned on', () => {
    expect(healthWritesDue([row('a', 100)], 100)).toEqual(['a']);
  });

  it(`writes at most ${MAX_HEALTH_WRITES_PER_PASS} in one pass`, () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`w${i}`, 1000 + i));
    const due = healthWritesDue(rows, 0);
    expect(due).toHaveLength(MAX_HEALTH_WRITES_PER_PASS);
    expect(due[0]).toBe('w0');
  });
});

describe('lastNightWindow (R310)', () => {
  it('runs from 6pm the day before to now, for a morning session', () => {
    expect(lastNightWindow(at(12, 7, 30))).toEqual({ start: at(11, 18), end: at(12, 7, 30) });
  });

  it('stops at 2pm for an evening session, so a nap after 2pm never counts', () => {
    expect(lastNightWindow(at(12, 19))).toEqual({ start: at(11, 18), end: at(12, 14) });
  });

  it('crosses a month', () => {
    expect(lastNightWindow(new Date(2026, 10, 1, 8).getTime()).start).toBe(new Date(2026, 9, 31, 18).getTime());
  });
});

describe('sleepMinutes', () => {
  const window = { start: at(11, 18), end: at(12, 9) };
  const s = (kind: SleepSample['kind'], start: number, end: number): SleepSample => ({ kind, start, end });

  it('adds the asleep stages and leaves out awake', () => {
    const samples = [s('asleep', at(11, 23), at(12, 2)), s('awake', at(12, 2), at(12, 2, 30)), s('asleep', at(12, 2, 30), at(12, 6))];
    expect(sleepMinutes(samples, window)).toBe(6.5 * 60);
  });

  it('counts overlaps once: the watch and the phone both logged the night', () => {
    const samples = [s('asleep', at(11, 23), at(12, 5)), s('asleep', at(12, 0), at(12, 6))];
    expect(sleepMinutes(samples, window)).toBe(7 * 60);
  });

  it('only counts what falls inside the window', () => {
    expect(sleepMinutes([s('asleep', at(11, 13), at(11, 20))], window)).toBe(120);
    expect(sleepMinutes([s('asleep', at(12, 8), at(12, 11))], window)).toBe(60);
  });

  it('falls back to time in bed when there are no asleep stages', () => {
    expect(sleepMinutes([s('inBed', at(11, 23), at(12, 4))], window)).toBe(5 * 60);
    expect(sleepMinutes([s('inBed', at(11, 22), at(12, 7)), s('asleep', at(11, 23), at(12, 4))], window)).toBe(5 * 60);
  });

  it('is unknown with nothing logged for the night', () => {
    expect(sleepMinutes([], window)).toBeNull();
    expect(sleepMinutes([s('awake', at(11, 23), at(12, 1)), s('asleep', at(10, 23), at(11, 6))], window)).toBeNull();
  });
});

describe('restingHeartRateRise', () => {
  const NOW = at(12, 8);
  const baseline = (bpm: number, days = 10) => Array.from({ length: days }, (_, i) => ({ at: NOW - (i + 1) * DAY, bpm }));

  it("is today's reading minus the 28-day average before it", () => {
    expect(restingHeartRateRise([{ at: NOW - HOUR, bpm: 62 }, ...baseline(50)], NOW)).toBe(12);
    expect(restingHeartRateRise([{ at: NOW - HOUR, bpm: 48 }, ...baseline(50)], NOW)).toBe(-2);
  });

  it('uses the newest reading of the last 36 hours, and nothing older', () => {
    expect(restingHeartRateRise([{ at: NOW - 30 * HOUR, bpm: 60 }, ...baseline(50).slice(2)], NOW)).toBe(10);
    expect(restingHeartRateRise([{ at: NOW - 40 * HOUR, bpm: 70 }, ...baseline(50).slice(2)], NOW)).toBeNull();
  });

  it('leaves out readings older than 28 days and a second one the same day', () => {
    const samples = [{ at: NOW - HOUR, bpm: 60 }, { at: NOW - 3 * HOUR, bpm: 90 }, ...baseline(50), { at: NOW - 40 * DAY, bpm: 100 }];
    expect(restingHeartRateRise(samples, NOW)).toBe(10);
  });

  it('has no average to trust with fewer than 7 readings before today', () => {
    expect(restingHeartRateRise([{ at: NOW - HOUR, bpm: 70 }, ...baseline(50, 6)], NOW)).toBeNull();
    expect(restingHeartRateRise([], NOW)).toBeNull();
  });
});

describe('roughSleepReason (§17.1: the owner confirmed the thresholds)', () => {
  it('offers on under 6 hours of sleep', () => {
    expect(roughSleepReason({ sleepMinutes: 359, heartRateRise: null })).toBe('short_sleep');
    expect(roughSleepReason({ sleepMinutes: 360, heartRateRise: null })).toBeNull();
  });

  it('offers on resting heart rate 10 bpm or more above its average', () => {
    expect(roughSleepReason({ sleepMinutes: null, heartRateRise: 10 })).toBe('resting_heart_rate');
    expect(roughSleepReason({ sleepMinutes: 480, heartRateRise: 9.9 })).toBeNull();
  });

  it('is one offer, not two, when both hold', () => {
    expect(roughSleepReason({ sleepMinutes: 300, heartRateRise: 15 })).toBe('short_sleep');
  });

  it('offers nothing when neither read has anything', () => {
    expect(roughSleepReason({ sleepMinutes: null, heartRateRise: null })).toBeNull();
  });

  it('words each reason as a question, like the Short on food offer', () => {
    expect(roughSleepOfferLine('short_sleep')).toBe('Under 6 hours of sleep last night. Mark this session Rough sleep?');
    expect(roughSleepOfferLine('resting_heart_rate')).toBe('Resting heart rate is up today. Mark this session Rough sleep?');
  });
});

describe('newerHealthBodyweight (R311)', () => {
  it("offers a reading newer than the app's latest, in the display unit to 0.1", () => {
    expect(newerHealthBodyweight(1_000, { at: 2_000, kg: 80 }, 'lb')).toEqual({ at: 2_000, weight: 176.4, unit: 'lb' });
    expect(newerHealthBodyweight(null, { at: 2_000, kg: 80.04 }, 'kg')).toEqual({ at: 2_000, weight: 80, unit: 'kg' });
  });

  it('offers nothing older than or as old as the latest entry, nothing at all, or a non-weight', () => {
    expect(newerHealthBodyweight(2_000, { at: 2_000, kg: 80 }, 'kg')).toBeNull();
    expect(newerHealthBodyweight(3_000, { at: 2_000, kg: 80 }, 'kg')).toBeNull();
    expect(newerHealthBodyweight(null, null, 'kg')).toBeNull();
    expect(newerHealthBodyweight(null, { at: 2_000, kg: 0 }, 'kg')).toBeNull();
  });
});
