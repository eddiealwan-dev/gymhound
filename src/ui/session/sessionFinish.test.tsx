import { router } from 'expo-router';
import { act, create } from 'react-test-renderer';
import { getActiveWorkoutView } from '../../db/repositories/workoutViewsRepo';
import { finish } from '../../state/sessionActions';
import Session from '../../../app/session';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockWorkout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, exercises: [] };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ countUntickedWithValues: () => 0 }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockWorkout, unit: 'kg', distanceUnit: 'km' }),
}));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({ ExerciseBlock: () => null }));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const FAILED = "GymHound couldn't finish this workout. It's still here — try again.";

function mount() {
  let tree!: ReturnType<typeof create>;
  act(() => {
    tree = create(<Session />);
  });
  return tree;
}

/** Every string drawn on screen right now (a closed sheet draws nothing). */
function shownText(tree: ReturnType<typeof create>): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

function press(tree: ReturnType<typeof create>, label: string) {
  const buttons = tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  expect(buttons).toHaveLength(1);
  act(() => buttons[0].props.onPress());
}

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.mocked(router.replace).mockClear();
  jest.mocked(finish).mockReset();
  // A set is ticked, so Finish goes straight on to `finish`.
  jest.mocked(getActiveWorkoutView).mockReturnValue({ exercises: [{ sets: [{ done: true }] }] } as unknown as ReturnType<typeof getActiveWorkoutView>);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the session screen when Finish is pressed (R32)', () => {
  it('goes to the summary when the workout finishes', () => {
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();

    press(tree, 'Finish');

    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
    expect(shownText(tree)).not.toContain(FAILED);
  });

  it('asks about the empty workout when the finish refuses with nothing ticked', () => {
    jest.mocked(finish).mockReturnValue('nothing_ticked');
    const tree = mount();

    press(tree, 'Finish');

    expect(shownText(tree)).toContain('Nothing is ticked yet.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('catches an unexpected error: logs it, says the workout is still here, and stays on the session', () => {
    const boom = new Error('disk I/O error');
    jest.mocked(finish).mockImplementation(() => {
      throw boom;
    });
    const tree = mount();

    expect(() => press(tree, 'Finish')).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toContain(boom);
    expect(shownText(tree)).toEqual(expect.arrayContaining([FAILED, 'OK']));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('closes the message on OK, leaves the workout active, and lets Finish be tried again', () => {
    jest.mocked(finish).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount();
    press(tree, 'Finish');

    press(tree, 'OK');

    expect(shownText(tree)).not.toContain(FAILED);
    expect(router.replace).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledTimes(1);

    jest.mocked(finish).mockReturnValue('finished');
    press(tree, 'Finish');

    expect(finish).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
  });
});
