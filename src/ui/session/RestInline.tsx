import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { restRemainingSeconds } from '../../domain/rest';
import { restMinus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

type Props = {
  workoutId: string;
  /** When the rest ends (epoch ms): `rest_ends_at`. */
  endsAt: number;
};

/** How often the clock is read: the same as the rest bar, so the two show the same second. */
const TICK_MS = 250;

/**
 * The running rest, under the set that started it: "Rest 1:45", −15s and Skip. Since Task 26 it is the only countdown
 * while that set is in the workout; the bar at the bottom shows only when no set row can (R41). It shows nothing once
 * the rest has run out. Text doesn't shrink, so when large text leaves no room beside the time, −15s and Skip wrap onto
 * a second line, at the end.
 */
export function RestInline({ workoutId, endsAt }: Props) {
  const db = useDb();
  const { colors } = useTheme();
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
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        columnGap: 8,
        rowGap: 4,
        marginVertical: 4,
        paddingLeft: 12,
        paddingRight: 4,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <View
        accessibilityRole="timer"
        accessibilityLabel={`Rest ${formatRest(remaining)}`}
        // It takes the width of its text (not `flex: 1`, whose zero basis never needs room), then grows into what is left.
        style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}
      >
        <Body weight={600} muted>
          Rest
        </Body>
        <Num style={{ fontSize: 20 }}>{formatRest(remaining)}</Num>
      </View>
      <Button label="−15s" variant="quiet" onPress={() => restMinus15(db, workoutId, endsAt)} />
      <Button label="Skip" variant="quiet" onPress={() => restSkip(db, workoutId)} />
    </View>
  );
}
