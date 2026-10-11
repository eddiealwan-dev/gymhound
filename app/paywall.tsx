import { router } from 'expo-router';
import { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEntitlementsState } from '../src/platform/entitlements';
import { Button } from '../src/ui/Button';
import { ProPitch } from '../src/ui/pro/ProPitch';
import { Body, Display } from '../src/ui/Text';
import { useTheme } from '../src/ui/ThemeProvider';

/**
 * The paywall (§8.12, R154): full screen above the tabs, with no header, dock or footer. It scrolls, keeps clear of
 * the notch and the home indicator, and is no wider than 512. Not now, or Pro coming on, goes back, once: a purchase
 * that goes through after Not now must not pop the screen under the paywall. Opened with Pro already on, it says so
 * with Done.
 */
export default function Paywall() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isPro } = useEntitlementsState();
  const left = useRef(false);
  const done = () => {
    if (left.current) return;
    left.current = true;
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View style={{ flexGrow: 1, width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 32, paddingBottom: 16 }}>
          {isPro ? (
            <View style={{ gap: 16 }}>
              <Display accessibilityRole="header">GymHound Pro</Display>
              <Body>Pro is on.</Body>
              <View style={{ marginTop: 8 }}>
                <Button label="Done" onPress={done} />
              </View>
            </View>
          ) : (
            <ProPitch context="screen" onDone={done} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
