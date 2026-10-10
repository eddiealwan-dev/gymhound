import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { openAppDbAsync } from '../src/db/client';
import { DbProvider } from '../src/db/DbProvider';
import migrations from '../src/db/migrations/migrations';
import { ensureSettings } from '../src/db/repositories/settingsRepo';
import type { Db } from '../src/db/types';
import { runSeed } from '../src/seed/seed';
import { darkColors, fonts, lightColors, resolveScheme } from '../src/ui/theme';
import { ThemeProvider, useSystemScheme, useTheme } from '../src/ui/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

/** Shown instead of the app when the database cannot be opened, migrated or seeded. There is no stored theme to read, so it follows the device. */
function StartupError({ error }: { error: Error }) {
  const colors = resolveScheme('system', useSystemScheme()) === 'dark' ? darkColors : lightColors;
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontFamily: fonts.body600, fontSize: 18, color: colors.text }}>GymHound couldn't update its database.</Text>
      <Text style={{ fontFamily: fonts.body400, fontSize: 14, color: colors.textMuted }}>{error.message}</Text>
    </View>
  );
}

function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
    </>
  );
}

/** Migrates, then ensures settings (so the seed picks the device's units), then seeds, and only then shows the app. */
function Boot({ db }: { db: Db }) {
  const migrated = useMigrations(db as Parameters<typeof useMigrations>[0], migrations);
  const [fontsLoaded, fontError] = useFonts({
    [fonts.display600]: BarlowCondensed_600SemiBold,
    [fonts.display700]: BarlowCondensed_700Bold,
    [fonts.display800]: BarlowCondensed_800ExtraBold,
    [fonts.body400]: Inter_400Regular,
    [fonts.body500]: Inter_500Medium,
    [fonts.body600]: Inter_600SemiBold,
  });
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

  useEffect(() => {
    if (!migrated.success) return;
    try {
      ensureSettings(db, getLocales()[0]?.measurementSystem ?? null);
      runSeed(db, Date.now());
      setSeeded(true);
    } catch (e) {
      setSeedError(asError(e));
    }
  }, [db, migrated.success]);

  const error = migrated.error ?? seedError;
  // A font that fails to load falls back to the system font; it never blocks the app.
  const ready = seeded && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (error) return <StartupError error={error} />;
  if (!ready) return null;
  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [opened, setOpened] = useState<{ db: Db } | { error: Error } | null>(null);
  useEffect(() => {
    openAppDbAsync().then(
      (db) => setOpened({ db }),
      (e) => setOpened({ error: asError(e) }),
    );
  }, []);
  if (!opened) return null;
  if ('error' in opened) return <StartupError error={opened.error} />;
  return (
    <DbProvider db={opened.db}>
      <Boot db={opened.db} />
    </DbProvider>
  );
}
