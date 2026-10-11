import {
  BODY_KINDS,
  BODY_LABELS,
  bodyUnit,
  convertBody,
  dailySeries,
  formatBodyValue,
  isBodyKind,
  lengthUnitFor,
  parseBodyValue,
  type BodyEntry,
} from './body';

describe('BODY_KINDS and BODY_LABELS', () => {
  it('lists bodyweight then the seven measurements, each with its label', () => {
    expect(BODY_KINDS).toEqual(['bodyweight', 'waist', 'chest', 'hips', 'arms', 'thighs', 'neck', 'body_fat']);
    expect(BODY_KINDS.map((k) => BODY_LABELS[k])).toEqual([
      'Bodyweight',
      'Waist',
      'Chest',
      'Hips',
      'Arms',
      'Thighs',
      'Neck',
      'Body fat',
    ]);
  });

  it('isBodyKind accepts the eight kinds only (a route parameter is any string)', () => {
    for (const k of BODY_KINDS) expect(isBodyKind(k)).toBe(true);
    expect(isBodyKind('calves')).toBe(false);
    expect(isBodyKind('')).toBe(false);
    expect(isBodyKind('toString')).toBe(false);
  });
});

describe('units per kind (R112)', () => {
  it('lengths follow the weight unit', () => {
    expect(lengthUnitFor('lb')).toBe('in');
    expect(lengthUnitFor('kg')).toBe('cm');
  });

  it('gives an lb user lb, inches and %', () => {
    expect(bodyUnit('bodyweight', 'lb')).toBe('lb');
    for (const k of ['waist', 'chest', 'hips', 'arms', 'thighs', 'neck'] as const) expect(bodyUnit(k, 'lb')).toBe('in');
    expect(bodyUnit('body_fat', 'lb')).toBe('%');
  });

  it('gives a kg user kg, centimetres and %', () => {
    expect(bodyUnit('bodyweight', 'kg')).toBe('kg');
    for (const k of ['waist', 'chest', 'hips', 'arms', 'thighs', 'neck'] as const) expect(bodyUnit(k, 'kg')).toBe('cm');
    expect(bodyUnit('body_fat', 'kg')).toBe('%');
  });
});

describe('convertBody', () => {
  it('converts inches to centimetres and back', () => {
    expect(convertBody(34, 'in', 'cm')).toBeCloseTo(86.36, 10);
    expect(convertBody(86.36, 'cm', 'in')).toBeCloseTo(34, 10);
  });

  it('converts lb and kg by the exact factor (§7.1)', () => {
    expect(convertBody(100, 'kg', 'lb')).toBeCloseTo(220.462, 3);
    expect(convertBody(220.462262, 'lb', 'kg')).toBeCloseTo(100, 5);
  });

  it('leaves a value unchanged in the same unit, % included', () => {
    expect(convertBody(18.5, '%', '%')).toBe(18.5);
    expect(convertBody(80, 'kg', 'kg')).toBe(80);
  });

  it('refuses to convert between a weight and a length', () => {
    expect(() => convertBody(80, 'kg', 'cm')).toThrow();
    expect(() => convertBody(20, '%', 'in')).toThrow();
  });
});

describe('parseBodyValue (R117)', () => {
  it('accepts body fat at the bounds, 2 and 75 %', () => {
    expect(parseBodyValue('body_fat', '2', '%')).toEqual({ valid: true, value: 2 });
    expect(parseBodyValue('body_fat', '75', '%')).toEqual({ valid: true, value: 75 });
  });

  it('rejects 1.9 %, 75.1 %, "abc", "-3" and an empty field', () => {
    for (const t of ['1.9', '75.1', 'abc', '-3', '', '  ']) {
      expect(parseBodyValue('body_fat', t, '%')).toEqual({ valid: false, value: null });
    }
  });

  it('takes a comma or a dot as the decimal point', () => {
    expect(parseBodyValue('bodyweight', '82,5', 'kg')).toEqual({ valid: true, value: 82.5 });
    expect(parseBodyValue('bodyweight', ' 182.5 ', 'lb')).toEqual({ valid: true, value: 182.5 });
  });

  it('bounds bodyweight at 20–1000 lb and 10–450 kg (catches 1855)', () => {
    expect(parseBodyValue('bodyweight', '20', 'lb').valid).toBe(true);
    expect(parseBodyValue('bodyweight', '1000', 'lb').valid).toBe(true);
    expect(parseBodyValue('bodyweight', '19.9', 'lb').valid).toBe(false);
    expect(parseBodyValue('bodyweight', '1855', 'lb').valid).toBe(false);
    expect(parseBodyValue('bodyweight', '10', 'kg').valid).toBe(true);
    expect(parseBodyValue('bodyweight', '450', 'kg').valid).toBe(true);
    expect(parseBodyValue('bodyweight', '9.9', 'kg').valid).toBe(false);
    expect(parseBodyValue('bodyweight', '451', 'kg').valid).toBe(false);
  });

  it('bounds lengths at 5–100 in and 12–250 cm', () => {
    expect(parseBodyValue('waist', '5', 'in').valid).toBe(true);
    expect(parseBodyValue('waist', '100', 'in').valid).toBe(true);
    expect(parseBodyValue('waist', '4.9', 'in').valid).toBe(false);
    expect(parseBodyValue('neck', '101', 'in').valid).toBe(false);
    expect(parseBodyValue('arms', '12', 'cm').valid).toBe(true);
    expect(parseBodyValue('thighs', '250', 'cm').valid).toBe(true);
    expect(parseBodyValue('arms', '11.9', 'cm').valid).toBe(false);
    expect(parseBodyValue('chest', '250.5', 'cm').valid).toBe(false);
  });

  it('rejects a unit that does not belong to the kind', () => {
    expect(parseBodyValue('bodyweight', '34', 'in').valid).toBe(false);
    expect(parseBodyValue('waist', '80', 'kg').valid).toBe(false);
    expect(parseBodyValue('body_fat', '20', 'cm').valid).toBe(false);
    expect(parseBodyValue('hips', '20', '%').valid).toBe(false);
  });
});

describe('formatBodyValue', () => {
  it('shows one decimal at most, with the unit', () => {
    expect(formatBodyValue(182.5, 'lb')).toBe('182.5 lb');
    expect(formatBodyValue(34, 'in')).toBe('34 in');
    expect(formatBodyValue(86.36, 'cm')).toBe('86.4 cm');
    expect(formatBodyValue(80.04, 'kg')).toBe('80 kg');
  });

  it('puts % right after the number', () => {
    expect(formatBodyValue(18.5, '%')).toBe('18.5%');
    expect(formatBodyValue(20, '%')).toBe('20%');
  });
});

describe('dailySeries (R115)', () => {
  const e = (id: string, localDate: string, measuredAt: number, value: number, unit: BodyEntry['unit']): BodyEntry => ({
    id,
    kind: 'bodyweight',
    localDate,
    measuredAt,
    value,
    unit,
  });

  it('is empty for no entries', () => {
    expect(dailySeries([], 'lb')).toEqual([]);
  });

  it('keeps the later of two entries on the same day, whatever the input order', () => {
    const morning = e('a', '2026-10-01', 1000, 180, 'lb');
    const evening = e('b', '2026-10-01', 2000, 182, 'lb');
    expect(dailySeries([morning, evening], 'lb')).toEqual([{ localDate: '2026-10-01', value: 182 }]);
    expect(dailySeries([evening, morning], 'lb')).toEqual([{ localDate: '2026-10-01', value: 182 }]);
  });

  it('orders days oldest first from newest-first input', () => {
    const rows = [
      e('c', '2026-10-03', 3000, 181, 'lb'),
      e('b', '2026-10-02', 2000, 182, 'lb'),
      e('a', '2026-10-01', 1000, 183, 'lb'),
    ];
    expect(dailySeries(rows, 'lb').map((p) => p.localDate)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });

  it('converts mixed lb and kg bodyweight to the display unit', () => {
    const rows = [e('a', '2026-10-01', 1000, 220.462262, 'lb'), e('b', '2026-10-02', 2000, 99, 'kg')];
    const series = dailySeries(rows, 'kg');
    expect(series[0].value).toBeCloseTo(100, 5);
    expect(series[1].value).toBe(99);
    const inLb = dailySeries(rows, 'lb');
    expect(inLb[0].value).toBe(220.462262);
    expect(inLb[1].value).toBeCloseTo(218.258, 3);
  });

  it('converts inches and centimetres for a measurement', () => {
    const rows: BodyEntry[] = [
      { id: 'a', kind: 'waist', localDate: '2026-10-01', measuredAt: 1, value: 34, unit: 'in' },
      { id: 'b', kind: 'waist', localDate: '2026-10-02', measuredAt: 2, value: 85, unit: 'cm' },
    ];
    const series = dailySeries(rows, 'cm');
    expect(series[0].value).toBeCloseTo(86.36, 10);
    expect(series[1].value).toBe(85);
  });
});
