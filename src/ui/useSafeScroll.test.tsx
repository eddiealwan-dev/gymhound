import { ScrollView, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { Screen } from './Screen';
import { staleInset, strandedOffset } from './useSafeScroll';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const page = { contentHeight: 2000, viewHeight: 700, insetTop: 0, insetBottom: 0 };

describe('strandedOffset (R510)', () => {
  it('leaves a page anywhere between its top and its end alone', () => {
    expect(strandedOffset({ ...page, offsetY: 0 }, false)).toBeNull();
    expect(strandedOffset({ ...page, offsetY: 650 }, false)).toBeNull();
    expect(strandedOffset({ ...page, offsetY: 1300 }, false)).toBeNull();
  });

  it('brings a page scrolled past its end back to the end', () => {
    expect(strandedOffset({ ...page, offsetY: 4200, insetBottom: 3000 }, false)).toBe(1300);
    expect(strandedOffset({ ...page, offsetY: 1500 }, false)).toBe(1300);
  });

  it('allows the keyboard inset while the keyboard is up, and not after', () => {
    const typing = { ...page, offsetY: 1600, insetBottom: 336 };
    expect(strandedOffset(typing, true)).toBeNull();
    expect(strandedOffset(typing, false)).toBe(1300);
  });

  it('brings a short page that drifted back to its top', () => {
    expect(strandedOffset({ contentHeight: 300, viewHeight: 700, insetTop: 0, insetBottom: 0, offsetY: 900 }, false)).toBe(0);
    expect(strandedOffset({ ...page, offsetY: -400 }, false)).toBe(0);
  });

  it('calls a bottom inset with no keyboard stale', () => {
    expect(staleInset({ insetBottom: 336 }, false)).toBe(true);
    expect(staleInset({ insetBottom: 336 }, true)).toBe(false);
    expect(staleInset({ insetBottom: 0.5 }, false)).toBe(false);
  });
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

  it('snaps a page stranded past its end back once the scroll has come to rest', () => {
    const tree = mount();
    const scroll = tree.root.findByType(ScrollView);
    const scrollTo = jest.fn();
    // The ref is the native ScrollView; give it a scrollTo to watch.
    const instance = scroll.instance as { scrollTo?: unknown };
    instance.scrollTo = scrollTo;
    act(() =>
      scroll.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 0, y: 4200 }, contentSize: { width: 390, height: 2000 }, layoutMeasurement: { width: 390, height: 700 }, contentInset: { top: 0, bottom: 3000, left: 0, right: 0 } },
      }),
    );
    expect(scrollTo).toHaveBeenCalledWith({ y: 1300, animated: true });
    // The stale inset is cleared by a one-time change of the inset the page asks for.
    expect(tree.root.findByType(ScrollView).props.contentInset.bottom).toBe(0.5);
  });
});
