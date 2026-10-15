import { parseDecimal, parseDuration, parseReps, parseRpe } from './input';

describe('parseDecimal', () => {
  it.each([
    ['82,5', 82.5],
    ['82.5', 82.5],
    [' 100 ', 100],
    ['0', 0],
  ])('parseDecimal(%p)', (t, v) => expect(parseDecimal(t)).toBe(v));

  it.each(['', 'abc', '-5', '1.2.3', '1e3', '1,2,3'])('parseDecimal rejects %p', (t) =>
    expect(parseDecimal(t)).toBeNull(),
  );
});

describe('parseReps', () => {
  it('accepts whole non-negative numbers and rejects the rest', () => {
    expect(parseReps('8')).toBe(8);
    expect(parseReps('0')).toBe(0);
    expect(parseReps('8.5')).toBeNull();
    expect(parseReps('-1')).toBeNull();
  });
});

describe('parseDuration', () => {
  it('parses seconds and m:ss into seconds', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:03')).toBe(63);
  });

  it('parses h:mm:ss for a long run or a capped For Time ("1:05:00" is 65 minutes)', () => {
    expect(parseDuration('1:05:00')).toBe(3900);
    expect(parseDuration('1:30:15')).toBe(5415);
    expect(parseDuration('0:07:42')).toBe(462);
  });

  it('rejects out-of-range seconds and blank input', () => {
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('1:60:00')).toBeNull();
    expect(parseDuration('1:05:75')).toBeNull();
    expect(parseDuration('1:5:00')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });
});

describe('parseRpe', () => {
  it('accepts 6 to 10 in half steps, with a comma or full stop', () => {
    expect(parseRpe('8')).toBe(8);
    expect(parseRpe('8,5')).toBe(8.5);
  });

  it('rejects off-step and out-of-range values', () => {
    expect(parseRpe('8.3')).toBeNull();
    expect(parseRpe('5.5')).toBeNull();
    expect(parseRpe('10.5')).toBeNull();
  });
});
