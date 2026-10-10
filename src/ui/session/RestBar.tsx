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
  /** Whether the bar is the lowest thing docked, and so clears the bottom safe area itself. The music bar below it does that instead. */
  bottomInset: boolean;
};

/** How often the clock is read. The bar exists only while a rest is running, so this costs nothing the rest of the time. */
const TICK_MS = 250;

/**
 * The rest timer docked at the bottom of the session: -15s, the clock, Skip. Since Task 26 it is only the fallback for a
 * rest that no set row can show (R41): the countdown otherwise lives under its set (`RestInline`). It is driven by
 * `rest_ends_at`, so a rest survives a reload, and a stored end that has passed shows nothing. It only shows and steers
 * the rest: ringing at the end, wherever the user is, is `RestWatcher`'s job. The session's dock places it and measures it.
 */
export function RestBar({ workoutId, endsAt, bottomInset }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const remaining = restRemainingSeconds(endsAt, now);
  if (remaining === null) return null;

  return (
    <View
      style={{
        backgroundColor: colors.surfaceRaised,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingBottom: bottomInset ? insets.bottom : 0,
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
