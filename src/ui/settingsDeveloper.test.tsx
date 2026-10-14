import { router } from 'expo-router';
import { Share, Switch, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import Settings from '../../app/(tabs)/settings';
import { saveRoutine } from '../db/repositories/routinesRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { draftReducer, newDraft } from '../domain/routineDraft';
import { createRevenueCatEntitlements } from '../platform/entitlements';
import type { AppEntitlements, PurchasesSdk } from '../platform/entitlements';
import { useRoutineLimit } from './RoutineLimit';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A real seeded database, so Settings and the routine limit share what they read. */
let mockDb: Db;
/** When set, the app's entitlements object (a store build); otherwise the real one for `mockDb`. */
let mockEntitlements: AppEntitlements | null = null;

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: jest.fn() }));
let mockTester = false;
jest.mock('../platform/runtime', () => ({ ...jest.requireActual('../platform/runtime'), isTesterBuild: () => mockTester }));
jest.mock('../platform/entitlements/select', () => {
  const actual = jest.requireActual('../platform/entitlements/select');
  return { ...actual, entitlementsFor: (db: Db) => mockEntitlements ?? actual.entitlementsFor(db) };
});
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
let mockBuild: { commit: string; date: string } | null = { commit: '93912f2', date: '2026-10-12' };
jest.mock('../platform/buildStamp', () => ({ buildStamp: () => mockBuild }));
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
  mockEntitlements?.dispose();
  mockEntitlements = null;
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

  it('names the build the phone runs, to match the commit the PC printed (R540)', () => {
    build(true);
    let tree = mount();
    expect(texts(tree)).toContain('Build 93912f2 · 2026-10-12');
    mockBuild = null;
    tree = mount();
    expect(texts(tree)).toContain('Build: not known');
    mockBuild = { commit: '93912f2', date: '2026-10-12' };
  });

  it('turning it on lets another screen make a routine of your own at once; off locks it again (§18.21)', () => {
    build(true);
    oneRoutineOfYourOwn(mockDb);
    const tree = mount();
    const add = jest.fn();

    act(() => limit.whenRoomFor(add));
    expect(add).not.toHaveBeenCalled();
    expect(texts(tree)).toContain('Routines of your own are part of GymHound Pro.');

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

  it('under the store with Pro bought, shows the debug unlock itself, so it can still be turned off', async () => {
    build(true);
    setSetting(mockDb, 'proCached', true);
    setSetting(mockDb, 'proDebugUnlock', true);
    const sdk: PurchasesSdk = {
      configure: () => {},
      getCustomerInfo: async () => ({ activeEntitlements: ['pro'] }),
      onCustomerInfo: () => () => {},
      getPlans: async () => [],
      purchase: async () => ({ activeEntitlements: ['pro'] }),
      restore: async () => ({ activeEntitlements: ['pro'] }),
      showManageSubscriptions: async () => {},
    };
    mockEntitlements = createRevenueCatEntitlements(mockDb, sdk, 'key', true);
    const tree = mount();
    await act(async () => {});

    expect(unlock(tree)[0].props.value).toBe(true);
    act(() => unlock(tree)[0].props.onValueChange(false));
    expect(getSettings(mockDb).proDebugUnlock).toBe(false);
    // The app re-reads on bumpData; here the screen is drawn again by hand.
    act(() =>
      tree.update(
        <>
          <Settings />
          <LimitProbe />
        </>,
      ),
    );
    expect(unlock(tree)[0].props.value).toBe(false);
    expect(mockEntitlements.isPro()).toBe(true);
  });
});

describe('Settings: the rule test, the rating line and test answers (§18.28)', () => {
  const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label);

  it('Developer opens the rule test and says what the rating rules said last (R581, R587)', () => {
    build(true);
    let tree = mount();
    expect(texts(tree)).toContain('Rating prompt: no workout finished yet.');
    act(() => button(tree, 'Rule test')!.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/rule-test');

    setSetting(mockDb, 'reviewLastCheck', 'Something off was marked, so not today.');
    tree = mount();
    expect(texts(tree)).toContain('Rating prompt: Something off was marked, so not today.');
  });

  it('Test answers shows only in a tester build, and shares what is saved (R594)', () => {
    build(false);
    expect(button(mount(), 'Send test answers')).toBeUndefined();

    mockTester = true;
    setSetting(mockDb, 'testerAnswers', [{ workout: 2, at: Date.UTC(2026, 9, 20, 12), answers: [{ question: 'If not, why not?', answer: 'Too heavy' }] }]);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const tree = mount();
    expect(texts(tree)).toContain("1 set of answers saved. Send them to GymHound when you're asked.");
    act(() => button(tree, 'Send test answers')!.props.onPress());
    expect(share.mock.calls[0][0].message).toContain('If not, why not?\nToo heavy');
    share.mockRestore();
    mockTester = false;
  });
});
