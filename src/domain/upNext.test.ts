import type { Gear } from './plates';
import type { Equipment, LoggingType, WeightUnit } from './types';
import { dayTitle, startDayLabel, upNextDayHasWeight, upNextLoad, upNextNeedsWeights, upNextOutcome, upNextSubtitle } from './upNext';

/** The default bars and plate pairs in Settings. */
const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };
const KG_GEAR: Gear = { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } };

const w = (nextWeight: number | null, unit: WeightUnit | null = nextWeight === null ? null : 'kg', equipment: Equipment = 'barbell') => ({
  loggingType: 'weighted' as const,
  equipment,
  nextWeight,
  nextWeightUnit: unit,
});
const none = (loggingType: LoggingType) => ({ loggingType, equipment: 'bodyweight' as const, nextWeight: null, nextWeightUnit: null });

describe('upNextLoad', () => {
  it('shows a weight already in the display unit as it is', () => {
    expect(upNextLoad(w(60), true, 'kg', KG_GEAR)).toBe('60 kg');
    expect(upNextLoad(w(62.5, 'lb'), true, 'lb', LB_GEAR)).toBe('62.5 lb');
  });

  it('a kg user sees a 135 lb plan as 60 kg on a barbell with kg plates (R63)', () => {
    expect(upNextLoad(w(135, 'lb'), true, 'kg', KG_GEAR)).toBe('60 kg');
  });

  it('an lb user sees a 60 kg barbell plan as 130 lb, the nearest the lb plates load', () => {
    expect(upNextLoad(w(60, 'kg'), true, 'lb', LB_GEAR)).toBe('130 lb');
  });

  it('converts anything but a barbell to the nearest 0.5 in the display unit', () => {
    expect(upNextLoad(w(15, 'lb', 'dumbbell'), true, 'kg', KG_GEAR)).toBe('7 kg');
  });

  it('shows — for a loadable exercise with no weight once another exercise of the day has one', () => {
    expect(upNextLoad(w(null), true, 'kg', KG_GEAR)).toBe('—');
    expect(upNextLoad(none('weighted_time'), true, 'kg', KG_GEAR)).toBe('—');
    expect(upNextLoad(none('assisted'), true, 'kg', KG_GEAR)).toBe('—');
  });

  it('shows nothing for a loadable exercise with no weight when no exercise of the day has one', () => {
    expect(upNextLoad(w(null), false, 'kg', KG_GEAR)).toBeNull();
  });

  it('never shows — for timed, distance or bodyweight-plus exercises', () => {
    expect(upNextLoad(none('timed'), true, 'kg', KG_GEAR)).toBeNull();
    expect(upNextLoad(none('distance_time'), true, 'kg', KG_GEAR)).toBeNull();
    expect(upNextLoad(none('bodyweight_plus'), true, 'kg', KG_GEAR)).toBeNull();
  });

  it('still shows the weight of a bodyweight-plus exercise that has one', () => {
    const dip = { loggingType: 'bodyweight_plus' as const, equipment: 'bodyweight' as const, nextWeight: 10, nextWeightUnit: 'kg' as const };
    expect(upNextLoad(dip, true, 'kg', KG_GEAR)).toBe('10 kg');
  });
});

describe('upNextOutcome', () => {
  const last = (
    lastOutcome: Parameters<typeof upNextOutcome>[0]['lastOutcome'],
    lastMark: Parameters<typeof upNextOutcome>[0]['lastMark'] = null,
    increment = 5,
    incrementUnit: WeightUnit = 'lb',
    loggingType: LoggingType = 'weighted',
  ) => ({ loggingType, lastOutcome, lastMark, increment, incrementUnit });

  it('a raise reads the routine increment: " · ↑ 5 lb"', () => {
    expect(upNextOutcome(last('raised'), 'lb')).toBe(' · ↑ 5 lb');
  });

  it('a raise reads the increment in the display unit, by the gym convention', () => {
    expect(upNextOutcome(last('raised', null, 5, 'lb'), 'kg')).toBe(' · ↑ 2.5 kg');
    expect(upNextOutcome(last('raised', null, 2.5, 'kg'), 'lb')).toBe(' · ↑ 5 lb');
    expect(upNextOutcome(last('raised', null, 2.5, 'kg'), 'kg')).toBe(' · ↑ 2.5 kg');
  });

  it('a raise on an assisted exercise is less assistance: " · ↓ 5 lb" (R72), and its holds read as any other', () => {
    expect(upNextOutcome(last('raised', null, 5, 'lb', 'assisted'), 'lb')).toBe(' · ↓ 5 lb');
    expect(upNextOutcome(last('raised', null, 5, 'lb', 'assisted'), 'kg')).toBe(' · ↓ 2.5 kg');
    expect(upNextOutcome(last('held', null, 5, 'lb', 'assisted'), 'lb')).toBe(' · held');
    expect(upNextOutcome(last('held_marked', 'pain', 5, 'lb', 'assisted'), 'lb')).toBe(' · held · Pain');
  });

  it('a hold on a flagged exercise names the reason: " · held · Rough sleep"', () => {
    expect(upNextOutcome(last('held_marked', 'rough_sleep'), 'lb')).toBe(' · held · Rough sleep');
    expect(upNextOutcome(last('held_marked', 'short_on_food'), 'kg')).toBe(' · held · Short on food');
  });

  it('a hold on a normal day reads " · held"', () => {
    expect(upNextOutcome(last('held'), 'lb')).toBe(' · held');
  });

  it('says nothing with no history, no rule or no sets', () => {
    expect(upNextOutcome(last(null), 'lb')).toBeNull();
    expect(upNextOutcome(last('no_rule'), 'lb')).toBeNull();
    expect(upNextOutcome(last('no_sets'), 'lb')).toBeNull();
  });
});

describe('upNextDayHasWeight', () => {
  it('is true when any exercise of the day has a weight and its unit', () => {
    expect(upNextDayHasWeight([w(null), w(60)])).toBe(true);
    expect(upNextDayHasWeight([none('timed'), { loggingType: 'bodyweight_plus', nextWeight: 10, nextWeightUnit: 'kg' }])).toBe(true);
  });

  it('is false when no exercise has both a weight and a unit', () => {
    expect(upNextDayHasWeight([w(null), none('timed')])).toBe(false);
    expect(upNextDayHasWeight([w(60, null)])).toBe(false);
    expect(upNextDayHasWeight([])).toBe(false);
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

  it('says when the day was last done, with no workout-level mark (R69)', () => {
    expect(upNextSubtitle({ localDate: '2026-10-07' }, false, 'en-GB')).toBe('Last time: WED 7 OCT');
    expect(upNextSubtitle({ localDate: '2026-10-07' }, true, 'en-GB')).toBe('Last time: WED 7 OCT. Pick weights as you go.');
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
