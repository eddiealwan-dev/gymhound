import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Routines from '../../app/(tabs)/routines/index';
import type { RoutineSummary } from '../db/repositories/routinesRepo';
import { deleteRoutine, duplicateRoutine, setActiveRoutine, userRoutineCount } from '../db/repositories/routinesRepo';
import { shareRoutine } from '../state/routineShare';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRoutines: RoutineSummary[];
let mockPro: boolean;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../db/repositories/routinesRepo', () => ({
  listRoutines: jest.fn(() => mockRoutines),
  setActiveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
  deleteRoutine: jest.fn(),
  duplicateRoutine: jest.fn(() => 'copy-1'),
}));
jest.mock('../state/routineShare', () => ({ shareRoutine: jest.fn(() => Promise.resolve('shared')) }));
// The saved workouts group has its own tests (savedWorkouts.test.tsx).
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({ listSavedWorkouts: () => [], startSavedWorkout: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const routine = (id: string, name: string, isActive: boolean, isPremade = true): RoutineSummary => ({ id, name, isPremade, dayCount: 3, isActive });

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Routines />);
  });
  return tree;
}

/** Every string drawn on screen right now (a closed sheet draws nothing). */
function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);

function press(tree: ReactTestRenderer, label: string, index = 0) {
  act(() => buttons(tree, label)[index].props.onPress());
}

beforeEach(() => {
  jest.useFakeTimers();
  mockRoutines = [routine('fb', 'Full body', true), routine('ppl', 'Push/pull/legs', false)];
  jest.mocked(router.push).mockClear();
  jest.mocked(setActiveRoutine).mockClear();
  jest.mocked(duplicateRoutine).mockClear();
  jest.mocked(deleteRoutine).mockClear();
  jest.mocked(bumpData).mockClear();
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(userRoutineCount).mockReturnValue(0);
  // Pro by default: the free rules (§18.21) have their own tests, which set it to false.
  mockPro = true;
});

afterEach(() => jest.useRealTimers());

describe('Routines: Set active (R80, Round 5)', () => {
  it('makes the routine the active one when no workout is running', () => {
    const tree = mount();

    press(tree, 'Set active');

    expect(setActiveRoutine).toHaveBeenCalledWith('db', 'ppl');
    expect(bumpData).toHaveBeenCalled();
    expect(shownText(tree)).not.toContain('Workout in progress');
  });

  it('while a workout runs, changes nothing and says to finish or discard it first', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('w1');
    const tree = mount();

    press(tree, 'Set active');

    expect(setActiveRoutine).not.toHaveBeenCalled();
    const shown = shownText(tree);
    expect(shown).toContain('Workout in progress');
    expect(shown).toContain('Finish or discard the workout in progress before changing routines.');
    expect(buttons(tree, 'Resume').map((b) => b.props.variant ?? 'primary')).toEqual(['primary']);
    expect(buttons(tree, 'Not now').map((b) => b.props.variant)).toEqual(['secondary']);
  });

  it('Resume opens the session once the sheet has gone; Not now just closes it', () => {
    jest.mocked(getActiveWorkoutId).mockReturnValue('w1');
    const tree = mount();

    press(tree, 'Set active');
    press(tree, 'Not now');
    act(() => void jest.advanceTimersByTime(400));
    expect(shownText(tree)).not.toContain('Workout in progress');
    expect(router.push).not.toHaveBeenCalled();

    press(tree, 'Set active');
    press(tree, 'Resume');
    expect(shownText(tree)).not.toContain('Workout in progress');
    expect(router.push).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(400));
    expect(router.push).toHaveBeenCalledWith('/session');
    expect(setActiveRoutine).not.toHaveBeenCalled();
  });
});

describe('Routines: the list (design pass)', () => {
  it('Set active is a compact secondary pill, a 44pt target with its hit slop', () => {
    const tree = mount();

    const [setActive] = buttons(tree, 'Set active');
    expect(setActive.props).toMatchObject({ variant: 'secondary', size: 'compact' });
  });

  it('the routine in use shows a tick and "Active" with no edge or fill, so it never reads as a button, and never in red', () => {
    const tree = mount();

    const mark = tree.root.findAll((n) => n.props.accessibilityLabel === 'Active' && n.props.accessible === true)[0];
    expect(mark).toBeDefined();
    expect(mark.props.accessibilityRole).toBeUndefined();
    const style = StyleSheet.flatten(mark.props.style);
    expect(style.borderWidth).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
    expect(shownText(tree)).toContain('Active');
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });

  it('"Premade" is the group heading', () => {
    const tree = mount();

    const heading = tree.root.findAll((n) => n.type === Text && n.props.children === 'Premade')[0];
    expect(heading.props.accessibilityRole).toBe('header');
    expect(StyleSheet.flatten(heading.props.style)).toMatchObject({ textTransform: 'uppercase', fontSize: 14, color: '#a39d90' });
  });
});

const LIMIT = 'Routines of your own are part of GymHound Pro.';

describe('Routines: Premade and Yours (§8.6)', () => {
  it('lists the premades under PREMADE and your own routines under YOURS, with New routine', () => {
    mockRoutines = [routine('fb', 'Full body', true), routine('mine', 'My split', false, false)];
    const tree = mount();

    const shown = shownText(tree);
    expect(shown.indexOf('Premade')).toBeLessThan(shown.indexOf('Full body'));
    expect(shown.indexOf('Full body')).toBeLessThan(shown.indexOf('Yours'));
    expect(shown.indexOf('Yours')).toBeLessThan(shown.indexOf('My split'));
    const heading = tree.root.findAll((n) => n.type === Text && n.props.children === 'Yours')[0];
    expect(heading.props.accessibilityRole).toBe('header');
    expect(buttons(tree, 'New routine')).toHaveLength(1);
    // Your own routine can be set active too.
    expect(buttons(tree, 'Set active')).toHaveLength(1);
  });

  it('tapping a routine opens its detail', () => {
    mockRoutines = [routine('fb', 'Full body', true), routine('mine', 'My split', false, false)];
    const tree = mount();

    const open = (name: string) =>
      act(() => tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === `${name}, 3 days` && typeof n.props.onPress === 'function')[0].props.onPress());
    open('Full body');
    expect(router.push).toHaveBeenCalledWith('/routines/fb');
    open('My split');
    expect(router.push).toHaveBeenCalledWith('/routines/mine');
  });
});

describe('Routines: routines of your own are Pro (§18.21, R521)', () => {
  it('free: New routine shows the Pro sheet instead, with See Pro and Not now', () => {
    mockPro = false;
    const tree = mount();

    press(tree, 'New routine');

    expect(router.push).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain(LIMIT);
    expect(buttons(tree, 'See Pro').map((b) => b.props.variant ?? 'primary')).toEqual(['primary']);
    expect(buttons(tree, 'Not now').map((b) => b.props.variant)).toEqual(['quiet']);

    press(tree, 'Not now');
    expect(shownText(tree)).not.toContain(LIMIT);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('reads Pro when tapped, so the trial starting or Pro coming on counts at once', () => {
    mockPro = false;
    const tree = mount();
    press(tree, 'New routine');
    press(tree, 'Not now');

    mockPro = true;
    press(tree, 'New routine');
    expect(router.push).toHaveBeenCalledWith('/routines/edit/new');
  });

  it('with Pro (or the trial), New routine opens the editor however many you have', () => {
    jest.mocked(userRoutineCount).mockReturnValue(3);
    const tree = mount();

    press(tree, 'New routine');

    expect(router.push).toHaveBeenCalledWith('/routines/edit/new');
    expect(shownText(tree)).not.toContain(LIMIT);
  });

  it('a double tap on See Pro opens one paywall', () => {
    mockPro = false;
    const tree = mount();

    press(tree, 'New routine');
    const [seePro] = buttons(tree, 'See Pro');
    act(() => {
      seePro.props.onPress();
      seePro.props.onPress();
    });
    act(() => void jest.advanceTimersByTime(400));
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('See Pro closes the sheet and, once it has gone, opens the paywall (R138)', () => {
    mockPro = false;
    const tree = mount();

    press(tree, 'New routine');
    press(tree, 'See Pro');
    expect(shownText(tree)).not.toContain(LIMIT);
    expect(router.push).not.toHaveBeenCalled();
    act(() => void jest.advanceTimersByTime(400));
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/paywall');
  });
});

describe('Routines: free programs and Pro programs (§18.21, R520, R525)', () => {
  it("free: a Pro program's row says Pro where Set active would be, and tapping it explains instead of setting it", () => {
    mockPro = false;
    const tree = mount();
    expect(buttons(tree, 'Pro').length).toBeGreaterThan(0);
    press(tree, 'Pro');
    expect(setActiveRoutine).not.toHaveBeenCalled();
    expect(shownText(tree).some((t) => /is part of GymHound Pro\. Free includes Beginner full body, 5×5, Dumbbell full body and Mobility\./.test(t))).toBe(true);
  });
});

describe('Routines: first run and empty groups (R401, R403)', () => {
  const PICK_ONE = 'Set one active and Train lines up its next workout.';
  const YOURS_EMPTY = 'Routines you make or duplicate show here.';

  it('says what Set active does while no routine is in use, under the title', () => {
    mockRoutines = [routine('fb', 'Full body', false), routine('ppl', 'Push/pull/legs', false)];
    const t = shownText(mount());
    expect(t.slice(t.indexOf('Routines'), t.indexOf('Routines') + 2)).toEqual(['Routines', PICK_ONE]);
  });

  it('drops that line once a routine is in use', () => {
    expect(shownText(mount())).not.toContain(PICK_ONE);
  });

  it('says how Yours fills while you have none, over New routine', () => {
    const t = shownText(mount());
    const yours = t.indexOf('Yours');
    expect(t.slice(yours, yours + 3)).toEqual(['Yours', YOURS_EMPTY, 'New routine']);
  });

  it('shows your routines instead of the line once you have one', () => {
    mockRoutines = [routine('fb', 'Full body', true), routine('mine', 'My split', false, false)];
    const t = shownText(mount());
    expect(t).not.toContain(YOURS_EMPTY);
    expect(t).toContain('My split');
  });
});

describe('Routines: ⋯ on each row (Round 9, R542)', () => {
  /** Opens the ⋯ sheet of the routine named `name`. */
  const options = (tree: ReactTestRenderer, name: string) =>
    act(() => tree.root.findByProps({ accessibilityLabel: `Options for ${name}` }).props.onPress());
  /** Taps a button in the open sheet, then lets the sheet go so its action runs. */
  const choose = (tree: ReactTestRenderer, label: string) => {
    press(tree, label, buttons(tree, label).length - 1);
    act(() => jest.runAllTimers());
  };

  it('every routine has one, read as "Options for {name}"', () => {
    mockRoutines = [routine('fb', 'Full body', true), routine('mine', 'Mine', false, false)];
    const tree = mount();
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Options for Full body' }).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Options for Mine' }).length).toBeGreaterThan(0);
  });

  it("a program's sheet: Set active, Duplicate, Share routine; no Edit or Delete", () => {
    const tree = mount();
    options(tree, 'Push/pull/legs');
    const shown = shownText(tree);
    expect(shown).toEqual(expect.arrayContaining(['Push/pull/legs', 'Duplicate', 'Share routine', 'Cancel']));
    expect(shown).not.toContain('Edit');
    expect(shown).not.toContain('Delete routine');
    choose(tree, 'Set active');
    expect(setActiveRoutine).toHaveBeenCalledWith('db', 'ppl');
  });

  it('the routine in use has no Set active in its sheet', () => {
    const tree = mount();
    options(tree, 'Full body');
    expect(buttons(tree, 'Set active')).toHaveLength(1); // the other row's pill only
  });

  it('your own: Edit opens the editor, Duplicate opens the copy, Share opens the share sheet', () => {
    mockRoutines = [routine('mine', 'Mine', false, false)];
    const tree = mount();
    options(tree, 'Mine');
    choose(tree, 'Edit');
    expect(router.push).toHaveBeenLastCalledWith('/routines/edit/mine');
    options(tree, 'Mine');
    choose(tree, 'Duplicate');
    expect(duplicateRoutine).toHaveBeenCalledWith('db', 'mine', expect.any(Number));
    expect(router.push).toHaveBeenLastCalledWith('/routines/copy-1');
    options(tree, 'Mine');
    choose(tree, 'Share routine');
    expect(shareRoutine).toHaveBeenCalledWith('db', 'mine');
  });

  it('Delete routine asks first; Keep keeps it, Delete deletes it', () => {
    mockRoutines = [routine('mine', 'Mine', false, false)];
    const tree = mount();
    options(tree, 'Mine');
    choose(tree, 'Delete routine');
    expect(shownText(tree)).toContain('Delete this routine?');
    press(tree, 'Keep');
    expect(deleteRoutine).not.toHaveBeenCalled();
    options(tree, 'Mine');
    choose(tree, 'Delete routine');
    press(tree, 'Delete');
    expect(deleteRoutine).toHaveBeenCalledWith('db', 'mine');
    expect(bumpData).toHaveBeenCalled();
  });

  it('free: a Pro program shows See Pro in place of Set active, and Duplicate explains Pro', () => {
    mockPro = false;
    const tree = mount();
    options(tree, 'Push/pull/legs');
    expect(buttons(tree, 'See Pro').length).toBeGreaterThan(0);
    choose(tree, 'Duplicate');
    expect(duplicateRoutine).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Routines of your own are part of GymHound Pro.');
  });
});
