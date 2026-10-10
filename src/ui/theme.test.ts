import { darkColors, fonts, lightColors, resolveScheme } from './theme';

describe('theme', () => {
  it('has the dark palette from the spec', () => {
    expect(darkColors).toEqual({ bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' });
  });

  it('has the light palette from the spec', () => {
    expect(lightColors).toEqual({ bg: '#f6f3ec', surface: '#ffffff', surfaceRaised: '#efebe3', border: '#ddd7cb', text: '#15130f', textMuted: '#6b665c', red: '#E10600' });
  });

  it('names the six bundled font faces', () => {
    expect(fonts).toEqual({
      display600: 'BarlowCondensed_600SemiBold',
      display700: 'BarlowCondensed_700Bold',
      display800: 'BarlowCondensed_800ExtraBold',
      body400: 'Inter_400Regular',
      body500: 'Inter_500Medium',
      body600: 'Inter_600SemiBold',
    });
  });

  it('follows the system scheme only when the preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('falls back to light when the system scheme is unknown', () => {
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });
});
