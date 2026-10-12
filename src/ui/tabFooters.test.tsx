import { act, create } from 'react-test-renderer';
import Fuel from '../../app/(tabs)/fuel';
import Routines from '../../app/(tabs)/routines';
import { Footer } from './Footer';
import { Screen } from './Screen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The footer's own look is not under test here, only where it is placed (spec 8.1, and Fuel since Task 26): Train, Fuel, History, Stats and Settings.
jest.mock('./Footer', () => ({ Footer: () => null }));
// The icon font loads after the test ends, which logs errors from a torn-down environment; the icons are not under test.
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
// Routines holds the "Workout in progress" sheet (R80), which reads the safe area.
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/repositories/routinesRepo', () => ({ listRoutines: jest.fn(), setActiveRoutine: jest.fn() }));
// What every read returns: Routines' list, unless a test says otherwise.
const ROUTINES = [{ id: 'ppl', name: 'Push Pull Legs', dayCount: 6, isPremade: true, isActive: true }];
let mockQueryResult: unknown = ROUTINES;
jest.mock('../state/dataVersion', () => ({
  bumpData: jest.fn(),
  useDbQuery: () => mockQueryResult,
  useFocusedDbQuery: () => mockQueryResult,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: () => undefined }));
// Fuel: locked (the footer shows in every Fuel state); its water card has its own tests.
jest.mock('../platform/entitlements', () => ({ ...jest.requireActual('../platform/entitlements'), useIsPro: () => false }));
jest.mock('./fuel/WaterCard', () => ({ WaterCard: () => null }));
// The pitch reads the store; its own tests cover it (paywall.test).
jest.mock('./pro/ProPitch', () => ({ ProPitch: () => null }));

beforeEach(() => {
  mockQueryResult = ROUTINES;
});

function render(element: React.ReactElement) {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(element);
  });
  return tree;
}

describe('the GruntHound footer sits on Train, Fuel, History, Stats and Settings only (spec 8.1, Task 26)', () => {
  it('shows on a Screen that asks for it (the check below would otherwise pass for nothing)', () => {
    const tree = render(
      <Screen footer>
        <></>
      </Screen>,
    );
    expect(tree.root.findAllByType(Footer).length).toBe(1);
  });

  it('shows on Fuel, as on Train (Task 26)', () => {
    mockQueryResult = { targets: null, entries: [], trainingDay: false };
    const tree = render(<Fuel />);
    expect(JSON.stringify(tree.toJSON())).toContain('Fuel');
    expect(tree.root.findAllByType(Footer).length).toBe(1);
  });

  it('does not show on Routines', () => {
    const tree = render(<Routines />);
    expect(JSON.stringify(tree.toJSON())).toContain('Push Pull Legs');
    expect(tree.root.findAllByType(Footer).length).toBe(0);
  });
});
