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
