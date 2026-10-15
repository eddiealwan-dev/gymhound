import { router } from 'expo-router';
import { eq } from 'drizzle-orm';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import RoutineDetailScreen from '../../../app/(tabs)/routines/[id]';
import { setActiveProgram } from '../../db/repositories/programRunRepo';
import { duplicateRoutine } from '../../db/repositories/routinesRepo';
import { routineExercises, routines } from '../../db/schema';
import { seededDb } from '../../db/testing/fixtures';
import { insertProgram, runSession } from '../../db/testing/programFixture';
import type { Db } from '../../db/types';
import { Button } from '../Button';
import { ModifySheet } from '../ModifySheet';
import { ConfirmSheet } from '../Sheet';
import { RoutineOptionsSheet, useRoutineActions } from './useRoutineActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockId: string;
let mockPro = false;

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: mockId }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../../state/dataVersion', () => ({ useDbQuery: (query: (db: Db) => unknown) => query(mockDb), bumpData: jest.fn() }));
jest.mock('../../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('../pro/openPaywall', () => ({ useOpenPaywall: () => jest.fn() }));
jest.mock('../Footer', () => ({ Footer: () => null }));
jest.mock('../../seed/programPictures.generated', () => ({ PROGRAM_PICTURES: {} }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 9, 12, 9, 0).getTime();
const BF = 'program-barbell-foundations';
const BF_A = `${BF}:a`;
const SQUAT_A = `${BF_A}:barbell-back-squat`;
const CALI = 'program-calisthenics-foundations';
const PULL_LADDER = `${CALI}:a:fedb-scapular-pull-up`;

function mount(id: string): ReactTestRenderer {
  mockId = id;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<RoutineDetailScreen />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join('').replace(/​/g, ''));
const labels = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
const press = (tree: ReactTestRenderer, label: string) => act(() => buttons(tree, label)[0].props.onPress());
const tapRow = (tree: ReactTestRenderer, label: string) =>
  act(() =>
    tree.root
      .findAll((n: ReactTestInstance) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label))[0]
      .props.onPress(),
  );
const settle = () => act(() => void jest.advanceTimersByTime(1000));

beforeEach(() => {
  jest.useFakeTimers();
  mockDb = seededDb();
  mockPro = false;
  jest.mocked(router.push).mockClear();
});
afterEach(() => jest.useRealTimers());

describe('the active program under its card (R634, R616, R636)', () => {
  it('shows Active with the week, then the days and exercises', () => {
    insertProgram(mockDb, BF);
    setActiveProgram(mockDb, BF, NOW);
    const tree = mount(BF);
    const shown = texts(tree);
    expect(shown).toContain('Active');
    expect(shown).toContain('Week 1 of 12');
    expect(shown).toContain('Barbell back squat');
    expect(shown.indexOf('Week 1 of 12')).toBeLessThan(shown.indexOf('Barbell back squat'));
  });

  it("an inactive program's card names no exercise, in its text or its labels", () => {
    insertProgram(mockDb, BF);
    insertProgram(mockDb, 'program-dumbbell-full-body');
    setActiveProgram(mockDb, 'program-dumbbell-full-body', NOW);
    const tree = mount(BF);
    const said = [...texts(tree), ...labels(tree)].join('\n');
    expect(said).toContain("The days and exercises show once it's your active program.");
    for (const name of ['Barbell back squat', 'Barbell bench press', 'Barbell row', 'Week 1 of 12']) expect(said).not.toContain(name);
    expect(buttons(tree, 'Duplicate')).toHaveLength(0);
  });

  it('Start over asks first, then starts the run at week 1 (R616)', () => {
    insertProgram(mockDb, BF);
    setActiveProgram(mockDb, BF, NOW);
    const tree = mount(BF);
    press(tree, 'Start over');
    const ask = tree.root.findAllByType(ConfirmSheet).find((s) => s.props.title === 'Start Barbell Foundations over at week 1? Your weights stay.')!;
    expect(ask.props).toMatchObject({ visible: true, confirmLabel: 'Start over', cancelLabel: 'Not now' });
    act(() => ask.props.onConfirm());
    const routine = mockDb.select().from(routines).where(eq(routines.id, BF)).get()!;
    expect(routine.runStartedAt).not.toBe(NOW);
    expect(buttons(tree, 'Start over')[0].props.accessibilityLabel).toBe('Start Barbell Foundations over at week 1');
  });

  it('says when a lift has dropped back twice in this run (R614)', () => {
    insertProgram(mockDb, BF);
    setActiveProgram(mockDb, BF, NOW);
    // Three misses in a row reset a Beginner lift; six do it twice.
    let weight = 135;
    for (let i = 1; i <= 6; i++) {
      runSession(mockDb, BF_A, NOW + i * DAY, { [SQUAT_A]: { weight, reps: [3, 3, 3] } });
      weight = mockDb.select().from(routineExercises).where(eq(routineExercises.id, SQUAT_A)).get()!.nextWeight ?? weight;
    }
    expect(texts(mount(BF))).toContain('Barbell back squat has dropped back twice in this run. See After this program.');
  });

  it('a ladder slot opens Change rung, which moves the rung (R618)', () => {
    mockPro = true;
    insertProgram(mockDb, CALI);
    setActiveProgram(mockDb, CALI, NOW);
    const tree = mount(CALI);
    tapRow(tree, 'Scapular pull-up');
    expect(buttons(tree, 'Modify')).toHaveLength(0);
    press(tree, 'Change rung');
    settle();
    const sheet = tree.root.findAllByType(ModifySheet).find((s) => Boolean(s.props.ladder))!;
    expect(sheet.props.ladder).toMatchObject({ current: 0, sets: 3 });
    expect(sheet.props.ladder.rungs.map((r: { name: string }) => r.name)).toContain('Weighted pull-up');
    act(() => sheet.props.onChooseRung(4));
    expect(mockDb.select().from(routineExercises).where(eq(routineExercises.id, PULL_LADDER)).get()).toMatchObject({ ladderRung: 4, exerciseId: 'pull-up' });
  });

  it('Set active starts the run at week 1 (R636)', () => {
    insertProgram(mockDb, BF);
    const tree = mount(BF);
    press(tree, 'Set active');
    const routine = mockDb.select().from(routines).where(eq(routines.id, BF)).get()!;
    expect(routine.runStartedAt).not.toBeNull();
  });
});

describe('Duplicate is offered on a program only while it is active (R635)', () => {
  function Options({ routine }: { routine: { id: string; name: string; isPremade: boolean; isActive: boolean } }) {
    const actions = useRoutineActions();
    return <RoutineOptionsSheet routine={routine} actions={actions} onClose={() => {}} />;
  }
  const sheet = (routine: { id: string; name: string; isPremade: boolean; isActive: boolean }) => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Options routine={routine} />);
    });
    return tree;
  };

  it('in the ⋯ sheet: not for an inactive program, yes for the active one and your own', () => {
    mockPro = true;
    expect(buttons(sheet({ id: BF, name: 'Barbell Foundations', isPremade: true, isActive: false }), 'Duplicate')).toHaveLength(0);
    expect(buttons(sheet({ id: BF, name: 'Barbell Foundations', isPremade: true, isActive: true }), 'Duplicate')).toHaveLength(1);
    expect(buttons(sheet({ id: 'mine', name: 'My split', isPremade: false, isActive: false }), 'Duplicate')).toHaveLength(1);
    expect(buttons(sheet({ id: 'premade-ppl-6', name: 'Push/pull/legs', isPremade: true, isActive: false }), 'Duplicate')).toHaveLength(1);
  });

  it('on the page: only while the exercises show', () => {
    insertProgram(mockDb, BF);
    expect(buttons(mount(BF), 'Duplicate')).toHaveLength(0);
    setActiveProgram(mockDb, BF, NOW);
    expect(buttons(mount(BF), 'Duplicate')).toHaveLength(1);
  });
});

describe('sharing a copy past what a code carries (ruling R-t9a)', () => {
  it('says why it cannot be shared', async () => {
    mockPro = true;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const copy = duplicateRoutine(mockDb, 'program-hybrid-athlete', NOW);
    const tree = mount(copy);
    await act(async () => {
      buttons(tree, 'Share routine')[0].props.onPress();
    });
    expect(texts(tree)).toContain('This routine has a target longer than GymHound can share.');
    warn.mockRestore();
  });
});
