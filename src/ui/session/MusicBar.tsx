import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../db/DbProvider';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicApp } from '../../platform/music';
import { openMusicApp } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

type Props = {
  /** The app picked in the music sheet, already known to exist on this platform (`musicAppOn`). */
  app: MusicApp;
};

/**
 * The music app picked with the header's Music button, docked at the bottom of the session in every active workout
 * until × clears it (Task 26). Open leaves for the app: the keyboard closes and typed sets are saved first, and again by
 * the flush on the app going to the background (R32). Phase 7's player fills this same bar.
 */
export function MusicBar({ app }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  /** Whether the last Open found the app missing. */
  const [missing, setMissing] = useState(false);

  const open = async () => {
    Keyboard.dismiss();
    flushAll();
    setMissing((await openMusicApp(app)) === 'missing');
  };

  const close = () => {
    setSetting(db, 'musicApp', null);
    bumpData();
  };

  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderTopWidth: 1, borderTopColor: colors.border, paddingBottom: insets.bottom }}>
      <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="musical-notes" size={24} color={colors.text} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Body weight={600}>{app.label}</Body>
            <Body muted accessibilityLiveRegion="polite" style={{ fontSize: 14 }}>
              {missing ? `${app.label} isn't on this phone.` : 'Tap Open to play or skip'}
            </Body>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close music bar"
            hitSlop={4}
            onPress={close}
            style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <Button label={`Open ${app.label}`} variant="secondary" onPress={() => void open()} />
      </View>
    </View>
  );
}
