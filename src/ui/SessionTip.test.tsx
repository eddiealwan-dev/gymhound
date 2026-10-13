import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { addExerciseToWorkout, addSet } from '../db/repositories/workoutEditRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { finishWorkout, startEmptyWorkout, tickSet } from '../db/repositories/workoutsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { SESSION_TIP, SESSION_TIP_SPOKEN, SessionTip } from './SessionTip';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: (query: (db: Db) => unknown) => query(mockDb), bumpData: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const NOW = new Date(2026, 9, 12, 9, 0).getTime();

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SessionTip />);
  });
  return tree;
}

const shown = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);

beforeEach(() => {
  mockDb = seededDb();
});

describe('SessionTip (R408)', () => {
  it('shows the tip to a lifter who has never finished a workout, read without the glyph', () => {
    const tree = mount();
    expect(shown(tree)).toEqual([SESSION_TIP]);
    expect(tree.root.findByType(Text).props.accessibilityLabel).toBe(SESSION_TIP_SPOKEN);
  });

  it('dismissing it stores that for good, and it stays away', () => {
    const tree = mount();
    const dismiss = tree.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss tip' && typeof n.props.onPress === 'function')[0];
    act(() => dismiss.props.onPress());
    expect(getSettings(mockDb).hintSessionDismissed).toBe(true);
    expect(mount().toJSON()).toBeNull();
  });

  it('is not shown once a workout has been finished', () => {
    const id = startEmptyWorkout(mockDb, NOW);
    const we = addExerciseToWorkout(mockDb, id, 'barbell-bench-press');
    tickSet(mockDb, addSet(mockDb, we), { weight: 135, reps: 5, durationS: null, distance: null }, 'lb', NOW + 60_000, 'mi');
    finishWorkout(mockDb, id, NOW + 30 * 60_000);
    expect(mount().toJSON()).toBeNull();
  });

  it('is not shown when dismissed earlier', () => {
    setSetting(mockDb, 'hintSessionDismissed', true);
    expect(mount().toJSON()).toBeNull();
  });
});
