import { Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import { workouts } from '../db/schema';
import type { Db } from '../db/types';
import { Button } from './Button';
import { TesterQuestions } from './finish/TesterQuestions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockTester = true;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('../platform/runtime', () => ({ isTesterBuild: () => mockTester }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function finished(db: Db, n: number) {
  for (let i = 0; i < n; i++) {
    db.insert(workouts).values({ id: `w${i}`, name: 'Full body', status: 'finished', startedAt: i, finishedAt: i + 1, localDate: '2026-10-14' }).run();
  }
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<TesterQuestions />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

beforeEach(() => {
  mockDb = seededDb();
  mockTester = true;
});

describe('the tester questions on the finish summary (R593)', () => {
  it('shows nothing outside a tester build, or after the 1st workout', () => {
    finished(mockDb, 2);
    mockTester = false;
    expect(mount().toJSON()).toBeNull();
    mockTester = true;
    mockDb = seededDb();
    finished(mockDb, 1);
    expect(mount().toJSON()).toBeNull();
  });

  it('asks after the 2nd workout, saves the answers, and asks that set only once', () => {
    finished(mockDb, 2);
    const tree = mount();
    expect(texts(tree)).toEqual(expect.arrayContaining(['A few questions for the test', 'Did you lift the weight it showed today?']));
    const field = tree.root.findAllByType(TextInput).find((f) => f.props.accessibilityLabel === 'Did you lift the weight it showed today?')!;
    act(() => field.props.onChangeText('Yes'));
    act(() => tree.root.findAllByType(Button).find((b) => b.props.label === 'Save answers')!.props.onPress());
    expect(texts(tree)).toContain('Thanks. Your answers are saved. Send them from Settings, under Test answers.');
    const stored = getSettings(mockDb).testerAnswers as { workout: number; answers: { question: string; answer: string }[] }[];
    expect(stored).toHaveLength(1);
    expect(stored[0].workout).toBe(2);
    expect(stored[0].answers[0]).toEqual({ question: 'Did you lift the weight it showed today?', answer: 'Yes' });
    expect(mount().toJSON()).toBeNull();
  });

  it('asks the trust questions after the 3rd', () => {
    finished(mockDb, 3);
    setSetting(mockDb, 'testerAnswers', [{ workout: 2, at: 0, answers: [] }]);
    expect(texts(mount())).toContain('Would you pay to set your own rule on your own routines?');
  });
});
