import { formatPrevious, placeholdersFor, resolveTick, setLabels, type PrevSet } from './setEntry';

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
  });

  describe('with an entry unit', () => {
    it('converts a previous weight logged in the other unit (84 kg -> 185.19 lb)', () => {
      const logged: PrevSet = { ...prev, weight: 84, weightUnit: 'kg' };
      expect(placeholdersFor({ previous: logged, ruleRepMax: null, unit: 'lb' }).weight).toBe(185.19);
    });

    it('converts pounds to kilograms the same way (185 lb -> 83.91 kg)', () => {
      const logged: PrevSet = { ...prev, weight: 185, weightUnit: 'lb' };
      expect(placeholdersFor({ previous: logged, ruleRepMax: null, unit: 'kg' }).weight).toBe(83.91);
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

describe('formatPrevious', () => {
  it('omits the unit when it matches the display unit', () => {
    expect(formatPrevious({ ...prev, weight: 185, reps: 12 }, 'weighted', 'lb')).toBe('185×12');
  });

  it('shows the unit when it differs from the display unit', () => {
    expect(formatPrevious({ ...prev, weight: 84, weightUnit: 'kg', reps: 12 }, 'weighted', 'lb')).toBe('84 kg×12');
  });

  it('prefixes added weight with a plus', () => {
    expect(formatPrevious({ ...prev, weight: 25, reps: 8 }, 'bodyweight_plus', 'lb')).toBe('+25×8');
  });

  it('prefixes assistance with the true minus sign', () => {
    expect(formatPrevious({ ...prev, weight: 40, reps: 8 }, 'assisted', 'lb')).toBe('−40×8');
  });

  it('shows timed sets in seconds', () => {
    expect(formatPrevious({ ...prev, weight: null, reps: null, durationS: 45 }, 'timed', 'lb')).toBe('45 s');
  });

  it('shows distance and m:ss time for distance_time sets', () => {
    expect(
      formatPrevious(
        { ...prev, weight: null, reps: null, distance: 2, distanceUnit: 'km', durationS: 750 },
        'distance_time',
        'lb',
      ),
    ).toBe('2 km · 12:30');
  });
});
