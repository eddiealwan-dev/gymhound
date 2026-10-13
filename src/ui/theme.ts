import type { ThemePreference } from '../domain/types';

export type Colors = {
  bg: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  text: string;
  textMuted: string;
  /** Suggested values in empty fields: 3:1 or more on `bg` and `surface`. */
  textFaint: string;
  /** Field and compact-button edges: 3:1 or more on `bg`, `surface` and `surfaceRaised`. */
  borderStrong: string;
  red: string;
};

export const darkColors: Colors = {
  bg: '#100f0c',
  surface: '#1a1814',
  surfaceRaised: '#232019',
  border: '#2e2a23',
  text: '#f1ece2',
  textMuted: '#a39d90',
  textFaint: '#6d675c',
  borderStrong: '#736c60',
  red: '#E10600',
};

export const lightColors: Colors = {
  bg: '#f6f3ec',
  surface: '#ffffff',
  surfaceRaised: '#efebe3',
  border: '#ddd7cb',
  text: '#15130f',
  textMuted: '#6b665c',
  textFaint: '#8f897d',
  borderStrong: '#8a8478',
  red: '#E10600',
};

/**
 * A switch's colours, as DESIGN.md has them (R131, R171): on, a text-colour track under a background-colour thumb, the
 * brightest thing in its row; off, a borderStrong track (3:1 on the page in both themes) under a text-colour thumb. The
 * thumb swaps colour with the state, so on and off never look alike: with one dark thumb on both, on was hard to tell
 * in dark mode (Round 7). Each track reads on the page and the card, and its thumb on it, at 3:1 or more.
 */
export function switchColors(colors: Colors): { thumbOn: string; thumbOff: string; trackOn: string; trackOff: string } {
  return { thumbOn: colors.bg, thumbOff: colors.text, trackOn: colors.text, trackOff: colors.borderStrong };
}

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
