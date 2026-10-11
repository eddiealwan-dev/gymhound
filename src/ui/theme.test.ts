import { darkColors, fonts, lightColors, resolveScheme } from './theme';

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two `#rrggbb` colours, from 1 to 21. */
function ratio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme', () => {
  it('has the dark palette from the spec', () => {
    expect(darkColors).toEqual({
      bg: '#100f0c',
      surface: '#1a1814',
      surfaceRaised: '#232019',
      border: '#2e2a23',
      text: '#f1ece2',
      textMuted: '#a39d90',
      red: '#E10600',
      textFaint: '#6d675c',
      borderStrong: '#736c60',
    });
  });

  it('has the light palette from the spec', () => {
    expect(lightColors).toEqual({
      bg: '#f6f3ec',
      surface: '#ffffff',
      surfaceRaised: '#efebe3',
      border: '#ddd7cb',
      text: '#15130f',
      textMuted: '#6b665c',
      red: '#E10600',
      textFaint: '#8f897d',
      borderStrong: '#8a8478',
    });
  });

  it('suggested text reads at 3:1 or more on the field', () => {
    for (const c of [darkColors, lightColors]) {
      expect(ratio(c.textFaint, c.bg)).toBeGreaterThanOrEqual(3);
      expect(ratio(c.textFaint, c.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('field edges read at 3:1 or more', () => {
    for (const c of [darkColors, lightColors]) {
      for (const g of [c.bg, c.surface, c.surfaceRaised]) expect(ratio(c.borderStrong, g)).toBeGreaterThanOrEqual(3);
    }
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
