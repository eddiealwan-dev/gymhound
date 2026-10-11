import type { Outcome } from './progression';
import { stallFlags, type StallInput } from './stall';
import type { WeightUnit } from './types';

/** A session with a rule, its outcome and its working weight (lb unless given). */
const s = (outcome: Outcome, weight: number | null = 100, unit: WeightUnit = 'lb'): StallInput => ({
  hasRule: true,
  outcome,
  workingWeight: weight,
  workingUnit: weight === null ? null : unit,
});

describe('stallFlags (7.5)', () => {
  it('labels the third held session at the same weight, and every later one in the run', () => {
    expect(stallFlags([s('held'), s('held'), s('held'), s('held')])).toEqual([false, false, true, true]);
  });

  it('is empty for no sessions and returns one flag per session', () => {
    expect(stallFlags([])).toEqual([]);
    expect(stallFlags([s('held')])).toEqual([false]);
  });

  it('skips a marked session between them: it neither counts nor breaks the run', () => {
    expect(stallFlags([s('held'), s('held_marked'), s('held'), s('held')])).toEqual([false, false, false, true]);
  });

  it('skips no_sets and no_rule sessions, and sessions without a rule', () => {
    const noRule: StallInput = { hasRule: false, outcome: 'held', workingWeight: 100, workingUnit: 'lb' };
    expect(stallFlags([s('held'), s('no_sets', null), s('held'), s('no_rule'), noRule, s('held')])).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('a raise breaks the run', () => {
    expect(stallFlags([s('held'), s('held'), s('raised'), s('held'), s('held')])).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('a held session at another weight starts a new run', () => {
    expect(stallFlags([s('held', 100), s('held', 100), s('held', 105), s('held', 105), s('held', 105)])).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('60 kg and 132.3 lb are the same weight (R125)', () => {
    expect(stallFlags([s('held', 60, 'kg'), s('held', 132.3, 'lb'), s('held', 60, 'kg')])).toEqual([false, false, true]);
  });

  it('a held session with no working weight breaks the run', () => {
    expect(stallFlags([s('held'), s('held'), s('held', null), s('held')])).toEqual([false, false, false, false]);
  });
});
