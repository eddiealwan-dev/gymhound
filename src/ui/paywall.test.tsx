import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Linking, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import PaywallRoute from '../../app/paywall';
import { announce } from '../platform/announce';
import type { EntitlementsState } from '../platform/entitlements/useIsPro';
import type { PlanKind, PurchaseResult, RestoreResult, StorePlan } from '../platform/entitlements';
import { Button } from './Button';
import { Footer } from './Footer';
import { priceLine, ProPitch } from './pro/ProPitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** What the hooks report, and the store calls Unlock and Restore make. */
let mockState: EntitlementsState;
const mockPurchase = jest.fn<Promise<PurchaseResult>, [PlanKind]>();
const mockRestore = jest.fn<Promise<RestoreResult>, []>();
const mockRefreshOffer = jest.fn();

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: function Ionicons() { return null; } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/entitlements', () => ({
  useEntitlementsState: () => mockState,
  entitlementsFor: () => ({ purchase: mockPurchase, restore: mockRestore, refreshOffer: mockRefreshOffer }),
}));
jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const TITLE = 'GymHound Pro';
const ROUTINES = 'All nine programs';
const FUEL = 'Fuel: calories and protein, with training and rest day targets, and macro graphs';
const OWN = 'Routines of your own and saved workouts';
const FREE =
  'Everything else stays free: logging, history, Stats, four programs (Beginner full body, 5×5, Dumbbell full body and Mobility), the rest timer, plates, PRs, Something off, body measurements and water.';
const UNAVAILABLE = "Purchases aren't available in this build.";
const NOT_ANSWERING = "The store isn't answering. Try again later.";
const RENEWS = 'Renews automatically until you cancel in your App Store or Google Play account.';
const PENDING = "Waiting for approval. Pro comes on once it's approved.";
const WORKING = 'Working…';
const PURCHASE_FAILED = "Couldn't finish the purchase. Try again.";
const NONE_FOUND = 'No earlier purchase found.';
const RESTORE_FAILED = "Couldn't reach the store. Try again.";

const MONTHLY = { priceString: '$4.99', period: { count: 1, unit: 'month' as const } };
const START = 'Start your free trial';

/** The store's plans, at the owner's prices (R570). */
const PLANS: StorePlan[] = [
  { kind: 'yearly', priceString: '$29.99', price: 29.99, perMonthString: '$2.50', period: { count: 1, unit: 'year' }, freeTrialDays: 7 },
  { kind: 'monthly', priceString: '$4.99', price: 4.99, perMonthString: null, period: { count: 1, unit: 'month' }, freeTrialDays: 7 },
  { kind: 'lifetime', priceString: '$69.99', price: 69.99, perMonthString: null, period: null, freeTrialDays: null },
];
const MORE = 'More payment options';

function state(over: Partial<EntitlementsState> = {}): EntitlementsState {
  return { isPro: false, isDebugPro: false, canPurchase: true, canRestore: true, plans: PLANS, subscribed: false, kind: 'revenuecat', ...over };
}

const radios = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.type !== 'string' && n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function');

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Every string drawn on screen right now. */
function shownText(tree: ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((t) => [t.props.children].flat().join(''));
}

const buttons = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
const button = (tree: ReactTestRenderer, label: string) => {
  const found = buttons(tree, label);
  expect(found).toHaveLength(1);
  return found[0];
};

/** Presses a button and lets the store call it started settle. */
async function press(tree: ReactTestRenderer, label: string) {
  await act(async () => {
    button(tree, label).props.onPress();
  });
}

/** A promise the test resolves when it likes, to look at the pitch while a store call runs. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  mockState = state();
  mockRefreshOffer.mockClear();
  mockPurchase.mockReset();
  mockRestore.mockReset();
  jest.mocked(announce).mockClear();
  jest.mocked(router.back).mockClear();
});

describe('priceLine (§8.12, R157)', () => {
  it('says the store price for one period as "a {unit}", and for several as "every {n} {units}"', () => {
    expect(priceLine(MONTHLY)).toBe('$4.99 a month');
    expect(priceLine({ priceString: '$1.99', period: { count: 1, unit: 'week' } })).toBe('$1.99 a week');
    expect(priceLine({ priceString: '£29.99', period: { count: 1, unit: 'year' } })).toBe('£29.99 a year');
    expect(priceLine({ priceString: '$0.99', period: { count: 1, unit: 'day' } })).toBe('$0.99 a day');
    expect(priceLine({ priceString: '$14.99', period: { count: 3, unit: 'month' } })).toBe('$14.99 every 3 months');
    expect(priceLine({ priceString: '$9.99', period: { count: 2, unit: 'week' } })).toBe('$9.99 every 2 weeks');
  });

  it('says "{price} once" for a one-time unlock (R159), and nothing with no offer', () => {
    expect(priceLine({ priceString: '$24.99', period: null })).toBe('$24.99 once');
    expect(priceLine(null)).toBeNull();
  });
});

describe('ProPitch (§8.12, R137)', () => {
  it('shows the title, the three Pro lines each with a check, the free list, Start your free trial, Restore purchases and Not now', () => {
    const tree = render(<ProPitch context="screen" onDone={() => {}} />);
    const shown = shownText(tree);

    expect(shown).toEqual(expect.arrayContaining([TITLE, ROUTINES, OWN, FUEL, FREE]));
    const checks = tree.root.findAllByType(Ionicons).filter((icon) => icon.props.name === 'checkmark');
    expect(checks).toHaveLength(3);
    for (const check of checks) {
      expect(check.props).toMatchObject({ name: 'checkmark', size: 20, color: '#f1ece2' });
    }
    expect(button(tree, START).props.variant ?? 'primary').toBe('primary');
    expect(button(tree, 'Restore purchases').props.variant).toBe('secondary');
    expect(button(tree, 'Not now').props.variant).toBe('secondary');
  });

  it('reads the title as a heading', () => {
    const tree = render(<ProPitch context="screen" />);
    const title = tree.root.findAllByType(Text).find((t) => t.props.children === TITLE);
    expect(title?.props.accessibilityRole).toBe('header');
  });

  it('in the Fuel tab has no Not now', () => {
    const tree = render(<ProPitch context="tab" />);
    expect(buttons(tree, 'Not now')).toHaveLength(0);
    expect(button(tree, START)).toBeTruthy();
  });

  it('offers Yearly and Monthly as radio buttons, Yearly chosen and marked with its saving, Lifetime under More payment options (R570)', () => {
    const tree = render(<ProPitch context="screen" />);
    expect(radios(tree).map((r) => [r.props.accessibilityLabel, r.props.accessibilityState.checked])).toEqual([
      ['Yearly, Save 50%, $2.50/mo, $29.99 billed yearly, 7 days free', true],
      ['Monthly, $4.99/mo, Billed monthly, 7 days free', false],
    ]);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Save 50%', '$2.50/mo', '$29.99 billed yearly', '$4.99/mo', MORE]));
    expect(shownText(tree)).not.toContain('$69.99');
    act(() => button(tree, MORE).props.onPress());
    expect(radios(tree).map((r) => r.props.accessibilityLabel)).toEqual([
      'Yearly, Save 50%, $2.50/mo, $29.99 billed yearly, 7 days free',
      'Monthly, $4.99/mo, Billed monthly, 7 days free',
      'Lifetime, $69.99, One-time payment',
    ]);
    expect(shownText(tree)).not.toContain(MORE);
    expect(shownText(tree)).not.toContain(UNAVAILABLE);
    expect(button(tree, START).props.disabled).toBeFalsy();
    expect(button(tree, 'Restore purchases').props.disabled).toBeFalsy();
  });

  it('says what the free trial leads to, and that a subscription renews until cancelled (R159)', () => {
    const tree = render(<ProPitch context="screen" />);
    const shown = shownText(tree);
    const terms = "7 days free, then $29.99 a year. Cancel before the trial ends and you won't be charged.";
    expect(shown).toContain(terms);
    expect(shown).toContain(RENEWS);
    expect(shown.indexOf(RENEWS)).toBeGreaterThan(shown.indexOf(terms));
  });

  it('choosing a plan changes the button and its terms, and buys that plan', async () => {
    mockPurchase.mockResolvedValue('cancelled');
    const tree = render(<ProPitch context="screen" />);
    act(() => radios(tree)[1].props.onPress());
    expect(shownText(tree)).toContain("7 days free, then $4.99 a month. Cancel before the trial ends and you won't be charged.");
    await press(tree, START);
    expect(mockPurchase).toHaveBeenLastCalledWith('monthly');

    act(() => button(tree, MORE).props.onPress());
    act(() => radios(tree)[2].props.onPress());
    expect(radios(tree)[2].props.accessibilityState.checked).toBe(true);
    expect(shownText(tree)).toContain('$69.99 once. Pro is yours to keep.');
    expect(shownText(tree)).not.toContain(RENEWS);
    await press(tree, 'Buy lifetime');
    expect(mockPurchase).toHaveBeenLastCalledWith('lifetime');
  });

  it('shows Lifetime without More payment options when the store sells nothing else', () => {
    mockState = state({ plans: [PLANS[2]] });
    const tree = render(<ProPitch context="screen" />);
    expect(radios(tree).map((r) => r.props.accessibilityLabel)).toEqual(['Lifetime, $69.99, One-time payment']);
    expect(shownText(tree)).not.toContain(MORE);
    expect(button(tree, 'Buy lifetime')).toBeTruthy();
  });

  it('a subscription with no free trial says Subscribe, with its price', () => {
    mockState = state({ plans: [{ ...PLANS[1], freeTrialDays: null }] });
    const tree = render(<ProPitch context="screen" />);
    expect(button(tree, 'Subscribe')).toBeTruthy();
    expect(shownText(tree)).toContain('$4.99 a month.');
    expect(shownText(tree)).not.toContain('Save 50%');
  });

  it('asks the store for its offer again when it opens', () => {
    render(<ProPitch context="screen" />);
    expect(mockRefreshOffer).toHaveBeenCalledTimes(1);
  });

  it('with a store that has nothing to sell yet, disables Unlock only and says the store is not answering', () => {
    mockState = state({ canPurchase: false, plans: [] });
    const tree = render(<ProPitch context="screen" />);

    expect(radios(tree)).toHaveLength(0);
    expect(button(tree, 'Unlock').props.disabled).toBe(true);
    expect(button(tree, 'Restore purchases').props.disabled).toBeFalsy();
    expect(shownText(tree)).toContain(NOT_ANSWERING);
    expect(shownText(tree)).not.toContain(UNAVAILABLE);
    expect(shownText(tree)).not.toContain(RENEWS);
  });

  describe('Terms and Privacy (R159)', () => {
    const saved = { terms: process.env.EXPO_PUBLIC_TERMS_URL, privacy: process.env.EXPO_PUBLIC_PRIVACY_URL };
    afterEach(() => {
      for (const [key, value] of [['EXPO_PUBLIC_TERMS_URL', saved.terms], ['EXPO_PUBLIC_PRIVACY_URL', saved.privacy]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    const links = (tree: ReactTestRenderer) =>
      tree.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function');

    it('shows no links until the build sets them', () => {
      delete process.env.EXPO_PUBLIC_TERMS_URL;
      delete process.env.EXPO_PUBLIC_PRIVACY_URL;
      const tree = render(<ProPitch context="screen" />);
      expect(links(tree)).toHaveLength(0);
    });

    it('opens each link the build sets', () => {
      process.env.EXPO_PUBLIC_TERMS_URL = 'https://example.com/terms';
      process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://example.com/privacy';
      const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const tree = render(<ProPitch context="tab" />);
      const found = links(tree);
      expect(found.map((l) => l.props.accessibilityLabel)).toEqual(['Terms of use', 'Privacy policy']);
      act(() => found[0].props.onPress());
      act(() => found[1].props.onPress());
      expect(open.mock.calls).toEqual([['https://example.com/terms'], ['https://example.com/privacy']]);
      open.mockRestore();
    });

    it('shows only the one that is set', () => {
      delete process.env.EXPO_PUBLIC_TERMS_URL;
      process.env.EXPO_PUBLIC_PRIVACY_URL = 'https://example.com/privacy';
      const tree = render(<ProPitch context="screen" />);
      expect(links(tree).map((l) => l.props.accessibilityLabel)).toEqual(['Privacy policy']);
    });
  });

  it('with no store (Expo Go, the debug unlock, free) shows the planned prices, and disables buying and Restore under one line', () => {
    mockState = state({ kind: 'debug', canPurchase: false, canRestore: false, plans: [] });
    const tree = render(<ProPitch context="screen" onDone={() => {}} />);

    expect(radios(tree)).toHaveLength(2);
    expect(shownText(tree)).toEqual(expect.arrayContaining(['Save 50%', '$2.50/mo', '$4.99/mo', MORE]));
    expect(button(tree, START).props.disabled).toBe(true);
    expect(button(tree, 'Restore purchases').props.disabled).toBe(true);
    expect(shownText(tree).filter((line) => line === UNAVAILABLE)).toHaveLength(1);
    expect(button(tree, 'Not now').props.disabled).toBeFalsy();
  });

  it('Not now calls onDone', () => {
    const onDone = jest.fn();
    const tree = render(<ProPitch context="screen" onDone={onDone} />);
    act(() => button(tree, 'Not now').props.onPress());
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('Unlock disables both buttons while the store works, then a purchase calls onDone and says Pro is on', async () => {
    const onDone = jest.fn();
    const pending = deferred<PurchaseResult>();
    mockPurchase.mockReturnValue(pending.promise);
    const tree = render(<ProPitch context="screen" onDone={onDone} />);

    await press(tree, START);
    expect(mockPurchase).toHaveBeenCalledWith('yearly');
    expect(button(tree, START).props.disabled).toBe(true);
    expect(button(tree, 'Restore purchases').props.disabled).toBe(true);
    expect(shownText(tree)).toContain(WORKING);
    expect(announce).toHaveBeenCalledWith(WORKING);
    expect(onDone).not.toHaveBeenCalled();

    await act(async () => pending.resolve('purchased'));
    expect(shownText(tree)).not.toContain(WORKING);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Pro is on.');
  });

  it('a cancelled purchase says nothing and gives the buttons back', async () => {
    const onDone = jest.fn();
    mockPurchase.mockResolvedValue('cancelled');
    const tree = render(<ProPitch context="screen" onDone={onDone} />);

    await press(tree, START);

    expect(onDone).not.toHaveBeenCalled();
    expect(shownText(tree)).not.toContain(PURCHASE_FAILED);
    expect(shownText(tree)).not.toContain(WORKING);
    expect(jest.mocked(announce).mock.calls).toEqual([[WORKING]]);
    expect(button(tree, START).props.disabled).toBeFalsy();
    expect(button(tree, 'Restore purchases').props.disabled).toBeFalsy();
  });

  it('a failed purchase says so, announced', async () => {
    mockPurchase.mockResolvedValue('failed');
    const tree = render(<ProPitch context="screen" />);

    await press(tree, START);

    expect(shownText(tree)).toContain(PURCHASE_FAILED);
    expect(announce).toHaveBeenCalledWith(PURCHASE_FAILED);
    expect(button(tree, START).props.disabled).toBeFalsy();
  });

  it('a purchase the store could not offer says the store is not answering', async () => {
    mockPurchase.mockResolvedValue('unavailable');
    const tree = render(<ProPitch context="screen" />);
    await press(tree, START);
    expect(shownText(tree)).toContain(NOT_ANSWERING);
    expect(announce).toHaveBeenCalledWith(NOT_ANSWERING);
  });

  it('a payment waiting for approval says so, announced, and stays on the pitch', async () => {
    const onDone = jest.fn();
    mockPurchase.mockResolvedValue('pending');
    const tree = render(<ProPitch context="screen" onDone={onDone} />);
    await press(tree, START);
    expect(shownText(tree)).toContain(PENDING);
    expect(announce).toHaveBeenLastCalledWith(PENDING);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('a purchase call that throws counts as failed', async () => {
    mockPurchase.mockRejectedValue(new Error('boom'));
    const tree = render(<ProPitch context="screen" />);
    await press(tree, START);
    expect(shownText(tree)).toContain(PURCHASE_FAILED);
  });

  it('Restore purchases: restored calls onDone; none and failed say so, announced', async () => {
    const onDone = jest.fn();
    const tree = render(<ProPitch context="tab" onDone={onDone} />);

    mockRestore.mockResolvedValueOnce('none');
    await press(tree, 'Restore purchases');
    expect(shownText(tree)).toContain(NONE_FOUND);
    expect(announce).toHaveBeenLastCalledWith(NONE_FOUND);

    mockRestore.mockResolvedValueOnce('failed');
    await press(tree, 'Restore purchases');
    expect(shownText(tree)).toContain(RESTORE_FAILED);
    expect(shownText(tree)).not.toContain(NONE_FOUND);
    expect(announce).toHaveBeenLastCalledWith(RESTORE_FAILED);

    mockRestore.mockResolvedValueOnce('restored');
    await press(tree, 'Restore purchases');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(shownText(tree)).not.toContain(RESTORE_FAILED);
    expect(announce).toHaveBeenLastCalledWith('Pro is on.');
  });

  it('Restore disables both buttons while it runs', async () => {
    const pending = deferred<RestoreResult>();
    mockRestore.mockReturnValue(pending.promise);
    const tree = render(<ProPitch context="screen" />);

    await press(tree, 'Restore purchases');
    expect(button(tree, START).props.disabled).toBe(true);
    expect(button(tree, 'Restore purchases').props.disabled).toBe(true);
    await act(async () => pending.resolve('none'));
    expect(button(tree, 'Restore purchases').props.disabled).toBeFalsy();
  });

  it('draws nothing in red (red is for the wordmark, the active tab and PR marks)', () => {
    const tree = render(<ProPitch context="screen" onDone={() => {}} />);
    const styles = tree.root.findAll((n) => n.props.style !== undefined).map((n) => JSON.stringify(StyleSheet.flatten(n.props.style)));
    expect(styles.join(' ').toUpperCase()).not.toContain('#E10600');
  });
});

describe('/paywall (§8.12, R154)', () => {
  it('shows the pitch with Not now, which goes back; no footer', () => {
    const tree = render(<PaywallRoute />);

    expect(shownText(tree)).toEqual(expect.arrayContaining([TITLE, ROUTINES, OWN, FUEL, FREE]));
    expect(tree.root.findAllByType(Footer)).toHaveLength(0);
    act(() => button(tree, 'Not now').props.onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('goes back only once: a purchase that goes through after Not now does not leave a second screen', async () => {
    let finish!: (result: PurchaseResult) => void;
    mockPurchase.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const tree = render(<PaywallRoute />);

    await press(tree, START);
    act(() => button(tree, 'Not now').props.onPress());
    act(() => button(tree, 'Not now').props.onPress());
    await act(async () => finish('purchased'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('goes back once the purchase goes through', async () => {
    mockPurchase.mockResolvedValue('purchased');
    const tree = render(<PaywallRoute />);
    await press(tree, START);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('keeps clear of the notch and the home indicator, and is no wider than 512', () => {
    const tree = render(<PaywallRoute />);
    const flat = tree.root.findAll((n) => n.props.contentContainerStyle !== undefined || n.props.style !== undefined);
    const styles = flat.map((n) => JSON.stringify([StyleSheet.flatten(n.props.contentContainerStyle), StyleSheet.flatten(n.props.style)]));
    expect(styles.some((s) => s.includes('"paddingTop":47') && s.includes('"paddingBottom":34'))).toBe(true);
    expect(styles.some((s) => s.includes('"maxWidth":512'))).toBe(true);
  });

  it('already Pro on open: "Pro is on." and Done, which goes back', () => {
    mockState = state({ isPro: true });
    const tree = render(<PaywallRoute />);

    expect(shownText(tree)).toContain('Pro is on.');
    expect(buttons(tree, 'Unlock')).toHaveLength(0);
    act(() => button(tree, 'Done').props.onPress());
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
