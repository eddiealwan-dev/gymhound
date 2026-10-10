import { convertIncrement, convertWeight, defaultUnitFor, formatWeight, roundToHalf, sameWeight, toKg } from './units';

describe('units', () => {
  it('converts pounds to kilograms', () => {
    expect(toKg(100, 'lb')).toBeCloseTo(45.359237, 6);
  });

  it('converts between weight units', () => {
    expect(convertWeight(2.5, 'kg', 'lb')).toBeCloseTo(5.5116, 4);
  });

  it('compares weights in kg, equal when closer than 0.01 kg', () => {
    expect(sameWeight({ value: 100, unit: 'kg' }, { value: 220.462, unit: 'lb' })).toBe(true);
    expect(sameWeight({ value: 100, unit: 'kg' }, { value: 100.02, unit: 'kg' })).toBe(false);
  });

  it('formats weights to 2 decimals with trailing zeros trimmed', () => {
    expect(formatWeight(185, 'lb')).toBe('185 lb');
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
    expect(formatWeight(80, 'kg')).toBe('80 kg');
    expect(formatWeight(83.914, 'kg')).toBe('83.91 kg');
  });

  it('picks the default unit for a measurement system', () => {
    expect(defaultUnitFor('us')).toBe('lb');
    expect(defaultUnitFor('metric')).toBe('kg');
    expect(defaultUnitFor('uk')).toBe('kg');
    expect(defaultUnitFor(null)).toBe('kg');
  });

  it('converts increments by the gym convention, kg = lb / 2 and lb = kg x 2', () => {
    expect(convertIncrement(5, 'lb', 'kg')).toBe(2.5);
    expect(convertIncrement(2.5, 'kg', 'lb')).toBe(5);
    expect(convertIncrement(10, 'lb', 'kg')).toBe(5);
    expect(convertIncrement(5, 'lb', 'lb')).toBe(5);
    expect(convertIncrement(2.5, 'kg', 'kg')).toBe(2.5);
  });

  it('rounds to the nearest 0.5', () => {
    expect(roundToHalf(22.68)).toBe(22.5);
    expect(roundToHalf(22.75)).toBe(23);
  });
});
