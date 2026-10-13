import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { getSettings } from '../db/repositories/settingsRepo';
import { useDbQuery } from '../state/dataVersion';
import { darkColors, lightColors, resolveScheme } from './theme';
import type { Colors, Scheme } from './theme';

type Theme = { scheme: Scheme; colors: Colors };

const ThemeContext = createContext<Theme | null>(null);

/** The device's light or dark setting, or null when it has none. */
export function useSystemScheme(): Scheme | null {
  const system = useColorScheme();
  return system === 'light' || system === 'dark' ? system : null;
}

/** Resolves the stored Light / Dark / System preference against the device setting. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const pref = useDbQuery(getSettings).theme;
  const system = useSystemScheme();
  const scheme = resolveScheme(pref, system);
  const theme = useMemo<Theme>(() => ({ scheme, colors: scheme === 'dark' ? darkColors : lightColors }), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside ThemeProvider');
  return theme;
}
