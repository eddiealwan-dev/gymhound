import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getSettings, setSetting } from '../../src/db/repositories/settingsRepo';
import type { Db } from '../../src/db/types';
import { formatDateTime } from '../../src/domain/dates';
import type { ThemePreference } from '../../src/domain/types';
import { latestSnapshotPath, shareFile } from '../../src/state/backup';
import { bumpData, useDbQuery } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/** Light, Dark or System. The choice is stored, and the theme provider re-reads it. */
function AppearanceControl() {
  const { colors } = useTheme();
  const db = useDb();
  const current = useDbQuery(getSettings).theme;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Appearance"
      style={{ flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 4, gap: 4 }}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === current;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              setSetting(db, 'theme', option.value);
              bumpData();
            }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 9,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? colors.text : 'transparent',
            }}
          >
            <Body weight={600} style={{ color: selected ? colors.bg : colors.text }}>
              {option.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Module-level, so `useDbQuery` reads again only when the data changes or the screen regains focus. */
const readBackups = (db: Db) => ({ lastSnapshotAt: getSettings(db).lastSnapshotAt, latestPath: latestSnapshotPath() });

/** When the last good snapshot was written, and a way to send the newest one somewhere safe. Snapshots run in the phone app only. */
function BackupsSection() {
  const { lastSnapshotAt, latestPath } = useDbQuery(readBackups);
  const [shareFailed, setShareFailed] = useState(false);
  return (
    <View style={{ gap: 8, marginTop: 24 }}>
      <Body weight={600} muted>
        Backups
      </Body>
      {Platform.OS === 'web' ? (
        <Body>Backups run in the phone app.</Body>
      ) : (
        <>
          <Body>{lastSnapshotAt === null ? 'No snapshot yet.' : `Last snapshot: ${formatDateTime(lastSnapshotAt)}`}</Body>
          {latestPath !== null ? (
            <Button
              label="Share latest snapshot"
              variant="secondary"
              onPress={() => {
                setShareFailed(false);
                shareFile(latestPath).catch(() => setShareFailed(true));
              }}
            />
          ) : null}
          {shareFailed ? <Body muted>Couldn't open the share sheet.</Body> : null}
        </>
      )}
    </View>
  );
}

/** Settings so far: Appearance and Backups. The rest arrive in later tasks. */
export default function Settings() {
  return (
    <Screen footer>
      <Display>Settings</Display>
      <View style={{ gap: 8, marginTop: 16 }}>
        <Body weight={600} muted>
          Appearance
        </Body>
        <AppearanceControl />
      </View>
      <BackupsSection />
    </Screen>
  );
}
