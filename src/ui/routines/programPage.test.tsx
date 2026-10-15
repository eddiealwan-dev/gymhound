import { router } from 'expo-router';
import { setActiveProgram } from '../../db/repositories/programRunRepo';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import RoutineDetailScreen from '../../../app/(tabs)/routines/[id]';
import type { RoutineDetail, RoutineDetailExercise } from '../../db/repositories/routinesRepo';
import { getRoutineDetail, setActiveRoutine, userRoutineCount } from '../../db/repositories/routinesRepo';
import { getActiveWorkoutId } from '../../db/repositories/workoutsRepo';
import { Button } from '../Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockId: string;
let mockPro: boolean;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: string) => unknown) => query('db'), bumpData: jest.fn() }));
jest.mock('../../db/repositories/routinesRepo', () => ({
  getRoutineDetail: jest.fn(),
  setActiveRoutine: jest.fn(),
  userRoutineCount: jest.fn(),
  duplicateRoutine: jest.fn(),
  deleteRoutine: jest.fn(),
  swapRoutineExercise: jest.fn(),
}));
jest.mock('../../db/repositories/programRunRepo', () => ({ setActiveProgram: jest.fn(), changeRung: jest.fn(), startProgramOver: jest.fn() }));
jest.mock('../../db/repositories/programViewRepo', () => ({ programPageOf: jest.fn(() => null) }));
jest.mock('../../state/routineShare', () => ({ shareRoutine: jest.fn(() => Promise.resolve('shared')) }));
jest.mock('../../db/repositories/workoutsRepo', () => ({ getActiveWorkoutId: jest.fn() }));
jest.mock('../../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('../Footer', () => ({ Footer: () => null }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('../../seed/programPictures.generated', () => ({
  PROGRAM_PICTURES: { 'program-advanced-upper-lower-dup': { card: 11, thumb: 12 } },
}));

const exercise = (id: string, name: string): RoutineDetailExercise => ({
  id,
  exerciseId: id,
  name,
  loggingType: 'weighted',
  equipment: 'barbell',
  setCount: 4,
  repMin: 4,
  repMax: 6,
  increment: 5,
  incrementUnit: 'lb',
  supersetGroup: null,
  nextWeight: null,
  nextWeightUnit: null,
});

const DUP: RoutineDetail = {
  id: 'program-advanced-upper-lower-dup',
  name: 'Advanced Upper/Lower DUP',
  isPremade: true,
  isActive: false,
  days: [
    { id: 'upper-heavy', name: 'Upper Heavy', exercises: [exercise('bench', 'Barbell bench press'), exercise('pull', 'Weighted pull-up')] },
    { id: 'lower-heavy', name: 'Lower Heavy', exercises: [exercise('squat', 'Barbell back squat')] },
  ],
};

const RETIRED: RoutineDetail = { ...DUP, id: 'premade-ppl-6', name: 'Push/pull/legs', days: [{ id: 'push-a', name: 'Push A', exercises: [exercise('bench', 'Barbell bench press')] }] };
const MINE: RoutineDetail = { ...RETIRED, id: 'mine', name: 'My split', isPremade: false };

const HIDDEN = "The days and exercises show once it's your active program.";
const RETIRED_LINE = 'Retired. It keeps running for you, and its history stays.';
const EXERCISES = ['Upper Heavy', 'Barbell bench press', 'Weighted pull-up', 'Lower Heavy', 'Barbell back squat'];

function mount(detail: RoutineDetail): ReactTestRenderer {
  mockId = detail.id;
  jest.mocked(getRoutineDetail).mockReturnValue(detail);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<RoutineDetailScreen />);
  });
  return tree;
}

function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node.replace(/​/g, ''));
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockPro = true;
  jest.mocked(getActiveWorkoutId).mockReturnValue(null);
  jest.mocked(userRoutineCount).mockReturnValue(0);
});

afterEach(() => jest.useRealTimers());

describe("a program's page is its card (R630, R634)", () => {
  it('shows the card, then says the days show once it is active, with Set active filled; no exercise names', () => {
    const tree = mount(DUP);
    const shown = shownText(tree);
    expect(shown).toContain('#11 · Advanced Upper/Lower DUP');
    expect(shown).toContain('Why it works');
    expect(shown).toContain('Sources (7)');
    expect(shown.indexOf(HIDDEN)).toBeGreaterThan(shown.indexOf('Sources (7)'));
    for (const name of EXERCISES) expect(shown).not.toContain(name);
    expect(buttons(tree, 'Set active').map((b) => b.props.variant ?? 'primary')).toEqual(['primary']);
    // Nothing that needs the exercises (Modify, Duplicate) is offered until they show (R635).
    expect(buttons(tree, 'Duplicate')).toHaveLength(0);
    expect(buttons(tree, 'Share routine')).toHaveLength(1);

    act(() => buttons(tree, 'Set active')[0].props.onPress());
    expect(setActiveProgram).toHaveBeenCalledWith('db', 'program-advanced-upper-lower-dup', expect.any(Number));
  });

  it("a Pro program on free: R525's line and See Pro, and no Set active", () => {
    mockPro = false;
    const tree = mount(DUP);
    const shown = shownText(tree);
    expect(shown.some((t) => t.startsWith('Advanced Upper/Lower DUP is part of GymHound Pro. Free includes'))).toBe(true);
    expect(shown).not.toContain(HIDDEN);
    expect(buttons(tree, 'Set active')).toHaveLength(0);
    act(() => buttons(tree, 'See Pro')[0].props.onPress());
    expect(router.push).toHaveBeenCalledWith('/paywall');
    expect(setActiveProgram).not.toHaveBeenCalled();
    for (const name of EXERCISES) expect(shown).not.toContain(name);
  });

  it('your active program shows Active, then its days and exercises', () => {
    const tree = mount({ ...DUP, isActive: true });
    const shown = shownText(tree);
    expect(shown).not.toContain(HIDDEN);
    expect(buttons(tree, 'Set active')).toHaveLength(0);
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === 'Active' && n.props.accessible === true)).toHaveLength(1);
    for (const name of EXERCISES) expect(shown).toContain(name);
    expect(shown.indexOf('Upper Heavy')).toBeGreaterThan(shown.indexOf('Sources (7)'));
  });

  it('Back returns to Routines', () => {
    const tree = mount(DUP);
    act(() => tree.root.findAll((n) => n.props.accessibilityLabel === 'Back to Routines' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(router.back).toHaveBeenCalled();
  });
});

describe('Earlier programs (R598)', () => {
  it("a retired program's page says it keeps running, and still shows its days", () => {
    const shown = shownText(mount(RETIRED));
    expect(shown).toContain(RETIRED_LINE);
    expect(shown).toContain('Push A');
    expect(shown).toContain('Barbell bench press');
  });

  it('your own routine has no such line', () => {
    expect(shownText(mount(MINE))).not.toContain(RETIRED_LINE);
  });
});
