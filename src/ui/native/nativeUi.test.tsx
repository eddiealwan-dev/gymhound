import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { HealthStore } from '../../platform/health/types';
import { acceptSleepOffer, dismissSleepOffer, roughSleepOfferFor, setHealthSwitch } from '../../state/healthSync';
import { HealthSettings } from './HealthSettings';
import { SleepOfferBanner } from './SleepOfferBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockStore: HealthStore | null = null;
let mockOpen = true;
jest.mock('../../platform/health', () => ({ getHealthStore: () => mockStore }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/healthRepo', () => ({ sleepOfferOpen: () => mockOpen }));
jest.mock('../../db/repositories/settingsRepo', () => ({
  getSettings: () => ({ healthWorkouts: true, healthSleep: false, healthHeartRate: false, healthBodyweight: false }),
}));
jest.mock('../../state/healthSync', () => ({
  acceptSleepOffer: jest.fn(),
  dismissSleepOffer: jest.fn(),
  roughSleepOfferFor: jest.fn(async () => 'sleep'),
  setHealthSwitch: jest.fn(async () => {}),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: unknown) => unknown) => query('db') }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const STORE = { name: 'Apple Health' } as HealthStore;

async function mount(node: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(node);
  });
  return tree;
}

const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));
const pressable = (tree: ReactTestRenderer, label: string) =>
  tree.root.find((n) => typeof n.props.onPress === 'function' && (n.props.accessibilityLabel === label || n.props.label === label));

beforeEach(() => {
  mockStore = STORE;
  mockOpen = true;
  jest.clearAllMocks();
});

describe('SleepOfferBanner (§17.1, R309)', () => {
  it('draws nothing and reads nothing without a health store (Expo Go, the web)', async () => {
    mockStore = null;
    const tree = await mount(<SleepOfferBanner workoutId="w1" />);
    expect(tree.toJSON()).toBeNull();
    expect(roughSleepOfferFor).not.toHaveBeenCalled();
  });

  it('asks Health once and shows the offer while it is open', async () => {
    const tree = await mount(<SleepOfferBanner workoutId="w1" />);
    expect(roughSleepOfferFor).toHaveBeenCalledTimes(1);
    expect(roughSleepOfferFor).toHaveBeenCalledWith('db', 'w1', STORE);
    expect(lines(tree).length).toBeGreaterThan(1);
    act(() => pressable(tree, 'Mark it').props.onPress());
    expect(acceptSleepOffer).toHaveBeenCalledWith('db', 'w1');
    act(() => pressable(tree, 'Dismiss').props.onPress());
    expect(dismissSleepOffer).toHaveBeenCalledWith('db', 'w1');
  });

  it('shows nothing once the offer is closed, or when the night was fine', async () => {
    mockOpen = false;
    expect((await mount(<SleepOfferBanner workoutId="w1" />)).toJSON()).toBeNull();
    mockOpen = true;
    jest.mocked(roughSleepOfferFor).mockResolvedValueOnce(null);
    expect((await mount(<SleepOfferBanner workoutId="w1" />)).toJSON()).toBeNull();
  });

  it('shows nothing, and logs it, when asking Health fails outright', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(roughSleepOfferFor).mockRejectedValueOnce(new Error('database is locked'));
    expect((await mount(<SleepOfferBanner workoutId="w1" />)).toJSON()).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'database is locked' }));
    warn.mockRestore();
  });
});

describe('HealthSettings (§17.1, R307)', () => {
  it('is not shown without a health store', async () => {
    mockStore = null;
    expect((await mount(<HealthSettings />)).toJSON()).toBeNull();
  });

  it("names the store, shows a switch per item, and turns one on through the store's sheet", async () => {
    const tree = await mount(<HealthSettings />);
    expect(lines(tree)).toEqual(
      expect.arrayContaining(['Apple Health', 'Save workouts to Apple Health', 'Read sleep', 'Read resting heart rate', 'Read body weight']),
    );
    const sleep = tree.root.find((n) => n.props.accessibilityLabel === 'Read sleep' && typeof n.props.onValueChange === 'function');
    expect(sleep.props.value).toBe(false);
    await act(async () => sleep.props.onValueChange(true));
    expect(setHealthSwitch).toHaveBeenCalledWith('db', 'sleep', true, STORE);
  });

  it('logs a switch that fails outright, and lets it be tried again', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(setHealthSwitch).mockRejectedValueOnce(new Error('database is locked'));
    const tree = await mount(<HealthSettings />);
    const sleep = () => tree.root.find((n) => n.props.accessibilityLabel === 'Read sleep' && typeof n.props.onValueChange === 'function');
    await act(async () => sleep().props.onValueChange(true));
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'database is locked' }));
    await act(async () => sleep().props.onValueChange(true));
    expect(setHealthSwitch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
