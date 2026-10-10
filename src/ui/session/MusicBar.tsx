import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { AccessibilityInfo, Animated, Dimensions, Easing, Keyboard, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../db/DbProvider';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicAppId } from '../../domain/types';
import type { MusicApp } from '../../platform/music';
import { openMusicApp } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { Body } from '../Text';
import { useTheme } from '../ThemeProvider';

/** How long the bar takes to slide up from the bottom edge. */
const SLIDE_MS = 250;

type Props = {
  /** The app picked in the music sheet, already known to exist on this platform (`musicAppOn`). */
  app: MusicApp;
};

/**
 * The music app picked with the header's Music button, docked at the bottom of the session in every active workout
 * until × clears it (Task 26). Open leaves for the app: the keyboard closes and typed sets are saved first, and again by
 * the flush on the app going to the background (R32). Phase 7's player fills this same bar.
 *
 * It slides up from the bottom edge once, when it first appears (spec §18.4), by its own measured height; with Reduce
 * Motion on, or when the phone can't say whether it is on, it just appears. The slide is a transform, so the dock's
 * measured height, and the content's padding, are right from the start.
 */
export function MusicBar({ app }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  /** The app the last Open found missing, so a different app picked afterwards starts without the message. */
  const [missingApp, setMissingApp] = useState<MusicAppId | null>(null);
  const missing = missingApp === app.id;
  /** How far below its place the bar is drawn: off the screen until it is measured, then its height, sliding to 0. */
  const offset = useRef(new Animated.Value(Dimensions.get('screen').height)).current;
  const slid = useRef(false);

  const slideUp = (e: LayoutChangeEvent) => {
    if (slid.current) return;
    slid.current = true;
    offset.setValue(e.nativeEvent.layout.height);
    const appear = () => offset.setValue(0);
    // A check that fails counts as Reduce Motion: the bar must never stay off the screen with its × out of reach.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) appear();
      else Animated.timing(offset, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }, appear);
  };

  const missingLine = `${app.label} isn't on this phone.`;

  const open = async () => {
    Keyboard.dismiss();
    flushAll();
    const isMissing = (await openMusicApp(app)) === 'missing';
    setMissingApp(isMissing ? app.id : null);
    // TalkBack reads the line's live region; VoiceOver doesn't, so iOS is told.
    if (isMissing && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(missingLine);
  };

  const close = () => {
    setSetting(db, 'musicApp', null);
    bumpData();
  };

  return (
    <Animated.View
      onLayout={slideUp}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: insets.bottom,
        transform: [{ translateY: offset }],
      }}
    >
      <View style={{ width: '100%', maxWidth: 512, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {/* Decorative: the app's name beside it says what the bar is. */}
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="musical-notes" size={24} color={colors.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Body weight={600}>{app.label}</Body>
            <Body muted accessibilityLiveRegion="polite" style={{ fontSize: 14 }}>
              {missing ? missingLine : 'Tap Open to play or skip'}
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
    </Animated.View>
  );
}
