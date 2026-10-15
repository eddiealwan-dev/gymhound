import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { RungWords } from '../domain/ruleLine';
import { ModifySheet } from './ModifySheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
const mockCandidates = jest.fn(() => []);
jest.mock('../db/repositories/routinesRepo', () => ({ swapCandidates: () => mockCandidates() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

/** #3's Pull-up ladder. */
const RUNGS: RungWords[] = [
  { name: 'Scapular pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
  { name: 'Arch hang', timed: true, repMin: 10, repMax: 30, weighted: false },
  { name: 'Negative pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
  { name: 'Band assisted pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
  { name: 'Pull-up', timed: false, repMin: 5, repMax: 8, weighted: false },
  { name: 'Weighted pull-up', timed: false, repMin: 5, repMax: 8, weighted: true },
];

function mount(onChooseRung: (rung: number) => void, onClose = jest.fn()): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ModifySheet
        target={{ exerciseId: 'negative-pull-up', name: 'Negative pull-up', programExerciseId: null, inUse: [] }}
        ladder={{ rungs: RUNGS, current: 2, sets: 3 }}
        note="Changes it from the next workout."
        onChoose={jest.fn()}
        onChooseRung={onChooseRung}
        onClose={onClose}
      />,
    );
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));

describe('ModifySheet on a ladder slot: Change rung (R618)', () => {
  it('lists the rungs in order with the current one marked, and their sets and range', () => {
    const shown = texts(mount(jest.fn()));
    expect(shown).toContain('Change rung');
    const rows = ['1. Scapular pull-up', '2. Arch hang', '3. Negative pull-up (current)', '4. Band assisted pull-up', '5. Pull-up', '6. Weighted pull-up'];
    const at = rows.map((r) => shown.indexOf(r));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(shown).toContain('3 × 10–30 s');
    expect(shown).toContain('3 × 5–8');
    expect(shown).toContain('Changes it from the next workout.');
    // No swap list: a ladder's exercise is its rung.
    expect(shown).not.toContain('Choose a new exercise');
    expect(mockCandidates).not.toHaveBeenCalled();
  });

  it('changes the rung, labelled for VoiceOver', () => {
    const onChooseRung = jest.fn();
    const tree = mount(onChooseRung);
    const row = tree.root.find((n) => n.props.accessibilityLabel === 'Rung 5, Pull-up, 3 × 5–8' && typeof n.props.onPress === 'function');
    act(() => row.props.onPress());
    expect(onChooseRung).toHaveBeenCalledWith(4);
    const current = tree.root.findAll((n) => n.props.accessibilityLabel === 'Rung 3, Negative pull-up, current, 3 × 5–8' && typeof n.props.onPress === 'function');
    expect(current.length).toBe(1);
  });

  it('the current rung closes without a change', () => {
    const onChooseRung = jest.fn();
    const onClose = jest.fn();
    const tree = mount(onChooseRung, onClose);
    const row = tree.root.find((n) => n.props.accessibilityLabel === 'Rung 3, Negative pull-up, current, 3 × 5–8' && typeof n.props.onPress === 'function');
    act(() => row.props.onPress());
    expect(onChooseRung).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
