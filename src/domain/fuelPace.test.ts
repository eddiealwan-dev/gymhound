import { proteinPace, shouldOfferShortOnFood } from './fuelPace';

const at = (h: number, m = 0) => new Date(2026, 9, 11, h, m).getTime();

describe('proteinPace', () => {
  it.each([
    [0, 0, 0],
    [5, 0, 0],
    [6, 0, 0],
    [10, 0, 0.25],
    [14, 0, 0.5],
    [22, 0, 1],
    [23, 30, 1],
  ])('at %i:%i is %p (§7.10)', (h, m, pace) => expect(proteinPace(at(h, m))).toBe(pace));
});

describe('shouldOfferShortOnFood', () => {
  const base = {
    isPro: true,
    offerShown: false,
    anyFoodToday: true,
    proteinSoFar: 40,
    trainingProteinTarget: 180,
    anyExerciseShortOnFood: false,
    startedAt: at(14),
  };

  it('offers when protein is behind pace (R152)', () => {
    expect(shouldOfferShortOnFood(base)).toBe(true);
  });

  it('does not offer when protein is on pace', () => {
    expect(shouldOfferShortOnFood({ ...base, proteinSoFar: 100 })).toBe(false);
    expect(shouldOfferShortOnFood({ ...base, proteinSoFar: 90 })).toBe(false);
  });

  it('does not offer before 06:00', () => {
    expect(shouldOfferShortOnFood({ ...base, proteinSoFar: 0, startedAt: at(5, 30) })).toBe(false);
  });

  it.each([
    ['no food logged', { anyFoodToday: false }],
    ['a 0 protein target', { trainingProteinTarget: 0 }],
    ['no targets', { trainingProteinTarget: null }],
    ['an exercise already Short on food', { anyExerciseShortOnFood: true }],
    ['the offer already shown', { offerShown: true }],
    ['Pro off', { isPro: false }],
  ])('does not offer with %s', (_, change) => expect(shouldOfferShortOnFood({ ...base, ...change })).toBe(false));
});
