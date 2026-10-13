import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { announce } from '../platform/announce';
import { openFeedbackEmail } from '../platform/feedback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ theme: 'system', unit: 'lb', distanceUnit: 'mi', restSeconds: 120, restBell: true, restBellSound: 'bell', lastSnapshotAt: null, lastSnapshotError: null }),
  setSetting: jest.fn(),
}));
jest.mock('../db/repositories/unitsRepo', () => ({ switchDisplayUnit: jest.fn() }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/feedback', () => ({ ...jest.requireActual('../platform/feedback'), openFeedbackEmail: jest.fn() }));
jest.mock('../state/backup', () => ({ snapshotListing: () => ({ path: null, names: [], error: null }), snapshotFolderReport: () => null, shareFile: jest.fn() }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn(), router: { push: jest.fn() } }));
jest.mock('../state/dataVersion', () => ({ ...jest.requireActual('../state/dataVersion'), useDbQuery: (query: (db: unknown) => unknown) => query('db') }));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../platform/entitlements', () => ({
  debugUnlockAllowed: () => false,
  entitlementsFor: jest.fn(),
  useEntitlementsState: () => ({ isPro: false, isDebugPro: false, canPurchase: false, plans: [], subscribed: false, kind: 'free' }),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Settings />);
  });
  return tree;
}
const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));
const press = async (tree: ReactTestRenderer) => {
  await act(async () => tree.root.find((n) => n.props.label === 'Send feedback' && typeof n.props.onPress === 'function').props.onPress());
};

describe('Settings → Feedback (R570)', () => {
  it('Send feedback opens a new email in the mail app, after GymHound Pro', async () => {
    jest.mocked(openFeedbackEmail).mockResolvedValue('opened');
    const tree = mount();
    const all = lines(tree);
    expect(all.indexOf('Feedback')).toBeGreaterThan(all.indexOf('GymHound Pro'));
    expect(all).toContain('Found a bug, or have an idea? Tell us. It opens an email in your mail app.');
    await press(tree);
    expect(openFeedbackEmail).toHaveBeenCalledTimes(1);
    expect(lines(tree).some((l) => l.startsWith("Couldn't open Mail"))).toBe(false);
  });

  it('with no mail app it gives the address to write to', async () => {
    jest.mocked(openFeedbackEmail).mockResolvedValue('unavailable');
    const tree = mount();
    await press(tree);
    expect(lines(tree)).toContain("Couldn't open Mail. Write to grunthound@gmail.com.");
    expect(announce).toHaveBeenCalledWith("Couldn't open Mail. Write to grunthound@gmail.com.");
  });
});
