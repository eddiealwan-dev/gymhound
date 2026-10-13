import {
  formatWater,
  ML_PER_FL_OZ,
  parseWaterAmount,
  parseWaterGoal,
  quickAmounts,
  toMl,
  waterAmountText,
  waterUnitFor,
  formatWaterSpoken,
  waterUnitLabel,
  waterUnitSpoken,
} from './water';

describe('water units (R150)', () => {
  it('shows fl oz to lb users and ml to kg users', () => {
    expect(waterUnitFor('lb')).toBe('fl_oz');
    expect(waterUnitFor('kg')).toBe('ml');
  });

  it('names the unit as it is written', () => {
    expect(waterUnitLabel('ml')).toBe('ml');
    expect(waterUnitLabel('fl_oz')).toBe('fl oz');
  });

  it('offers 250 and 500 ml, or 8 and 16 fl oz', () => {
    expect(quickAmounts('ml')).toEqual([250, 500]);
    expect(quickAmounts('fl_oz')).toEqual([8, 16]);
  });

  it('turns 8 fl oz into 236.6 ml and back into "8 fl oz"', () => {
    expect(ML_PER_FL_OZ).toBe(29.5735);
    expect(toMl(8, 'fl_oz')).toBeCloseTo(236.6, 1);
    expect(toMl(250, 'ml')).toBe(250);
    expect(formatWater(toMl(8, 'fl_oz'), 'fl_oz')).toBe('8 fl oz');
  });
});

describe('formatWater', () => {
  it('shows ml whole with thousands separators', () => {
    expect(formatWater(1250, 'ml', 'en-US')).toBe('1,250 ml');
    expect(formatWater(236.588, 'ml', 'en-US')).toBe('237 ml');
    expect(formatWater(0, 'ml', 'en-US')).toBe('0 ml');
  });

  it('shows fl oz whole', () => {
    expect(formatWater(toMl(40, 'fl_oz'), 'fl_oz', 'en-US')).toBe('40 fl oz');
    expect(formatWater(toMl(5 * 8, 'fl_oz') + 1, 'fl_oz', 'en-US')).toBe('40 fl oz');
    expect(formatWater(0, 'fl_oz', 'en-US')).toBe('0 fl oz');
  });

  it('keeps one decimal under 1 fl oz, so a small entry never reads as 0', () => {
    expect(formatWater(toMl(0.5, 'fl_oz'), 'fl_oz', 'en-US')).toBe('0.5 fl oz');
  });

  it('never shows 0 for a positive amount', () => {
    expect(formatWater(1, 'fl_oz', 'en-US')).toBe('<0.1 fl oz');
    expect(formatWater(0.2, 'ml', 'en-US')).toBe('<1 ml');
  });

  it('follows the locale', () => {
    expect(formatWater(1250, 'ml', 'de-DE')).toBe('1.250 ml');
  });
});

describe('waterAmountText', () => {
  it('writes a stored amount back as the number to edit, in the unit', () => {
    expect(waterAmountText(2000, 'ml')).toBe('2000');
    expect(waterAmountText(toMl(64, 'fl_oz'), 'fl_oz')).toBe('64');
    expect(waterAmountText(toMl(8.5, 'fl_oz'), 'fl_oz')).toBe('8.5');
  });
});

describe('parseWaterAmount', () => {
  it.each([
    ['250', 'ml', 250],
    ['1', 'ml', 1],
    ['3000', 'ml', 3000],
    [' 330 ', 'ml', 330],
    ['12,5', 'fl_oz', 12.5 * ML_PER_FL_OZ],
    ['0.1', 'fl_oz', 0.1 * ML_PER_FL_OZ],
    ['100', 'fl_oz', 100 * ML_PER_FL_OZ],
  ] as const)('reads %s %s', (text, unit, ml) => {
    expect(parseWaterAmount(text, unit)).toBeCloseTo(ml, 6);
  });

  it.each([
    ['', 'ml'],
    ['abc', 'ml'],
    ['-5', 'ml'],
    ['0', 'ml'],
    ['0.5', 'ml'],
    ['3001', 'ml'],
    ['0', 'fl_oz'],
    ['0.05', 'fl_oz'],
    ['101', 'fl_oz'],
  ] as const)('refuses %s %s', (text, unit) => {
    expect(parseWaterAmount(text, unit)).toBeNull();
  });
});

describe('parseWaterGoal', () => {
  it.each([
    ['2000', 'ml', 2000],
    ['250', 'ml', 250],
    ['10000', 'ml', 10000],
    ['64', 'fl_oz', 64 * ML_PER_FL_OZ],
    ['8', 'fl_oz', 8 * ML_PER_FL_OZ],
    ['338.1', 'fl_oz', 338.1 * ML_PER_FL_OZ],
    ['237', 'ml', 237],
  ] as const)('reads %s %s', (text, unit, ml) => {
    expect(parseWaterGoal(text, unit)).toBeCloseTo(ml, 6);
  });

  it.each([
    ['', 'ml'],
    ['x', 'ml'],
    ['236', 'ml'],
    ['10001', 'ml'],
    ['7.9', 'fl_oz'],
    ['338.2', 'fl_oz'],
  ] as const)('refuses %s %s', (text, unit) => {
    expect(parseWaterGoal(text, unit)).toBeNull();
  });
});

describe('a goal stays editable in the other unit', () => {
  // The goal is checked in ml in both units (8 fl oz to 10,000 ml), so the number the field shows in either unit
  // is accepted again.
  const goals = ['237', '250', '1000', '2000', '3785', '9999', '10000'].map((t) => parseWaterGoal(t, 'ml')!)
    .concat(['8', '8.1', '64', '100', '338', '338.1'].map((t) => parseWaterGoal(t, 'fl_oz')!));
  it.each(goals.map((ml) => [ml]))('%s ml', (ml) => {
    expect(ml).not.toBeNull();
    for (const unit of ['ml', 'fl_oz'] as const) expect(parseWaterGoal(waterAmountText(ml, unit), unit)).not.toBeNull();
  });
});

describe('what VoiceOver hears', () => {
  it('says fluid ounces in full; ml stays ml', () => {
    expect(waterUnitSpoken('fl_oz')).toBe('fluid ounces');
    expect(waterUnitSpoken('ml')).toBe('ml');
    expect(formatWaterSpoken(toMl(8, 'fl_oz'), 'fl_oz', 'en-US')).toBe('8 fluid ounces');
    expect(formatWaterSpoken(toMl(1, 'fl_oz'), 'fl_oz', 'en-US')).toBe('1 fluid ounce');
    expect(formatWaterSpoken(1, 'fl_oz', 'en-US')).toBe('less than 0.1 fluid ounces');
    expect(formatWaterSpoken(1250, 'ml', 'en-US')).toBe('1,250 ml');
  });
});
