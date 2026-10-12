import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useDb } from '../../db/DbProvider';
import { formatRest } from '../../domain/dates';
import { restRowPhase, spokenRest } from '../../domain/rest';
import { restMinus15, restPlus15, restSkip } from '../../state/sessionActions';
import { useTicker } from '../../state/useNow';
import { Button } from '../Button';
import { Body, Num } from '../Text';
import { useTheme } from '../ThemeProvider';

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

/** How often the clock is read: the same as the rest bar, so the two show the same second. */
const TICK_MS = 250;

/** What the row shows at `now`: the seconds left, or its phase once the rest is up. It draws again only when this changes (R405). */
const faceAt = (endsAt: number) => (now: number) => {
  const phase = restRowPhase(endsAt, now);
  return phase.kind === 'running' ? phase.remaining : phase.kind;
};

/**
 * The share of the track still drawn, as an animated value that drains to 0 at `endsAt` on the native driver (R404):
 * the track moves smoothly on the UI thread, at no cost to JavaScript, instead of stepping once a second. The value is
 * the time left over the rest's length, unclamped (+15s may leave more than the length), and what is drawn is that
 * clamped to 0–1. It is set again from the clock whenever the end or the length changes, so it never drifts from the
 * countdown.
 */
function useDrain(endsAt: number, lengthSeconds: number, running: boolean): Animated.AnimatedInterpolation<number> {
  const drain = useRef<Animated.Value | null>(null);
  if (drain.current === null) drain.current = new Animated.Value(1);
  const value = drain.current;
  useEffect(() => {
    if (!running) return;
    const lengthMs = lengthSeconds * 1000;
    if (!Number.isFinite(lengthMs) || lengthMs <= 0) {
      // The length is unknown: the track stays full, as before.
      value.setValue(1);
      return;
    }
    const left = Math.max(0, endsAt - Date.now());
    value.setValue(left / lengthMs);
    const animation = Animated.timing(value, {
      toValue: 0,
      duration: left,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [value, endsAt, lengthSeconds, running]);
  // One node for the row's life, so a draw never hands the native driver a new one.
  return useMemo(() => value.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), [value]);
}

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
  // The length this rest started with (the block draws a new row for a new rest).
  const [trackLength] = useState(lengthSeconds);
  /** The height of the row while it counts down, which "Rest's up" keeps so the sets below don't jump at zero. */
  const [runningHeight, setRunningHeight] = useState<number | undefined>(undefined);
  /** Whether the row has gone: the clock then stops. Set by the draw that finds it gone. */
  const [stopped, setStopped] = useState(false);
  // Read every 250 ms so each second turns over on time; drawn again only when the shown second (or phase) changes.
  const now = useTicker(TICK_MS, faceAt(endsAt), !stopped);

  const phase = restRowPhase(endsAt, now);
  const gone = phase.kind === 'gone';
  if (gone !== stopped) setStopped(gone);
  const running = phase.kind === 'running';
  const drain = useDrain(endsAt, trackLength, running);

  if (phase.kind === 'gone') return null;

  return (
    <View
      onLayout={running ? (e) => setRunningHeight(e.nativeEvent.layout.height) : undefined}
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
        columnGap: 8,
        // The pills' 4pt hitSlops, stacked on two lines, must not overlap.
        rowGap: 8,
        minHeight: running ? undefined : runningHeight,
        marginVertical: 4,
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
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
          {/*
            The pills wrap as one group, so Skip never sits alone on the second line. When the group alone is wider than
            the row (AX2 on 320pt), it wraps inside itself, at the end, rather than being clipped by the row.
          */}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
              rowGap: 8,
              columnGap: 8,
              maxWidth: '100%',
              flexShrink: 0,
            }}
          >
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
          </View>
          {/* The full width, scaled from its left edge to the share left: a transform runs on the native driver, a width can't. */}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 3,
              transformOrigin: 'left',
              transform: [{ scaleX: drain }],
              backgroundColor: colors.text,
            }}
          />
        </>
      ) : (
        <View style={{ flexGrow: 1, flexBasis: 'auto', minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color={colors.text} />
          <Body weight={600} style={{ flexShrink: 1 }}>
            {upText}
          </Body>
        </View>
      )}
    </View>
  );
}
