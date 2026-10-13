import { router } from 'expo-router';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import RoutineDetailScreen from '../../app/(tabs)/routines/[id]';
import { getRoutineDetail } from '../db/repositories/routinesRepo';
import { setSetting } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { runSeed } from '../seed/seed';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockPro = true;
const ROUTINE = 'premade-fullbody-3';
const SQUAT_ROW = 'premade-fullbody-3:a:barbell-back-squat';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), navigate: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({ id: 'premade-fullbody-3' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: Db) => unknown) => query(mockDb), bumpData: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => jest.fn() }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<RoutineDetailScreen />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const tapRow = (tree: ReactTestRenderer, label: string) =>
  act(() =>
    tree.root
      .findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith(label))[0]
      .props.onPress(),
  );
const press = (tree: ReactTestRenderer, label: string) => act(() => tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress());
const settle = () => act(() => void jest.advanceTimersByTime(1000));

beforeEach(() => {
  jest.useFakeTimers();
  mockDb = seededDb();
  mockPro = true;
  jest.mocked(router.push).mockClear();
});
afterEach(() => jest.useRealTimers());

describe("Modify and Stats on a routine's page (R553, R554)", () => {
  it('tapping an exercise opens Modify and Stats; Stats opens its chart and history', () => {
    const tree = mount();
    tapRow(tree, 'Barbell back squat, ');
    expect(texts(tree)).toEqual(expect.arrayContaining(['Modify', 'Stats']));
    press(tree, 'Stats');
    settle();
    expect(router.push).toHaveBeenCalledWith('/lift/barbell-back-squat');
  });

  it('Modify swaps the exercise in the program from the next workout, and offers the program’s own back', () => {
    let tree = mount();
    tapRow(tree, 'Barbell back squat, ');
    press(tree, 'Modify');
    settle();
    expect(texts(tree)).toContain('Choose a new exercise');
    tapRow(tree, 'Front squat, ');
    const day = getRoutineDetail(mockDb, ROUTINE)!.days[0];
    expect(day.exercises.find((e) => e.id === SQUAT_ROW)).toMatchObject({ exerciseId: 'barbell-front-squat', setCount: 3, repMin: 5, repMax: 8 });

    tree = mount();
    tapRow(tree, 'Front squat, ');
    press(tree, 'Modify');
    settle();
    expect(texts(tree)).toContain("Barbell back squat (program's)");
  });

  it('a swap in a program stays through an app update', () => {
    const tree = mount();
    tapRow(tree, 'Barbell back squat, ');
    press(tree, 'Modify');
    settle();
    tapRow(tree, 'Front squat, ');
    setSetting(mockDb, 'seedVersion', 1);
    runSeed(mockDb, Date.now());
    expect(getRoutineDetail(mockDb, ROUTINE)!.days[0].exercises.find((e) => e.id === SQUAT_ROW)?.exerciseId).toBe('barbell-front-squat');
  });

  it('free: a free program can still be modified', () => {
    mockPro = false;
    const tree = mount();
    // Beginner full body is free, so it changes.
    tapRow(tree, 'Barbell back squat, ');
    press(tree, 'Modify');
    settle();
    expect(texts(tree)).toContain('Choose a new exercise');
  });
});
