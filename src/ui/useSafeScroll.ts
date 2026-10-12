import { useContext, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type ScrollView } from 'react-native';
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

const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

/**
 * Which pages follow the keyboard (R510, R550). iOS's own keyboard insets (`automaticallyAdjustKeyboardInsets`) answer
 * every keyboard on every mounted ScrollView, tabs out of sight included, and a screen that worked out an inset while
 * hidden could be left scrolled past its content (Round 8). So a page follows a keyboard only when it raised it: it
 * adjusts while it is in view, and keeps adjusting after it leaves view until the keyboard it raised has gone, so iOS
 * takes back the inset it gave. A page leaving view closes its keyboard. Nothing else: Round 8's snap-back (scrolling a
 * page back after a scroll came to rest) could keep a page always scrolling, which made it stick at the edges and
 * swallow taps until another tab was chosen (Round 10), and is gone.
 */
export function useSafeScroll() {
  const ref = useRef<ScrollView>(null);
  const focused = useScreenFocused();
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  /** A keyboard this page raised is still up. */
  const [ownsKeyboard, setOwnsKeyboard] = useState(false);

  useEffect(() => {
    const shown = Keyboard.addListener(SHOW, () => {
      if (focusedRef.current) setOwnsKeyboard(true);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOwnsKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  useEffect(() => {
    if (!focused && ownsKeyboard) Keyboard.dismiss();
  }, [focused, ownsKeyboard]);

  return { ref, scrollProps: { automaticallyAdjustKeyboardInsets: focused || ownsKeyboard } };
}
