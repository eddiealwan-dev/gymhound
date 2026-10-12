import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { getSettings, setSetting } from '../db/repositories/settingsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { TRIAL_ENDED_LINE, TRIAL_STARTED_LINE } from '../domain/trial';
import { createFreeOnlyEntitlements, withTrial } from '../platform/entitlements';
import type { TrialEntitlements } from '../platform/entitlements';
import { TrainTrialNotice, TrialChip, TrialPitchLine, TrialSettingsLine, TrialStartedNotice } from './pro/TrialLines';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockEntitlements: TrialEntitlements;
const mockOpenPaywall = jest.fn();

jest.mock('../platform/entitlements/select', () => {
  const actual = jest.requireActual('../platform/entitlements/select');
  return { ...actual, entitlementsFor: () => mockEntitlements };
});
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('./pro/openPaywall', () => ({ useOpenPaywall: () => mockOpenPaywall }));
jest.mock('../platform/locale', () => ({ deviceLocale: () => 'en-US' }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const DAY = 86_400_000;
const START = new Date(2026, 9, 12, 18, 40).getTime();
let now = START;

/** The app's entitlements over a store-less build, with the trial at `startedAt` (null: not started). */
function trialAt(startedAt: number | null, at: number) {
  setSetting(mockDb, 'trialStartedAt', startedAt);
  now = at;
  mockEntitlements = withTrial(mockDb, createFreeOnlyEntitlements(), () => now);
}

function render(element: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const shown = (tree: ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map((t) => t.props.children)
    .flat()
    .filter((c) => typeof c === 'string')
    .join(' | ');

beforeEach(() => {
  mockDb = seededDb();
  mockOpenPaywall.mockClear();
});

describe('the full access trial lines (§18.19)', () => {
  it('Settings counts the days, says nothing is charged, and offers See Pro (R485, R488)', () => {
    trialAt(START, START + 2 * DAY);
    const tree = render(<TrialSettingsLine />);
    expect(shown(tree)).toContain('Full access trial · 5 days left');
    expect(shown(tree)).toContain('Nothing is charged.');
    expect(shown(tree)).not.toMatch(/renew|charge you|billed/i);
    act(() => tree.root.findByProps({ label: 'See Pro' }).props.onPress());
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it('Settings and the chip say nothing before the trial or after it', () => {
    trialAt(null, START);
    expect(render(<TrialSettingsLine />).toJSON()).toBeNull();
    expect(render(<TrialChip />).toJSON()).toBeNull();
    trialAt(START, START + 8 * DAY);
    expect(render(<TrialSettingsLine />).toJSON()).toBeNull();
    expect(render(<TrialChip />).toJSON()).toBeNull();
  });

  it("Fuel's chip reads the days left, and in full for VoiceOver (R486)", () => {
    trialAt(START, START + DAY);
    const tree = render(<TrialChip />);
    expect(shown(tree)).toBe('Trial · 6 days left');
    expect(tree.root.findByProps({ accessible: true }).props.accessibilityLabel).toBe('Full access trial, 6 days left');
  });

  it('Train is quiet until the last two days, then says when it ends and what locks (R487)', () => {
    trialAt(START, START + 3 * DAY);
    expect(render(<TrainTrialNotice />).toJSON()).toBeNull();
    trialAt(START, START + 6 * DAY);
    expect(shown(render(<TrainTrialNotice />))).toContain('Your full access trial ends tomorrow.');
    trialAt(START, START + 7 * DAY - 3_600_000);
    expect(shown(render(<TrainTrialNotice />))).toContain('Your full access trial ends today at 6:40');
  });

  it('Train says once that the trial has ended, answered for good by either button (R490)', () => {
    trialAt(START, START + 8 * DAY);
    const tree = render(<TrainTrialNotice />);
    expect(shown(tree)).toContain(TRIAL_ENDED_LINE);
    act(() => tree.root.findByProps({ label: 'Not now' }).props.onPress());
    expect(getSettings(mockDb).trialEndedSeen).toBe(true);
    expect(render(<TrainTrialNotice />).toJSON()).toBeNull();
  });

  it("See Pro on the ended line opens the paywall and answers it", () => {
    trialAt(START, START + 8 * DAY);
    const tree = render(<TrainTrialNotice />);
    act(() => tree.root.findByProps({ label: 'See Pro' }).props.onPress());
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
    expect(getSettings(mockDb).trialEndedSeen).toBe(true);
  });

  it('the finish that started the trial says so, and no other finish does (R486)', () => {
    setSetting(mockDb, 'trialStartWorkoutId', 'w1');
    trialAt(START, START + 60_000);
    const tree = render(<TrialStartedNotice workoutId="w1" />);
    expect(shown(tree)).toContain(TRIAL_STARTED_LINE);
    act(() => tree.root.findByProps({ label: "See what's included" }).props.onPress());
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
    expect(render(<TrialStartedNotice workoutId="w2" />).toJSON()).toBeNull();
  });

  it('the Pro pitch says where the trial stands (R489)', () => {
    trialAt(null, START);
    expect(shown(render(<TrialPitchLine />))).toBe('Your next finished workout starts a 7-day full access trial. Nothing to set up.');
    trialAt(START, START + 2 * DAY);
    expect(shown(render(<TrialPitchLine />))).toBe('5 days left in your full access trial');
    trialAt(START, START + 8 * DAY);
    expect(shown(render(<TrialPitchLine />))).toBe('Your full access trial has ended.');
  });
});
