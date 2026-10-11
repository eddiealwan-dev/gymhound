import { router } from 'expo-router';
import { Keyboard, ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';
import Session from '../../../app/session';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockWorkout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, restSetId: null, exercises: [{ id: 'we1', exerciseId: 'bench', name: 'Barbell bench press', supersetGroup: null }] };

/** The props each mocked child was last drawn with: what is open shows here. */
const mockSeen: { block?: { onOpenMenu: () => void }; menuFor?: string | null; musicVisible?: boolean } = {};

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockWorkout, unit: 'kg', distanceUnit: 'km' }),
}));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({
  ExerciseBlock: (props: { onOpenMenu: () => void }) => {
    mockSeen.block = props;
    return null;
  },
}));
jest.mock('./ExerciseMenu', () => ({
  ExerciseMenu: ({ exerciseId }: { exerciseId: string | null }) => {
    mockSeen.menuFor = exerciseId;
    return null;
  },
}));
jest.mock('./MusicSheet', () => ({
  MusicSheet: ({ visible }: { visible: boolean }) => {
    mockSeen.musicVisible = visible;
    return null;
  },
}));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

let dismiss: jest.SpyInstance;

beforeEach(() => {
  jest.mocked(router.push).mockClear();
  dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the session screen closes the keyboard (Task 24)', () => {
  it('closes it when the page is dragged', () => {
    const tree = mount();
    expect(tree.root.findByType(ScrollView).props.keyboardDismissMode).toBe('on-drag');
  });

  it('closes it before the ⋯ menu opens', () => {
    mount();
    const menuWhenDismissed: (string | null | undefined)[] = [];
    dismiss.mockImplementation(() => void menuWhenDismissed.push(mockSeen.menuFor));

    act(() => mockSeen.block!.onOpenMenu());

    expect(mockSeen.menuFor).toBe('we1');
    expect(menuWhenDismissed).toEqual([null]);
  });

  it('closes it before the exercise picker opens from Add exercise', () => {
    const tree = mount();
    const pushesWhenDismissed: number[] = [];
    dismiss.mockImplementation(() => void pushesWhenDismissed.push(jest.mocked(router.push).mock.calls.length));

    const add = tree.root.findAllByType(Button).find((b) => b.props.label === 'Add exercise')!;
    act(() => add.props.onPress());

    expect(router.push).toHaveBeenCalledWith({ pathname: '/pick-exercise', params: { mode: 'add' } });
    expect(pushesWhenDismissed).toEqual([0]);
  });

  it('closes it before the music sheet opens', () => {
    const tree = mount();
    const musicWhenDismissed: (boolean | undefined)[] = [];
    dismiss.mockImplementation(() => void musicWhenDismissed.push(mockSeen.musicVisible));

    const music = tree.root.findAll((n) => n.props.accessibilityLabel === 'Music' && typeof n.props.onPress === 'function')[0];
    act(() => music.props.onPress());

    expect(mockSeen.musicVisible).toBe(true);
    expect(musicWhenDismissed).toEqual([false]);
  });
});
