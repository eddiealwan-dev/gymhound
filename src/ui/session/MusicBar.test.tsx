import { Keyboard, Linking, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
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

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MusicBar app={spotify} />);
  });
  return tree;
}

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
});
