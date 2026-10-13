import { loadPlates, nearestLoadable, planInUnit } from './plates';

/** The default plate sets (pairs owned) and bars from settings. */
const LB_PLATES = { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 };
const KG_PLATES = { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 };
const LB_BAR = 45;
const KG_BAR = 20;

describe('loadPlates', () => {
  it('loads the exact target, heaviest plate first', () => {
    expect(loadPlates(225, LB_BAR, LB_PLATES)).toEqual({ perSide: [45, 45], total: 225 });
    expect(loadPlates(230, LB_BAR, LB_PLATES)).toEqual({ perSide: [45, 45, 2.5], total: 230 });
  });

  it('never goes over the target', () => {
    expect(loadPlates(232, LB_BAR, LB_PLATES)).toEqual({ perSide: [45, 45, 2.5], total: 230 });
  });

  it('returns the bar alone at or below the bar', () => {
    expect(loadPlates(40, LB_BAR, LB_PLATES)).toEqual({ perSide: [], total: 45 });
    expect(loadPlates(45, LB_BAR, LB_PLATES)).toEqual({ perSide: [], total: 45 });
  });

  it('takes fewer plates on a tie', () => {
    expect(loadPlates(65, LB_BAR, { '10': 1, '5': 2 })).toEqual({ perSide: [10], total: 65 });
  });

  it('never uses more pairs than owned', () => {
    expect(loadPlates(405, LB_BAR, LB_PLATES)).toEqual({ perSide: [45, 45, 45, 45], total: 405 });
    expect(loadPlates(500, LB_BAR, LB_PLATES)).toEqual({ perSide: [45, 45, 45, 45, 35, 10, 2.5], total: 500 });
    expect(loadPlates(700, LB_BAR, LB_PLATES)).toEqual({
      perSide: [45, 45, 45, 45, 35, 25, 10, 10, 5, 2.5],
      total: 580,
    });
  });

  it('adds fractional kg plates exactly', () => {
    expect(loadPlates(102.5, KG_BAR, KG_PLATES)).toEqual({ perSide: [25, 15, 1.25], total: 102.5 });
  });
});

describe('nearestLoadable', () => {
  it('rounds to the closest loadable total on either side', () => {
    expect(nearestLoadable(227, LB_BAR, LB_PLATES)).toBe(225);
    expect(nearestLoadable(228, LB_BAR, LB_PLATES)).toBe(230);
  });

  it('takes the lower total on a tie', () => {
    expect(nearestLoadable(227.5, LB_BAR, LB_PLATES)).toBe(225);
  });

  it('rounds kg with the kg plates', () => {
    expect(nearestLoadable(102.06, KG_BAR, KG_PLATES)).toBe(102.5);
  });

  it('returns the bar at or below the bar', () => {
    expect(nearestLoadable(10, LB_BAR, LB_PLATES)).toBe(45);
    expect(nearestLoadable(45, LB_BAR, LB_PLATES)).toBe(45);
  });

  it('returns the heaviest loadable total above everything owned', () => {
    expect(nearestLoadable(700, LB_BAR, LB_PLATES)).toBe(580);
  });
});

describe('planInUnit', () => {
  it('returns the weight unchanged in the same unit', () => {
    expect(planInUnit(137, 'lb', 'lb', true, LB_BAR, LB_PLATES)).toBe(137);
    expect(planInUnit(61.3, 'kg', 'kg', false, KG_BAR, KG_PLATES)).toBe(61.3);
  });

  it('rounds a converted barbell plan to the nearest loadable total', () => {
    expect(planInUnit(135, 'lb', 'kg', true, KG_BAR, KG_PLATES)).toBe(60); // 61.23 kg
    expect(planInUnit(225, 'lb', 'kg', true, KG_BAR, KG_PLATES)).toBe(102.5); // 102.06 kg
    // 60 kg is 132.28 lb, nearer 130 than 135: one reason a plan keeps its own unit.
    expect(planInUnit(60, 'kg', 'lb', true, LB_BAR, LB_PLATES)).toBe(130);
  });

  it('rounds anything else to 0.5, never to the bar', () => {
    expect(planInUnit(15, 'lb', 'kg', false, KG_BAR, KG_PLATES)).toBe(7); // 6.80 kg
  });

  it('rounds above the heaviest loadable total by twice the smallest plate, not down to the plates', () => {
    // 300 kg is 661.39 lb; the default lb plates load at most 580.
    expect(planInUnit(300, 'kg', 'lb', true, LB_BAR, LB_PLATES)).toBe(660);
  });
});
