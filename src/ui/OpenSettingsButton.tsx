import { Linking, View } from 'react-native';
import { Button } from './Button';

/** Opens this app's page in the phone's Settings, where a refused permission is turned back on. A failure does nothing. */
export function openPhoneSettings(): void {
  Linking.openSettings().catch(() => {});
}

/**
 * **Open Settings** (§18.15, R409), a compact secondary pill under a line that says a permission is off: the line says
 * where to turn it on, and this takes the lifter there. In Expo Go it opens Expo Go's page, which holds the permission.
 * `accessibilityLabel` says which permission when the screen has more than one.
 */
export function OpenSettingsButton({ accessibilityLabel }: { accessibilityLabel?: string }) {
  return (
    // 4pt inset keeps the pill's 4pt hit slop inside its section.
    <View style={{ alignItems: 'flex-start', padding: 4, margin: -4 }}>
      <Button label="Open Settings" variant="secondary" size="compact" accessibilityLabel={accessibilityLabel} onPress={openPhoneSettings} />
    </View>
  );
}
