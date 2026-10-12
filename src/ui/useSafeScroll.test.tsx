import { Keyboard, ScrollView, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { Screen } from './Screen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

describe('Screen and the keyboard (R510)', () => {
  function mount(navigation?: unknown): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    const screen = (
      <Screen footer>
        <Text>Custom bar</Text>
      </Screen>
    );
    act(() => {
      tree = create(navigation === undefined ? screen : <NavigationContext.Provider value={navigation as never}>{screen}</NavigationContext.Provider>);
    });
    return tree;
  }

  /** A navigation object whose focus can be changed, as a tab's is when another tab is chosen. */
  function fakeNavigation(focused: boolean) {
    const listeners: Record<string, (() => void)[]> = { focus: [], blur: [] };
    return {
      isFocused: () => focused,
      addListener: (type: 'focus' | 'blur', fn: () => void) => {
        listeners[type].push(fn);
        return () => {
          listeners[type] = listeners[type].filter((f) => f !== fn);
        };
      },
      emit(type: 'focus' | 'blur') {
        focused = type === 'focus';
        for (const fn of listeners[type]) fn();
      },
    };
  }

  it('adjusts for the keyboard and keeps taps on buttons while it is up, outside a navigator', () => {
    const scroll = mount().root.findByType(ScrollView);
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('adjusts only while its screen is the one in view', () => {
    const navigation = fakeNavigation(true);
    const tree = mount(navigation);
    expect(tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
    act(() => navigation.emit('blur'));
    expect(tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(false);
    act(() => navigation.emit('focus'));
    expect(tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it('starts out of the keyboard business on a tab mounted out of sight', () => {
    const tree = mount(fakeNavigation(false));
    expect(tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(false);
  });

  it('never scrolls a page by itself, so a page is never left mid-scroll and taps always land (Round 10, R550)', () => {
    const props = mount().root.findByType(ScrollView).props;
    expect(props.onScroll).toBeUndefined();
    expect(props.onMomentumScrollEnd).toBeUndefined();
    expect(props.onScrollEndDrag).toBeUndefined();
    expect(props.contentInset).toBeUndefined();
  });

  it('keeps following a keyboard it raised after leaving view, until it has gone, and closes it', () => {
    const listeners: Record<string, (() => void)[]> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
      return { remove: () => {} };
    }) as never);
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const navigation = fakeNavigation(true);
    const tree = mount(navigation);
    const adjusts = () => tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets;
    act(() => (listeners.keyboardWillShow ?? listeners.keyboardDidShow ?? []).forEach((fn) => fn()));
    act(() => navigation.emit('blur'));
    expect(adjusts()).toBe(true);
    expect(dismiss).toHaveBeenCalled();
    act(() => (listeners.keyboardDidHide ?? []).forEach((fn) => fn()));
    expect(adjusts()).toBe(false);
    add.mockRestore();
    dismiss.mockRestore();
  });

  it("doesn't follow a keyboard another screen raised while it was out of view", () => {
    const listeners: Record<string, (() => void)[]> = {};
    const add = jest.spyOn(Keyboard, 'addListener').mockImplementation(((type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
      return { remove: () => {} };
    }) as never);
    const tree = mount(fakeNavigation(false));
    act(() => (listeners.keyboardWillShow ?? listeners.keyboardDidShow ?? []).forEach((fn) => fn()));
    expect(tree.root.findByType(ScrollView).props.automaticallyAdjustKeyboardInsets).toBe(false);
    add.mockRestore();
  });
});
