import type { ThemePreference } from '../domain/types';

export type Colors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  red: string;
};

export const darkColors: Colors = {
  bg: '#100f0c',
  surface: '#1a1814',
  surfaceRaised: '#232019',
  border: '#2e2a23',
  text: '#f1ece2',
  textMuted: '#a39d90',
  red: '#E10600',
};

export const lightColors: Colors = {
  bg: '#f6f3ec',
  surface: '#ffffff',
  surfaceRaised: '#efebe3',
  border: '#ddd7cb',
  text: '#15130f',
  textMuted: '#6b665c',
  red: '#E10600',
};

export type Scheme = 'light' | 'dark';

/** The stored preference wins. `system` follows the device and falls back to light when the device has no answer. */
export function resolveScheme(pref: ThemePreference, system: Scheme | null | undefined): Scheme {
  if (pref === 'system') return system === 'dark' ? 'dark' : 'light';
  return pref;
}

/** Barlow Condensed for display and numbers, Inter for body. These are the names `useFonts` registers. */
export const fonts = {
  display600: 'BarlowCondensed_600SemiBold',
  display700: 'BarlowCondensed_700Bold',
  display800: 'BarlowCondensed_800ExtraBold',
  body400: 'Inter_400Regular',
  body500: 'Inter_500Medium',
  body600: 'Inter_600SemiBold',
} as const;
