import { Keyboard, Linking, Platform, ScrollView, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Session from '../../../app/session';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicAppId } from '../../domain/types';
import { Button } from '../Button';
import { MusicBar } from './MusicBar';
import { RestBar } from './RestBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The bottom of the session (Task 26): the countdown lives under its set, so the rest bar shows only as R41's fallback,
 * and the music bar picked from the header stays docked there.
 */

type Workout = { id: string; name: string; startedAt: number; restEndsAt: number | null; restSetId: string | null; exercises: unknown[] };

const EXERCISES = [{ id: 'we1', exerciseId: 'bench', supersetGroup: null, sets: [{ id: 's1' }, { id: 's2' }] }];
const mockState: { workout: Workout; musicApp: MusicAppId | null } = {
  workout: { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES },
  musicApp: null,
};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
// A write lands in the state the screen reads, as it would in SQLite; the test re-renders, as the bump would.
jest.mock('../../db/repositories/settingsRepo', () => ({
  getSettings: jest.fn(),
  setSetting: jest.fn((_db: unknown, key: string, value: unknown) => {
    if (key === 'musicApp') mockState.musicApp = value as MusicAppId | null;
  }),
}));
jest.mock('../../db/repositories/workoutsRepo', () => ({ countUntickedWithValues: () => 0 }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockState.workout, unit: 'kg', distanceUnit: 'km', musicApp: mockState.musicApp }),
  bumpData: jest.fn(),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({ ExerciseBlock: () => null }));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

/** Draws the screen again, as the version bump after a write would. */
const rerender = (tree: ReactTestRenderer) => act(() => tree.update(<Session />));

const restBars = (tree: ReactTestRenderer) => tree.root.findAllByType(RestBar);
const musicBars = (tree: ReactTestRenderer) => tree.root.findAllByType(MusicBar);
const buttonLabels = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).map((b) => b.props.label);

/** The view docked at the bottom of the session, which holds the bars and reports their height. */
const dock = (tree: ReactTestRenderer): ReactTestInstance =>
  tree.root.findAll((n) => n.type === View && typeof n.props.onLayout === 'function')[0];

/** The bottom padding of the scrolling content: what keeps Finish clear of the bars. */
const contentPaddingBottom = (tree: ReactTestRenderer): number => {
  const content = tree.root.findByType(ScrollView).findAll((n) => n.type === View && n.props.style?.maxWidth === 512)[0];
  return content.props.style.paddingBottom;
};

const layout = (tree: ReactTestRenderer, height: number) =>
  act(() => dock(tree).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } }));

const press = (tree: ReactTestRenderer, label: string) =>
  act(() => {
    tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress();
  });

beforeEach(() => {
  mockState.workout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: EXERCISES };
  mockState.musicApp = null;
  jest.mocked(setSetting).mockClear();
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the rest bar is only the fallback (Task 26, R41)', () => {
  it('is not drawn while the set that started the rest is a row of the workout: the countdown is under that set', () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: 's2' };
    expect(restBars(mount())).toHaveLength(0);
  });

  it('is drawn when a rest runs and no set started it', () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: null };
    const bars = restBars(mount());
    expect(bars).toHaveLength(1);
    expect(bars[0].props).toMatchObject({ workoutId: 'w1', endsAt: 60_000 });
  });

  it('is drawn when the set that started the rest is no longer in the workout', () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: 'gone' };
    expect(restBars(mount())).toHaveLength(1);
  });

  it('is not drawn with no rest running', () => {
    expect(restBars(mount())).toHaveLength(0);
  });

  it('clears the bottom safe area itself when it is alone', () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: null };
    expect(restBars(mount())[0].props.bottomInset).toBe(true);
  });
});

describe('the bottom padding follows what is docked', () => {
  it('is the safe area with nothing docked', () => {
    expect(contentPaddingBottom(mount())).toBe(16 + 34);
  });

  it("is the docked bars' measured height while they show", () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: null };
    mockState.musicApp = 'spotify';
    const tree = mount();

    layout(tree, 180);

    expect(contentPaddingBottom(tree)).toBe(16 + 180);
  });

  it('goes back to the safe area when the dock empties', () => {
    mockState.musicApp = 'spotify';
    const tree = mount();
    layout(tree, 110);
    expect(contentPaddingBottom(tree)).toBe(16 + 110);

    mockState.musicApp = null;
    rerender(tree);
    layout(tree, 0);

    expect(contentPaddingBottom(tree)).toBe(16 + 34);
  });
});

describe('the music bar (Task 26)', () => {
  it('picking Spotify from the header stores it, closes the sheet and shows the bar with Open Spotify', () => {
    const tree = mount();
    const music = tree.root.findAll((n) => n.props.accessibilityLabel === 'Music' && typeof n.props.onPress === 'function')[0];
    act(() => music.props.onPress());

    press(tree, 'Spotify');
    rerender(tree);

    expect(setSetting).toHaveBeenCalledWith('db', 'musicApp', 'spotify');
    expect(musicBars(tree)).toHaveLength(1);
    expect(buttonLabels(tree)).toContain('Open Spotify');
    // The sheet has closed: its Close button is gone.
    expect(buttonLabels(tree)).not.toContain('Close');
  });

  it('the music sheet shows the app picked as selected (G6)', () => {
    mockState.musicApp = 'spotify';
    const tree = mount();
    const music = tree.root.findAll((n) => n.props.accessibilityLabel === 'Music' && typeof n.props.onPress === 'function')[0];

    act(() => music.props.onPress());

    const picked = tree.root.findAllByType(Button).filter((b) => b.props.selected === true);
    expect(picked.map((b) => b.props.label)).toEqual(['Spotify']);
  });

  it('Open Spotify opens Spotify by its address', async () => {
    mockState.musicApp = 'spotify';
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = mount();

    await act(async () => {
      tree.root.findAllByType(Button).find((b) => b.props.label === 'Open Spotify')!.props.onPress();
    });

    expect(openURL).toHaveBeenCalledWith('spotify://');
  });

  it('picking Audible after Spotify was missing shows Audible without the missing message', async () => {
    mockState.musicApp = 'spotify';
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
    const tree = mount();
    await act(async () => {
      tree.root.findAllByType(Button).find((b) => b.props.label === 'Open Spotify')!.props.onPress();
    });
    expect(tree.root.findAllByType(Text).map((t) => t.props.children)).toContain("Spotify isn't on this phone.");

    const music = tree.root.findAll((n) => n.props.accessibilityLabel === 'Music' && typeof n.props.onPress === 'function')[0];
    act(() => music.props.onPress());
    press(tree, 'Audible');
    rerender(tree);

    const texts = tree.root.findAllByType(Text).map((t) => t.props.children);
    expect(buttonLabels(tree)).toContain('Open Audible');
    expect(texts).not.toContain("Audible isn't on this phone.");
    expect(texts).toContain('Tap Open to play or skip');
  });

  it('× clears it, and the bar goes', () => {
    mockState.musicApp = 'spotify';
    const tree = mount();
    const close = tree.root.findAll((n) => n.props.accessibilityLabel === 'Close music bar' && typeof n.props.onPress === 'function')[0];

    act(() => close.props.onPress());
    rerender(tree);

    expect(setSetting).toHaveBeenCalledWith('db', 'musicApp', null);
    expect(musicBars(tree)).toHaveLength(0);
  });

  it('is never drawn on web', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    mockState.musicApp = 'spotify';
    expect(musicBars(mount())).toHaveLength(0);
  });

  it('is not drawn for Apple Music on Android', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockState.musicApp = 'apple-music';
    expect(musicBars(mount())).toHaveLength(0);
  });

  it('stacks under the fallback rest bar, which then leaves the safe area to the music bar', () => {
    mockState.workout = { ...mockState.workout, restEndsAt: 60_000, restSetId: null };
    mockState.musicApp = 'spotify';
    const tree = mount();

    // In the dock, top to bottom.
    expect(dock(tree).findAll((n) => n.type === RestBar || n.type === MusicBar).map((n) => n.type)).toEqual([RestBar, MusicBar]);
    expect(restBars(tree)[0].props.bottomInset).toBe(false);
  });
});
