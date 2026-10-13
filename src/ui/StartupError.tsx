import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { focusOn } from '../platform/announce';
import { shareFile } from '../state/backup';
import { darkColors, fonts, lightColors, resolveScheme, type Colors } from './theme';
import { useSystemScheme } from './ThemeProvider';

/** Files the error screen can hand to the share sheet, as absolute paths. Each is null unless that file exists. */
export type ExportFiles = { snapshot: string | null; failed: string | null };
export const NO_EXPORTS: ExportFiles = { snapshot: null, failed: null };

/** Start fresh's question (R421): what it does, and that the damaged files are kept. */
export const START_FRESH_QUESTION =
  'Start with no data? The damaged files are kept in a folder on this phone, in case they can be recovered.';

/** The error screen's own button. It cannot use `Button`, which needs the theme, and the theme needs the database that just failed. */
function ErrorButton({ label, onPress, primary, colors }: { label: string; onPress: () => void; primary: boolean; colors: Colors }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
 * With `onStartFresh` (the live file was missing or empty and every snapshot failed its check, R421), **Start fresh**
 * asks first, in place, then calls it. The error text stays on screen throughout (§12).
 */
export function StartupError({ error, exports = NO_EXPORTS, onStartFresh }: { error: Error; exports?: ExportFiles; onStartFresh?: () => void }) {
  const colors = resolveScheme('system', useSystemScheme()) === 'dark' ? darkColors : lightColors;
  const [shareFailed, setShareFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const question = useRef<Text>(null);
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  // The question takes the button's place, so VoiceOver moves to it.
  useEffect(() => {
    if (asking) focusOn(question.current);
  }, [asking]);
  const share = (path: string) => {
    setShareFailed(false);
    shareFile(path).catch((error: unknown) => {
      console.warn('GymHound could not share the file.', error);
      setShareFailed(true);
    });
  };
  const { snapshot, failed } = exports;
  const muted = { fontFamily: fonts.body400, fontSize: 14, color: colors.textMuted };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24, gap: 8 }}>
      <Text style={{ fontFamily: fonts.body600, fontSize: 18, color: colors.text }}>GymHound couldn't update its database.</Text>
      <Text style={muted}>{error.message}</Text>
      {snapshot !== null || failed !== null || onStartFresh ? (
        <View style={{ gap: 8, marginTop: 16 }}>
          {snapshot !== null ? <ErrorButton label="Export my data" primary colors={colors} onPress={() => share(snapshot)} /> : null}
          {failed !== null ? (
            <ErrorButton label="Export the file that failed" primary={false} colors={colors} onPress={() => share(failed)} />
          ) : null}
          {shareFailed ? <Text style={muted}>Couldn't open the share sheet. Try again.</Text> : null}
          {onStartFresh && !asking ? <ErrorButton label="Start fresh" primary={false} colors={colors} onPress={() => setAsking(true)} /> : null}
          {onStartFresh && asking ? (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text ref={question} style={{ fontFamily: fonts.body400, fontSize: 16, color: colors.text }}>
                {START_FRESH_QUESTION}
              </Text>
              <ErrorButton label="Start fresh" primary colors={colors} onPress={onStartFresh} />
              <ErrorButton label="Cancel" primary={false} colors={colors} onPress={() => setAsking(false)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
