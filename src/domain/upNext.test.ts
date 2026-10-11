import type { LoggingType, WeightUnit } from './types';
import { dayTitle, startDayLabel, upNextLoad, upNextNeedsWeights, upNextSubtitle } from './upNext';

const w = (nextWeight: number | null, unit: WeightUnit | null = nextWeight === null ? null : 'kg') => ({
  loggingType: 'weighted' as const,
  nextWeight,
  nextWeightUnit: unit,
});
const none = (loggingType: LoggingType) => ({ loggingType, nextWeight: null, nextWeightUnit: null });

describe('upNextLoad', () => {
  it('shows the weight in its own unit', () => {
    expect(upNextLoad(w(60), true)).toBe('60 kg');
    expect(upNextLoad(w(62.5, 'lb'), true)).toBe('62.5 lb');
  });

  it('shows — for a loadable exercise with no weight once another exercise of the day has one', () => {
    expect(upNextLoad(w(null), true)).toBe('—');
    expect(upNextLoad(none('weighted_time'), true)).toBe('—');
    expect(upNextLoad(none('assisted'), true)).toBe('—');
  });

  it('shows nothing for a loadable exercise with no weight when no exercise of the day has one', () => {
    expect(upNextLoad(w(null), false)).toBeNull();
  });

  it('never shows — for timed, distance or bodyweight-plus exercises', () => {
    expect(upNextLoad(none('timed'), true)).toBeNull();
    expect(upNextLoad(none('distance_time'), true)).toBeNull();
    expect(upNextLoad(none('bodyweight_plus'), true)).toBeNull();
  });

  it('still shows the weight of a bodyweight-plus exercise that has one', () => {
    expect(upNextLoad({ loggingType: 'bodyweight_plus', nextWeight: 10, nextWeightUnit: 'kg' }, true)).toBe('10 kg');
  });
});

describe('upNextNeedsWeights', () => {
  it('is true when a loadable exercise has no weight and none of the day has one', () => {
    expect(upNextNeedsWeights([w(null), none('timed')])).toBe(true);
  });

  it('is false once any exercise of the day has a weight', () => {
    expect(upNextNeedsWeights([w(null), w(60)])).toBe(false);
  });

  it('is false for a day with nothing that needs a load', () => {
    expect(upNextNeedsWeights([none('bodyweight_plus')])).toBe(false);
    expect(upNextNeedsWeights([none('timed'), none('distance_time')])).toBe(false);
  });
});

describe('upNextSubtitle', () => {
  it('says first time, and asks for weights once when the day needs them', () => {
    expect(upNextSubtitle(null, true, 'en-GB')).toBe('First time on this day. Pick weights as you go.');
    expect(upNextSubtitle(null, false, 'en-GB')).toBe('First time on this day.');
  });

  it('says when the day was last done and how it went', () => {
    expect(upNextSubtitle({ localDate: '2026-10-07', dayMark: 'rough_sleep' }, false, 'en-GB')).toBe('Last time: WED 7 OCT · Rough sleep');
    expect(upNextSubtitle({ localDate: '2026-10-07', dayMark: 'rough_sleep' }, true, 'en-GB')).toBe(
      'Last time: WED 7 OCT · Rough sleep. Pick weights as you go.',
    );
  });
});

describe('dayTitle and startDayLabel', () => {
  it('uses the day name, or the routine and day when the day name is one or two characters', () => {
    expect(dayTitle('Upper/lower', 'Upper A')).toBe('Upper A');
    expect(dayTitle('5×5', 'A')).toBe('5×5 A');
    expect(dayTitle('PPL', 'B2')).toBe('PPL B2');
  });

  it('reads Start {day}', () => {
    expect(startDayLabel('Upper/lower', 'Upper A')).toBe('Start Upper A');
    expect(startDayLabel('5×5', 'B')).toBe('Start 5×5 B');
  });
});
