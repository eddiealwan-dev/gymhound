import { formatVolume, totalVolume, type VolumeSet } from './volume';

const s = (o: Partial<VolumeSet>): VolumeSet => ({
  loggingType: 'weighted',
  setType: 'working',
  done: true,
  weight: 100,
  weightUnit: 'kg',
  reps: 5,
  ...o,
});

describe('totalVolume (spec 7.9)', () => {
  it('multiplies load by reps', () => {
    expect(totalVolume([s({})], 'kg')).toBe(500);
  });

  it('excludes warmup sets and sets that are not done', () => {
    expect(totalVolume([s({ setType: 'warmup' }), s({ done: false })], 'kg')).toBe(0);
  });

  it('counts only weighted and bodyweight_plus logging types', () => {
    expect(totalVolume([s({ loggingType: 'assisted' }), s({ loggingType: 'timed' })], 'kg')).toBe(0);
  });

  it('none counted for the three program types (R608): a carry, an AMRAP score and a For Time score', () => {
    expect(totalVolume([s({ loggingType: 'weighted_distance', reps: null }), s({ loggingType: 'weighted_distance', reps: 5 })], 'kg')).toBe(0);
    expect(totalVolume([s({ loggingType: 'rounds', weight: null, reps: 6 }), s({ loggingType: 'for_time', weight: 40, reps: 5 })], 'kg')).toBe(0);
  });

  it('adds nothing for a weight-and-time set', () => {
    expect(totalVolume([s({ loggingType: 'weighted_time', reps: null })], 'kg')).toBe(0);
    // Excluded by its logging type, not merely by having no reps.
    expect(totalVolume([s({ loggingType: 'weighted_time', reps: 5 })], 'kg')).toBe(0);
  });

  it('counts bodyweight_plus load by reps', () => {
    expect(
      totalVolume([s({ loggingType: 'bodyweight_plus', weight: 20, weightUnit: 'lb', reps: 10 })], 'lb'),
    ).toBe(200);
  });

  it('converts to the display unit before rounding to a whole number', () => {
    expect(totalVolume([s({ reps: 1 })], 'lb')).toBe(220);
  });

  it('includes drop and failure sets', () => {
    expect(totalVolume([s({ setType: 'drop' }), s({ setType: 'failure' })], 'kg')).toBe(1000);
  });
});

describe('formatVolume', () => {
  it('adds the locale thousands separator and the unit', () => {
    expect(formatVolume(12480, 'lb', 'en-US')).toBe('12,480 lb');
  });
});
