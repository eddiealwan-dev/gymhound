import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import FinishSummaryScreen from '../../app/finish/[id]';
import type { FinishSummary } from '../db/repositories/workoutViewsRepo';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRead: { summary: FinishSummary | null; unit: 'lb' | 'kg' };

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, useLocalSearchParams: () => ({ id: 'w1' }) }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getFinishSummary: jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** Push A, an hour long, with three sets logged and `next` as the rule left it. */
const pushA = (next: FinishSummary['next']): FinishSummary => ({
  id: 'w1',
  name: 'Push A',
  durationMs: 3_600_000,
  volume: 4320,
  setCount: 3,
  next,
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FinishSummaryScreen />);
  });
  return tree;
}

/** Every string drawn on screen, in order. */
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

describe('the finish summary (8.5, R64)', () => {
  it("shows next time's weight for each exercise, in order, under the stats and above Done", () => {
    mockRead = {
      unit: 'lb',
      summary: pushA([
        { name: 'Barbell bench press', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
        { name: 'Overhead press', outcome: 'held_marked', nextWeight: 95, nextUnit: 'lb', mark: 'pain' },
        { name: 'Incline dumbbell press', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
        { name: 'Triceps pushdown', outcome: 'no_sets', nextWeight: 40, nextUnit: 'lb', mark: null },
      ]),
    };
    const text = shownText(mount());

    const lines = [
      'Barbell bench press — next time 140 lb ↑',
      'Overhead press — holds at 95 lb · Pain',
      'Incline dumbbell press — holds at 50 lb',
      'Triceps pushdown — holds at 40 lb',
    ];
    const logged = text.indexOf('3 sets');
    expect(logged).toBeGreaterThan(-1);
    expect(text.slice(logged + 1)).toEqual([...lines, 'Done']);
  });

  it('shows no next-time line when no exercise has a rule', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    const text = shownText(mount());

    expect(text.slice(text.indexOf('3 sets') + 1)).toEqual(['Done']);
  });
});
