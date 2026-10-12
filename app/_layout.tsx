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
import { Platform } from 'react-native';
import { closeAppDb, liveDbPath, openAppDb, openAppDbAsync } from '../src/db/client';
import { DbProvider } from '../src/db/DbProvider';
import migrations from '../src/db/migrations/migrations';
import { tryBackfillPrFlags } from '../src/db/repositories/prRepo';
import { ensureSettings } from '../src/db/repositories/settingsRepo';
import { setAsideDamaged, snapshotTime, startDatabase } from '../src/db/snapshots';
import type { Db } from '../src/db/types';
import { formatDateTime } from '../src/domain/dates';
import { fileExists, getSnapshotFiles, openSnapshotForCheck, setAsidePath } from '../src/platform/snapshots';
import { runSeed } from '../src/seed/seed';
import { latestSnapshotPath, recordRestoredSnapshot } from '../src/state/backup';
import { afterDatabaseStart, beforeDatabaseStart } from '../src/state/nativeServices';
// Loaded here, with the root layout, so its browser-history listener is added before the router's (see the module).
import '../src/state/draftFlush';
import { Button } from '../src/ui/Button';
import { RestWatcher } from '../src/ui/session/RestWatcher';
import { Sheet } from '../src/ui/Sheet';
import { NO_EXPORTS, StartupError, type ExportFiles } from '../src/ui/StartupError';
import { Body } from '../src/ui/Text';
import { fonts } from '../src/ui/theme';
import { ThemeProvider, useTheme } from '../src/ui/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});

const asError = (e: unknown) => (e instanceof Error ? e : new Error(String(e)));

/** A path from `find`, only if the file is there. Never throws. */
function existing(find: () => string | null): string | null {
  try {
    const path = find();
    return path !== null && fileExists(path) ? path : null;
  } catch {
    return null;
  }
}

/**
 * What the database startup came to: the app is ready, or the error screen shows with whatever export is possible, and
 * Start fresh when there is no data to lose (R421).
 */
type Started =
  | { kind: 'ready'; db: Db; restoredFrom: string | null }
  | { kind: 'failed'; error: Error; exports: ExportFiles; canStartFresh?: boolean };

type MigrateTarget = Parameters<typeof migrate>[0];
const migrateApp = (db: Db) => migrate(db as MigrateTarget, migrations);

/**
 * Opens the database. `fresh` is Start fresh on the error screen (R421): the damaged snapshots and live file are set
 * aside first (`setAsideDamaged`), and iCloud is not asked, so the start opens a new, empty database.
 */
async function startApp(fresh = false): Promise<Started> {
  const files = getSnapshotFiles();
  if (!files) {
    // Web has no snapshots, so it never restores.
    const db = await openAppDbAsync();
    await migrateApp(db);
    return { kind: 'ready', db, restoredFrom: null };
  }
  if (fresh) setAsideDamaged(files, Date.now());
  else await beforeDatabaseStart(); // Phase 7: a new iPhone brings its newest iCloud snapshot first (no-op in Expo Go).
  const result = await startDatabase({
    files,
    open: openAppDb,
    close: closeAppDb,
    migrate: migrateApp,
    openSnapshot: openSnapshotForCheck,
    now: Date.now(),
  });
  if (result.kind === 'ok') {
    afterDatabaseStart(result.db); // Phase 7: Health retries and the iCloud copy, in the background (no-op in Expo Go).
    return { kind: 'ready', db: result.db, restoredFrom: result.restoredFrom };
  }
  return {
    kind: 'failed',
    error: result.error,
    canStartFresh: result.allDamaged === true,
    exports: {
      snapshot: existing(() => (result.newestSnapshot === null ? null : files.pathFor(result.newestSnapshot))),
      // Set aside if the failed file was moved; otherwise it is still the live file.
      failed: existing(() => (result.setAside === null ? liveDbPath() : setAsidePath(result.setAside))),
    },
  };
}

let starting: Promise<Started> | null = null;

/**
 * Starts the database once per launch (a second call, such as a development remount, shares the first). `fresh` starts
 * again from the error screen's Start fresh (R421), where nothing is open.
 * It never rejects: any throw at all becomes the error screen, with whatever can still be exported.
 */
function start(fresh = false): Promise<Started> {
  if (fresh) starting = null;
  starting ??= startApp(fresh).catch(
    (e): Started => ({
      kind: 'failed',
      error: asError(e),
      exports: Platform.OS === 'web' ? NO_EXPORTS : { snapshot: existing(latestSnapshotPath), failed: existing(liveDbPath) },
    }),
  );
  return starting;
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
        {/* The barcode scanner (R547) fills the screen: the camera needs the room. */}
        <Stack.Screen name="food/scan" options={{ presentation: 'fullScreenModal' }} />
        {/* Stats on an exercise in a workout (R554): the lift's page over the session. */}
        <Stack.Screen name="lift-stats/[id]" options={{ presentation: 'modal' }} />
        {/* Phase 6 (R181): a progress photo opens full screen, with no dock. */}
        <Stack.Screen name="photo/[id]" options={{ presentation: 'fullScreenModal' }} />
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
  if (started.kind === 'failed') {
    const startFresh = () => {
      setStarted(null);
      start(true).then(setStarted);
    };
    return <StartupError error={started.error} exports={started.exports} onStartFresh={started.canStartFresh ? startFresh : undefined} />;
  }
  return (
    <DbProvider db={started.db}>
      <Boot db={started.db} restoredFrom={started.restoredFrom} />
    </DbProvider>
  );
}
