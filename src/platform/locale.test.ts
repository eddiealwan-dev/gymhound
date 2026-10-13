import { deviceLocale, usableLocale } from './locale';

const mockLocales = jest.fn();
jest.mock('expo-localization', () => ({ getLocales: () => mockLocales() }));

describe('usableLocale', () => {
  it('keeps a normal tag', () => {
    expect(usableLocale('en-GB')).toBe('en-GB');
  });
  it('drops a POSIX suffix and fixes an underscore', () => {
    expect(usableLocale('en-US@posix')).toBe('en-US');
    expect(usableLocale('de_DE')).toBe('de-DE');
  });
  it('is null for a tag Intl cannot use, or none', () => {
    expect(usableLocale('not a tag!')).toBeNull();
    expect(usableLocale('')).toBeNull();
    expect(usableLocale(undefined)).toBeNull();
  });
});

describe('deviceLocale', () => {
  it('cleans the phone tag so date formatting never throws', () => {
    mockLocales.mockReturnValue([{ languageTag: 'en-US@posix' }]);
    expect(deviceLocale()).toBe('en-US');
    expect(() => new Intl.DateTimeFormat(deviceLocale())).not.toThrow();
  });
  it('falls back to en-US with no usable tag', () => {
    mockLocales.mockReturnValue([]);
    expect(deviceLocale()).toBe('en-US');
    mockLocales.mockReturnValue([{ languageTag: '!!' }]);
    expect(deviceLocale()).toBe('en-US');
  });
});
