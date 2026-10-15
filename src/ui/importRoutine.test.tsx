import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { sharedRoutineFor } from '../db/repositories/routineShareRepo';
import { saveRoutine, userRoutineCount } from '../db/repositories/routinesRepo';
import { freshSeededDb, seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { draftReducer, newDraft } from '../domain/routineDraft';
import { encodePremade, encodeRoutine, shareMessage, signBytes } from '../domain/routineShare';
import { ImportRoutine } from './routines/ImportRoutine';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), push: jest.fn(), back: jest.fn() } }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
/** Adding a routine of your own is Pro (§18.21, R521). */
let mockPro = true;
jest.mock('../platform/entitlements', () => ({ entitlementsFor: () => ({ isPro: () => mockPro }), useIsPro: () => mockPro }));
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

  it("a premade program's code adds nothing: it opens the program, free or Pro (R472)", () => {
    mockPro = false;
    const tree = render(shareMessage('Push/pull/legs', encodePremade('premade-ppl-6')));
    expect(allText(tree)).toContain('Push/pull/legs');
    // A retired program is on Routines only while someone uses it (R598): the preview says it is retired, not that it
    // is on Routines, and Open program opens its page.
    expect(allText(tree)).toContain('6 days. Retired. Open program shows its page.');
    expect(allText(tree)).not.toContain('already in your Routines');
    const open = tree.root.findByProps({ label: 'Open program' });
    act(() => open.props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/routines/premade-ppl-6');
    expect(userRoutineCount(mockDb)).toBe(0);
    mockPro = true;
  });

  it("a program's code opens it: the twenty share by place (R601)", () => {
    mockPro = false;
    const tree = render(encodePremade('program-bro-split'));
    expect(allText(tree)).toContain('Bro Split');
    expect(allText(tree)).toContain('already in your Routines');
    act(() => tree.root.findByProps({ label: 'Open program' }).props.onPress());
    expect(mockReplace).toHaveBeenCalledWith('/routines/program-bro-split');
  });

  it("a retired program's code on a phone that never had it says it is no longer in GymHound (R601)", () => {
    mockDb = freshSeededDb();
    const tree = render(shareMessage('Push/pull/legs', encodePremade('premade-ppl-6')));
    expect(allText(tree)).toContain('This program is no longer in GymHound.');
    expect(allText(tree)).not.toContain('newer version');
    expect(tree.root.findByProps({ label: 'Add routine' }).props.disabled).toBe(true);
  });

  it('a program only a newer GymHound has says to update', () => {
    const tree = render(signBytes([0, 200], 2));
    expect(allText(tree)).toContain('That code is from a newer version of GymHound. Update the app and try again.');
    expect(addButton(tree).props.disabled).toBe(true);
  });

  it('says in plain words why a code does not read, and adds nothing', () => {
    const tree = render('GH1.abc');
    expect(allText(tree)).toContain('That code is cut short. Copy the whole code and try again.');
    expect(addButton(tree).props.disabled).toBe(true);
  });

  it('free: Add routine opens the Pro sheet instead, and adds nothing (R471, R521)', () => {
    mockPro = false;
    oneOfYourOwn(mockDb);
    const code = encodeRoutine(sharedRoutineFor(mockDb, 'premade-ppl-6')!);
    const tree = render(code);
    act(() => addButton(tree).props.onPress());
    expect(userRoutineCount(mockDb)).toBe(1);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(allText(tree)).toContain('Routines of your own are part of GymHound Pro.');
    mockPro = true;
  });
});
