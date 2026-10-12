import { dateFormat, numberFormat } from './intl';

describe('shared Intl formatters (performance pass)', () => {
  it('hands back the same formatter for the same locale and options', () => {
    expect(dateFormat('en-US', { month: 'long' })).toBe(dateFormat('en-US', { month: 'long' }));
    expect(numberFormat('en-US')).toBe(numberFormat('en-US'));
    expect(numberFormat('en-US', { maximumFractionDigits: 1 })).toBe(numberFormat('en-US', { maximumFractionDigits: 1 }));
  });

  it('keeps formatters for different locales or options apart', () => {
    expect(dateFormat('en-US', { month: 'long' })).not.toBe(dateFormat('en-GB', { month: 'long' }));
    expect(dateFormat('en-US', { month: 'long' })).not.toBe(dateFormat('en-US', { month: 'long', year: 'numeric' }));
    expect(numberFormat('en-US')).not.toBe(numberFormat('de-DE'));
  });

  it('formats as a new formatter does', () => {
    const day = new Date(2026, 9, 9);
    expect(dateFormat('en-GB', { day: 'numeric', month: 'short' }).format(day)).toBe(
      new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(day),
    );
    expect(numberFormat('de-DE').format(12480)).toBe(new Intl.NumberFormat('de-DE').format(12480));
  });
});
