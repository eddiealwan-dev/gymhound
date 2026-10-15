import type { Gear } from './plates';
import {
  addSetNext,
  beatTwice,
  beatTwiceForTime,
  blockDone,
  effectiveIncrement,
  isMiss,
  ladderNext,
  missStreak,
  programWeek,
  reactiveDeloadDue,
  resetWeight,
  runTarget,
  weekInfo,
  weekSetCount,
} from './programRules';
import type { OutcomeInput } from './progression';
import type { AddSetRule, ProgramWeek, WeeklyRule } from '../seed/programTypes';

type TestSet = OutcomeInput['sets'][number];
const rep = (reps: number | null, more: Partial<TestSet> = {}): TestSet => ({
  setType: 'working', done: true, weight: 135, weightUnit: 'lb', reps, durationS: null, ...more,
});

/** The default lb bar and plates (pairs owned), with one 2.5 lb pair. */
const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };

/** #5 Upper/Lower Powerbuilding: 10 weeks, week 10 a half-set deload (Appendix D). */
const DELOAD_10: ProgramWeek = { week: 10, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' };
/** #11 Advanced Upper/Lower DUP: 6 weeks, 4 days a week, week 6 a half-set deload (R627). */
const DELOAD_6: ProgramWeek = { week: 6, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' };

describe('programWeek (R616)', () => {
  it('3 days a week, 0→1, 2→1, 3→2, 35→12', () => {
    expect(programWeek(0, 3)).toBe(1);
    expect(programWeek(2, 3)).toBe(1);
    expect(programWeek(3, 3)).toBe(2);
    expect(programWeek(35, 3)).toBe(12);
  });
});

describe('weekInfo (R617, R627)', () => {
  it('#5 week 10 is a half deload', () => {
    expect(weekInfo([DELOAD_10], 10, 10, null)).toEqual(DELOAD_10);
    expect(weekInfo([DELOAD_10], 10, 9, null)).toBeNull();
  });

  it('after week 10 null', () => {
    expect(weekInfo([DELOAD_10], 10, 11, null)).toBeNull();
    expect(weekInfo([DELOAD_10], 10, 11, { deloadAt: null, session: 40, daysPerWeek: 4 })).toBeNull();
  });

  it('early deload makes the next daysPerWeek sessions a deload', () => {
    // Started after 13 finished sessions (week 4 of #11): sessions 13–16 are the deload, and the block ends after it.
    const early = (session: number) => ({ deloadAt: 13, session, daysPerWeek: 4 });
    expect(weekInfo([DELOAD_6], 6, programWeek(12, 4), early(12))).toBeNull();
    for (const session of [13, 14, 15, 16]) {
      expect(weekInfo([DELOAD_6], 6, programWeek(session, 4), early(session))).toMatchObject({
        kind: 'deload', halfSets: true, holds: true,
      });
    }
    expect(weekInfo([DELOAD_6], 6, programWeek(17, 4), early(17))).toBeNull();
  });

  it('blockDone tells a normal week (null, not done) from the end of the block (null, done)', () => {
    expect(blockDone(10, 9, null)).toBe(false);
    expect(blockDone(10, 10, null)).toBe(false);
    expect(blockDone(10, 11, null)).toBe(true);
    expect(blockDone(10, 11, { deloadAt: null, session: 40, daysPerWeek: 4 })).toBe(true);
    // #11's early deload from session 13: done from session 17, in week 5 of 6.
    const early = (session: number) => ({ deloadAt: 13, session, daysPerWeek: 4 });
    expect(blockDone(6, programWeek(16, 4), early(16))).toBe(false);
    expect(blockDone(6, programWeek(17, 4), early(17))).toBe(true);
    expect(blockDone(6, programWeek(12, 4), early(12))).toBe(false);
  });

  it('an early deload in a plan without one is a half-set deload', () => {
    expect(weekInfo([], 6, 2, { deloadAt: 5, session: 5, daysPerWeek: 4 })).toEqual({
      week: 2, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '',
    });
  });
});

describe('weekSetCount (R617)', () => {
  it('3→2, 1→1, exempt keeps 3', () => {
    expect(weekSetCount(3, DELOAD_10, false)).toBe(2);
    expect(weekSetCount(1, DELOAD_10, false)).toBe(1);
    expect(weekSetCount(4, DELOAD_10, false)).toBe(2);
    expect(weekSetCount(3, DELOAD_10, true)).toBe(3);
  });

  it('keeps the sets on a normal or a note-only week', () => {
    expect(weekSetCount(3, null, false)).toBe(3);
    expect(weekSetCount(3, { week: 1, kind: 'note', halfSets: false, holds: false, runShare: 1, note: 'Base.' }, false)).toBe(3);
  });
});

describe('isMiss (R613)', () => {
  const base = { setCount: 3, repMin: 6, loggingType: 'weighted' as const, marked: false, weekHolds: false };

  it('a set under repMin', () => {
    expect(isMiss({ ...base, sets: [rep(8), rep(6), rep(5)] })).toBe(true);
  });

  it('a missing set', () => {
    expect(isMiss({ ...base, sets: [rep(8), rep(8)] })).toBe(true);
    expect(isMiss({ ...base, sets: [rep(8), rep(8), rep(8, { done: false })] })).toBe(true);
    expect(isMiss({ ...base, sets: [rep(8), rep(8), rep(8, { setType: 'warmup' })] })).toBe(true);
  });

  it('marked never', () => {
    expect(isMiss({ ...base, marked: true, sets: [rep(3)] })).toBe(false);
  });

  it('holding week never', () => {
    expect(isMiss({ ...base, weekHolds: true, sets: [rep(3)] })).toBe(false);
  });

  it('8,8,7 on 6–8 is not a miss', () => {
    expect(isMiss({ ...base, sets: [rep(8), rep(8), rep(7)] })).toBe(false);
  });

  it('reads seconds for timed and weighted_time, and distance for weighted_distance', () => {
    const secs = (s: number) => rep(null, { durationS: s });
    expect(isMiss({ ...base, repMin: 30, loggingType: 'weighted_time', sets: [secs(45), secs(30), secs(29)] })).toBe(true);
    expect(isMiss({ ...base, repMin: 10, loggingType: 'timed', sets: [secs(10), secs(12), secs(10)] })).toBe(false);
    const dist = (d: number, unit: 'ft' | 'yd' = 'ft') => rep(null, { distance: d, distanceUnit: unit });
    expect(isMiss({ ...base, repMin: 50, loggingType: 'weighted_distance', sets: [dist(50), dist(60), dist(40)] })).toBe(true);
    // 20 yd is 60 ft, read in the slot's unit.
    expect(
      isMiss({ ...base, repMin: 50, loggingType: 'weighted_distance', distanceUnit: 'ft', sets: [dist(50), dist(20, 'yd'), dist(55)] }),
    ).toBe(false);
  });

  it('a metcon score is never a miss', () => {
    expect(isMiss({ ...base, loggingType: 'rounds', sets: [rep(1)] })).toBe(false);
    expect(isMiss({ ...base, loggingType: 'for_time', sets: [] })).toBe(false);
  });
});

describe('missStreak (R613)', () => {
  it('skips marked, a non-miss breaks', () => {
    expect(missStreak([])).toBe(0);
    expect(missStreak([{ missed: true, skipped: false }, { missed: false, skipped: true }, { missed: true, skipped: false }])).toBe(2);
    expect(missStreak([{ missed: true, skipped: false }, { missed: false, skipped: false }, { missed: true, skipped: false }])).toBe(1);
    expect(missStreak([{ missed: true, skipped: false }, { missed: false, skipped: false }])).toBe(0);
  });

  it('restarts after a reset: miss, miss, miss (reset), miss is 1, not 4', () => {
    const miss = { missed: true, skipped: false };
    expect(missStreak([miss, miss, { ...miss, reset: true }, miss])).toBe(1);
    expect(missStreak([miss, miss, { ...miss, reset: true }])).toBe(0);
    expect(missStreak([miss, { ...miss, reset: true }, { missed: false, skipped: true }, miss, miss])).toBe(2);
  });
});

describe('effectiveIncrement (R612)', () => {
  it('effectiveIncrement halves after a miss', () => {
    expect(effectiveIncrement(5, true, false)).toBe(5);
    expect(effectiveIncrement(5, true, true)).toBe(2.5);
    expect(effectiveIncrement(10, true, true)).toBe(5);
    expect(effectiveIncrement(2.5, true, true)).toBe(1.25);
    expect(effectiveIncrement(5, false, true)).toBe(5);
  });
});

describe('resetWeight (R613)', () => {
  it('rounds 90% down to a loadable barbell weight: 135 → 120 with 2.5 lb pairs', () => {
    expect(resetWeight({ value: 135, unit: 'lb' }, 0.9, 5, true, LB_GEAR)).toBe(120);
  });

  it('rounds down to a multiple of the step off a barbell', () => {
    expect(resetWeight({ value: 160, unit: 'lb' }, 0.9, 5, false, LB_GEAR)).toBe(140);
    expect(resetWeight({ value: 50, unit: 'lb' }, 0.9, 5, false, LB_GEAR)).toBe(45);
    expect(resetWeight({ value: 60, unit: 'kg' }, 0.9, 2.5, false, LB_GEAR)).toBe(52.5);
  });

  it('steps down above the heaviest loadable total, and never goes under the bar', () => {
    // Heaviest loadable is 45 + 2 × 267.5 = 580; above it the step is 2 × 2.5 = 5.
    expect(resetWeight({ value: 700, unit: 'lb' }, 0.9, 5, true, LB_GEAR)).toBe(630);
    expect(resetWeight({ value: 45, unit: 'lb' }, 0.9, 5, true, LB_GEAR)).toBe(45);
  });

  it('without plates owned, a barbell rounds to the step', () => {
    expect(resetWeight({ value: 135, unit: 'lb' }, 0.9, 5, true, { bar: 45, plates: {} })).toBe(120);
  });
});

describe('ladderNext (R618)', () => {
  const at = (rung: number, more: Partial<Parameters<typeof ladderNext>[0]> = {}) =>
    ladderNext({ rung, rungCount: 6, allTop: false, lowToday: false, lowLastTime: false, ...more });

  it('up at the top, down after two low sessions, stays at the last rung', () => {
    expect(at(2, { allTop: true })).toEqual({ rung: 3, moved: 'up' });
    expect(at(2, { lowToday: true })).toEqual({ rung: 2, moved: null });
    expect(at(2, { lowToday: true, lowLastTime: true })).toEqual({ rung: 1, moved: 'down' });
    expect(at(5, { allTop: true })).toEqual({ rung: 5, moved: null });
    expect(at(0, { lowToday: true, lowLastTime: true })).toEqual({ rung: 0, moved: null });
    expect(at(3)).toEqual({ rung: 3, moved: null });
  });
});

describe('addSetNext (R619)', () => {
  const ABC: AddSetRule = { capSets: 8, then: { kind: 'load', lb: 8, backToSets: 5 } };
  const BIKE: AddSetRule = { capSets: 8, then: { kind: 'seconds', step: 5 } };

  it('ABC 5→6…8 then raise and back to 5', () => {
    expect(addSetNext({ setCount: 5, allDone: true, rule: ABC, baseSets: 5 })).toEqual({ setCount: 6, raise: false });
    expect(addSetNext({ setCount: 7, allDone: true, rule: ABC, baseSets: 5 })).toEqual({ setCount: 8, raise: false });
    expect(addSetNext({ setCount: 8, allDone: true, rule: ABC, baseSets: 5 })).toEqual({ setCount: 5, raise: true });
    expect(addSetNext({ setCount: 6, allDone: false, rule: ABC, baseSets: 5 })).toEqual({ setCount: 6, raise: false });
  });

  it('intervals stay at the cap and add seconds', () => {
    expect(addSetNext({ setCount: 8, allDone: true, rule: BIKE, baseSets: 6 })).toEqual({ setCount: 8, raise: true });
    expect(addSetNext({ setCount: 6, allDone: true, rule: BIKE, baseSets: 6 })).toEqual({ setCount: 7, raise: false });
  });

  it('never drops under the base sets', () => {
    expect(addSetNext({ setCount: 3, allDone: false, rule: ABC, baseSets: 5 })).toEqual({ setCount: 5, raise: false });
  });
});

describe('runTarget (R620)', () => {
  const EASY: WeeklyRule = { kind: 'seconds', startS: 1500, stepS: 120, capS: 2400 };
  const INTERVALS: WeeklyRule = { kind: 'sets_then_seconds', startSets: 6, capSets: 8, seconds: 180, stepS: 15 };

  it('easy run week 1 1,500 s, week 9 2,400 s capped', () => {
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 1, 1)).toEqual({ sets: 1, seconds: 1500 });
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 3, 1)).toEqual({ sets: 1, seconds: 1740 });
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 8, 1)).toEqual({ sets: 1, seconds: 2340 });
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 9, 1)).toEqual({ sets: 1, seconds: 2400 });
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 12, 1)).toEqual({ sets: 1, seconds: 2400 });
  });

  it('intervals 6→8 sets then +15 s', () => {
    const base = { sets: 6, seconds: 180 };
    expect(runTarget(INTERVALS, base, 1, 1)).toEqual({ sets: 6, seconds: 180 });
    expect(runTarget(INTERVALS, base, 2, 1)).toEqual({ sets: 7, seconds: 180 });
    expect(runTarget(INTERVALS, base, 3, 1)).toEqual({ sets: 8, seconds: 180 });
    expect(runTarget(INTERVALS, base, 4, 1)).toEqual({ sets: 8, seconds: 195 });
    expect(runTarget(INTERVALS, base, 6, 1)).toEqual({ sets: 8, seconds: 225 });
  });

  it('lighter week 60%', () => {
    // Week 4 is 1,860 s; 60% is 1,116 s.
    expect(runTarget(EASY, { sets: 1, seconds: 1500 }, 4, 0.6)).toEqual({ sets: 1, seconds: 1116 });
    expect(runTarget(INTERVALS, { sets: 6, seconds: 180 }, 4, 0.6)).toEqual({ sets: 8, seconds: 117 });
  });

  it('a fixed jog keeps its time', () => {
    expect(runTarget({ kind: 'fixed' }, { sets: 1, seconds: 600 }, 5, 1)).toEqual({ sets: 1, seconds: 600 });
    expect(runTarget({ kind: 'fixed' }, { sets: 1, seconds: 600 }, 4, 0.6)).toEqual({ sets: 1, seconds: 600 });
  });
});

describe('metcon scores (R622)', () => {
  it('beatTwice and beatTwiceForTime', () => {
    const s = (rounds: number, extraReps: number) => ({ rounds, extraReps });
    expect(beatTwice([s(5, 0), s(5, 4), s(6, 0)])).toBe(true);
    expect(beatTwice([s(4, 0), s(5, 4), s(5, 9), s(6, 0)])).toBe(true);
    expect(beatTwice([s(5, 4), s(5, 4), s(6, 0)])).toBe(false);
    expect(beatTwice([s(5, 0), s(6, 0), s(5, 9)])).toBe(false);
    expect(beatTwice([s(5, 0), s(6, 0)])).toBe(false);
    expect(beatTwiceForTime([480, 462, 450])).toBe(true);
    expect(beatTwiceForTime([480, 462, 462])).toBe(false);
    expect(beatTwiceForTime([450, 462, 440])).toBe(false);
    expect(beatTwiceForTime([462, 450])).toBe(false);
  });
});

describe('reactiveDeloadDue (R627)', () => {
  it('reactiveDeloadDue at 2', () => {
    expect(reactiveDeloadDue(0)).toBe(false);
    expect(reactiveDeloadDue(1)).toBe(false);
    expect(reactiveDeloadDue(2)).toBe(true);
    expect(reactiveDeloadDue(3)).toBe(true);
  });
});
