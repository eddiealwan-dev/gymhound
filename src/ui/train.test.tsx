import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Train from '../../app/(tabs)/index';
import type { UpNext, UpNextExercise } from '../db/repositories/routinesRepo';
import { ActiveWorkoutExistsError } from '../db/repositories/workoutsRepo';
import { startEmpty, startFromDay } from '../state/sessionActions';
import { Button } from './Button';
import { Body } from './Text';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 10, 9, 0).getTime();

type Read = {
  unit: 'kg' | 'lb';
  active: { name: string; startedAt: number; setsDone: number } | null;
  upNext: UpNext | null;
  trainingDates: string[];
  weekVolume: number;
};

let mockRead: Read;

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-GB' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead }));
jest.mock('../state/sessionActions', () => ({ startEmpty: jest.fn(), startFromDay: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../state/useNow', () => ({ useNow: () => new Date(2026, 9, 10, 9, 0).getTime() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../db/repositories/routinesRepo', () => ({ getUpNext: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutsRepo', () => ({
  ActiveWorkoutExistsError: class ActiveWorkoutExistsError extends Error {},
}));
jest.mock('../db/repositories/workoutViewsRepo', () => ({
  getActiveWorkoutView: jest.fn(),
  getTrainingDates: jest.fn(),
  getVolumeSetsSince: jest.fn(),
}));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const exercise = (id: string, name: string, loggingType: UpNextExercise['loggingType'], setCount: number, repMin: number, repMax: number): UpNextExercise => ({
  routineExerciseId: id,
  exerciseId: id,
  name,
  loggingType,
  setCount,
  repMin,
  repMax,
  nextWeight: null,
  nextWeightUnit: null,
});

/** The Upper/lower routine's Upper A day, never done, with no weights yet. */
const upperA = (): UpNext => ({
  routineId: 'ul',
  routineName: 'Upper/lower',
  dayId: 'ul:upper-a',
  dayName: 'Upper A',
  lastTime: null,
  exercises: [
    exercise('re-bench', 'Barbell bench press', 'weighted', 4, 5, 8),
    exercise('re-row', 'Barbell row', 'weighted', 4, 6, 10),
    exercise('re-plank', 'Plank', 'timed', 3, 30, 60),
  ],
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Train />);
  });
  return tree;
}

const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join(''));

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

function press(tree: ReactTestRenderer, label: string) {
  const found = buttons(tree, label);
  expect(found).toHaveLength(1);
  act(() => found[0].props.onPress());
}

const filled = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Button)
    .filter((b) => (b.props.variant ?? 'primary') === 'primary')
    .map((b) => b.props.label);

beforeEach(() => {
  mockRead = { unit: 'kg', active: null, upNext: upperA(), trainingDates: [], weekVolume: 0 };
  jest.mocked(router.push).mockClear();
  jest.mocked(startEmpty).mockReset();
  jest.mocked(startFromDay).mockReset();
});

describe('Train leads with today\'s workout (spec 18.6)', () => {
  it('Up next comes right after the date and before the stat cards', () => {
    const all = lines(mount());

    expect(all.indexOf('UP NEXT')).toBeGreaterThan(all.indexOf('SAT 10 OCT'));
    expect(all.indexOf('SAT 10 OCT')).toBeGreaterThan(-1);
    expect(all.indexOf('UP NEXT')).toBeLessThan(all.indexOf('Streak'));
  });

  it('Start Upper A is the filled button under the title', () => {
    const tree = mount();
    const all = lines(tree);

    expect(buttons(tree, 'Start Upper A')[0].props.variant ?? 'primary').toBe('primary');
    expect(all.indexOf('Upper/lower · Upper A')).toBeGreaterThan(all.indexOf('UP NEXT'));
    expect(all.indexOf('Start Upper A')).toBeGreaterThan(all.indexOf('Upper/lower · Upper A'));
    expect(all.indexOf('Start Upper A')).toBeLessThan(all.indexOf('Barbell bench press'));

    press(tree, 'Start Upper A');

    expect(startFromDay).toHaveBeenCalledWith('db', 'ul:upper-a');
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('one filled button in each state', () => {
    expect(filled(mount())).toEqual(['Start Upper A']);

    mockRead = { ...mockRead, upNext: null };
    expect(filled(mount())).toEqual(['Choose a routine']);

    mockRead = { ...mockRead, upNext: upperA(), active: { name: 'Upper A', startedAt: NOW - 27 * 60_000, setsDone: 5 } };
    expect(filled(mount())).toEqual(['Resume']);
  });

  it('first run: says pick weights once, and no row says pick a weight', () => {
    const all = lines(mount());

    expect(all).toContain('First time on this day. Pick weights as you go.');
    expect(all.join('\n').toLowerCase()).not.toContain('pick a weight');
    expect(all).toContain('4×5–8');
    expect(all).toContain('4×6–10');
    expect(all).toContain('3×30–60s');
  });

  it('a row with no weight shows — once another has one', () => {
    const upNext = upperA();
    upNext.exercises[0] = { ...upNext.exercises[0], nextWeight: 60, nextWeightUnit: 'kg' };
    mockRead = { ...mockRead, upNext };
    const all = lines(mount());

    expect(all).toContain('4×5–8 · 60 kg');
    expect(all).toContain('4×6–10 · —');
    expect(all).toContain('3×30–60s');
    expect(all).toContain('First time on this day.');
  });

  it('Start empty workout is outlined and after the stat cards', () => {
    const tree = mount();
    const all = lines(tree);

    expect(buttons(tree, 'Start empty workout')).toHaveLength(1);
    expect(buttons(tree, 'Start empty workout')[0].props.variant).toBe('secondary');
    expect(all.indexOf('Start empty workout')).toBeGreaterThan(all.indexOf('This week'));
    for (const gone of ['Start empty', 'Start this', 'Routines']) expect(all).not.toContain(gone);

    press(tree, 'Start empty workout');

    expect(startEmpty).toHaveBeenCalledWith('db');
    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('Change routine opens Routines', () => {
    const tree = mount();
    // The outermost match is the Pressable itself; the host view inside it carries the same label.
    const link = tree.root.findAll((n) => n.props.accessibilityLabel === 'Change routine' && typeof n.props.onPress === 'function');

    expect(link.length).toBeGreaterThan(0);
    expect(link[0].props.accessibilityRole).toBe('button');
    expect(lines(tree)).toContain('Change routine');

    act(() => link[0].props.onPress());

    expect(router.push).toHaveBeenCalledWith('/routines');
  });

  it('no routine: one card, Choose a routine filled, Start empty workout outlined', () => {
    mockRead = { ...mockRead, upNext: null };
    const tree = mount();
    const all = lines(tree);

    expect(all).toContain('No routine yet. Pick one and Train will line up your next workout.');
    expect(all).not.toContain("Pick a routine to see what's up next.");
    expect(all).not.toContain('Change routine');
    expect(all).not.toContain('UP NEXT');
    expect(buttons(tree, 'Start empty workout')).toHaveLength(1);
    expect(buttons(tree, 'Start empty workout')[0].props.variant).toBe('secondary');
    expect(buttons(tree, 'Choose a routine')[0].props.variant ?? 'primary').toBe('primary');

    press(tree, 'Choose a routine');

    expect(router.push).toHaveBeenCalledWith('/routines');
  });

  it('in progress: IN PROGRESS, Resume is the only filled button', () => {
    mockRead = { ...mockRead, active: { name: 'Upper A', startedAt: NOW - 27 * 60_000, setsDone: 5 } };
    const tree = mount();
    const all = lines(tree);

    expect(all).toContain('IN PROGRESS');
    expect(all).toContain('27:00 · 5 sets done');
    for (const gone of ['Start empty workout', 'UP NEXT', 'Start Upper A']) expect(all).not.toContain(gone);
    expect(filled(tree)).toEqual(['Resume']);

    press(tree, 'Resume');

    expect(router.push).toHaveBeenCalledWith('/session');
  });

  it('in progress: a quiet Change routine at the foot of the Resume card opens Routines (Round 4, A4)', () => {
    mockRead = { ...mockRead, active: { name: 'Upper A', startedAt: NOW - 27 * 60_000, setsDone: 5 } };
    const tree = mount();
    const all = lines(tree);
    const link = tree.root.findAll((n) => n.props.accessibilityLabel === 'Change routine' && typeof n.props.onPress === 'function');

    expect(link.length).toBeGreaterThan(0);
    expect(link[0].props.accessibilityRole).toBe('button');
    expect(all).toContain('Change routine');
    // Under Resume and before the stat cards: it belongs to the card.
    expect(all.indexOf('Change routine')).toBeGreaterThan(all.indexOf('27:00 · 5 sets done'));
    expect(all.indexOf('Change routine')).toBeLessThan(all.indexOf('Streak'));
    expect(shownText(tree).indexOf('Change routine')).toBeGreaterThan(shownText(tree).indexOf('Resume'));
    expect(filled(tree)).toEqual(['Resume']);

    act(() => link[0].props.onPress());

    expect(router.push).toHaveBeenCalledWith('/routines');
  });

  it('a one-letter day reads Start 5×5 A', () => {
    mockRead = { ...mockRead, upNext: { ...upperA(), routineName: '5×5', dayName: 'A' } };
    const tree = mount();

    expect(buttons(tree, 'Start 5×5 A')).toHaveLength(1);
    expect(lines(tree)).toContain('5×5 · A');
  });

  it('the guard still blocks a second workout', () => {
    jest.useFakeTimers();
    try {
      jest.mocked(startFromDay).mockImplementation(() => {
        throw new ActiveWorkoutExistsError();
      });
      const tree = mount();

      press(tree, 'Start Upper A');

      expect(shownText(tree)).toContain('Finish or discard the workout in progress first.');
      expect(router.push).not.toHaveBeenCalled();

      press(tree, 'Resume');
      // The session opens only once the sheet has gone.
      expect(router.push).not.toHaveBeenCalled();
      act(() => {
        jest.runAllTimers();
      });

      expect(router.push).toHaveBeenCalledWith('/session');
      expect(shownText(tree)).not.toContain('Finish or discard the workout in progress first.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a long row wraps instead of squeezing the name', () => {
    const tree = mount();
    const name = tree.root.findAllByType(Body).find((b) => b.props.children === 'Barbell bench press')!;
    const right = tree.root.findAllByType(Body).find((b) => b.props.children === '4×5–8')!;
    const row = name.parent!;

    expect(StyleSheet.flatten(row.props.style)).toEqual(expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }));
    expect(right.parent).toBe(row);
    // flex: 1 would give the name a flex basis of 0, so the row would never wrap and the name would be squeezed.
    const nameStyle = StyleSheet.flatten(name.props.style);
    expect(nameStyle).toEqual(expect.objectContaining({ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 }));
    expect(nameStyle.flex).toBeUndefined();
    const rightStyle = StyleSheet.flatten(right.props.style);
    expect(rightStyle.flex).toBeUndefined();
    expect(rightStyle.flexShrink).toBeUndefined();
    expect(rightStyle.flexGrow).toBeUndefined();
  });
});
