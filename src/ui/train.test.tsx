import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Train from '../../app/(tabs)/index';
import type { UpNext, UpNextExercise } from '../db/repositories/routinesRepo';
import { ActiveWorkoutExistsError } from '../db/repositories/workoutsRepo';
import type { Gear } from '../domain/plates';
import { setSetting } from '../db/repositories/settingsRepo';
import { bumpData } from '../state/dataVersion';
import { startEmpty, startFromDay } from '../state/sessionActions';
import { Button } from './Button';
import { Body } from './Text';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 10, 9, 0).getTime();

type Read = {
  unit: 'kg' | 'lb';
  distanceUnit?: 'km' | 'mi';
  unitsHint?: boolean;
  gear: Gear;
  active: { name: string; startedAt: number; setsDone: number } | null;
  upNext: UpNext | null;
  trainingDates: string[];
  weekVolume: number;
};

let mockRead: Read;

// The full access trial's lines have their own tests (trialLines.test.tsx); here they draw nothing.
jest.mock('./pro/TrialLines', () => ({
  TrialSettingsLine: () => null,
  TrialChip: () => null,
  TrainTrialNotice: () => null,
  TrialStartedNotice: () => null,
  TrialPitchLine: () => null,
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-GB' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useFocusedDbQuery: () => mockRead, bumpData: jest.fn() }));
jest.mock('../state/sessionActions', () => ({ startEmpty: jest.fn(), startFromDay: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../state/useNow', () => ({ useNow: () => new Date(2026, 9, 10, 9, 0).getTime() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../db/repositories/routinesRepo', () => ({ getUpNext: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
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

const exercise = (
  id: string,
  name: string,
  loggingType: UpNextExercise['loggingType'],
  equipment: UpNextExercise['equipment'],
  setCount: number,
  repMin: number,
  repMax: number,
): UpNextExercise => ({
  routineExerciseId: id,
  exerciseId: id,
  name,
  loggingType,
  equipment,
  setCount,
  repMin,
  repMax,
  increment: 5,
  incrementUnit: 'lb',
  nextWeight: null,
  nextWeightUnit: null,
  lastOutcome: null,
  lastMark: null,
  lastWorkingWeight: null,
  lastWorkingUnit: null,
  lastNextWeight: null,
  lastNextUnit: null,
});

/** The default bars and plate pairs in Settings. */
const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };
const KG_GEAR: Gear = { bar: 20, plates: { '25': 4, '20': 1, '15': 1, '10': 1, '5': 1, '2.5': 1, '1.25': 1 } };

/** Last time's working and next weights, both in `unit`. */
const lastWeights = (working: number, next: number, unit: 'lb' | 'kg') => ({
  lastWorkingWeight: working,
  lastWorkingUnit: unit,
  lastNextWeight: next,
  lastNextUnit: unit,
});

/** The Upper/lower routine's Upper A day, never done, with no weights yet. */
const upperA = (): UpNext => ({
  routineId: 'ul',
  routineName: 'Upper/lower',
  dayId: 'ul:upper-a',
  dayName: 'Upper A',
  lastTime: null,
  exercises: [
    exercise('re-bench', 'Barbell bench press', 'weighted', 'barbell', 4, 5, 8),
    exercise('re-row', 'Barbell row', 'weighted', 'barbell', 4, 6, 10),
    exercise('re-plank', 'Plank', 'timed', 'bodyweight', 3, 30, 60),
  ],
});

/** Upper A run once, on WED 7 OCT: the bench was raised from 135 to 140 lb, the row held at 135 lb on a flagged Rough sleep. */
const upperARun = (): UpNext => {
  const upNext = upperA();
  const [bench, row, plank] = upNext.exercises;
  const lb = 'lb' as const;
  return {
    ...upNext,
    lastTime: { localDate: '2026-10-07' },
    exercises: [
      { ...bench, nextWeight: 140, nextWeightUnit: lb, lastOutcome: 'raised', ...lastWeights(135, 140, lb) },
      { ...row, nextWeight: 135, nextWeightUnit: lb, lastOutcome: 'held_marked', lastMark: 'rough_sleep', ...lastWeights(135, 135, lb) },
      { ...plank, lastOutcome: 'no_rule' },
    ],
  };
};

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
  mockRead = { unit: 'kg', gear: KG_GEAR, active: null, upNext: upperA(), trainingDates: [], weekVolume: 0 };
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

  it('the date stays whole at any text size: one line that shrinks to fit, with no fixed line height (R79, Round 5)', () => {
    const tree = mount();
    const date = tree.root.findAll((n) => n.type === Text && n.props.children === 'SAT 10 OCT');
    expect(date).toHaveLength(1);
    const { numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier, style } = date[0].props;

    expect({ numberOfLines, adjustsFontSizeToFit, minimumFontScale, maxFontSizeMultiplier }).toEqual({
      numberOfLines: 1,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.3,
      maxFontSizeMultiplier: undefined,
    });
    // iOS shrinks only the font to fit, never a fixed line height, which grows with the phone's text size.
    const flat = StyleSheet.flatten(style);
    expect(flat.fontSize).toBe(56);
    expect(flat.lineHeight).toBeUndefined();

    // The greeting above it wraps instead.
    const greeting = tree.root.findAll((n) => n.type === Text && n.props.children === 'GOOD MORNING');
    expect(greeting).toHaveLength(1);
    expect(greeting[0].props.numberOfLines).toBeUndefined();
  });

  it('the stat numbers shrink to fit on one line with no fixed line height, as the date does (R79, Round 5 review)', () => {
    const tree = mount();
    const numbers = tree.root.findAll((n) => n.type === Text && n.props.adjustsFontSizeToFit === true && n.props.children === '0');
    // Streak and This week.
    expect(numbers).toHaveLength(2);
    for (const number of numbers) {
      const { numberOfLines, minimumFontScale, style } = number.props;
      expect({ numberOfLines, minimumFontScale }).toEqual({ numberOfLines: 1, minimumFontScale: 0.5 });
      // A fixed line height grows with the phone's text size and never shrinks with the font on iOS.
      expect(StyleSheet.flatten(style).lineHeight).toBeUndefined();
      expect(StyleSheet.flatten(style).fontSize).toBe(44);
    }
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

  it("each row ends with last time's outcome, and the line under the title has no mark (spec 18.7, R69)", () => {
    mockRead = { ...mockRead, unit: 'lb', gear: LB_GEAR, upNext: upperARun() };
    const all = lines(mount());

    expect(all).toContain('Last time: WED 7 OCT');
    expect(all).toContain('4×5–8 · 140 lb · ↑ 5 lb');
    expect(all).toContain('4×6–10 · 135 lb · held · Rough sleep');
    // A plank has no rule: nothing to say about last time.
    expect(all).toContain('3×30–60s');
  });

  it('a kg user sees the loads and the raise in kg: a 135 lb barbell plan reads 60 kg (R63)', () => {
    const upNext = upperARun();
    // Raised from 135 to 140 lb, which a kg user sees as 60 and 62.5 kg: the rise is the difference shown (R77).
    upNext.exercises[0] = { ...upNext.exercises[0], nextWeight: 140, ...lastWeights(135, 140, 'lb') };
    mockRead = { ...mockRead, unit: 'kg', gear: KG_GEAR, upNext };
    const all = lines(mount());

    expect(all).toContain('4×5–8 · 62.5 kg · ↑ 2.5 kg');
    expect(all).toContain('4×6–10 · 60 kg · held · Rough sleep');
  });

  it('a raise the kg loads do not show reads no rise: 130 and 135 lb both read 60 kg (R76, R77)', () => {
    const upNext = upperARun();
    upNext.exercises[0] = { ...upNext.exercises[0], nextWeight: 135, ...lastWeights(130, 135, 'lb') };
    mockRead = { ...mockRead, unit: 'kg', gear: KG_GEAR, upNext };

    expect(lines(mount())).toContain('4×5–8 · 60 kg');
  });

  it('a raise shows the actual rise: 135 to 145 lb without 2.5 lb plates reads ↑ 10 lb (R73)', () => {
    const upNext = upperARun();
    upNext.exercises[0] = { ...upNext.exercises[0], nextWeight: 145, ...lastWeights(135, 145, 'lb') };
    mockRead = { ...mockRead, unit: 'lb', gear: LB_GEAR, upNext };

    expect(lines(mount())).toContain('4×5–8 · 145 lb · ↑ 10 lb');
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
    // A 44pt target.
    expect(StyleSheet.flatten(link[0].props.style({ pressed: false }))).toMatchObject({ minHeight: 44 });
    // It reaches 12pt into the card's bottom padding, so its words sit 16pt from the edge (design pass).
    expect(StyleSheet.flatten(link[0].props.style({ pressed: false }))).toMatchObject({ marginBottom: -12 });

    act(() => link[0].props.onPress());

    expect(router.push).toHaveBeenCalledWith('/routines');
  });

  it('no routine: Start empty workout starts one and opens the session', () => {
    mockRead = { ...mockRead, upNext: null };
    const tree = mount();

    press(tree, 'Start empty workout');

    expect(startEmpty).toHaveBeenCalledTimes(1);
    expect(startEmpty).toHaveBeenCalledWith('db');
    expect(router.push).toHaveBeenCalledWith('/session');
    expect(jest.mocked(startEmpty).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(router.push).mock.invocationCallOrder[0]);
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

  it('in progress: a quiet Change routine at the foot of the Resume card (Round 4, A4)', () => {
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
  });

  describe('in progress: Change routine says to finish or discard first (R80, Round 5)', () => {
    const changeRoutine = (tree: ReactTestRenderer) =>
      tree.root.findAll((n) => n.props.accessibilityLabel === 'Change routine' && typeof n.props.onPress === 'function')[0];

    /** Train with a workout running, its Change routine tapped. */
    function tapped(): ReactTestRenderer {
      jest.useFakeTimers();
      mockRead = { ...mockRead, active: { name: 'Upper A', startedAt: NOW - 27 * 60_000, setsDone: 5 } };
      const tree = mount();
      act(() => changeRoutine(tree).props.onPress());
      return tree;
    }

    afterEach(() => jest.useRealTimers());

    it('opens "Workout in progress" instead of Routines, with Resume filled and Not now', () => {
      const tree = tapped();

      expect(router.push).not.toHaveBeenCalled();
      const shown = shownText(tree);
      expect(shown).toContain('Workout in progress');
      expect(shown).toContain('Finish or discard the workout in progress before changing routines.');
      const sheet = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Resume' || b.props.label === 'Not now');
      expect(sheet.map((b) => [b.props.label, b.props.variant ?? 'primary'])).toEqual([
        ['Resume', 'primary'],
        ['Resume', 'primary'],
        ['Not now', 'secondary'],
      ]);
    });

    it("Resume opens the session once the sheet has gone", () => {
      const tree = tapped();
      const sheetResume = tree.root.findAllByType(Button).filter((b) => b.props.label === 'Resume')[1];

      act(() => sheetResume.props.onPress());

      expect(shownText(tree)).not.toContain('Workout in progress');
      expect(router.push).not.toHaveBeenCalled();
      act(() => void jest.advanceTimersByTime(400));
      expect(router.push).toHaveBeenCalledWith('/session');
    });

    it('Not now closes it and goes nowhere', () => {
      const tree = tapped();

      press(tree, 'Not now');
      act(() => void jest.advanceTimersByTime(400));

      expect(shownText(tree)).not.toContain('Workout in progress');
      expect(router.push).not.toHaveBeenCalled();
    });

    it("Up next's Change routine still opens Routines", () => {
      const tree = mount();

      act(() => changeRoutine(tree).props.onPress());

      expect(router.push).toHaveBeenCalledWith('/routines');
      expect(shownText(tree)).not.toContain('Workout in progress');
    });
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

  it("any other failure says Couldn't start. Try again., logs it and opens nothing, instead of throwing from the button", () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(startFromDay).mockImplementationOnce(() => {
      throw new Error('disk I/O error');
    });
    const tree = mount();

    expect(() => press(tree, 'Start Upper A')).not.toThrow();

    expect(shownText(tree)).toContain("Couldn't start. Try again.");
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'disk I/O error' }));
    expect(router.push).not.toHaveBeenCalled();
    press(tree, 'OK');
    expect(shownText(tree)).not.toContain("Couldn't start. Try again.");
    warn.mockRestore();
  });

  it('a long row wraps instead of squeezing the name', () => {
    const tree = mount();
    const name = tree.root.findAllByType(Body).find((b) => b.props.children === 'Barbell bench press')!;
    const right = tree.root.findAllByType(Body).find((b) => b.props.children === '4×5–8')!;
    const row = name.parent!;

    // The 14pt scheme sits on the 16pt name's baseline (design pass).
    expect(StyleSheet.flatten(row.props.style)).toEqual(
      expect.objectContaining({ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8 }),
    );
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

describe('Train: the first-run units line (R407)', () => {
  const KG_LINE = "Weights are in kg and distances in km, from your phone's region. Change them in Settings.";
  const dismiss = (tree: ReactTestRenderer) => tree.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss tip' && typeof n.props.onPress === 'function')[0];

  beforeEach(() => {
    jest.mocked(setSetting).mockClear();
    jest.mocked(bumpData).mockClear();
  });

  it('says which units the phone chose, under the first card and over the stats, with a way to dismiss it', () => {
    mockRead = { ...mockRead, upNext: null, unitsHint: true, distanceUnit: 'km' };
    const tree = mount();
    const all = lines(tree);
    expect(all).toContain(KG_LINE);
    expect(all.indexOf('No routine yet. Pick one and Train will line up your next workout.')).toBeLessThan(all.indexOf(KG_LINE));
    expect(all.indexOf(KG_LINE)).toBeLessThan(all.indexOf('Streak'));
    expect(dismiss(tree)).toBeDefined();
  });

  it('names lb and mi for a US phone', () => {
    mockRead = { ...mockRead, unit: 'lb', distanceUnit: 'mi', unitsHint: true };
    expect(lines(mount())).toContain("Weights are in lb and distances in mi, from your phone's region. Change them in Settings.");
  });

  it('dismissing it stores that for good and reads again', () => {
    mockRead = { ...mockRead, unitsHint: true, distanceUnit: 'km' };
    const tree = mount();
    act(() => dismiss(tree).props.onPress());
    expect(setSetting).toHaveBeenCalledWith('db', 'hintUnitsDismissed', true);
    expect(bumpData).toHaveBeenCalledTimes(1);
  });

  it('is not shown once dismissed or after the first workout (the read says no), nor while a workout runs', () => {
    mockRead = { ...mockRead, unitsHint: false, distanceUnit: 'km' };
    expect(lines(mount())).not.toContain(KG_LINE);
    mockRead = { ...mockRead, unitsHint: true, active: { name: 'Upper A', startedAt: NOW - 60_000, setsDone: 0 } };
    expect(lines(mount())).not.toContain(KG_LINE);
  });
});
