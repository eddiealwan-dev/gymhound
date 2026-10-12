import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/core';

/** What a scroll event says about where a ScrollView is. */
export type ScrollMetrics = {
  offsetY: number;
  contentHeight: number;
  viewHeight: number;
  insetTop: number;
  insetBottom: number;
};

/**
 * Where a ScrollView should be moved to so its content can be reached again, or null when it is fine (R510). The
 * furthest a page may rest is its content's end, plus the keyboard's inset while the keyboard is up; the nearest is its
 * top. Anything past those by more than a point is stranded: iOS left it there (a keyboard inset worked out for a
 * screen out of sight), and it snaps back. A bounce past an edge is never counted: this runs only once a scroll has
 * come to rest.
 */
export function strandedOffset(m: ScrollMetrics, keyboardUp: boolean): number | null {
  const end = Math.max(0, m.contentHeight - m.viewHeight) + (keyboardUp ? Math.max(0, m.insetBottom) : 0);
  if (m.offsetY > end + 1) return end;
  if (m.offsetY < -Math.max(0, m.insetTop) - 1) return 0;
  return null;
}

/** Whether a bottom inset is left over from a keyboard that has gone (R510). */
export function staleInset(m: Pick<ScrollMetrics, 'insetBottom'>, keyboardUp: boolean): boolean {
  return !keyboardUp && m.insetBottom > 1;
}

function metricsOf(e: NativeSyntheticEvent<NativeScrollEvent>): ScrollMetrics {
  const n = e.nativeEvent;
  return {
    offsetY: n.contentOffset.y,
    contentHeight: n.contentSize.height,
    viewHeight: n.layoutMeasurement.height,
    insetTop: n.contentInset?.top ?? 0,
    insetBottom: n.contentInset?.bottom ?? 0,
  };
}

/**
 * Whether the screen is the one in view. Tabs keep their screens mounted underneath, so a screen out of sight must not
 * react to the keyboard another screen raised. Outside a navigator (a modal sheet's own tree, a test) it counts as in view.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);
  return focused;
}

/** Long enough for iOS's bounce back from an edge to finish. */
const BOUNCE_MS = 600;

const keyboardUp = () => {
  try {
    return Keyboard.isVisible();
  } catch {
    return false;
  }
};

/**
 * The props that keep a page's content reachable (R510, Round 8's scrolling bug). iOS's own keyboard insets
 * (`automaticallyAdjustKeyboardInsets`) answer every keyboard on every mounted ScrollView, including tabs out of
 * sight, and can leave one scrolled past its content with an inset that never goes. So:
 * - only the screen in view adjusts for the keyboard;
 * - when a scroll ends, or the screen comes back into view, a page scrolled past its content snaps back to its end
 *   (or top), and an inset left from a keyboard that has gone is cleared (a one-time change of `contentInset`, which
 *   iOS applies as given).
 * Spread `scrollProps` on the ScrollView and pass `ref`.
 */
export function useSafeScroll() {
  const ref = useRef<ScrollView>(null);
  const focused = useScreenFocused();
  const last = useRef<ScrollMetrics | null>(null);
  /** Flips between two invisible insets to make iOS drop a stale one. */
  const [nudge, setNudge] = useState(0);

  const recover = useCallback((m: ScrollMetrics | null) => {
    if (m === null) return;
    const up = keyboardUp();
    if (staleInset(m, up)) setNudge((n) => (n === 0 ? 0.5 : 0));
    const to = strandedOffset(staleInset(m, up) ? { ...m, insetBottom: 0 } : m, up);
    if (to !== null) ref.current?.scrollTo({ y: to, animated: true });
  }, []);

  const remember = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    last.current = metricsOf(e);
  }, []);
  /** A scroll that came to rest by itself: check where it stopped. */
  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      last.current = metricsOf(e);
      recover(last.current);
    },
    [recover],
  );
  /**
   * A finger lifted: iOS may still bounce back on its own, so look once the bounce has had time to finish, from the
   * position the scroll events have kept since. A page resting in a stranded range never bounces, and is caught here.
   */
  const afterDrag = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEnded = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      last.current = metricsOf(e);
      if (afterDrag.current !== null) clearTimeout(afterDrag.current);
      afterDrag.current = setTimeout(() => {
        afterDrag.current = null;
        recover(last.current);
      }, BOUNCE_MS);
    },
    [recover],
  );

  useEffect(() => {
    if (focused) recover(last.current);
  }, [focused, recover]);
  useEffect(
    () => () => {
      if (afterDrag.current !== null) clearTimeout(afterDrag.current);
    },
    [],
  );

  return {
    ref,
    scrollProps: {
      automaticallyAdjustKeyboardInsets: focused,
      contentInset: { top: 0, bottom: nudge, left: 0, right: 0 },
      onScroll: remember,
      scrollEventThrottle: 200,
      onScrollBeginDrag: () => {
        // A new drag cancels the look after the last one.
        if (afterDrag.current !== null) clearTimeout(afterDrag.current);
        afterDrag.current = null;
      },
      onScrollEndDrag: dragEnded,
      onMomentumScrollEnd: settle,
    },
  };
}
