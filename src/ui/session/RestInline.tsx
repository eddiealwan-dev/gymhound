import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { REST_UP_MS, restRowPhase, restTrackFraction, spokenRest } from '../../domain/rest';
import { restMinus15, restPlus15, restSkip } from '../../state/sessionActions';
import { Button } from '../Button';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';
import { ClockPanel, ClockPills, ClockTrack } from './ClockPanel';
import { useRestClock } from './useRestClock';

type Props = {
  workoutId: string;
  /** When the rest ends (epoch ms): `rest_ends_at`, or the end of the rest `useRestUp` holds. */
  endsAt: number;
  /**
   * How long this rest is, in seconds: the track drains from full over it. The row keeps the length it was first drawn
   * with, so a new length chosen from the countdown (which sets future rests only) does not rescale this rest's track.
   */
  lengthSeconds: number;
  /** What the row says once the rest is up: "Rest's up · Set 2 next". */
  upText: string;
  /** Opens the rest choices of the exercise. A choice sets future rests only; this one keeps its end (R50). */
  onOpenRest: () => void;
};

/**
 * The rest under the set that started it (spec 18.6): a big countdown under a REST label, which opens the exercise's rest
 * choices when tapped, then −15s, +15s and Skip, over a thin track that drains with the time left. At zero it holds a
 * check and "Rest's up" for `REST_UP_MS`, with no buttons and at the height the countdown had, then shows nothing. It is
 * the only countdown while that set is in the workout; the bar at the bottom shows only when no set row can (R41). Text
 * doesn't shrink, so when large text leaves no room beside the time, the three pills wrap together onto a second line,
 * at the end (G1), and wrap among themselves when even that line is too narrow for all three. It sits on `surface`,
 * outlined in `borderStrong`, so it never looks like a done set.
 */
export function RestInline({ workoutId, endsAt, lengthSeconds, upText, onOpenRest }: Props) {
  const db = useDb();
  const { colors } = useTheme();
  // The clock reads on each whole second of the rest, as the rest bar's does, and stops once the row has gone.
  const now = useRestClock(endsAt, endsAt + REST_UP_MS);
  // The length this rest started with (the block draws a new row for a new rest).
  const [trackLength] = useState(lengthSeconds);
  /** The height of the row while it counts down, which "Rest's up" keeps so the sets below don't jump at zero. */
  const [runningHeight, setRunningHeight] = useState<number | undefined>(undefined);

  const phase = restRowPhase(endsAt, now);

  if (phase.kind === 'gone') return null;
  const running = phase.kind === 'running';

  return (
    <ClockPanel
      onLayout={running ? (e) => setRunningHeight(e.nativeEvent.layout.height) : undefined}
      minHeight={running ? undefined : runningHeight}
      margins={{ marginVertical: 4 }}
    >
      {running ? (
        <>
          <Pressable
            accessibilityRole="button"
            // Read as a duration, not a clock (B9).
            accessibilityLabel={`Rest, ${spokenRest(phase.remaining)} left`}
            accessibilityHint="Changes the rest time"
            onPress={onOpenRest}
            // It takes the width of its text (not `flex: 1`, whose zero basis never needs room), then grows into what is left.
            style={({ pressed }) => ({ flexGrow: 1, flexBasis: 'auto', minWidth: 0, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}
          >
            <Body weight={600} muted style={{ fontSize: 11, letterSpacing: 0.5 }}>
              REST
            </Body>
            <Num weight={800} style={{ fontSize: 32 }}>
              {formatRest(phase.remaining)}
            </Num>
          </Pressable>
          <ClockPills>
            <Button
              label="−15s"
              variant="secondary"
              size="compact"
              accessibilityLabel="Take 15 seconds off the rest"
              onPress={() => restMinus15(db, workoutId, endsAt)}
            />
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
          </ClockPills>
          <ClockTrack fraction={restTrackFraction(phase.remaining, trackLength)} />
        </>
      ) : (
        <View style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color={colors.text} />
          <Body weight={600} style={{ flexShrink: 1 }}>
            {upText}
          </Body>
        </View>
      )}
    </ClockPanel>
  );
}
