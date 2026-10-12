import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { Keyboard, ScrollView, Text, TextInput, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { NavigationContext } from 'expo-router/build/react-navigation/core';
import { Screen } from './Screen';
import { KEYBOARD_MARGIN } from './useSafeScroll';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

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

type KeyboardListener = (e: { endCoordinates: { screenY: number; height: number }; duration: number }) => void;
let keyboard: Record<string, KeyboardListener[]>;
const fire = (type: string, screenY = 500) =>
  act(() => (keyboard[type] ?? []).forEach((fn) => fn({ endCoordinates: { screenY, height: 844 - screenY }, duration: 250 })));

/** The page's scroll view sits from y 100 to 800 in the window; the field, when there is one, at `field` in its content. */
function mount(navigation?: unknown, field: { top: number; height: number } | 'elsewhere' | null = null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  const screen = (
    <Screen footer>
      <Text>Custom bar</Text>
    </Screen>
  );
  act(() => {
    tree = create(navigation === undefined ? screen : <NavigationContext.Provider value={navigation as never}>{screen}</NavigationContext.Provider>);
  });
  const scroll = tree.root.findByType(ScrollView).instance as { getNativeScrollRef: unknown; scrollTo: jest.Mock };
  scroll.getNativeScrollRef = () => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 100, 390, 700) });
  scroll.scrollTo = jest.fn();
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(
    (field === null
      ? null
      : {
          measureLayout: (_to: unknown, ok: (l: number, t: number, w: number, h: number) => void, fail: () => void) =>
            field === 'elsewhere' ? fail() : ok(0, field.top, 300, field.height),
        }) as never,
  );
  return tree;
}

const room = (tree: ReactTestRenderer) => {
  const scroll = tree.root.findByType(ScrollView);
  const spacers = scroll.findAll((n) => n.type === View && typeof n.props.style?.height === 'number' && n.props.style.height > 0);
  return spacers.length === 0 ? 0 : spacers[spacers.length - 1].props.style.height;
};

beforeEach(() => {
  keyboard = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((type: string, fn: KeyboardListener) => {
    (keyboard[type] ??= []).push(fn);
    return { remove: () => {} };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('a page and the keyboard (R560)', () => {
  it("never uses iOS's automatic keyboard insets, anywhere in the app (react-native#57755)", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(__dirname, '..', '..', 'app'));
    walk(join(__dirname, '..'));
    // Named only in comments explaining why it is gone.
    const users = files.filter((f) => /automaticallyAdjustKeyboardInsets\s*[={]|automaticallyAdjustKeyboardInsets\s*$/m.test(readFileSync(f, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\/|^\s*\*.*$/gm, '')));
    expect(users).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it('keeps taps on buttons while the keyboard is up', () => {
    expect(mount().root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('a field on the page: room under the content for the keyboard, then the field scrolled above it', () => {
    // Keyboard top at 500: the scroll view (100 to 800) is covered by 300, and 400 of it stays in view.
    const tree = mount(undefined, { top: 600, height: 44 });
    fire('keyboardWillShow');
    expect(room(tree)).toBe(300);
    fire('keyboardDidShow');
    const scroll = tree.root.findByType(ScrollView).instance as { scrollTo: jest.Mock };
    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 600 + 44 + KEYBOARD_MARGIN - 400, animated: true });
  });

  it('a field already in view is not scrolled to', () => {
    const tree = mount(undefined, { top: 100, height: 44 });
    fire('keyboardWillShow');
    fire('keyboardDidShow');
    expect((tree.root.findByType(ScrollView).instance as { scrollTo: jest.Mock }).scrollTo).not.toHaveBeenCalled();
  });

  it('the room goes with the keyboard, and a page left past its new end is brought back once', () => {
    const tree = mount(undefined, { top: 600, height: 44 });
    fire('keyboardWillShow');
    fire('keyboardDidShow');
    const scroll = tree.root.findByType(ScrollView);
    const scrollTo = (scroll.instance as { scrollTo: jest.Mock }).scrollTo;
    scrollTo.mockClear();
    fire('keyboardWillHide');
    expect(room(tree)).toBe(0);
    act(() => scroll.props.onLayout({ nativeEvent: { layout: { height: 700 } } }));
    act(() => scroll.props.onContentSizeChange(390, 900));
    expect(scrollTo).toHaveBeenCalledWith({ y: 200, animated: true });
    // Only once: a later size change, or a scroll's own end, never scrolls the page (R550).
    scrollTo.mockClear();
    act(() => scroll.props.onContentSizeChange(390, 800));
    act(() => scroll.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 900 } } }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('leaves a page a finger is moving to its own bounce', () => {
    const tree = mount(undefined, { top: 600, height: 44 });
    fire('keyboardWillShow');
    fire('keyboardDidShow');
    const scroll = tree.root.findByType(ScrollView);
    const scrollTo = (scroll.instance as { scrollTo: jest.Mock }).scrollTo;
    scrollTo.mockClear();
    act(() => scroll.props.onScrollBeginDrag());
    fire('keyboardWillHide');
    act(() => scroll.props.onLayout({ nativeEvent: { layout: { height: 700 } } }));
    act(() => scroll.props.onContentSizeChange(390, 900));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('a keyboard raised by a field elsewhere (a sheet over the page) changes nothing here', () => {
    const tree = mount(undefined, 'elsewhere');
    fire('keyboardWillShow');
    fire('keyboardDidShow');
    expect(room(tree)).toBe(0);
    expect((tree.root.findByType(ScrollView).instance as { scrollTo: jest.Mock }).scrollTo).not.toHaveBeenCalled();
  });

  it('a tab out of sight ignores the keyboard', () => {
    const tree = mount(fakeNavigation(false), { top: 600, height: 44 });
    fire('keyboardWillShow');
    expect(room(tree)).toBe(0);
  });

  it('a page leaving view closes the keyboard its field raised', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const navigation = fakeNavigation(true);
    mount(navigation, { top: 600, height: 44 });
    fire('keyboardWillShow');
    act(() => navigation.emit('blur'));
    expect(dismiss).toHaveBeenCalled();
  });
});
