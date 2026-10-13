import { AppState, Linking, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { announce } from '../platform/announce';
import { askNotificationAccess, notificationAccess } from '../platform/notificationAccess';
import { Button } from './Button';
import { NOTIFICATIONS_OFF, NOTIFICATIONS_WHY, RestNotificationAccess } from './RestNotificationAccess';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<RestNotificationAccess />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label);

beforeEach(() => {
  jest.mocked(notificationAccess).mockReset();
  jest.mocked(askNotificationAccess).mockReset();
  jest.mocked(announce).mockClear();
});

describe('Settings → Rest timer: the notification line (R410)', () => {
  it('draws nothing while notifications are allowed, or where there is nothing to ask', async () => {
    jest.mocked(notificationAccess).mockResolvedValue('granted');
    expect((await mount()).toJSON()).toBeNull();
    jest.mocked(notificationAccess).mockResolvedValue('unavailable');
    expect((await mount()).toJSON()).toBeNull();
  });

  it('before the phone has asked: says why, and Allow notifications asks', async () => {
    jest.mocked(notificationAccess).mockResolvedValue('undetermined');
    jest.mocked(askNotificationAccess).mockResolvedValue('granted');
    const tree = await mount();
    expect(texts(tree)).toContain(NOTIFICATIONS_WHY);
    expect(button(tree, 'Allow notifications')?.props).toMatchObject({ variant: 'secondary', size: 'compact' });

    await act(async () => button(tree, 'Allow notifications')!.props.onPress());

    expect(askNotificationAccess).toHaveBeenCalledTimes(1);
    expect(tree.toJSON()).toBeNull();
    expect(announce).toHaveBeenCalledWith('Notifications are on.');
  });

  it('refused at the question: says where to turn it on', async () => {
    jest.mocked(notificationAccess).mockResolvedValue('undetermined');
    jest.mocked(askNotificationAccess).mockResolvedValue('denied');
    const tree = await mount();
    await act(async () => button(tree, 'Allow notifications')!.props.onPress());
    expect(texts(tree)).toContain(NOTIFICATIONS_OFF);
    expect(announce).toHaveBeenCalledWith(NOTIFICATIONS_OFF);
  });

  it('refused earlier: says where to turn it on, and Open Settings goes there', async () => {
    jest.mocked(notificationAccess).mockResolvedValue('denied');
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    try {
      const tree = await mount();
      expect(texts(tree)).toContain(NOTIFICATIONS_OFF);
      const settings = button(tree, 'Open Settings')!;
      expect(settings.props.accessibilityLabel).toBe('Open Settings to turn on notifications');
      act(() => settings.props.onPress());
      expect(open).toHaveBeenCalledTimes(1);
    } finally {
      open.mockRestore();
    }
  });

  it('reads again when the app comes back to the front, so a change made in Settings shows', async () => {
    const listeners: ((state: string) => void)[] = [];
    const add = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    try {
      jest.mocked(notificationAccess).mockResolvedValue('denied');
      const tree = await mount();
      expect(texts(tree)).toContain(NOTIFICATIONS_OFF);
      jest.mocked(notificationAccess).mockResolvedValue('granted');
      await act(async () => listeners.forEach((l) => l('active')));
      expect(tree.toJSON()).toBeNull();
    } finally {
      add.mockRestore();
    }
  });
});
