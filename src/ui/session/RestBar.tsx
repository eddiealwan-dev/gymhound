import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { restRemainingSeconds, spokenRest } from '../../domain/rest';
import { restMinus15, restPlus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { Num } from '../Text';
import { useTheme } from '../ThemeProvider';
import { useRestClock } from './useRestClock';

type Props = {
  workoutId: string;
  /** When the rest ends (epoch ms): `rest_ends_at`. */
  endsAt: number;
  /** Whether the bar is the lowest thing docked, and so clears the bottom safe area itself. The music bar below it does that instead. */
  bottomInset: boolean;
};

/**
 * The rest timer docked at the bottom of the session: −15s, the clock, +15s and Skip, as compact pills that wrap with
 * large text. It has no tap-to-change, because its set is gone. Since Task 26 it is only the fallback for a
 * rest that no set row can show (R41): the countdown otherwise lives under its set (`RestInline`). It is driven by
 * `rest_ends_at`, so a rest survives a reload, and a stored end that has passed shows nothing. It only shows and steers
 * the rest: ringing at the end, wherever the user is, is `RestWatcher`'s job. The session's dock places it and measures it.
 */
export function RestBar({ workoutId, endsAt, bottomInset }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // Read on each whole second of the rest, until it ends.
  const now = useRestClock(endsAt, endsAt);

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
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          columnGap: 12,
          rowGap: 4,
        }}
      >
        <Button
          label="−15s"
          variant="secondary"
          size="compact"
          accessibilityLabel="Take 15 seconds off the rest"
          onPress={() => restMinus15(db, workoutId, endsAt)}
        />
        <Num
          accessibilityRole="timer"
          // Read as a duration, not a clock (B9).
          accessibilityLabel={`Rest, ${spokenRest(remaining)} left`}
          style={{ flexGrow: 1, flexBasis: 'auto', fontSize: 40, textAlign: 'center' }}
        >
          {formatRest(remaining)}
        </Num>
        <Button
          label="+15s"
          variant="secondary"
          size="compact"
          accessibilityLabel="Add 15 seconds to the rest"
          onPress={() => restPlus15(db, workoutId, endsAt)}
        />
        <Button
          label="Skip"
          variant="secondary"
          size="compact"
          accessibilityLabel="Skip the rest"
          onPress={() => restSkip(db, workoutId, endsAt)}
        />
      </View>
    </View>
  );
}
