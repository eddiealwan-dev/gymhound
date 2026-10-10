import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { restPhase, restRemainingSeconds } from '../../domain/rest';
import type { BellSound } from '../../domain/types';
import { playBell } from '../../platform/restTimer/bell';
import { restEnded, restMinus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { Num } from '../Text';
import { useTheme } from '../ThemeProvider';

type Props = {
  workoutId: string;
  /** When the rest ends (epoch ms): `rest_ends_at`. */
  endsAt: number;
  /** Settings: whether the bell rings at the end, and which one. */
  bell: boolean;
  sound: BellSound;
  /** Reports the bar's height when it is laid out, and 0 when it goes, so the page can leave room beneath its content. */
  onHeight: (height: number) => void;
};

/** How often the clock is read. The bar exists only while a rest is running, so this costs nothing the rest of the time. */
const TICK_MS = 250;

/** A success haptic when the rest ends. The web has none, and a missing one never stops the bell. */
function endHaptic(): void {
  if (Platform.OS === 'web') return;
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // no haptics here
  }
}

/**
 * The rest timer, docked above the bottom safe area: -15s, the clock, Skip. It is driven by `rest_ends_at`, so a rest
 * survives a reload and a stored end that has passed shows nothing. When the time runs out while it is watching, it
 * buzzes, rings the bell if that is on (the bell ducks any music), then clears the rest.
 */
export function RestBar({ workoutId, endsAt, bell, sound, onHeight }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());
  /** Whether the last look found time left: only a rest watched running out rings. */
  const wasRunning = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // The bar goes away with the rest, and the room it took goes with it.
  useEffect(() => () => onHeight(0), [onHeight]);

  const remaining = restRemainingSeconds(endsAt, now);

  useEffect(() => {
    const phase = restPhase(endsAt, now, wasRunning.current);
    wasRunning.current = phase === 'running';
    if (phase === 'running') return;
    if (phase === 'ring') {
      endHaptic();
      if (bell) void playBell(sound);
    }
    restEnded(db, workoutId);
  }, [db, workoutId, endsAt, now, bell, sound]);

  if (remaining === null) return null;

  return (
    <View
      onLayout={(e) => onHeight(e.nativeEvent.layout.height)}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: colors.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: insets.bottom,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 512,
          alignSelf: 'center',
          paddingHorizontal: 16,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <Button label="−15s" variant="secondary" onPress={() => restMinus15(db, workoutId, endsAt)} />
        <Num accessibilityRole="timer" accessibilityLabel={`Rest ${formatRest(remaining)}`} style={{ flex: 1, fontSize: 40, textAlign: 'center' }}>
          {formatRest(remaining)}
        </Num>
        <Button label="Skip" variant="quiet" onPress={() => restSkip(db, workoutId)} />
      </View>
    </View>
  );
}
