import { router } from 'expo-router';
import { Keyboard } from 'react-native';
import { act, create } from 'react-test-renderer';
import { getNextDayTitle } from '../../db/repositories/workoutsRepo';
import { getActiveWorkoutView } from '../../db/repositories/workoutViewsRepo';
import { flushAll } from '../../state/draftFlush';
import { discard, finish } from '../../state/sessionActions';
import Session from '../../../app/session';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockWorkout = { id: 'w1', name: 'Push A', startedAt: 1_000, restEndsAt: null, exercises: [] };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
  useNavigation: () => ({ addListener: () => () => {} }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getNextDayTitle: jest.fn(() => 'Pull A') }));
jest.mock('../../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn() }));
jest.mock('../../state/dataVersion', () => ({
  useDbQuery: () => ({ workout: mockWorkout, unit: 'kg', distanceUnit: 'km', restSeconds: 120 }),
}));
jest.mock('../../state/draftFlush', () => ({ flushAll: jest.fn() }));
jest.mock('../../state/sessionActions', () => ({ finish: jest.fn(), discard: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../../state/useNow', () => ({ useNow: () => 2_000 }));
jest.mock('./ExerciseBlock', () => ({ ExerciseBlock: () => null }));
jest.mock('./ExerciseMenu', () => ({ ExerciseMenu: () => null }));
jest.mock('./RestBar', () => ({ RestBar: () => null }));
// The Short on food offer has its own tests (foodOffer.test.tsx).
jest.mock('./FoodOfferBanner', () => ({ FoodOfferBanner: () => null }));
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

type View = ReturnType<typeof getActiveWorkoutView>;

const done = { done: true };
const open = { done: false };

/** The workout as the database has it when Finish is pressed. */
function viewWith(exercises: { name: string; sets: { done: boolean }[] }[]) {
  jest.mocked(getActiveWorkoutView).mockReturnValue({ id: 'w1', name: 'Push A', exercises } as unknown as View);
}

/** The sheet's two answers in the order they are drawn, each with its variant (a Button with none is primary). */
function answers(tree: ReturnType<typeof create>) {
  return tree.root
    .findAllByType(Button)
    .filter((b) => b.props.label === 'Keep logging' || b.props.label === 'Finish anyway')
    .map((b) => [b.props.label, b.props.variant ?? 'primary']);
}

let warn: jest.SpyInstance;

beforeEach(() => {
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.dismissTo).mockClear();
  jest.mocked(finish).mockReset();
  jest.mocked(discard).mockClear();
  jest.mocked(flushAll).mockClear();
  jest.mocked(getActiveWorkoutView).mockClear();
  jest.mocked(getNextDayTitle).mockClear();
  // Every set is ticked, so Finish goes straight on to `finish`.
  viewWith([{ name: 'Barbell bench press', sets: [done] }]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
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

describe('the session screen asks before Finish drops untouched sets (§18.6)', () => {
  const ASKED = 'Finish Push A?';
  const UNTOUCHED_TITLE = 'Overhead press has nothing logged';

  /** Bench half done and the overhead press not started. */
  const untouched = () =>
    viewWith([
      { name: 'Barbell bench press', sets: [done, open] },
      { name: 'Overhead press', sets: [open] },
    ]);

  it('finishes with no question when every set is ticked', () => {
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();

    press(tree, 'Finish');

    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
    expect(shownText(tree)).not.toContain(ASKED);
  });

  it('asks with Keep logging filled when a whole exercise is untouched, naming it in the title (R57)', () => {
    untouched();
    const tree = mount();

    press(tree, 'Finish');

    expect(shownText(tree)).toEqual(
      expect.arrayContaining([
        UNTOUCHED_TITLE,
        "1 of 3 sets done. Incomplete sets won't count, and Up next moves to Pull A.",
      ]),
    );
    expect(shownText(tree)).not.toContain(ASKED);
    expect(getNextDayTitle).toHaveBeenCalledWith('db', 'w1');
    expect(answers(tree)).toEqual([
      ['Keep logging', 'primary'],
      ['Finish anyway', 'secondary'],
    ]);
    expect(finish).not.toHaveBeenCalled();
  });

  it('Keep logging closes and finishes nothing', () => {
    untouched();
    const tree = mount();
    press(tree, 'Finish');

    press(tree, 'Keep logging');

    expect(shownText(tree)).not.toContain(UNTOUCHED_TITLE);
    expect(finish).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('Finish anyway finishes and goes to the summary once the sheet has closed', () => {
    jest.useFakeTimers();
    untouched();
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();
    press(tree, 'Finish');

    press(tree, 'Finish anyway');

    // The sheet goes away first: nothing finishes while it fades.
    expect(shownText(tree)).not.toContain(UNTOUCHED_TITLE);
    expect(finish).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();

    act(() => void jest.runAllTimers());

    expect(finish).toHaveBeenCalledWith('db', 'w1');
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
  });

  it('finishes and goes to the summary at once when every set is ticked (no sheet to wait for)', () => {
    jest.useFakeTimers();
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();

    press(tree, 'Finish');

    expect(finish).toHaveBeenCalledWith('db', 'w1');
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
  });

  it('asks with Finish anyway filled when every exercise has a tick', () => {
    viewWith([
      { name: 'Barbell bench press', sets: [done, open] },
      { name: 'Overhead press', sets: [done] },
    ]);
    const tree = mount();

    press(tree, 'Finish');

    expect(shownText(tree)).toEqual(
      expect.arrayContaining([ASKED, "2 of 3 sets done. Incomplete sets won't count, and Up next moves to Pull A."]),
    );
    expect(answers(tree)).toEqual([
      ['Finish anyway', 'primary'],
      ['Keep logging', 'secondary'],
    ]);
    expect(finish).not.toHaveBeenCalled();
  });

  it("never says 'sets aren't ticked'", () => {
    untouched();
    const tree = mount();

    press(tree, 'Finish');

    expect(shownText(tree).some((text) => text.includes("aren't ticked"))).toBe(false);
  });

  it("never says 'Unticked' (R57)", () => {
    untouched();
    const tree = mount();

    press(tree, 'Finish');

    expect(shownText(tree).some((text) => /unticked/i.test(text))).toBe(false);
  });

  it('saves typed text before it counts', () => {
    untouched();
    const tree = mount();

    press(tree, 'Finish');

    const flushed = jest.mocked(flushAll).mock.invocationCallOrder;
    const read = jest.mocked(getActiveWorkoutView).mock.invocationCallOrder;
    expect(flushed.length).toBeGreaterThan(0);
    expect(read.length).toBeGreaterThan(0);
    expect(Math.min(...flushed)).toBeLessThan(Math.min(...read));
  });

  it('puts the keyboard away before it saves, reads and opens its sheet', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    untouched();
    const tree = mount();

    press(tree, 'Finish');

    expect(dismiss).toHaveBeenCalled();
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(flushAll).mock.invocationCallOrder[0]);
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(getActiveWorkoutView).mock.invocationCallOrder[0]);
  });
});

describe('the session screen after Finish anyway, while the finish waits for the sheet to go (R55, B1)', () => {
  /** Bench half done and the overhead press not started, so Finish asks first. */
  const untouched = () =>
    viewWith([
      { name: 'Barbell bench press', sets: [done, open] },
      { name: 'Overhead press', sets: [open] },
    ]);

  /** Opens the question and returns its Finish anyway: on a phone the sheet still shows it while it fades. */
  function askAndGetFinishAnyway(tree: ReturnType<typeof create>) {
    press(tree, 'Finish');
    const finishAnyway = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Finish anyway');
    expect(finishAnyway).toHaveLength(1);
    return finishAnyway[0].props.onPress as () => void;
  }

  it('a second Finish anyway, Finish or Discard does nothing: the workout finishes once', () => {
    jest.useFakeTimers();
    untouched();
    jest.mocked(finish).mockReturnValue('finished');
    const tree = mount();
    const finishAnyway = askAndGetFinishAnyway(tree);
    expect(getActiveWorkoutView).toHaveBeenCalledTimes(1);

    act(() => finishAnyway());
    // A double tap on the fading sheet.
    act(() => finishAnyway());

    // Finish does not ask again, nor read the workout again.
    press(tree, 'Finish');
    expect(shownText(tree)).not.toContain('Overhead press has nothing logged');
    expect(getActiveWorkoutView).toHaveBeenCalledTimes(1);

    // Discard does not ask.
    press(tree, 'Discard workout');
    expect(shownText(tree)).not.toContain('Discard this workout?');

    act(() => void jest.runAllTimers());

    expect(finish).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/finish/w1');
    expect(discard).not.toHaveBeenCalled();
  });

  it('a finish that fails lets Finish be tried again', () => {
    jest.useFakeTimers();
    untouched();
    jest.mocked(finish).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount();
    const finishAnyway = askAndGetFinishAnyway(tree);
    act(() => finishAnyway());
    act(() => void jest.runAllTimers());
    expect(shownText(tree)).toContain(FAILED);
    press(tree, 'OK');

    press(tree, 'Finish');

    expect(shownText(tree)).toContain('Overhead press has nothing logged');
  });

  it('a finish refused with nothing ticked still lets the workout be discarded', () => {
    jest.useFakeTimers();
    untouched();
    jest.mocked(finish).mockReturnValue('nothing_ticked');
    const tree = mount();
    const finishAnyway = askAndGetFinishAnyway(tree);
    act(() => finishAnyway());
    act(() => void jest.runAllTimers());
    expect(shownText(tree)).toContain('Nothing is ticked yet.');

    // The sheet's own Discard workout (the page's is quiet).
    const sheetDiscard = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Discard workout' && b.props.variant === 'secondary');
    expect(sheetDiscard).toHaveLength(1);
    act(() => sheetDiscard[0].props.onPress());
    press(tree, 'Discard');

    expect(discard).toHaveBeenCalledWith('db', 'w1');
    // Back to the Train screen already there, without stacking another (R78).
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Discard workout (R78)', () => {
  it('once confirmed, discards and returns to the Train screen already there, without stacking another', () => {
    jest.mocked(router.back).mockClear();
    const tree = mount();
    press(tree, 'Discard workout');
    expect(shownText(tree)).toContain('Discard this workout?');
    press(tree, 'Discard');

    expect(discard).toHaveBeenCalledWith('db', 'w1');
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('catches an unexpected error: logs it, says the workout is still here, and stays on the session', () => {
    const boom = new Error('disk I/O error');
    jest.mocked(discard).mockImplementationOnce(() => {
      throw boom;
    });
    const tree = mount();
    press(tree, 'Discard workout');

    expect(() => press(tree, 'Discard')).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]).toContain(boom);
    expect(shownText(tree)).toEqual(expect.arrayContaining(["GymHound couldn't discard this workout. It's still here. Try again.", 'OK']));
    expect(router.dismissTo).not.toHaveBeenCalled();
    press(tree, 'OK');
    expect(shownText(tree)).not.toContain("GymHound couldn't discard this workout. It's still here. Try again.");
  });
});
