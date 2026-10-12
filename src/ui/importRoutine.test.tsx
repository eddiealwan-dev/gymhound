import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { sharedRoutineFor } from '../db/repositories/routineShareRepo';
import { saveRoutine, userRoutineCount } from '../db/repositories/routinesRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { draftReducer, newDraft } from '../domain/routineDraft';
import { encodeRoutine, shareMessage } from '../domain/routineShare';
import { ImportRoutine } from './routines/ImportRoutine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn() } }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ bumpData: jest.fn() }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => jest.fn() }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function render(initial = ''): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ImportRoutine initial={initial} onCancel={jest.fn()} />);
  });
  return tree;
}

const allText = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const addButton = (tree: ReactTestRenderer) => tree.root.findByProps({ label: 'Add routine' });

function oneOfYourOwn(db: Db) {
  let draft = draftReducer(newDraft(), { type: 'rename', name: 'Mine' });
  draft = draftReducer(draft, { type: 'addDay' });
  draft = draftReducer(draft, {
    type: 'addExercise',
    dayKey: draft.days[0].key,
    exercise: { id: 'barbell-bench-press', name: 'Barbell bench press', loggingType: 'weighted' },
    increment: { value: 5, unit: 'lb' },
  });
  saveRoutine(db, draft, Date.UTC(2026, 9, 11));
}

beforeEach(() => {
  mockDb = seededDb();
  mockReplace.mockClear();
});

describe('Add from code (§18.18)', () => {
  it('previews a pasted message, then adds the routine as your own and opens it', () => {
    const code = encodeRoutine(sharedRoutineFor(mockDb, 'premade-fullbody-3')!);
    const tree = render();
    expect(addButton(tree).props.disabled).toBe(true);
    act(() => tree.root.findByType(TextInput).props.onChangeText(shareMessage('Beginner full body', code)));
    expect(allText(tree)).toContain('Beginner full body');
    expect(allText(tree)).toMatch(/3 days · \d+ exercises/);
    act(() => addButton(tree).props.onPress());
    expect(userRoutineCount(mockDb)).toBe(1);
    expect(mockReplace).toHaveBeenCalledWith(expect.stringMatching(/^\/routines\//));
  });

  it('says in plain words why a code does not read, and adds nothing', () => {
    const tree = render('GH1.abc');
    expect(allText(tree)).toContain('That code is cut short. Copy the whole code and try again.');
    expect(addButton(tree).props.disabled).toBe(true);
  });

  it('keeps to the free limit: with one routine of your own, Add routine opens the limit sheet instead (R471)', () => {
    oneOfYourOwn(mockDb);
    const code = encodeRoutine(sharedRoutineFor(mockDb, 'premade-ppl-6')!);
    const tree = render(code);
    act(() => addButton(tree).props.onPress());
    expect(userRoutineCount(mockDb)).toBe(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(allText(tree)).toContain('Free holds one routine of your own.');
  });
});
