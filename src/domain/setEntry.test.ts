import {
  formatPrevious,
  matchPrevious,
  placeholdersFor,
  resolveTick,
  setLabels,
  type PrevSet,
} from './setEntry';
import type { SetType } from './types';

const P = (
  position: number,
  setType: SetType,
  weight: number | null,
  reps: number | null,
  extra: Partial<PrevSet> = {},
): PrevSet => ({
  position,
  setType,
  weight,
  weightUnit: 'lb',
  reps,
  durationS: null,
  distance: null,
  distanceUnit: null,
  ...extra,
});

const prev: PrevSet = {
  position: 1,
  setType: 'working',
  weight: 180,
  weightUnit: 'lb',
  reps: 10,
  durationS: null,
  distance: null,
  distanceUnit: null,
};
const none = { weight: null, reps: null, durationS: null, distance: null };

describe('setLabels (spec 8.4)', () => {
  it('numbers working sets in order and letters the other types', () => {
    expect(setLabels(['warmup', 'working', 'working', 'drop', 'failure', 'working'])).toEqual([
      'W',
      '1',
      '2',
      'D',
      'F',
      '3',
    ]);
  });
});

describe('matchPrevious (spec 8.4)', () => {
  const last = [P(0, 'warmup', 95, 10), P(1, 'working', 185, 5), P(2, 'working', 185, 4), P(3, 'failure', 185, 2)];

  it('matches each set to the same number within its own type', () => {
    expect(
      matchPrevious(
        [{ setType: 'warmup' }, { setType: 'working' }, { setType: 'working' }, { setType: 'working' }],
        last,
      ),
    ).toEqual([last[0], last[1], last[2], null]);
  });

  it('never gives a warmup as the previous working set', () => {
    expect(matchPrevious([{ setType: 'working' }, { setType: 'working' }], last)).toEqual([last[1], last[2]]);
  });

  it('matches failure sets and leaves a type with no history empty', () => {
    expect(matchPrevious([{ setType: 'failure' }, { setType: 'drop' }], last)).toEqual([last[3], null]);
  });

  it('is empty for every set when there is no history', () => {
    expect(matchPrevious([{ setType: 'working' }], [])).toEqual([null]);
  });

  it('counts in position order, not input order, across the gap an unticked set left', () => {
    const gaps = [P(2, 'working', 185, 5), P(0, 'working', 180, 6)];
    expect(matchPrevious([{ setType: 'working' }, { setType: 'working' }], gaps)).toEqual([gaps[1], gaps[0]]);
  });

  it('numbers each type separately when the types are interleaved', () => {
    const mixed = [P(0, 'working', 100, 8), P(1, 'drop', 80, 8), P(2, 'working', 100, 7), P(3, 'drop', 60, 8)];
    expect(
      matchPrevious([{ setType: 'drop' }, { setType: 'working' }, { setType: 'drop' }, { setType: 'working' }], mixed),
    ).toEqual([mixed[1], mixed[0], mixed[3], mixed[2]]);
  });

  it('keeps the length and order of the current sets, and leaves its inputs alone', () => {
    const current = [{ setType: 'working' as const }, { setType: 'warmup' as const }];
    const previous = [P(2, 'working', 185, 5), P(0, 'working', 180, 6)];
    const before = JSON.stringify([current, previous]);
    expect(matchPrevious(current, previous)).toEqual([previous[1], null]);
    expect(matchPrevious([], previous)).toEqual([]);
    expect(JSON.stringify([current, previous])).toBe(before);
  });
});

describe('placeholdersFor', () => {
  it('shows the previous set', () => {
    expect(placeholdersFor({ previous: prev, ruleRepMax: 12 })).toEqual({
      weight: 180,
      reps: 10,
      durationS: null,
      distance: null,
    });
  });

  it('falls back to the rule rep max when there is no previous set', () => {
    expect(placeholdersFor({ previous: null, ruleRepMax: 12 })).toEqual({
      weight: null,
      reps: 12,
      durationS: null,
      distance: null,
    });
  });

  describe('for a logging type', () => {
    it('feeds the rule value into the duration for a timed exercise, and leaves reps empty', () => {
      expect(placeholdersFor({ previous: null, ruleRepMax: 60, loggingType: 'timed' })).toEqual({
        ...none,
        durationS: 60,
      });
    });

    it('prefers the previous duration over the rule value for a timed exercise', () => {
      const plank: PrevSet = { ...prev, weight: null, reps: null, durationS: 50 };
      expect(placeholdersFor({ previous: plank, ruleRepMax: 60, loggingType: 'timed' })).toEqual({
        ...none,
        durationS: 50,
      });
    });

    it('ignores the rule value for distance_time', () => {
      expect(placeholdersFor({ previous: null, ruleRepMax: 12, loggingType: 'distance_time' })).toEqual(none);
    });

    it('still feeds the rule value into reps for the weighted types', () => {
      expect(placeholdersFor({ previous: null, ruleRepMax: 12, loggingType: 'assisted' })).toEqual({
        ...none,
        reps: 12,
      });
    });

    it('shows the previous weight and time for a weight-and-time exercise, with no reps', () => {
      expect(
        placeholdersFor({
          previous: P(1, 'working', 70, null, { durationS: 40 }),
          ruleRepMax: 60,
          loggingType: 'weighted_time',
          unit: 'lb',
        }),
      ).toEqual({ weight: 70, reps: null, durationS: 40, distance: null });
    });

    it('feeds the rule value into the duration for weight and time when there is no previous set', () => {
      expect(placeholdersFor({ previous: null, ruleRepMax: 60, loggingType: 'weighted_time', unit: 'lb' })).toEqual({
        weight: null,
        reps: null,
        durationS: 60,
        distance: null,
      });
    });

    it('converts a previous weight-and-time weight into the entry unit, to the nearest 0.5', () => {
      const logged = P(1, 'working', 32, null, { weightUnit: 'kg', durationS: 75 });
      expect(placeholdersFor({ previous: logged, ruleRepMax: 60, loggingType: 'weighted_time', unit: 'lb' })).toEqual({
        weight: 70.5,
        reps: null,
        durationS: 75,
        distance: null,
      });
    });
  });

  describe('with an entry unit', () => {
    it('converts a previous weight logged in the other unit to the nearest 0.5, with no 2-decimal noise (84 kg -> 185 lb)', () => {
      const logged: PrevSet = { ...prev, weight: 84, weightUnit: 'kg' };
      expect(placeholdersFor({ previous: logged, ruleRepMax: null, unit: 'lb' }).weight).toBe(185);
    });

    it('converts pounds to kilograms the same way (185 lb -> 84 kg, 135 lb -> 61 kg)', () => {
      expect(placeholdersFor({ previous: { ...prev, weight: 185, weightUnit: 'lb' }, ruleRepMax: null, unit: 'kg' }).weight).toBe(84);
      expect(placeholdersFor({ previous: { ...prev, weight: 135, weightUnit: 'lb' }, ruleRepMax: null, unit: 'kg' }).weight).toBe(61);
    });

    it('leaves a previous weight alone when it is already in the entry unit', () => {
      expect(placeholdersFor({ previous: prev, ruleRepMax: null, unit: 'lb' }).weight).toBe(180);
    });

    it('leaves a previous weight alone when no entry unit is given', () => {
      const logged: PrevSet = { ...prev, weight: 84, weightUnit: 'kg' };
      expect(placeholdersFor({ previous: logged, ruleRepMax: null }).weight).toBe(84);
    });

    it('leaves a previous weight alone when it has no recorded unit', () => {
      const logged: PrevSet = { ...prev, weight: 84, weightUnit: null };
      expect(placeholdersFor({ previous: logged, ruleRepMax: null, unit: 'lb' }).weight).toBe(84);
    });
  });
});

describe('resolveTick', () => {
  it('accepts the target weight and the placeholder reps when nothing is entered', () => {
    expect(
      resolveTick({ loggingType: 'weighted', entered: none, target: 180, placeholders: { ...none, reps: 12 } }),
    ).toEqual({ ...none, weight: 180, reps: 12 });
  });

  it('prefers what was entered over the target', () => {
    expect(
      resolveTick({
        loggingType: 'weighted',
        entered: { ...none, weight: 185 },
        target: 180,
        placeholders: { ...none, reps: 12 },
      }),
    ).toEqual({ ...none, weight: 185, reps: 12 });
  });

  it('keeps an entered zero rather than treating it as empty', () => {
    expect(
      resolveTick({
        loggingType: 'weighted',
        entered: { ...none, weight: 0 },
        target: 180,
        placeholders: { ...none, reps: 12 },
      }),
    ).toEqual({ ...none, weight: 0, reps: 12 });
  });

  it('refuses to tick when a required field has no value and no placeholder', () => {
    expect(resolveTick({ loggingType: 'weighted', entered: none, target: null, placeholders: none })).toBeNull();
  });

  it('defaults bodyweight_plus weight to 0', () => {
    expect(
      resolveTick({ loggingType: 'bodyweight_plus', entered: { ...none, reps: 10 }, target: null, placeholders: none }),
    ).toEqual({ ...none, weight: 0, reps: 10 });
  });

  it('requires a weight for assisted sets', () => {
    expect(
      resolveTick({ loggingType: 'assisted', entered: { ...none, reps: 8 }, target: null, placeholders: none }),
    ).toBeNull();
  });

  it('accepts the placeholder duration for timed sets', () => {
    expect(
      resolveTick({ loggingType: 'timed', entered: none, target: null, placeholders: { ...none, durationS: 45 } }),
    ).toEqual({ ...none, durationS: 45 });
  });

  it('requires a distance for distance_time sets', () => {
    expect(
      resolveTick({
        loggingType: 'distance_time',
        entered: { ...none, durationS: 600 },
        target: null,
        placeholders: none,
      }),
    ).toBeNull();
  });

  describe('for weight and time', () => {
    it('takes the entered weight and the placeholder duration, storing no reps or distance', () => {
      expect(
        resolveTick({
          loggingType: 'weighted_time',
          entered: { ...none, weight: 90 },
          target: null,
          placeholders: { ...none, durationS: 60 },
        }),
      ).toEqual({ weight: 90, reps: null, durationS: 60, distance: null });
    });

    it('takes today\'s target weight and an entered duration', () => {
      expect(
        resolveTick({
          loggingType: 'weighted_time',
          entered: { ...none, durationS: 45 },
          target: 70,
          placeholders: none,
        }),
      ).toEqual({ weight: 70, reps: null, durationS: 45, distance: null });
    });

    it('refuses to tick without a weight, even with a duration', () => {
      expect(
        resolveTick({
          loggingType: 'weighted_time',
          entered: none,
          target: null,
          placeholders: { ...none, durationS: 60 },
        }),
      ).toBeNull();
    });

    it('refuses to tick without a duration, even with a weight', () => {
      expect(
        resolveTick({ loggingType: 'weighted_time', entered: { ...none, weight: 90 }, target: null, placeholders: none }),
      ).toBeNull();
    });

    it('nulls the reps and distance a placeholder carried', () => {
      expect(
        resolveTick({
          loggingType: 'weighted_time',
          entered: { ...none, weight: 90, durationS: 30 },
          target: null,
          placeholders: { ...none, reps: 12, distance: 5 },
        }),
      ).toEqual({ weight: 90, reps: null, durationS: 30, distance: null });
    });
  });

  describe('returns only the fields the logging type uses', () => {
    it('ticks a timed plank with a 60 s rule from the entered duration, storing no reps', () => {
      const placeholders = placeholdersFor({ previous: null, ruleRepMax: 60, loggingType: 'timed' });
      expect(placeholders).toEqual({ ...none, durationS: 60 });
      expect(
        resolveTick({ loggingType: 'timed', entered: { ...none, durationS: 45 }, target: null, placeholders }),
      ).toEqual({ weight: null, reps: null, durationS: 45, distance: null });
    });

    it('nulls the duration and distance of a weighted set', () => {
      expect(
        resolveTick({
          loggingType: 'weighted',
          entered: none,
          target: 180,
          placeholders: { ...none, reps: 12, durationS: 30, distance: 5 },
        }),
      ).toEqual({ ...none, weight: 180, reps: 12 });
    });

    it('nulls the duration and distance of assisted and bodyweight_plus sets', () => {
      const placeholders = { ...none, reps: 8, durationS: 30, distance: 5 };
      expect(
        resolveTick({ loggingType: 'assisted', entered: { ...none, weight: 40 }, target: null, placeholders }),
      ).toEqual({ ...none, weight: 40, reps: 8 });
      expect(resolveTick({ loggingType: 'bodyweight_plus', entered: none, target: null, placeholders })).toEqual({
        ...none,
        weight: 0,
        reps: 8,
      });
    });

    it('nulls the weight, reps and distance of a timed set', () => {
      expect(
        resolveTick({
          loggingType: 'timed',
          entered: { ...none, weight: 20 },
          target: 20,
          placeholders: { ...none, weight: 20, reps: 12, durationS: 45, distance: 5 },
        }),
      ).toEqual({ ...none, durationS: 45 });
    });

    it('nulls the weight and reps of a distance_time set', () => {
      expect(
        resolveTick({
          loggingType: 'distance_time',
          entered: { ...none, distance: 5, durationS: 1500 },
          target: 20,
          placeholders: { ...none, weight: 20, reps: 12 },
        }),
      ).toEqual({ ...none, distance: 5, durationS: 1500 });
    });
  });
});

describe('formatPrevious (spec 8.4)', () => {
  it('omits the unit when it matches the display unit', () => {
    expect(formatPrevious(P(1, 'working', 185, 5), 'weighted', 'lb')).toBe('185 × 5');
  });

  it('shows the unit when it differs from the display unit', () => {
    expect(formatPrevious(P(1, 'working', 84, 12, { weightUnit: 'kg' }), 'weighted', 'lb')).toBe('84 kg × 12');
  });

  it('treats a weight with no recorded unit as being in the display unit', () => {
    expect(formatPrevious(P(1, 'working', 185, 5, { weightUnit: null }), 'weighted', 'lb')).toBe('185 × 5');
  });

  it('separates weight and reps with spaces around the multiplication sign', () => {
    expect(formatPrevious(P(1, 'working', 185, 5), 'weighted', 'lb')).toBe('185 × 5');
  });

  describe('bodyweight plus', () => {
    it('prefixes added weight with a plus', () => {
      expect(formatPrevious(P(1, 'working', 25, 8), 'bodyweight_plus', 'lb')).toBe('+25 × 8');
    });

    it('reads BW when no weight was added', () => {
      expect(formatPrevious(P(1, 'working', 0, 8), 'bodyweight_plus', 'lb')).toBe('BW × 8');
      expect(formatPrevious(P(1, 'working', null, 8), 'bodyweight_plus', 'lb')).toBe('BW × 8');
    });

    it('is empty when the reps are missing, with or without added weight', () => {
      expect(formatPrevious(P(1, 'working', 25, null), 'bodyweight_plus', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', 0, null), 'bodyweight_plus', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', null, null), 'bodyweight_plus', 'lb')).toBe('');
    });
  });

  it('prefixes assistance with the true minus sign', () => {
    expect(formatPrevious(P(1, 'working', 40, 8), 'assisted', 'lb')).toBe('−40 × 8');
  });

  describe('weight and time', () => {
    it('always shows the unit, even when it matches the display unit', () => {
      expect(formatPrevious(P(1, 'working', 70, null, { durationS: 40 }), 'weighted_time', 'lb')).toBe('70 lb × 40s');
    });

    it('shows the logged unit and m:ss from 60 seconds', () => {
      expect(
        formatPrevious(P(1, 'working', 32, null, { weightUnit: 'kg', durationS: 75 }), 'weighted_time', 'lb'),
      ).toBe('32 kg × 1:15');
    });

    it('shows the display unit for a weight with no recorded unit', () => {
      expect(
        formatPrevious(P(1, 'working', 70, null, { weightUnit: null, durationS: 40 }), 'weighted_time', 'kg'),
      ).toBe('70 kg × 40s');
    });

    it('is empty when the weight or the time is missing', () => {
      expect(formatPrevious(P(1, 'working', null, null, { durationS: 40 }), 'weighted_time', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', 70, null), 'weighted_time', 'lb')).toBe('');
    });
  });

  describe('time only', () => {
    it.each([
      [0, '0s'],
      [40, '40s'],
      [59, '59s'],
      [60, '1:00'],
      [90, '1:30'],
      [605, '10:05'],
    ])('shows %i seconds as %s', (durationS, text) => {
      expect(formatPrevious(P(1, 'working', null, null, { durationS }), 'timed', 'lb')).toBe(text);
    });

    it('is empty when the time is missing', () => {
      expect(formatPrevious(P(1, 'working', null, null), 'timed', 'lb')).toBe('');
    });
  });

  describe('distance and time', () => {
    it('shows the distance with its unit and m:ss time', () => {
      expect(
        formatPrevious(P(1, 'working', null, null, { distance: 2, distanceUnit: 'km', durationS: 750 }), 'distance_time', 'lb'),
      ).toBe('2 km · 12:30');
    });

    it('is empty when the distance, its unit or the time is missing', () => {
      expect(formatPrevious(P(1, 'working', null, null, { distanceUnit: 'km', durationS: 750 }), 'distance_time', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', null, null, { distance: 2, durationS: 750 }), 'distance_time', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', null, null, { distance: 2, distanceUnit: 'km' }), 'distance_time', 'lb')).toBe('');
    });
  });

  describe('with nothing to show', () => {
    it('is empty for no previous set', () => {
      expect(formatPrevious(null, 'weighted', 'lb')).toBe('');
      expect(formatPrevious(null, 'weighted_time', 'lb')).toBe('');
      expect(formatPrevious(null, 'timed', 'lb')).toBe('');
    });

    it('is empty, never an invented number, when the set lacks what its type needs', () => {
      expect(formatPrevious(P(1, 'working', null, null), 'weighted', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', 185, null), 'weighted', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', null, 8), 'assisted', 'lb')).toBe('');
      expect(formatPrevious(P(1, 'working', 40, null), 'assisted', 'lb')).toBe('');
    });

    it('never shows a dash', () => {
      const loggingTypes = ['weighted', 'bodyweight_plus', 'assisted', 'timed', 'weighted_time', 'distance_time'] as const;
      for (const loggingType of loggingTypes) {
        expect(formatPrevious(P(1, 'working', null, null), loggingType, 'lb')).not.toContain('—');
        expect(formatPrevious(null, loggingType, 'lb')).not.toContain('—');
      }
    });
  });
});
