import { Pressable, View } from 'react-native';
import { useDb } from '../../src/db/DbProvider';
import { getSettings, setSetting } from '../../src/db/repositories/settingsRepo';
import type { ThemePreference } from '../../src/domain/types';
import { bumpData, useDbQuery } from '../../src/state/dataVersion';
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

/** Settings so far: Appearance. The rest arrive in later tasks. */
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
    </Screen>
  );
}
