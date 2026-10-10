import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setSetting } from '../../db/repositories/settingsRepo';
import type { MusicAppId } from '../../domain/types';
import { musicAppsFor } from '../../platform/music';
import { bumpData } from '../../state/dataVersion';
import { Button } from '../Button';
import { MusicSheet } from './MusicSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ setSetting: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const onClose = jest.fn();

function render(musicApp: MusicAppId | null = null): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<MusicSheet visible apps={musicAppsFor('ios')} musicApp={musicApp} onClose={onClose} />);
  });
  return tree;
}

const labels = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).map((b) => b.props.label);
const press = (tree: ReactTestRenderer, label: string) => {
  act(() => {
    tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress();
  });
};

afterEach(() => {
  jest.restoreAllMocks();
  onClose.mockClear();
  jest.mocked(setSetting).mockClear();
  jest.mocked(bumpData).mockClear();
});

it('has one button per app, then Close', () => {
  expect(labels(render())).toEqual(['Apple Music', 'Spotify', 'Audible', 'Close']);
});

it('closes on Close without choosing anything, so VoiceOver can leave it (F3)', () => {
  const tree = render();
  press(tree, 'Close');
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(setSetting).not.toHaveBeenCalled();
});

it('stores the app picked for the music bar and closes, without leaving GymHound (Task 26)', () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  const tree = render();

  press(tree, 'Spotify');

  expect(setSetting).toHaveBeenCalledWith('db', 'musicApp', 'spotify');
  expect(bumpData).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(openURL).not.toHaveBeenCalled();
});

describe('the app already picked (G6)', () => {
  const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label)!;
  /** Whether the screen reader hears "selected": the native view under the button carries the state. */
  const saysSelected = (b: ReactTestInstance) =>
    b.findAll((n) => typeof n.type === 'string' && n.props.accessibilityState?.selected === true).length > 0;

  it('is the selected button, filled, and the screen reader says it is selected', () => {
    const tree = render('spotify');

    expect(button(tree, 'Spotify').props).toMatchObject({ selected: true, variant: 'primary' });
    expect(saysSelected(button(tree, 'Spotify'))).toBe(true);
    for (const label of ['Apple Music', 'Audible']) {
      expect(button(tree, label).props).toMatchObject({ selected: false, variant: 'secondary' });
      expect(saysSelected(button(tree, label))).toBe(false);
    }
  });

  it('leaves every app unselected while none is picked', () => {
    const tree = render(null);

    for (const label of ['Apple Music', 'Spotify', 'Audible']) {
      expect(button(tree, label).props).toMatchObject({ selected: false, variant: 'secondary' });
    }
  });
});
