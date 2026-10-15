import type { Gear } from './plates';
import type { Equipment, LoggingType, WeightUnit } from './types';
import {
  dayTitle,
  DELOAD_OFFER,
  firstSentence,
  graduationLine,
  programWeekText,
  startDayLabel,
  startOverQuestion,
  upNextDayHasWeight,
  upNextLoad,
  upNextNeedsWeights,
  upNextOutcome,
  upNextSubtitle,
} from './upNext';

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

  it('shows no load for a bodyweight-plus exercise at 0 added load (R75)', () => {
    const dip = { loggingType: 'bodyweight_plus' as const, equipment: 'bodyweight' as const, nextWeight: 0, nextWeightUnit: 'lb' as const };
    expect(upNextLoad(dip, true, 'lb', LB_GEAR)).toBeNull();
    expect(upNextLoad(dip, false, 'kg', KG_GEAR)).toBeNull();
  });
});

describe('upNextOutcome', () => {
  const last = (
    lastOutcome: Parameters<typeof upNextOutcome>[0]['lastOutcome'],
    lastMark: Parameters<typeof upNextOutcome>[0]['lastMark'] = null,
    increment = 5,
    incrementUnit: WeightUnit = 'lb',
    loggingType: LoggingType = 'weighted',
    equipment: Equipment = 'barbell',
  ) => ({
    loggingType,
    equipment,
    lastOutcome,
    lastMark,
    increment,
    incrementUnit,
    lastWorkingWeight: null,
    lastWorkingUnit: null,
    lastNextWeight: null,
    lastNextUnit: null,
  });
  /** A raise last time from `working` to `next`, both in `weightUnit`, on a routine that adds 5 lb. */
  const raise = (
    working: number,
    next: number,
    weightUnit: WeightUnit,
    loggingType: LoggingType = 'weighted',
    equipment: Equipment = 'barbell',
  ) => ({
    ...last('raised', null, 5, 'lb', loggingType, equipment),
    lastWorkingWeight: working,
    lastWorkingUnit: weightUnit,
    lastNextWeight: next,
    lastNextUnit: weightUnit,
  });
  /** Last time's outcome in `unit`, with that unit's default bar and plates, as Train passes them. */
  const outcome = (exercise: Parameters<typeof upNextOutcome>[0], unit: WeightUnit) =>
    upNextOutcome(exercise, unit, unit === 'lb' ? LB_GEAR : KG_GEAR);

  it('a raise reads the actual rise: 135 to 145 lb without 2.5 lb plates is " · ↑ 10 lb" (R73)', () => {
    expect(outcome(raise(135, 140, 'lb'), 'lb')).toBe(' · ↑ 5 lb');
    expect(outcome(raise(135, 145, 'lb'), 'lb')).toBe(' · ↑ 10 lb');
  });

  it('a rise in the display unit shows exactly', () => {
    expect(outcome(raise(60, 61.25, 'kg'), 'kg')).toBe(' · ↑ 1.25 kg');
    expect(outcome(raise(60, 61.25, 'kg', 'weighted', 'dumbbell'), 'kg')).toBe(' · ↑ 1.25 kg');
  });

  it('a rise after a unit switch is the difference between the loads Up next shows (R77)', () => {
    // An lb user sees a 60 kg barbell plan as 130 lb and 62.5 kg as 140 lb, the nearest the lb plates load.
    expect(upNextLoad(w(60, 'kg'), true, 'lb', LB_GEAR)).toBe('130 lb');
    expect(upNextLoad(w(62.5, 'kg'), true, 'lb', LB_GEAR)).toBe('140 lb');
    expect(outcome(raise(60, 62.5, 'kg'), 'lb')).toBe(' · ↑ 10 lb');
    // A kg user sees 135 lb as 60 kg, 140 lb as 62.5 kg and 145 lb as 65 kg.
    expect(outcome(raise(135, 140, 'lb'), 'kg')).toBe(' · ↑ 2.5 kg');
    expect(outcome(raise(135, 145, 'lb'), 'kg')).toBe(' · ↑ 5 kg');
    // Anything but a barbell shows to the nearest 0.5: 60 kg as 132.5 lb, 62.5 kg as 138 lb.
    expect(outcome(raise(60, 62.5, 'kg', 'weighted', 'dumbbell'), 'lb')).toBe(' · ↑ 5.5 lb');
  });

  it('shows no rise, not the routine increment, when the shown loads did not move (R76, R77)', () => {
    // 60.1 kg shows to an lb user as 130 lb, as 60 kg does.
    expect(outcome(raise(60, 60.1, 'kg'), 'lb')).toBeNull();
    expect(outcome(raise(60, 60.1, 'kg'), 'kg')).toBe(' · ↑ 0.1 kg');
  });

  it('falls back to the routine increment when last time has no working or next weight', () => {
    expect(outcome(last('raised'), 'lb')).toBe(' · ↑ 5 lb');
    expect(outcome(last('raised', null, 5, 'lb'), 'kg')).toBe(' · ↑ 2.5 kg');
    expect(outcome(last('raised', null, 2.5, 'kg'), 'lb')).toBe(' · ↑ 5 lb');
  });

  it('a raise on an assisted exercise is less assistance: " · ↓ {working − next}" (R72, R73), and its holds read as any other', () => {
    expect(outcome(raise(50, 45, 'lb', 'assisted', 'machine'), 'lb')).toBe(' · ↓ 5 lb');
    expect(outcome(raise(50, 40, 'lb', 'assisted', 'machine'), 'kg')).toBe(' · ↓ 4.5 kg');
    expect(outcome(last('held', null, 5, 'lb', 'assisted'), 'lb')).toBe(' · held');
    expect(outcome(last('held_marked', 'pain', 5, 'lb', 'assisted'), 'lb')).toBe(' · held · Pain');
  });

  it('a raise that is known to have changed nothing shows no rise, never the increment (R76)', () => {
    // An assisted exercise "raised" from 0 to 0 assistance (before R76 held it at 0), and a raise with no change.
    expect(outcome(raise(0, 0, 'lb', 'assisted', 'machine'), 'lb')).toBeNull();
    expect(outcome(raise(0, 0, 'kg', 'assisted', 'machine'), 'lb')).toBeNull();
    expect(outcome(raise(135, 135, 'lb'), 'lb')).toBeNull();
  });

  it('a hold on a flagged exercise names the reason: " · held · Rough sleep"', () => {
    expect(outcome(last('held_marked', 'rough_sleep'), 'lb')).toBe(' · held · Rough sleep');
    expect(outcome(last('held_marked', 'short_on_food'), 'kg')).toBe(' · held · Short on food');
  });

  it('a hold on a normal day reads " · held"', () => {
    expect(outcome(last('held'), 'lb')).toBe(' · held');
  });

  it('says nothing with no history, no rule or no sets', () => {
    expect(outcome(last(null), 'lb')).toBeNull();
    expect(outcome(last('no_rule'), 'lb')).toBeNull();
    expect(outcome(last('no_sets'), 'lb')).toBeNull();
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

  it('ignores a bodyweight-plus exercise at 0 added load, which shows no load (R75)', () => {
    const dipAt0 = { loggingType: 'bodyweight_plus' as const, nextWeight: 0, nextWeightUnit: 'lb' as const };
    expect(upNextDayHasWeight([w(null), dipAt0])).toBe(false);
    expect(upNextNeedsWeights([w(null), dipAt0])).toBe(true);
    // A 0 on a weighted exercise is still a weight.
    expect(upNextDayHasWeight([w(0, 'lb')])).toBe(true);
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

  it('puts the routine before a day still named as the editor numbered it, which says nothing alone (R56)', () => {
    expect(dayTitle('My split', 'Day 1')).toBe('My split Day 1');
    expect(dayTitle('My split', 'Day 12')).toBe('My split Day 12');
    expect(dayTitle('My split', 'Day one')).toBe('Day one');
    expect(dayTitle('My split', 'Leg day 1')).toBe('Leg day 1');
  });

  it('reads Start {day}', () => {
    expect(startDayLabel('Upper/lower', 'Upper A')).toBe('Start Upper A');
    expect(startDayLabel('5×5', 'B')).toBe('Start 5×5 B');
  });
});

describe('a program on Up next (R616, R627, R614)', () => {
  it('the week, or the block done', () => {
    expect(programWeekText({ week: 3, weeks: 12, done: false })).toBe('Week 3 of 12');
    expect(programWeekText({ week: 13, weeks: 12, done: true })).toBe('12 weeks done.');
  });

  it('leads the subtitle with the week', () => {
    expect(upNextSubtitle({ localDate: '2026-10-07' }, false, 'en-GB', 'Week 3 of 12')).toBe('Week 3 of 12 · Last time: WED 7 OCT');
    expect(upNextSubtitle(null, true, 'en-GB', 'Week 1 of 12')).toBe('Week 1 of 12 · First time on this day. Pick weights as you go.');
  });

  it('the first sentence of After this program, without its citations', () => {
    expect(firstSentence('Run it again from your current weights. When two different lifts have each needed two resets, graduate [22][23].')).toBe(
      'Run it again from your current weights.',
    );
    expect(firstSentence('Move to #12 Strength Peaking for a meet [22]. Or run it again.')).toBe('Move to #12 Strength Peaking for a meet.');
  });

  it('the words of the offer, Start over and the graduation line', () => {
    expect(DELOAD_OFFER).toBe('Two main lifts missed this week. Start the deload week now?');
    expect(startOverQuestion('Barbell Foundations')).toBe('Start Barbell Foundations over at week 1? Your weights stay.');
    expect(graduationLine('Barbell back squat')).toBe('Barbell back squat has dropped back twice in this run. See After this program.');
  });

  it('a carry needs a load (R607)', () => {
    expect(upNextNeedsWeights([{ loggingType: 'weighted_distance', nextWeight: null, nextWeightUnit: null }])).toBe(true);
  });
});
