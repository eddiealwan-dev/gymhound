import { BarlowCondensed_600SemiBold } from '@expo-google-fonts/barlow-condensed/600SemiBold';
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed/700Bold';
import { BarlowCondensed_800ExtraBold } from '@expo-google-fonts/barlow-condensed/800ExtraBold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { getLocales } from 'expo-localization';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { closeAppDb, liveDbPath, openAppDb, openAppDbAsync } from '../src/db/client';
import { DbProvider } from '../src/db/DbProvider';
import migrations from '../src/db/migrations/migrations';
import { tryBackfillPrFlags } from '../src/db/repositories/prRepo';
import { ensureSettings } from '../src/db/repositories/settingsRepo';
import { snapshotTime, startDatabase } from '../src/db/snapshots';
import type { Db } from '../src/db/types';
import { formatDateTime } from '../src/domain/dates';
import { fileExists, getSnapshotFiles, setAsidePath } from '../src/platform/snapshots';
import { runSeed } from '../src/seed/seed';
import { latestSnapshotPath, recordRestoredSnapshot, shareFile } from '../src/state/backup';
// Loaded here, with the root layout, so its browser-history listener is added before the router's (see the module).
import '../src/state/draftFlush';
import { Button } from '../src/ui/Button';
import { RestWatcher } from '../src/ui/session/RestWatcher';
import { Sheet } from '../src/ui/Sheet';
import { Body } from '../src/ui/Text';
import { darkColors, fonts, lightColors, resolveScheme, type Colors } from '../src/ui/theme';
import { ThemeProvider, useSystemScheme, useTheme } from '../src/ui/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

/** Files the error screen can hand to the share sheet, as absolute paths. Each is null unless that file exists. */
type ExportFiles = { snapshot: string | null; failed: string | null };
const NO_EXPORTS: ExportFiles = { snapshot: null, failed: null };

/** A path from `find`, only if the file is there. Never throws. */
function existing(find: () => string | null): string | null {
  try {
    const path = find();
    return path !== null && fileExists(path) ? path : null;
  } catch {
    return null;
  }
}

/** What the database startup came to: the app is ready, or the error screen shows with whatever export is possible. */
type Started =
  | { kind: 'ready'; db: Db; restoredFrom: string | null }
  | { kind: 'failed'; error: Error; exports: ExportFiles };

type MigrateTarget = Parameters<typeof migrate>[0];
const migrateApp = (db: Db) => migrate(db as MigrateTarget, migrations);

async function startApp(): Promise<Started> {
  const files = getSnapshotFiles();
  if (!files) {
    // Web has no snapshots, so it never restores.
    const db = await openAppDbAsync();
    await migrateApp(db);
    return { kind: 'ready', db, restoredFrom: null };
  }
  const result = await startDatabase({ files, open: openAppDb, close: closeAppDb, migrate: migrateApp, now: Date.now() });
  if (result.kind === 'ok') return { kind: 'ready', db: result.db, restoredFrom: result.restoredFrom };
  return {
    kind: 'failed',
    error: result.error,
    exports: {
      snapshot: existing(() => (result.newestSnapshot === null ? null : files.pathFor(result.newestSnapshot))),
      // Set aside if the failed file was moved; otherwise it is still the live file.
      failed: existing(() => (result.setAside === null ? liveDbPath() : setAsidePath(result.setAside))),
    },
  };
}

let starting: Promise<Started> | null = null;

/**
 * Starts the database once per launch (a second call, such as a development remount, shares the first).
 * It never rejects: any throw at all becomes the error screen, with whatever can still be exported.
 */
function start(): Promise<Started> {
  starting ??= startApp().catch(
    (e): Started => ({
      kind: 'failed',
      error: asError(e),
      exports: Platform.OS === 'web' ? NO_EXPORTS : { snapshot: existing(latestSnapshotPath), failed: existing(liveDbPath) },
    }),
  );
  return starting;
}

/** The error screen's own button. It cannot use `Button`, which needs the theme, and the theme needs the database that just failed. */
function ErrorButton({ label, onPress, primary, colors }: { label: string; onPress: () => void; primary: boolean; colors: Colors }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: primary ? 'transparent' : colors.border,
        backgroundColor: primary ? colors.text : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.body600, fontSize: 16, color: primary ? colors.bg : colors.text }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Shown instead of the app when the database cannot be opened, migrated or seeded. There is no stored theme to read, so it follows the device.
 * **Export my data** shares the newest snapshot and **Export the file that failed** shares the database file that did not work; each is shown only when its file exists.
 */
function StartupError({ error, exports = NO_EXPORTS }: { error: Error; exports?: ExportFiles }) {
  const colors = resolveScheme('system', useSystemScheme()) === 'dark' ? darkColors : lightColors;
  const [shareFailed, setShareFailed] = useState(false);
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const share = (path: string) => {
    setShareFailed(false);
    shareFile(path).catch(() => setShareFailed(true));
  };
  const { snapshot, failed } = exports;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontFamily: fonts.body600, fontSize: 18, color: colors.text }}>GymHound couldn't update its database.</Text>
      <Text style={{ fontFamily: fonts.body400, fontSize: 14, color: colors.textMuted }}>{error.message}</Text>
      {snapshot !== null || failed !== null ? (
        <View style={{ gap: 8, marginTop: 16 }}>
          {snapshot !== null ? <ErrorButton label="Export my data" primary colors={colors} onPress={() => share(snapshot)} /> : null}
          {failed !== null ? (
            <ErrorButton label="Export the file that failed" primary={false} colors={colors} onPress={() => share(failed)} />
          ) : null}
          {shareFailed ? (
            <Text style={{ fontFamily: fonts.body400, fontSize: 14, color: colors.textMuted }}>Couldn't open the share sheet.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Said once, on the launch that restored from a snapshot. */
function RestoredNotice({ restoredFrom }: { restoredFrom: string }) {
  const [open, setOpen] = useState(true);
  const when = formatDateTime(snapshotTime(restoredFrom));
  return (
    <Sheet visible={open} onClose={() => setOpen(false)}>
      <Body style={{ marginBottom: 16 }}>{`GymHound restored your data from ${when}. A workout that was in progress may be missing.`}</Body>
      <Button label="OK" onPress={() => setOpen(false)} />
    </Sheet>
  );
}

function ThemedStack({ restoredFrom }: { restoredFrom: string | null }) {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* The session has no swipe-down to leave: a stray drag mid-set must not close it. Its back chevron leaves the workout active. */}
        <Stack.Screen name="session" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        {/* The exercise picker rises over the session. */}
        <Stack.Screen name="pick-exercise" options={{ presentation: 'modal' }} />
        {/* Your own exercise: the editor opens over the picker (phase 4). */}
        <Stack.Screen name="exercise/[id]" options={{ presentation: 'modal' }} />
        {/* The summary of the workout just finished. Done leaves it. */}
        <Stack.Screen name="finish/[id]" options={{ presentation: 'fullScreenModal' }} />
        {/* Phase 5 (R154): the paywall, full screen above the tabs with no dock (§8.1); adding food and your own foods rise over Fuel. */}
        <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="food/add" options={{ presentation: 'modal' }} />
        <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Rings the end of the rest timer wherever the user is in the app. */}
      <RestWatcher />
      {restoredFrom !== null ? <RestoredNotice restoredFrom={restoredFrom} /> : null}
    </>
  );
}

/**
 * The database is open and migrated. Ensures settings (so the seed picks the device's units), then seeds, writes PR
 * flags for older workouts once (R127), and only then shows the app.
 */
function Boot({ db, restoredFrom }: { db: Db; restoredFrom: string | null }) {
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
    try {
      ensureSettings(db, getLocales()[0]?.measurementSystem ?? null);
      runSeed(db, Date.now());
      // Once (R127): PR flags for workouts finished before phase 4. Only reads a setting after that. A failure is
      // logged and retried next launch, never the error screen.
      tryBackfillPrFlags(db);
      if (restoredFrom !== null) recordRestoredSnapshot(db, restoredFrom);
      setSeeded(true);
    } catch (e) {
      setSeedError(asError(e));
    }
  }, [db, restoredFrom]);

  // A font that fails to load falls back to the system font; it never blocks the app.
  const ready = seeded && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (seedError) return <StartupError error={seedError} exports={{ snapshot: existing(latestSnapshotPath), failed: null }} />;
  if (!ready) return null;
  return (
    <ThemeProvider>
      <ThemedStack restoredFrom={restoredFrom} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [started, setStarted] = useState<Started | null>(null);
  useEffect(() => {
    start().then(setStarted);
  }, []);
  if (!started) return null;
  if (started.kind === 'failed') return <StartupError error={started.error} exports={started.exports} />;
  return (
    <DbProvider db={started.db}>
      <Boot db={started.db} restoredFrom={started.restoredFrom} />
    </DbProvider>
  );
}
