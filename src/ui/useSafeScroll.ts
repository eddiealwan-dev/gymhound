import { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, TextInput } from 'react-native';
import type { KeyboardEvent, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { NavigationContext } from 'expo-router/build/react-navigation/core';

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

/** Space kept between a field and the keyboard's top. */
export const KEYBOARD_MARGIN = 16;

/** The focused text field, when it lies inside `content`: calls `inside` with its frame in the content, else nothing. */
export function whenFieldInside(content: View | null, inside: (top: number, height: number) => void): void {
  const field = TextInput.State.currentlyFocusedInput() as unknown as { measureLayout?: View['measureLayout'] } | null;
  if (content === null || field?.measureLayout === undefined) return;
  // Fails, silently, for a field elsewhere: in a sheet over the page, or on another screen.
  field.measureLayout(content, (_left, top, _width, height) => inside(top, height), () => {});
}

/**
 * How a page keeps a field clear of the keyboard (R560). React Native's own `automaticallyAdjustKeyboardInsets` is not
 * used anywhere: on iOS it outlives the scroll view that asked for it, and a page that later reuses that native view can
 * inherit a keyboard's height of empty space below its content that takes no touches (react-native#57755, fixed after
 * the React Native in Expo Go). That was Rounds 8 to 11's page "scrolled past its content" with no way back.
 *
 * Instead, when a field on this page raises the keyboard (iOS), the page adds `room` under its content, the height of
 * the keyboard over the scroll view, and then scrolls the field into view. When the keyboard goes, the room goes, and a
 * page left past its new end is scrolled back once, unless a finger is on it (the bounce does it then). A field
 * elsewhere (a sheet over the page, another tab) changes nothing here. A page leaving view closes its keyboard. Android
 * resizes the window for the keyboard itself, so nothing is added there.
 */
export function useSafeScroll() {
  const ref = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const focused = useScreenFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  /** Space under the content for the keyboard. */
  const [room, setRoom] = useState(0);
  /** A keyboard raised by a field on this page is up. */
  const [ownsKeyboard, setOwnsKeyboard] = useState(false);
  const owns = useRef(false);
  /** Where the page's scroll view sits in the window, as measured when the keyboard came up. */
  const frame = useRef({ top: 0, bottom: 0 });
  /** The keyboard's top edge in the window while it is up. */
  const keyboardTop = useRef<number | null>(null);
  /** The scroll position at rest (after a drag, a fling or our own scroll), and whether a finger or a fling moves it now. */
  const offset = useRef(0);
  const moving = useRef(false);
  const viewHeight = useRef(0);
  /** The keyboard has gone: check the page is not left past its end once its content shrinks. */
  const settleAfterHide = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const own = (on: boolean) => {
      owns.current = on;
      setOwnsKeyboard(on);
    };
    const shown = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) => {
      keyboardTop.current = e.endCoordinates.screenY;
      if (!focusedRef.current) return;
      whenFieldInside(contentRef.current, () => {
        own(true);
        ref.current?.getNativeScrollRef?.()?.measureInWindow((_x: number, y: number, _w: number, h: number) => {
          frame.current = { top: y, bottom: y + h };
          const top = keyboardTop.current;
          if (top !== null) setRoom(Math.max(0, Math.round(y + h - top)));
        });
      });
    });
    const didShow = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      if (!owns.current) return;
      const top = e.endCoordinates.screenY;
      whenFieldInside(contentRef.current, (fieldTop, fieldHeight) => {
        // The room is in place by now (it was set as the keyboard began to rise): bring the field above the keyboard,
        // or below the page's top edge, only if it is not already in view.
        const visible = top - frame.current.top;
        const below = fieldTop + fieldHeight + KEYBOARD_MARGIN - (offset.current + visible);
        const above = offset.current - Math.max(0, fieldTop - KEYBOARD_MARGIN);
        const to = below > 0 ? offset.current + below : above > 0 ? offset.current - above : null;
        if (to === null) return;
        offset.current = Math.max(0, to);
        ref.current?.scrollTo({ y: offset.current, animated: true });
      });
    });
    const hidden = Keyboard.addListener('keyboardWillHide', () => {
      keyboardTop.current = null;
      if (!owns.current) return;
      own(false);
      settleAfterHide.current = true;
      setRoom(0);
    });
    return () => {
      shown.remove();
      didShow.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    if (!focused && ownsKeyboard) Keyboard.dismiss();
  }, [focused, ownsKeyboard]);

  const atRest = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  };
  const scrollProps = {
    onScrollBeginDrag: () => {
      moving.current = true;
    },
    onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      atRest(e);
      // A fling goes on to momentum, which says when it ends; a plain drag ends here.
      const v = e.nativeEvent.velocity?.y ?? 0;
      if (v === 0) moving.current = false;
    },
    onMomentumScrollEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      atRest(e);
      moving.current = false;
    },
    onLayout: (e: LayoutChangeEvent) => {
      viewHeight.current = e.nativeEvent.layout.height;
    },
    onContentSizeChange: (_w: number, contentHeight: number) => {
      if (!settleAfterHide.current) return;
      settleAfterHide.current = false;
      const end = Math.max(0, contentHeight - viewHeight.current);
      // Once, after the keyboard: never on a scroll's own end, so it can't start a scroll that starts another (R550).
      if (!moving.current && offset.current > end) {
        offset.current = end;
        ref.current?.scrollTo({ y: end, animated: true });
      }
    },
  };

  return { ref, contentRef, room, scrollProps };
}

/**
 * The keyboard's height while it is up and this screen is in view (iOS; 0 elsewhere), for a list whose search field
 * sits above it: the list adds this under its rows so the last ones can scroll above the keyboard (R560).
 */
export function useKeyboardHeight(): number {
  const focused = useScreenFocused();
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios' || !focused) return;
    const shown = Keyboard.addListener('keyboardWillShow', (e: KeyboardEvent) => setHeight(Math.round(e.endCoordinates.height)));
    const hidden = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      shown.remove();
      hidden.remove();
      setHeight(0);
    };
  }, [focused]);
  return height;
}
