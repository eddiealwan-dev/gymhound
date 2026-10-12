import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import FinishSummaryScreen from '../../app/finish/[id]';
import type { FinishSummary } from '../db/repositories/workoutViewsRepo';
import { FinishPrs } from './finish/FinishPrs';
import { SaveAsWorkout } from './finish/SaveAsWorkout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The phase 4 slots on the finish summary (R123): where they sit and what they are given. Their own content is tested by
// the tasks that fill them (3, 4 and 12), in finishSummary.test.tsx.

let mockRead: { summary: FinishSummary | null; unit: 'lb' | 'kg' };

// The full access trial's lines have their own tests (trialLines.test.tsx); here they draw nothing.
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('./pro/TrialLines', () => ({
  TrialSettingsLine: () => null,
  TrialChip: () => null,
  TrainTrialNotice: () => null,
  TrialStartedNotice: () => null,
  TrialPitchLine: () => null,
}));
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'w1' }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getFinishSummary: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('./finish/FinishPrs', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { FinishPrs: jest.fn(() => <T>[FinishPrs slot]</T>) };
});
jest.mock('./finish/SaveAsWorkout', () => {
  const { Text: T } = jest.requireActual('react-native');
  return { SaveAsWorkout: jest.fn(() => <T>[SaveAsWorkout slot]</T>) };
});

const summary: FinishSummary = {
  id: 'w1',
  name: 'Push A',
  durationMs: 3_600_000,
  volume: 4320,
  setCount: 3,
  next: [{ workoutExerciseId: 'we1', name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null }],
  prs: [],
};

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FinishSummaryScreen />);
  });
  return tree;
}

const shownText = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

beforeEach(() => jest.clearAllMocks());

it('puts the PRs after the next-time lines, and Save as a workout just above Done', () => {
  mockRead = { unit: 'lb', summary };
  const text = shownText(mount());
  const at = (s: string) => text.indexOf(s);

  expect(at('Barbell bench press — next time 140 lb ↑')).toBeGreaterThan(at('3 sets'));
  expect(at('[FinishPrs slot]')).toBeGreaterThan(at('Barbell bench press — next time 140 lb ↑'));
  expect(at('[SaveAsWorkout slot]')).toBeGreaterThan(at('[FinishPrs slot]'));
  expect(text.slice(at('[SaveAsWorkout slot]') + 1)).toEqual(['Done']);
});

it('gives the slots the workout id, the summary and the workout name', () => {
  mockRead = { unit: 'lb', summary };
  mount();

  expect((FinishPrs as jest.Mock).mock.calls[0][0]).toEqual({ summary });
  expect((SaveAsWorkout as jest.Mock).mock.calls[0][0]).toEqual({ workoutId: 'w1', workoutName: 'Push A' });
});

it('shows neither slot when the workout is not there', () => {
  mockRead = { unit: 'lb', summary: null };
  mount();

  expect(FinishPrs).not.toHaveBeenCalled();
  expect(SaveAsWorkout).not.toHaveBeenCalled();
});

it('the PR slot draws nothing with no personal bests', () => {
  const { FinishPrs: RealPrs } = jest.requireActual('./finish/FinishPrs');
  expect(RealPrs({ workoutId: 'w1', summary })).toBeNull();
});
