import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { restRemainingSeconds } from '../../domain/rest';
import { restMinus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { Num } from '../Text';
import { useTheme } from '../ThemeProvider';

type Props = {
  workoutId: string;
  /** When the rest ends (epoch ms): `rest_ends_at`. */
  endsAt: number;
  /** Reports the bar's height when it is laid out, and 0 when it goes, so the page can leave room beneath its content. */
  onHeight: (height: number) => void;
};

/** How often the clock is read. The bar exists only while a rest is running, so this costs nothing the rest of the time. */
const TICK_MS = 250;

/**
 * The rest timer, docked above the bottom safe area: -15s, the clock, Skip. It is driven by `rest_ends_at`, so a rest
 * survives a reload, and a stored end that has passed shows nothing. It only shows and steers the rest: ringing at the
 * end, wherever the user is, is `RestWatcher`'s job.
 */
export function RestBar({ workoutId, endsAt, onHeight }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // The bar goes away with the rest, and the room it took goes with it.
  useEffect(() => () => onHeight(0), [onHeight]);

  const remaining = restRemainingSeconds(endsAt, now);
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
