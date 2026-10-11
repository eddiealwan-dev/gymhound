import { Switch, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { saveRoutine } from '../db/repositories/routinesRepo';
import { getSettings } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { draftReducer, newDraft } from '../domain/routineDraft';
import { useRoutineLimit } from './RoutineLimit';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A real seeded database, so Settings and the routine limit share what they read. */
let mockDb: Db;

jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../platform/restTimer/bell', () => ({ playBell: jest.fn(() => Promise.resolve()) }));
jest.mock('../state/backup', () => ({
  snapshotListing: () => ({ path: null, names: [], error: null }),
  snapshotFolderReport: () => null,
  shareFile: jest.fn(),
}));
jest.mock('../state/dataVersion', () => ({
  useDbQuery: (query: (db: unknown) => unknown) => query(mockDb),
  useDataVersion: (select: (state: { version: number }) => unknown) => select({ version: 0 }),
  bumpData: jest.fn(),
}));
jest.mock('./BarPicker', () => ({ BarPicker: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const globals = globalThis as { __DEV__?: boolean };
const originalDev = globals.__DEV__;
const originalFlag = process.env.EXPO_PUBLIC_DEBUG_UNLOCK;

/** A development build (`__DEV__`) or a release build; neither sets EXPO_PUBLIC_DEBUG_UNLOCK. */
function build(dev: boolean): void {
  globals.__DEV__ = dev;
  delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
}

const UNLOCK = 'Unlock Pro for testing';

/** What the routine limit does with "add one more", from a screen other than Settings. */
let limit: ReturnType<typeof useRoutineLimit>;
function LimitProbe() {
  limit = useRoutineLimit();
  return limit.sheets;
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <>
        <Settings />
        <LimitProbe />
      </>,
    );
  });
  return tree;
}

const unlock = (tree: ReactTestRenderer) => tree.root.findAllByType(Switch).filter((s) => s.props.accessibilityLabel === UNLOCK);
const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);

/** One routine of your own, the most free holds. */
function oneRoutineOfYourOwn(db: Db) {
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
});

afterEach(() => {
  globals.__DEV__ = originalDev;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_DEBUG_UNLOCK;
  else process.env.EXPO_PUBLIC_DEBUG_UNLOCK = originalFlag;
});

describe('Settings: Developer (R126)', () => {
  it('is not there in a release build without the debug flag', () => {
    build(false);
    const tree = mount();

    expect(unlock(tree)).toHaveLength(0);
    expect(texts(tree)).not.toContain('Developer');
  });

  it('shows "Unlock Pro for testing", off, where the debug unlock is allowed', () => {
    build(true);
    const tree = mount();

    expect(texts(tree)).toContain('Developer');
    expect(texts(tree)).toContain(UNLOCK);
    expect(unlock(tree)).toHaveLength(1);
    expect(unlock(tree)[0].props.value).toBe(false);
  });

  it('turning it on lifts the one-routine limit on another screen at once; off brings it back', () => {
    build(true);
    oneRoutineOfYourOwn(mockDb);
    const tree = mount();
    const add = jest.fn();

    act(() => limit.whenRoomFor(add));
    expect(add).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Free holds one routine of your own. GymHound Pro holds as many as you like.');

    act(() => unlock(tree)[0].props.onValueChange(true));
    expect(getSettings(mockDb).proDebugUnlock).toBe(true);
    expect(unlock(tree)[0].props.value).toBe(true);
    act(() => limit.whenRoomFor(add));
    expect(add).toHaveBeenCalledTimes(1);

    act(() => unlock(tree)[0].props.onValueChange(false));
    expect(unlock(tree)[0].props.value).toBe(false);
    act(() => limit.whenRoomFor(add));
    expect(add).toHaveBeenCalledTimes(1);
  });
});
