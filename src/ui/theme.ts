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
 * A switch's colours. The thumb is the text colour, so it stands out from the page and the card: on Android and the
 * web it is wider than the track and its edge sits on them (a bg-coloured thumb all but vanished there in dark). On,
 * the track is borderStrong; off, it is border, a step quieter. The thumb reads at 3:1 or more on either, and its
 * place tells on from off.
 */
export function switchColors(colors: Colors): { thumb: string; trackOn: string; trackOff: string } {
  return { thumb: colors.text, trackOn: colors.borderStrong, trackOff: colors.border };
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
