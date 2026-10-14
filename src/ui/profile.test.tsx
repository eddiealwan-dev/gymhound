import { router } from 'expo-router';
import { Image, Platform, StyleSheet, Text, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import EditProfile, { eraseBody, NO_ACCOUNT, PHOTO_PHONE_ONLY } from '../../app/(tabs)/profile/edit';
import Profile from '../../app/(tabs)/profile/index';
import { logQuickAdd } from '../db/repositories/foodLogRepo';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { workouts } from '../db/schema';
import { eraseFiles } from '../platform/eraseFiles';
import { deleteProfilePhotoFile, pickProfilePhoto, saveProfilePhoto } from '../platform/profilePhotoFile';
import { setLeaveGuard } from '../state/leaveGuard';
import { Button } from './Button';
import { Header } from './Header';
import { ConfirmSheet, Sheet } from './Sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockPro = false;
let mockPath = '/';
const mockOpenPaywall = jest.fn();
/** The phone's text size; normal unless a test makes it large. */
let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) },
  usePathname: () => mockPath,
  useFocusEffect: () => undefined,
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US', measurementSystem: 'us' }] }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
jest.mock('../platform/locale', () => ({ deviceLocale: () => 'en-US', deviceRegion: () => 'US' }));
jest.mock('../platform/entitlements', () => ({ useIsPro: () => mockPro }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => mockOpenPaywall }));
jest.mock('../platform/eraseFiles', () => ({ eraseFiles: jest.fn(() => Promise.resolve()) }));
jest.mock('../platform/restTimer', () => ({ getRestTimerSurface: () => ({ cancel: () => Promise.resolve() }) }));
jest.mock('../platform/profilePhotoFile', () => ({
  pickProfilePhoto: jest.fn(),
  saveProfilePhoto: jest.fn(),
  deleteProfilePhotoFile: jest.fn(),
  profilePhotoExists: () => true,
  profilePhotoUri: (name: string) => `file:///docs/profile/${name}`,
}));
jest.mock('./Sheet', () => {
  const actual = jest.requireActual('./Sheet');
  // The photo picker opens once the sheet has gone: at once here.
  return { ...actual, afterSheetCloses: (go: () => void) => go() };
});
jest.mock('./HoundMark', () => ({ HoundMark: () => null }));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
const byLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = (tree: ReactTestRenderer, label: string) => act(() => byLabel(tree, label).props.onPress());
const button = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).find((b) => b.props.label === label || b.props.accessibilityLabel === label);
const openSheet = (tree: ReactTestRenderer) => tree.root.findAllByType(Sheet).find((s) => s.props.visible);
const widgetIds = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.type === 'string' && /^widget-/.test(n.props.testID ?? '')).map((n) => n.props.testID);

function finishedOn(db: Db, localDate: string, n = 1) {
  for (let i = 0; i < n; i++) {
    const at = new Date(`${localDate}T09:00:00`).getTime() + i;
    db.insert(workouts).values({ id: `w-${localDate}-${i}`, name: 'Full body', status: 'finished', startedAt: at, finishedAt: at + 3_600_000, localDate }).run();
  }
}

beforeEach(() => {
  mockDb = seededDb();
  mockPro = false;
  mockPath = '/';
  mockFontScale = 1;
  jest.useFakeTimers({ now: new Date('2026-10-13T12:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('the header opens the Profile (R566)', () => {
  it('from a Profile button left of Settings, which asks a guarding screen first, and is Close on the Profile', () => {
    const tree = mount(<Header />);
    // Drawn in this order: every node, a parent before its children.
    const buttons = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
    expect([...new Set(buttons.map((n) => n.props.accessibilityLabel))]).toEqual(['Profile', 'Settings']);

    const held: (() => void)[] = [];
    const remove = setLeaveGuard((leave) => {
      held.push(leave);
      return true;
    });
    press(tree, 'Profile');
    expect(router.push).not.toHaveBeenCalled();
    act(() => held[0]());
    expect(router.push).toHaveBeenCalledWith('/profile');
    remove();

    mockPath = '/profile/edit';
    const onProfile = mount(<Header />);
    press(onProfile, 'Close profile');
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the photo once there is one, else the initials, else the person glyph', () => {
    expect(mount(<Header />).root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'profile-photo-standin')).toHaveLength(1);
    setSetting(mockDb, 'profileName', 'Eddie Alwan');
    expect(texts(mount(<Header />))).toContain('EA');
    setSetting(mockDb, 'profilePhoto', 'profile-1.jpg');
    const photo = mount(<Header />).root.findByType(Image);
    expect(photo.props.source).toEqual({ uri: 'file:///docs/profile/profile-1.jpg' });
  });
});

describe('the Profile (R566, R567)', () => {
  it('a card with the photo, name, finished workouts and goal opens Edit profile', () => {
    finishedOn(mockDb, '2026-10-12', 2);
    setSetting(mockDb, 'profileName', 'Eddie');
    setSetting(mockDb, 'profileGoal', 'Bench 225 for reps');
    const tree = mount(<Profile />);
    expect(texts(tree)).toEqual(expect.arrayContaining(['Profile', 'Eddie', '2 workouts', 'Bench 225 for reps', 'Dashboard']));
    press(tree, 'Edit profile. Eddie. 2 workouts. Goal: Bench 225 for reps');
    expect(router.push).toHaveBeenCalledWith('/profile/edit');
  });

  it('with no name asks for one', () => {
    expect(texts(mount(<Profile />))).toEqual(expect.arrayContaining(['Add your name and a goal', '0 workouts']));
  });

  it('starts with Workouts per week and Daily macros; + Widget adds what is left, marked Pro where it is', () => {
    const tree = mount(<Profile />);
    expect(widgetIds(tree)).toEqual(['widget-workouts_per_week', 'widget-daily_macros']);
    act(() => button(tree, 'Add a widget')!.props.onPress());
    const choice = (label: RegExp) => openSheet(tree)!.findAll((n) => typeof n.type !== 'string' && typeof n.props.onPress === 'function' && label.test(n.props.accessibilityLabel ?? ''));
    expect(choice(/^Body weight\. Your latest weigh-in/).length).toBeGreaterThan(0);
    act(() => choice(/^Body weight\./)[0].props.onPress());
    expect(widgetIds(tree)).toEqual(['widget-workouts_per_week', 'widget-daily_macros', 'widget-body_weight']);
    expect(getSettings(mockDb).profileWidgets).toEqual(['workouts_per_week', 'daily_macros', 'body_weight']);
    // Nothing left to add: no + Widget.
    expect(button(tree, 'Add a widget')).toBeUndefined();

    press(tree, 'Options for Daily macros');
    act(() => button(tree, 'Remove from dashboard')!.props.onPress());
    act(() => button(tree, 'Add a widget')!.props.onPress());
    expect(choice(/^Daily macros, part of Pro\./).length).toBeGreaterThan(0);
  });

  it('⋯ moves a widget up or down, never past an end', () => {
    const tree = mount(<Profile />);
    press(tree, 'Options for Workouts per week');
    expect(button(tree, 'Move up')!.props.disabled).toBe(true);
    act(() => button(tree, 'Move down')!.props.onPress());
    expect(widgetIds(tree)).toEqual(['widget-daily_macros', 'widget-workouts_per_week']);
    press(tree, 'Options for Workouts per week');
    expect(button(tree, 'Move down')!.props.disabled).toBe(true);
  });

  it('Workouts per week: 8 weeks of bars, this week last, and a weekly goal set from ⋯', () => {
    finishedOn(mockDb, '2026-08-24');
    finishedOn(mockDb, '2026-10-05', 3);
    finishedOn(mockDb, '2026-10-12', 2);
    const tree = mount(<Profile />);
    const bars = tree.root.findAll((n) => typeof n.type === 'string' && /^week-bar-/.test(n.props.testID ?? ''));
    expect(bars.map((b) => b.props.testID)).toEqual([
      'week-bar-2026-08-24',
      'week-bar-2026-08-31',
      'week-bar-2026-09-07',
      'week-bar-2026-09-14',
      'week-bar-2026-09-21',
      'week-bar-2026-09-28',
      'week-bar-2026-10-05',
      'week-bar-2026-10-12',
    ]);
    const height = (b: ReactTestInstance) => StyleSheet.flatten(b.props.style).height;
    expect(bars.map(height)).toEqual([32, 2, 2, 2, 2, 2, 96, 64]);
    expect(texts(tree)).toEqual(expect.arrayContaining(['2 workouts this week', '8/24', '10/12']));
    expect(tree.root.findAllByProps({ testID: 'weekly-goal-line' })).toHaveLength(0);

    press(tree, 'Options for Workouts per week');
    act(() => button(tree, '4 workouts a week')!.props.onPress());
    expect(getSettings(mockDb).weeklyWorkoutGoal).toBe(4);
    expect(texts(tree)).toContain('2 of 4 this week');
    expect(tree.root.findAllByProps({ testID: 'weekly-goal-line' }).length).toBeGreaterThan(0);
    const chart = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'image')[0];
    expect(chart.props.accessibilityLabel).toMatch(/^Last 8 weeks: week of August 24, 1; .*week of October 12, 2\. Goal 4 a week\.$/);
    act(() => button(tree, 'No weekly goal')!.props.onPress());
    expect(getSettings(mockDb).weeklyWorkoutGoal).toBeNull();
  });

  it('Daily macros is Pro: free, it says so with See Pro', () => {
    const tree = mount(<Profile />);
    expect(texts(tree).some((t) => t.endsWith('Part of GymHound Pro.'))).toBe(true);
    act(() => button(tree, 'See Pro')!.props.onPress());
    expect(mockOpenPaywall).toHaveBeenCalled();
  });

  it("Daily macros with Pro: today's calories in a ring and the three macros, all on one line, amounts in small type", () => {
    mockPro = true;
    setSetting(mockDb, 'fuelTargets', { training: { kcal: 2600, protein: 180, carbs: 300, fat: 80 }, rest: { kcal: 2400, protein: 170, carbs: null, fat: null } });
    logQuickAdd(mockDb, 'Oats', { kcal: 1200, proteinG: 90, carbsG: 150, fatG: 20 }, '2026-10-13', Date.now());
    const tree = mount(<Profile />);
    const card = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'widget-daily_macros')[0];
    const item = (label: string) => card.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label)[0];
    // A rest day today: the rest-day target. Carbs and fat have none, so they are counted with no bar.
    const ring = item('Calories, 1,200 calories of 2,400 calories');
    const protein = item('Protein, 90 of 170 grams');
    const carbs = item('Carbs, 150 grams');
    const fat = item('Fat, 20 grams');
    for (const x of [ring, protein, carbs, fat]) expect(x).toBeDefined();
    // All four share one row (the owner's Round 13 note): the innermost box that holds them all lays them out in a row.
    const holdsAll = (items: ReactTestInstance[]) => (n: ReactTestInstance) => typeof n.type === 'string' && items.every((m) => n.findAll((x) => x === m).length > 0);
    const rowOf = (root: ReactTestInstance, items: ReactTestInstance[]) => {
      const all = root.findAll(holdsAll(items));
      return all[all.length - 1];
    };
    expect(StyleSheet.flatten(rowOf(card, [ring, protein, carbs, fat]).props.style)).toMatchObject({ flexDirection: 'row' });
    expect(texts(tree)).toEqual(expect.arrayContaining(['1,200', 'of 2,400', 'Protein', '90 / 170 g', 'Carbs', '150 g', 'Fat', '20 g']));
    // Small type that grows only some: they share a row.
    const amount = card.findAll((n) => n.type === Text && n.props.children === '90 / 170 g')[0];
    expect(StyleSheet.flatten(amount.props.style).fontSize).toBe(12);
    expect(amount.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.6);
    expect(card.findAll((n) => n.props.testID === 'widget-macro-protein')).not.toHaveLength(0);
    // The ring's track shows on the card even with nothing eaten (Round 14).
    expect(card.findAll((n) => n.props.testID === 'kcal-ring-track')[0].props.stroke).toBe('#736c60');
    expect(card.findAll((n) => n.props.testID === 'widget-macro-carbs')).toHaveLength(0);

    // At large text the ring has its own line and each macro the card's width.
    mockFontScale = 2;
    const large = mount(<Profile />);
    const largeCard = large.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'widget-daily_macros')[0];
    const largeItem = (label: string) => largeCard.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel === label)[0];
    const largeItems = ['Calories, 1,200 calories of 2,400 calories', 'Protein, 90 of 170 grams', 'Carbs, 150 grams', 'Fat, 20 grams'].map(largeItem);
    expect(StyleSheet.flatten(rowOf(largeCard, largeItems).props.style)).toMatchObject({ flexDirection: 'column' });

    mockFontScale = 1;
    setSetting(mockDb, 'fuelTargets', null);
    const none = mount(<Profile />);
    expect(texts(none)).toEqual(expect.arrayContaining(['Today: 1,200 kcal · 90 g protein', 'No targets yet.']));
    act(() => button(none, 'Set targets')!.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/fuel-targets');
  });

  it('Body weight: none yet offers Log weight', () => {
    setSetting(mockDb, 'profileWidgets', ['body_weight']);
    const tree = mount(<Profile />);
    expect(texts(tree)).toContain('No weigh-ins yet.');
    act(() => button(tree, 'Log weight')!.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/body/bodyweight');
  });
});

describe('Edit profile (R566, R568)', () => {
  const field = (tree: ReactTestRenderer, label: string) => tree.root.findAll((n) => n.type === TextInput && n.props.accessibilityLabel === label)[0];

  it('keeps the name and goal as typed, tidied when the field is left', () => {
    const tree = mount(<EditProfile />);
    act(() => field(tree, 'Name (optional)').props.onChangeText('  Eddie   Alwan '));
    expect(getSettings(mockDb).profileName).toBe('  Eddie   Alwan ');
    act(() => field(tree, 'Name (optional)').props.onBlur());
    expect(getSettings(mockDb).profileName).toBe('Eddie Alwan');
    expect(field(tree, 'Name (optional)').props.value).toBe('Eddie Alwan');
    expect(field(tree, 'Name (optional)').props.maxLength).toBe(40);

    act(() => field(tree, 'Goal (optional)').props.onChangeText('Bench 225\nby spring '));
    // Leaving the screen with the field open settles it too.
    act(() => tree.unmount());
    expect(getSettings(mockDb).profileGoal).toBe('Bench 225 by spring');
  });

  it('Change takes or chooses a photo and keeps it by name; Remove deletes it', async () => {
    jest.mocked(pickProfilePhoto).mockResolvedValue({ status: 'picked', uri: 'file:///tmp/x.jpg' });
    jest.mocked(saveProfilePhoto).mockReturnValue('profile-2.jpg');
    setSetting(mockDb, 'profilePhoto', 'profile-1.jpg');
    const tree = mount(<EditProfile />);
    act(() => button(tree, 'Change the profile photo')!.props.onPress());
    await act(async () => button(tree, 'Choose a photo')!.props.onPress());
    expect(pickProfilePhoto).toHaveBeenCalledWith('library');
    expect(getSettings(mockDb).profilePhoto).toBe('profile-2.jpg');
    // The photo it replaced goes.
    expect(deleteProfilePhotoFile).toHaveBeenCalledWith('profile-1.jpg');

    act(() => button(tree, 'Remove the profile photo')!.props.onPress());
    expect(getSettings(mockDb).profilePhoto).toBeNull();
    expect(deleteProfilePhotoFile).toHaveBeenCalledWith('profile-2.jpg');
    expect(button(tree, 'Remove the profile photo')).toBeUndefined();
    expect(button(tree, 'Add a profile photo')).toBeTruthy();
  });

  it('a refused camera says so and offers Settings', async () => {
    jest.mocked(pickProfilePhoto).mockResolvedValue({ status: 'denied' });
    const tree = mount(<EditProfile />);
    act(() => button(tree, 'Add a profile photo')!.props.onPress());
    await act(async () => button(tree, 'Take photo')!.props.onPress());
    expect(texts(tree)).toContain('Camera access is off. Turn it on in Settings to take a photo.');
  });

  it('on the web the photo is set in the phone app', () => {
    const os = Platform.OS;
    Platform.OS = 'web';
    try {
      const tree = mount(<EditProfile />);
      expect(texts(tree)).toContain(PHOTO_PHONE_ONLY);
      expect(button(tree, 'Add a profile photo')).toBeUndefined();
    } finally {
      Platform.OS = os;
    }
  });

  it('names the iCloud copy and Apple Health in Delete all data only where the build has them (R591)', () => {
    expect(eraseBody({ cloud: false, health: false })).toBe(
      "Every workout, routine and saved workout of your own, exercise of your own, body entry, photo, food and water entry, your profile and your settings are deleted from this phone, with GymHound's backups on the phone. This can't be undone. Pro stays with your Apple ID.",
    );
    const both = eraseBody({ cloud: true, health: true });
    expect(both).toContain("GymHound's backups on the phone and in iCloud.");
    expect(both).toContain(' Workouts already in Apple Health stay there. ');
  });

  it('says plainly that there is no account to sign in to', () => {
    expect(texts(mount(<EditProfile />))).toEqual(expect.arrayContaining(['Account', NO_ACCOUNT]));
  });

  it('Delete all data asks first, Cancel first; yes empties GymHound and lands on Train', () => {
    finishedOn(mockDb, '2026-10-12');
    setSetting(mockDb, 'profileName', 'Eddie');
    const tree = mount(<EditProfile />);
    act(() => button(tree, 'Delete all data')!.props.onPress());
    const ask = tree.root.findByType(ConfirmSheet);
    expect(ask.props).toMatchObject({ visible: true, title: 'Delete all data?', body: eraseBody({ cloud: false, health: false }), confirmLabel: 'Delete everything', primary: 'cancel' });
    act(() => ask.props.onCancel());
    expect(mockDb.select().from(workouts).all()).toHaveLength(1);

    act(() => button(tree, 'Delete all data')!.props.onPress());
    act(() => tree.root.findByType(ConfirmSheet).props.onConfirm());
    expect(mockDb.select().from(workouts).all()).toHaveLength(0);
    expect(getSettings(mockDb).profileName).toBe('');
    // The page stays mounted (a tab's page): its field follows, and leaving it writes no old name back.
    expect(field(tree, 'Name (optional)').props.value).toBe('');
    act(() => field(tree, 'Name (optional)').props.onBlur());
    act(() => tree.unmount());
    expect(getSettings(mockDb).profileName).toBe('');
    expect(eraseFiles).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
