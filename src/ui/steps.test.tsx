import { AppState, Linking, StyleSheet, Text, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import type { StepsPermission, StepsSource } from '../domain/steps';
import { StepsCard } from './stats/StepsCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Phase 6 Task 13 (R182): Stats → Steps, with a fake step counter (the real `expo-sensors` is never loaded). */

jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('../platform/locale', () => ({ deviceLocale: () => 'en-US' }));
const mockAnnounce = jest.fn();
jest.mock('../platform/announce', () => ({ announce: (text: string) => mockAnnounce(text) }));

/** The screen's focus, driven by the test: the registered focus effect runs on focus and its cleanup on blur. */
let mockFocusEffect: (() => void | (() => void)) | null = null;
let mockBlurCleanup: (() => void) | void = undefined;
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      mockFocusEffect = effect;
      useEffect(() => {
        mockBlurCleanup = effect();
        return () => {
          if (typeof mockBlurCleanup === 'function') mockBlurCleanup();
        };
      }, [effect]);
    },
  };
});

/** The fake counter: a permission, an answer to the ask, and a count per day (by local midnight), or a failure. */
const phone = {
  permission: 'granted' as StepsPermission,
  answer: 'granted' as StepsPermission,
  counts: {} as Record<string, number>,
  fails: false,
};
const mockSource: StepsSource & { [K in keyof StepsSource]: jest.Mock } = {
  permission: jest.fn(async () => phone.permission),
  request: jest.fn(async () => {
    phone.permission = phone.answer;
    return phone.answer;
  }),
  stepsBetween: jest.fn(async (start: Date) => {
    if (phone.fails) throw new Error('Not authorized');
    return phone.counts[start.toDateString()] ?? 0;
  }),
};
jest.mock('../platform/steps', () => ({ stepsSource: () => mockSource }));

// Sunday 11 October 2026, 14:30. The week is Mon 5 … Sun 11.
const NOW = new Date(2026, 9, 11, 14, 30).getTime();
const day = (d: number) => new Date(2026, 9, d).toDateString();
const WEEK = { [day(5)]: 8214, [day(6)]: 6002, [day(7)]: 0, [day(8)]: 12000, [day(9)]: 3000, [day(10)]: 4500, [day(11)]: 6000 };

let appStateListeners: ((state: AppStateStatus) => void)[] = [];

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  phone.permission = 'granted';
  phone.answer = 'granted';
  phone.counts = { ...WEEK };
  phone.fails = false;
  Object.values(mockSource).forEach((fn) => fn.mockClear());
  mockAnnounce.mockClear();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, listener: (state: AppStateStatus) => void) => {
    appStateListeners.push(listener);
    return { remove: () => (appStateListeners = appStateListeners.filter((l) => l !== listener)) };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function render(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<StepsCard />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const labelled = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label);
const button = (tree: ReactTestRenderer, label: string): ReactTestInstance | undefined =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function').find((n) => texts({ root: n } as ReactTestRenderer).includes(label));

describe('StepsCard (R182)', () => {
  it('draws nothing at all when the phone has no step counter it can read (Android, the web, no sensor)', async () => {
    phone.permission = 'unavailable';
    const tree = await render();
    expect(tree.toJSON()).toBeNull();
    expect(mockSource.stepsBetween).not.toHaveBeenCalled();
  });

  it('draws nothing, and never throws, when the counter fails to say its permission', async () => {
    mockSource.permission.mockRejectedValueOnce(new Error('boom'));
    const tree = await render();
    expect(tree.toJSON()).toBeNull();
  });

  it('before motion access is asked: says what it shows and offers Show steps, without asking', async () => {
    phone.permission = 'undetermined';
    const tree = await render();
    expect(texts(tree)).toEqual(['Steps', "See today's steps and the last 7 days from your iPhone's motion sensor.", 'Show steps']);
    expect(button(tree, 'Show steps')).toBeDefined();
    expect(mockSource.request).not.toHaveBeenCalled();
    expect(mockSource.stepsBetween).not.toHaveBeenCalled();
  });

  it('Show steps asks for motion access, then shows the steps and tells VoiceOver today’s count', async () => {
    phone.permission = 'undetermined';
    const tree = await render();
    await act(async () => {
      button(tree, 'Show steps')!.props.onPress();
    });
    expect(mockSource.request).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain('6,000');
    expect(button(tree, 'Show steps')).toBeUndefined();
    expect(mockAnnounce).toHaveBeenCalledWith('6,000 steps today.');
  });

  it('the app coming back to the front while the motion question is up does not undo its answer', async () => {
    phone.permission = 'undetermined';
    const tree = await render();
    let answer!: (p: StepsPermission) => void;
    mockSource.request.mockImplementationOnce(() => new Promise<StepsPermission>((resolve) => (answer = resolve)));
    await act(async () => {
      button(tree, 'Show steps')!.props.onPress();
    });
    // iOS's question sends the app inactive and back; the permission still reads undetermined for a moment.
    await act(async () => {
      appStateListeners.forEach((l) => l('active'));
    });
    phone.permission = 'granted';
    await act(async () => {
      answer('granted');
    });
    expect(texts(tree)).toContain('steps today');
    expect(button(tree, 'Show steps')).toBeUndefined();
  });

  it('Show steps refused: the Settings line, said to VoiceOver too', async () => {
    phone.permission = 'undetermined';
    phone.answer = 'denied';
    const tree = await render();
    await act(async () => {
      button(tree, 'Show steps')!.props.onPress();
    });
    expect(texts(tree)).toEqual(['Steps', 'Motion access is off. Turn it on in Settings to see your steps.', 'Open Settings']);
    expect(mockAnnounce).toHaveBeenCalledWith('Motion access is off. Turn it on in Settings to see your steps.');
    expect(mockSource.stepsBetween).not.toHaveBeenCalled();
  });

  it('denied: Open Settings opens the phone settings, where motion access is turned on (R409)', async () => {
    phone.permission = 'denied';
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    try {
      const tree = await render();
      const settings = button(tree, 'Open Settings')!;
      expect(settings.props.accessibilityLabel).toBe('Open Settings to turn on motion access');
      act(() => settings.props.onPress());
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      open.mockRestore();
    }
  });

  it('denied: the Settings line, and no Show steps', async () => {
    phone.permission = 'denied';
    const tree = await render();
    expect(texts(tree)).toEqual(['Steps', 'Motion access is off. Turn it on in Settings to see your steps.', 'Open Settings']);
    expect(button(tree, 'Show steps')).toBeUndefined();
    expect(mockSource.request).not.toHaveBeenCalled();
  });

  it('granted: today’s count, seven bars with their weekday initials, and the 7-day average', async () => {
    const tree = await render();
    expect(texts(tree)).toEqual(['Steps', '6,000', 'steps today', 'M', 'T', 'W', 'T', 'F', 'S', 'S', 'Average 5,674 a day over 7 days']);
    // Read today from its midnight to now and each earlier day midnight to midnight, oldest first.
    expect(mockSource.stepsBetween).toHaveBeenCalledTimes(7);
    expect(mockSource.stepsBetween.mock.calls[0]).toEqual([new Date(2026, 9, 5), new Date(2026, 9, 6)]);
    expect(mockSource.stepsBetween.mock.calls[6]).toEqual([new Date(2026, 9, 11), new Date(NOW)]);
    expect(mockSource.request).not.toHaveBeenCalled();
  });

  it('the bars are one VoiceOver element reading each day, and the tallest is full', async () => {
    const tree = await render();
    const bars = labelled(tree, 'Mon 8,214, Tue 6,002, Wed 0, Thu 12,000, Fri 3,000, Sat 4,500, Sun 6,000');
    expect(bars).toHaveLength(1);
    expect(bars[0].props.accessible).toBe(true);
    const fill = (i: number) => StyleSheet.flatten(tree.root.findByProps({ testID: `steps-bar-${i}` }).props.style).height;
    expect(fill(3)).toBe('100%');
    expect(fill(2)).toBe('0%');
    expect(fill(6)).toBe('50%');
    expect(labelled(tree, '6,000 steps today')).toHaveLength(1);
  });

  it("caps the weekday initials' text scaling at 1.5, so they never overlap at the largest text", async () => {
    const tree = await render();
    const initials = tree.root.findAllByType(Text).filter((t) => ['M', 'T', 'W', 'F', 'S'].includes([t.props.children].flat().join('')));
    expect(initials).toHaveLength(7);
    initials.forEach((t) => expect(t.props.maxFontSizeMultiplier).toBe(1.5));
  });

  it('a week of no steps draws empty bars, not a division by zero', async () => {
    phone.counts = {};
    const tree = await render();
    expect(StyleSheet.flatten(tree.root.findByProps({ testID: 'steps-bar-6' }).props.style).height).toBe('0%');
    expect(texts(tree)).toContain('Average 0 a day over 7 days');
  });

  it('a failed read says so, quietly', async () => {
    phone.fails = true;
    const tree = await render();
    expect(texts(tree)).toEqual(['Steps', "Couldn't read your steps."]);
  });

  it('reads again each time Stats comes into sight', async () => {
    const tree = await render();
    phone.counts[day(11)] = 7123;
    await act(async () => {
      mockBlurCleanup = mockFocusEffect!();
    });
    expect(texts(tree)).toContain('7,123');
  });

  it('reads again when the app comes back to the front while Stats is in sight, and not while it is out of sight', async () => {
    const tree = await render();
    phone.counts[day(11)] = 7500;
    await act(async () => {
      appStateListeners.forEach((l) => l('active'));
    });
    expect(texts(tree)).toContain('7,500');

    await act(async () => {
      if (typeof mockBlurCleanup === 'function') mockBlurCleanup();
      mockBlurCleanup = undefined;
    });
    mockSource.stepsBetween.mockClear();
    await act(async () => {
      appStateListeners.forEach((l) => l('active'));
    });
    expect(mockSource.stepsBetween).not.toHaveBeenCalled();
  });

  it('picks up motion access turned on in Settings when the app comes back', async () => {
    phone.permission = 'denied';
    const tree = await render();
    phone.permission = 'granted';
    await act(async () => {
      appStateListeners.forEach((l) => l('active'));
    });
    expect(texts(tree)).toContain('steps today');
  });

  it('uses no red anywhere', async () => {
    for (const permission of ['undetermined', 'denied', 'granted'] as const) {
      phone.permission = permission;
      const tree = await render();
      const colours = tree.root
        .findAll((n) => typeof n.type === 'string')
        .flatMap((n) => {
          const style = StyleSheet.flatten(n.props.style) ?? {};
          return [style.color, style.backgroundColor, style.borderColor];
        });
      expect(colours.map((c) => String(c).toUpperCase())).not.toContain('#E10600');
      act(() => tree.unmount());
    }
  });
});
