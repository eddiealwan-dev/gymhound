import { Linking, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { musicAppsFor } from '../../platform/music';
import { flushAll } from '../../state/draftFlush';
import { Button } from '../Button';
import { MusicSheet } from './MusicSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const onClose = jest.fn();

function render(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MusicSheet visible apps={musicAppsFor('ios')} onClose={onClose} />);
  });
  return tree;
}

const labels = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).map((b) => b.props.label);
const press = async (tree: ReactTestRenderer, label: string) => {
  await act(async () => {
    tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress();
  });
};
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);

afterEach(() => {
  jest.restoreAllMocks();
  onClose.mockClear();
  jest.mocked(flushAll).mockClear();
});

it('has one button per app', () => {
  expect(labels(render())).toEqual(['Open Apple Music', 'Open Spotify', 'Open Audible']);
});

it('saves what is typed, opens the app and closes', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const tree = render();
  await press(tree, 'Open Spotify');
  expect(flushAll).toHaveBeenCalled();
  expect(openURL).toHaveBeenCalledWith('spotify://');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("says so when the app isn't on the phone, and stays open", async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('not installed'));
  const tree = render();
  await press(tree, 'Open Audible');
  expect(texts(tree)).toContain("Audible isn't on this phone.");
  expect(onClose).not.toHaveBeenCalled();
});
