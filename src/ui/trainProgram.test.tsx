import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Train from '../../app/(tabs)/index';
import { startEarlyDeload, startProgramOver } from '../db/repositories/programRunRepo';
import { dismissDeloadOffer, type UpNext, type UpNextExercise, type UpNextProgram } from '../db/repositories/routinesRepo';
import type { Gear } from '../domain/plates';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';
import { ConfirmSheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Read = {
  unit: 'kg' | 'lb';
  gear: Gear;
  active: null;
  upNext: UpNext | null;
  trainingDates: string[];
  weekVolume: number;
};
let mockRead: Read;

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ useIsPro: () => false }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => jest.fn() }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-GB' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../state/dataVersion', () => ({ useFocusedDbQuery: () => mockRead, bumpData: jest.fn() }));
jest.mock('../state/sessionActions', () => ({ startEmpty: jest.fn(), startFromDay: jest.fn(), restPlus15: jest.fn() }));
jest.mock('../state/useNow', () => ({ useNow: () => new Date(2026, 9, 10, 9, 0).getTime() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('../db/repositories/routinesRepo', () => ({ getUpNext: jest.fn(), dismissDeloadOffer: jest.fn() }));
jest.mock('../db/repositories/programRunRepo', () => ({ startEarlyDeload: jest.fn(), startProgramOver: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn(), setSetting: jest.fn() }));
jest.mock('../db/repositories/workoutsRepo', () => ({ ActiveWorkoutExistsError: class ActiveWorkoutExistsError extends Error {} }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getActiveWorkoutView: jest.fn(), getTrainingDates: jest.fn(), getVolumeSetsSince: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const LB_GEAR: Gear = { bar: 45, plates: { '45': 4, '35': 1, '25': 1, '10': 2, '5': 1, '2.5': 1 } };

const exercise = (id: string, name: string, over: Partial<UpNextExercise> = {}): UpNextExercise => ({
  routineExerciseId: id,
  exerciseId: id,
  name,
  loggingType: 'weighted',
  equipment: 'barbell',
  setCount: 3,
  repMin: 5,
  repMax: 8,
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
  ...over,
});

const PROGRAM: UpNextProgram = {
  week: 3,
  weeks: 12,
  done: false,
  weekInfo: null,
  offerDeload: false,
  offerKey: 'program-advanced-upper-lower-dup:1:1',
  afterThisProgram: 'Run successive 6-week blocks, retesting a heavy triple in the first heavy week of each block [22]. More words.',
};

const upNext = (program: Partial<UpNextProgram> = {}, exercises: UpNextExercise[] = [exercise('re-bench', 'Barbell bench press', { nextWeight: 135, nextWeightUnit: 'lb' })]): UpNext => ({
  routineId: 'program-barbell-foundations',
  routineName: 'Barbell Foundations',
  routineIsPremade: true,
  dayId: 'program-barbell-foundations:a',
  dayName: 'A',
  lastTime: { localDate: '2026-10-07' },
  exercises,
  program: { ...PROGRAM, ...program },
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Train />);
  });
  return tree;
}

const lines = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((n) => ([] as unknown[]).concat(n.props.children).join('').replace(/​/g, ''));
const button = (tree: ReactTestRenderer, label: string) => {
  const found = tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  expect(found).toHaveLength(1);
  return found[0];
};

beforeEach(() => {
  mockRead = { unit: 'lb', gear: LB_GEAR, active: null, upNext: upNext(), trainingDates: [], weekVolume: 0 };
  jest.mocked(startEarlyDeload).mockClear();
  jest.mocked(startProgramOver).mockClear();
  jest.mocked(dismissDeloadOffer).mockClear();
  jest.mocked(bumpData).mockClear();
});

describe('Up next for a program (§18.29)', () => {
  it('leads the subtitle with the week (R616)', () => {
    expect(lines(mount())).toContain('Week 3 of 12 · Last time: WED 7 OCT');
  });

  it("shows the week's line under it (R617)", () => {
    mockRead.upNext = upNext({ week: 10, weekInfo: { week: 10, kind: 'deload', halfSets: true, holds: true, runShare: 1, note: '' } });
    const shown = lines(mount());
    expect(shown).toContain('Week 10 of 12 · Last time: WED 7 OCT');
    expect(shown).toContain('Deload week: half the sets, same weight. Nothing goes up or counts as a miss.');
  });

  it("hides nothing of the active program's day (R634)", () => {
    mockRead.upNext = upNext({}, [
      exercise('re-bench', 'Barbell bench press', { nextWeight: 135, nextWeightUnit: 'lb' }),
      exercise('re-yoke', 'Yoke carry', { loggingType: 'weighted_distance', equipment: 'other', setCount: 4, repMin: 50, repMax: 50, schemeExtra: { distanceUnit: 'ft' } }),
      exercise('re-metcon', 'AMRAP 10: goblet squat, push-up, run', { loggingType: 'rounds', equipment: 'other', setCount: 1, repMin: 4, repMax: 7, schemeExtra: { metcon: { format: 'AMRAP', workMinutes: 10 } } }),
      exercise('re-run', 'Long run', { loggingType: 'timed', equipment: 'bodyweight', setCount: 1, repMin: 4200, repMax: 4200, schemeExtra: { clock: true } }),
    ]);
    const shown = lines(mount());
    expect(shown).toContain('Barbell bench press');
    expect(shown).toContain('Yoke carry');
    expect(shown).toContain('4×50 ft · —');
    expect(shown).toContain('AMRAP 10 min');
    expect(shown).toContain('70:00');
  });

  describe('the reactive deload (R627)', () => {
    it('offers the deload at two main misses; Start deload starts it', () => {
      mockRead.upNext = upNext({ offerDeload: true });
      const tree = mount();
      expect(lines(tree)).toContain('Two main lifts missed this week. Start the deload week now?');
      act(() => button(tree, 'Start deload').props.onPress());
      expect(startEarlyDeload).toHaveBeenCalledWith('db', 'program-barbell-foundations', expect.any(Number));
      expect(bumpData).toHaveBeenCalled();
    });

    it('Not now puts it away for the week', () => {
      mockRead.upNext = upNext({ offerDeload: true });
      const tree = mount();
      act(() => button(tree, 'Not now').props.onPress());
      expect(dismissDeloadOffer).toHaveBeenCalledWith('db', PROGRAM.offerKey);
      expect(startEarlyDeload).not.toHaveBeenCalled();
    });

    it('says nothing without it', () => {
      expect(lines(mount())).not.toContain('Two main lifts missed this week. Start the deload week now?');
    });
  });

  it("after the last week: done, the first sentence of After this program, and Start over, which asks first (R616)", () => {
    mockRead.upNext = upNext({ done: true, week: 13 });
    const tree = mount();
    const shown = lines(tree);
    expect(shown).toContain('Last time: WED 7 OCT');
    expect(shown).toContain('12 weeks done. Run successive 6-week blocks, retesting a heavy triple in the first heavy week of each block.');
    act(() => button(tree, 'Start over').props.onPress());
    const ask = tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Start Barbell Foundations over at week 1? Your weights stay.')!;
    expect(ask.props).toMatchObject({ visible: true, confirmLabel: 'Start over', cancelLabel: 'Not now' });
    act(() => ask.props.onConfirm());
    expect(startProgramOver).toHaveBeenCalledWith('db', 'program-barbell-foundations', expect.any(Number));
  });

  it('every new control has a VoiceOver label', () => {
    mockRead.upNext = upNext({ offerDeload: true });
    const tree = mount();
    expect(button(tree, 'Start deload').props.accessibilityLabel).toBe('Start the deload week now');
    expect(button(tree, 'Not now').props.accessibilityLabel).toBe('Not now: keep this week as planned');
    mockRead.upNext = upNext({ done: true, week: 13 });
    expect(button(mount(), 'Start over').props.accessibilityLabel).toBe('Start Barbell Foundations over at week 1');
  });
});
