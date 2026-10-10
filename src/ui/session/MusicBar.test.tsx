import { AccessibilityInfo, Animated, Keyboard, Linking, Platform, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setSetting } from '../../db/repositories/settingsRepo';
import { MUSIC_APPS } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { MusicBar } from './MusicBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ setSetting: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const spotify = MUSIC_APPS.find((app) => app.id === 'spotify')!;
const audible = MUSIC_APPS.find((app) => app.id === 'audible')!;

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MusicBar app={spotify} />);
  });
  return tree;
}

/** The bar's own outer view: it reports the bar's height and carries the slide. */
const barView = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.type === View && typeof n.props.onLayout === 'function')[0];
const translateY = (tree: ReactTestRenderer): number => {
  const style = [barView(tree).props.style].flat(Infinity).reduce((all, s) => ({ ...all, ...s }), {});
  return style.transform.find((t: { translateY?: number }) => 'translateY' in t).translateY;
};
const layoutBar = async (tree: ReactTestRenderer, height: number) => {
  await act(async () => {
    barView(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
  });
};

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);
const closeButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === 'Close music bar' && typeof n.props.onPress === 'function')[0];
const openSpotify = async (tree: ReactTestRenderer) => {
  await act(async () => {
    tree.root.findAllByType(Button).find((b) => b.props.label === 'Open Spotify')!.props.onPress();
  });
};

let dismiss: jest.SpyInstance;

beforeEach(() => {
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
  jest.mocked(flushAll).mockClear();
});

describe('the music bar (Task 26)', () => {
  it("shows the app's name, the caption, Open Spotify and a close button", () => {
    const tree = render();
    expect(texts(tree)).toEqual(expect.arrayContaining(['Spotify', 'Tap Open to play or skip']));
    expect(tree.root.findAllByType(Button).map((b) => b.props.label)).toEqual(['Open Spotify']);
    expect(closeButton(tree)).toBeDefined();
  });

  it('clears the bottom safe area itself', () => {
    const tree = render();
    expect(tree.root.findAll((n) => n.props.style?.paddingBottom === 34).length).toBeGreaterThan(0);
  });

  it('closes the keyboard, saves what is typed, then opens the app by its address', async () => {
    const order: string[] = [];
    dismiss.mockImplementation(() => void order.push('dismiss'));
    jest.mocked(flushAll).mockImplementation(() => void order.push('flush'));
    const openURL = jest.spyOn(Linking, 'openURL').mockImplementation(async () => {
      order.push('open');
      return true;
    });
    const tree = render();

    await openSpotify(tree);

    expect(openURL).toHaveBeenCalledWith('spotify://');
    expect(order).toEqual(['dismiss', 'flush', 'open']);
    expect(texts(tree)).not.toContain("Spotify isn't on this phone.");
  });

  it("says so when the app isn't on the phone", async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
    const tree = render();

    await openSpotify(tree);

    expect(texts(tree)).toContain("Spotify isn't on this phone.");
  });

  it('× clears the music app', () => {
    const tree = render();

    act(() => closeButton(tree).props.onPress());

    expect(setSetting).toHaveBeenCalledWith('db', 'musicApp', null);
    expect(bumpData).toHaveBeenCalledTimes(1);
  });

  it('keeps no "missing" message for a different app picked after it', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
    const tree = render();
    await openSpotify(tree);
    expect(texts(tree)).toContain("Spotify isn't on this phone.");

    act(() => tree.update(<MusicBar app={audible} />));

    expect(texts(tree)).not.toContain("Audible isn't on this phone.");
    expect(texts(tree)).toContain('Tap Open to play or skip');
  });
});

describe('the music bar slides up (Task 26, spec §18.4)', () => {
  /** Jest has no native animation driver, so the slide is run straight to where it ends; its settings are recorded. */
  const finishSlides = () =>
    jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
      const run = { start: () => (value as Animated.Value).setValue(config.toValue as number), stop: () => {}, reset: () => {} };
      return run as unknown as Animated.CompositeAnimation;
    });

  it('starts below its own height, then slides up to rest on the bottom edge', async () => {
    const timing = finishSlides();
    const tree = render();
    // Before it is measured it is held off the screen.
    expect(translateY(tree)).toBeGreaterThan(150);

    await layoutBar(tree, 150);

    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ toValue: 0, duration: 250, useNativeDriver: true });
    expect(translateY(tree)).toBe(0);
  });

  it('is measured at its height before the slide starts', async () => {
    jest.spyOn(Animated, 'timing').mockImplementation(() => ({ start: () => {}, stop: () => {}, reset: () => {} }));
    const tree = render();

    await layoutBar(tree, 150);

    expect(translateY(tree)).toBe(150);
  });

  it('slides only once, not again when it is measured again', async () => {
    const timing = finishSlides();
    const tree = render();
    await layoutBar(tree, 150);

    await layoutBar(tree, 170);

    expect(timing).toHaveBeenCalledTimes(1);
    expect(translateY(tree)).toBe(0);
  });

  it('appears in place, without the slide, with Reduce Motion on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const timing = jest.spyOn(Animated, 'timing');
    const tree = render();

    await layoutBar(tree, 150);

    expect(timing).not.toHaveBeenCalled();
    expect(translateY(tree)).toBe(0);
  });

  it('appears in place, as with Reduce Motion, when the Reduce Motion check fails, so its × is never out of reach', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockRejectedValueOnce(new Error('unavailable'));
    const timing = jest.spyOn(Animated, 'timing');
    const tree = render();

    await layoutBar(tree, 150);

    expect(timing).not.toHaveBeenCalled();
    expect(translateY(tree)).toBe(0);
  });
});

describe('the music bar with a screen reader (G5)', () => {
  // React Native's own Jest mock, which `jest.restoreAllMocks` leaves alone: its calls are cleared before each test.
  const announce = jest.mocked(AccessibilityInfo.announceForAccessibility);

  beforeEach(() => announce.mockClear());

  /** Whether VoiceOver and TalkBack skip this node: it, or a view around it, hides itself and everything inside. */
  const hiddenFromScreenReaders = (node: ReactTestInstance): boolean => {
    for (let n: ReactTestInstance | null = node; n; n = n.parent) {
      if (n.props.accessibilityElementsHidden === true && n.props.importantForAccessibility === 'no-hide-descendants') return true;
    }
    return false;
  };

  it('skips the decorative music icon', () => {
    const tree = render();
    const icon = tree.root.find((n) => n.props.name === 'musical-notes');

    expect(hiddenFromScreenReaders(icon)).toBe(true);
    // The × is still read.
    expect(hiddenFromScreenReaders(closeButton(tree))).toBe(false);
  });

  it("says the app isn't on this phone on iOS, where VoiceOver does not read a live region", async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
    const tree = render();

    await openSpotify(tree);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith("Spotify isn't on this phone.");
  });

  it('says nothing more when the app opens', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = render();

    await openSpotify(tree);

    expect(announce).not.toHaveBeenCalled();
  });

  it("leaves it to the live region on Android, which TalkBack reads, so it isn't said twice", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
    const tree = render();

    await openSpotify(tree);

    expect(announce).not.toHaveBeenCalled();
    const line = tree.root.findAllByType(Text).find((t) => t.props.children === "Spotify isn't on this phone.")!;
    expect(line.props.accessibilityLiveRegion).toBe('polite');
  });
});
