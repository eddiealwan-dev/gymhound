import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Routines from '../../app/(tabs)/routines/index';
import type { RoutineSummary } from '../db/repositories/routinesRepo';
import { setActiveRoutine } from '../db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../db/repositories/workoutsRepo';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRoutines: RoutineSummary[];

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRoutines, bumpData: jest.fn() }));
jest.mock('../db/repositories/routinesRepo', () => ({ listRoutines: jest.fn(), setActiveRoutine: jest.fn() }));
jest.mock('../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const routine = (id: string, name: string, isActive: boolean): RoutineSummary => ({ id, name, isPremade: true, dayCount: 3, isActive });

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
  jest.mocked(bumpData).mockClear();
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
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
