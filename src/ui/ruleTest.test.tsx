import { Share, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import RuleTest from '../../app/rule-test';
import { getSettings } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { RULE_TEST_QUESTIONS } from '../domain/ruleTest';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: function Ionicons() { return null; } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../state/dataVersion', () => ({ bumpData: jest.fn(), useDbQuery: (read: (db: Db) => unknown) => read(mockDb) }));
jest.mock('../platform/locale', () => ({ deviceLocale: () => 'en-US' }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<RuleTest />);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label)!;
const press = (tree: ReactTestRenderer, label: string) => act(() => button(tree, label).props.onPress());
const field = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(TextInput).find((f) => f.props.accessibilityLabel === label)!;
const type = (tree: ReactTestRenderer, label: string, text: string) => act(() => field(tree, label).props.onChangeText(text));

/** Each screen's timer starts once it is drawn, so they move on one at a time. */
const showAllScreens = () => {
  for (let i = 0; i < 3; i += 1) act(() => void jest.advanceTimersByTime(5000));
};

beforeEach(() => {
  jest.useFakeTimers();
  mockDb = seededDb();
});
afterEach(() => jest.useRealTimers());

describe('Settings → Developer → Rule test (R581–R584)', () => {
  it('shows the three screens for five seconds each, then the questions', () => {
    const tree = mount();
    press(tree, 'Start');
    expect(texts(tree)).toEqual(expect.arrayContaining(['1 of 3', 'Bench press', 'Something off', 'Bench press — next time 140 lb ↑']));

    act(() => void jest.advanceTimersByTime(4999));
    expect(texts(tree)).toContain('1 of 3');
    act(() => void jest.advanceTimersByTime(1));
    expect(texts(tree)).toEqual(expect.arrayContaining(['2 of 3', 'Rough sleep', 'Bench press — holds at 135 lb · Rough sleep']));

    act(() => void jest.advanceTimersByTime(5000));
    expect(texts(tree)).toEqual(expect.arrayContaining(['3 of 3', 'Bench press — holds at 135 lb']));

    act(() => void jest.advanceTimersByTime(5000));
    expect(texts(tree)).toEqual(expect.arrayContaining(RULE_TEST_QUESTIONS.map((q, i) => `${i + 1}. ${q}`)));
  });

  it('saves the answers under the name given, or as the next tester, and shares them all', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const tree = mount();
    type(tree, 'Who is taking it', 'Sam');
    press(tree, 'Start');
    showAllScreens();
    type(tree, RULE_TEST_QUESTIONS[0], 'It goes up to 140');
    type(tree, RULE_TEST_QUESTIONS[4], 'Me');
    press(tree, 'Save answers');
    expect(texts(tree)).toContain('Saved. 1 person has taken it.');

    press(tree, 'Next person');
    press(tree, 'Start');
    showAllScreens();
    press(tree, 'Save answers');

    const stored = getSettings(mockDb).ruleTestAnswers as { who: string; answers: string[] }[];
    expect(stored.map((e) => e.who)).toEqual(['Sam', 'Tester 2']);
    expect(stored[0].answers[0]).toBe('It goes up to 140');
    expect(stored[0].answers[4]).toBe('Me');

    press(tree, 'Share answers');
    const message = share.mock.calls[0][0].message!;
    expect(message).toContain('Sam · ');
    expect(message).toContain('It goes up to 140');
    expect(message).toContain('Tester 2 · ');
    share.mockRestore();
  });
});
