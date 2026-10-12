import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Image, Platform, Text, TextInput } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import FinishSummaryScreen from '../../app/finish/[id]';
import { hasDoneSets, savedWorkoutOf, saveWorkoutAs } from '../db/repositories/savedWorkoutsRepo';
import { announce } from '../platform/announce';
import type { FinishSummary } from '../db/repositories/workoutViewsRepo';
import type { PrHighlight } from '../domain/prs';
import { bumpData } from '../state/dataVersion';
import { Button } from './Button';
import { PbCard } from './finish/PbCard';
import { PB_READY_TIMEOUT_MS } from './finish/PbCardHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRead: { summary: FinishSummary | null; unit: 'lb' | 'kg'; firstWorkout?: boolean };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'w1' }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead, bumpData: jest.fn() }));
jest.mock('../db/DbProvider', () => ({ useDb: () => 'db' }));
/** Saving a workout is Pro (§18.21, R522): Pro by default here; the free gate has its own test. */
let mockPro = true;
jest.mock('../platform/entitlements', () => ({
  ...jest.requireActual('../platform/entitlements'),
  entitlementsFor: () => ({ isPro: () => mockPro }),
  useIsPro: () => mockPro,
}));
jest.mock('../db/repositories/savedWorkoutsRepo', () => ({ savedWorkoutOf: jest.fn(() => null), saveWorkoutAs: jest.fn(), hasDoneSets: jest.fn(() => true) }));
jest.mock('../platform/announce', () => ({ ...jest.requireActual('../platform/announce'), announce: jest.fn() }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getFinishSummary: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///cache/ReactNative-snapshot-image1.png'), releaseCapture: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
let mockScheme: 'light' | 'dark' = 'dark';
jest.mock('./ThemeProvider', () => {
  const dark = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  const light = { bg: '#f6f3ec', surface: '#ffffff', surfaceRaised: '#efebe3', border: '#ddd7cb', text: '#15130f', textMuted: '#6b665c', red: '#E10600', textFaint: '#8f897d', borderStrong: '#8a8478' };
  return { useTheme: () => ({ scheme: mockScheme, colors: mockScheme === 'dark' ? dark : light }) };
});

/** Push A, an hour long, with three sets logged and `next` as the rule left it. */
const pushA = (next: FinishSummary['next'], prs: PrHighlight[] = []): FinishSummary => ({
  id: 'w1',
  name: 'Push A',
  durationMs: 3_600_000,
  volume: 4320,
  setCount: 3,
  next,
  prs,
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<FinishSummaryScreen />);
  });
  return tree;
}

/** Mounts and lets the share check (`Sharing.isAvailableAsync`) settle. */
async function mountSettled(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
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
        { workoutExerciseId: 'we1', name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
        { workoutExerciseId: 'we2', name: 'Overhead press', loggingType: 'weighted', outcome: 'held_marked', nextWeight: 95, nextUnit: 'lb', mark: 'pain' },
        { workoutExerciseId: 'we3', name: 'Incline dumbbell press', loggingType: 'weighted', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
        { workoutExerciseId: 'we4', name: 'Assisted pull-up', loggingType: 'assisted', outcome: 'raised', nextWeight: 30, nextUnit: 'lb', mark: null },
        { workoutExerciseId: 'we5', name: 'Triceps pushdown', loggingType: 'weighted', outcome: 'no_sets', nextWeight: 40, nextUnit: 'lb', mark: null },
      ]),
    };
    const text = shownText(mount());

    const lines = [
      'Barbell bench press — next time 140 lb ↑',
      'Overhead press — holds at 95 lb · Pain',
      'Incline dumbbell press — holds at 50 lb',
      'Assisted pull-up — next time 30 lb ↓',
      'Triceps pushdown — holds at 40 lb',
    ];
    const logged = text.indexOf('3 sets');
    expect(logged).toBeGreaterThan(-1);
    expect(text.slice(logged + 1)).toEqual([...lines, 'Save as a workout', 'Done']);
  });

  it('shows no next-time line when no exercise has a rule', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    const text = shownText(mount());

    expect(text.slice(text.indexOf('3 sets') + 1)).toEqual(['Save as a workout', 'Done']);
  });
});

/** A bench press personal record of `kind` at 185 lb. */
const benchPr = (kind: PrHighlight['kind'], reps = 5): PrHighlight => ({
  exerciseId: 'barbell-bench-press',
  name: 'Bench press',
  loggingType: 'weighted',
  kind,
  weight: 185,
  weightUnit: 'lb',
  reps,
  durationS: null,
  localDate: '2026-10-11',
});

const plankPr: PrHighlight = {
  exerciseId: 'plank',
  name: 'Plank',
  loggingType: 'timed',
  kind: 'longest_hold',
  weight: null,
  weightUnit: null,
  reps: null,
  durationS: 90,
  localDate: '2026-10-11',
};

describe('personal records on the finish summary (R104, R105)', () => {
  const next: FinishSummary['next'] = [
    { workoutExerciseId: 'we6', name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
  ];

  it('lists each personal record after the next-time lines, under "Personal records", each with a PR mark', async () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), benchPr('reps_at_weight', 8), plankPr]) };
    const text = shownText(await mountSettled());

    expect(text.slice(text.indexOf('Barbell bench press — next time 140 lb ↑') + 1)).toEqual([
      'Personal records',
      'PR',
      'Bench press — heaviest: 185 lb × 5',
      'Share',
      'PR',
      'Bench press — most reps at 185 lb: 8',
      'Share',
      'PR',
      'Plank — longest hold: 1:30',
      'Share',
      'Save as a workout',
      'Done',
    ]);
  });

  it('hides the section when there are none', async () => {
    mockRead = { unit: 'lb', summary: pushA(next) };
    const text = shownText(await mountSettled());

    expect(text).not.toContain('Personal records');
    expect(text).not.toContain('PR');
  });

  it('on the first finished workout, says when personal records start, under the heading and with no red (R405)', async () => {
    mockRead = { unit: 'lb', summary: pushA(next), firstWorkout: true };
    const tree = await mountSettled();
    const text = shownText(tree);

    const at = text.indexOf('Personal records');
    expect(text.slice(at, at + 2)).toEqual(['Personal records', "Personal records start with your next workout. Today's sets are the ones to beat."]);
    expect(text).not.toContain('PR');
    const colours = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => flatStyle(n.props.style).color);
    expect(colours).not.toContain('#E10600');
  });

  it('a later workout with no personal records still hides the section', async () => {
    mockRead = { unit: 'lb', summary: pushA(next), firstWorkout: false };
    expect(shownText(await mountSettled())).not.toContain('Personal records');
  });

  it('reads each row to VoiceOver as one sentence, and the heading as a heading', async () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), plankPr]) };
    const tree = await mountSettled();

    const rows = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessible === true && /^Personal record\./.test(n.props.accessibilityLabel ?? ''));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Personal record. Bench press — heaviest: 185 lb × 5',
      'Personal record. Plank — longest hold: 1:30',
    ]);
    const heading = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'Personal records');
    expect(heading[0].props.accessibilityRole).toBe('header');
  });

  it('marks PR in red, and lets the line wrap with the text size', async () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest')]) };
    const tree = await mountSettled();

    const flat = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
    const mark = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'PR')[0];
    expect(flat(mark.props.style)).toMatchObject({ color: '#E10600', fontSize: 14 });
    const line = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'Bench press — heaviest: 185 lb × 5')[0];
    expect(line.props.numberOfLines).toBeUndefined();
    expect(line.props.allowFontScaling).not.toBe(false);
    expect(flat(line.props.style)).toMatchObject({ flex: 1 });
  });
});

const flatStyle = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

describe('the personal record card (R106)', () => {
  afterEach(() => {
    mockScheme = 'dark';
  });

  function renderCard(highlight: PrHighlight, locale = 'en-GB'): ReactTestRenderer {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PbCard highlight={highlight} locale={locale} />);
    });
    return tree;
  }

  it('shows the lockup, the PR mark and PERSONAL RECORD, the exercise, the figure and its unit, the caption, the date and the footer (§18.17)', () => {
    const text = shownText(renderCard(benchPr('heaviest')));
    expect(text).toEqual(['GYMHOUND', 'PR', 'PERSONAL RECORD', 'Bench press', '185', 'lb × 5', 'Heaviest set', 'SUN 11 OCT 2026', 'GymHound · gym log']);
  });

  it('lays the date out for the locale, and keeps a value with no unit whole', () => {
    expect(shownText(renderCard(plankPr, 'en-US'))).toEqual(['GYMHOUND', 'PR', 'PERSONAL RECORD', 'Plank', '1:30', 'Longest hold', 'SUN OCT 11 2026', 'GymHound · gym log']);
  });

  it('adds how far it beat the best before when given it, and no session count (R445; R446 dropped after Round 8)', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <PbCard
          highlight={benchPr('heaviest')}
          locale="en-GB"
          model={{ name: 'Bench press', value: { main: '185', rest: 'lb × 5' }, caption: 'Heaviest set', comparison: 'Up 5 lb from 180 lb on 2 Oct.', date: 'SUN 11 OCT 2026', sessions: 12 }}
        />,
      );
    });
    const text = shownText(tree);
    expect(text).toContain('Up 5 lb from 180 lb on 2 Oct.');
    expect(text.join(' ')).not.toMatch(/SESSION/);
  });

  it('is 360 × 450, always dark, at a fixed text size, with red only on the wordmark and the PR mark', () => {
    mockScheme = 'light';
    const tree = renderCard(benchPr('reps_at_weight', 8));
    const root = tree.root.findAll((n) => typeof n.type === 'string' && n.props.collapsable === false)[0];
    expect(flatStyle(root.props.style)).toMatchObject({ width: 360, height: 450, backgroundColor: '#100f0c' });

    const texts = tree.root.findAll((n) => (n.type as unknown) === 'Text');
    for (const t of texts) expect(t.props.allowFontScaling).toBe(false);
    const styleOf = (label: string) => flatStyle(texts.find((t) => t.props.children === label)!.props.style);
    expect(styleOf('GYMHOUND').color).toBe('#E10600');
    expect(styleOf('PERSONAL RECORD').color).toBe('#E10600');
    expect(styleOf('Bench press').color).toBe('#f1ece2');
    expect(styleOf('8')).toMatchObject({ color: '#f1ece2', fontVariant: ['tabular-nums'] });
    const reds = texts.filter((t) => flatStyle(t.props.style).color === '#E10600').map((t) => t.props.children);
    expect(reds).toEqual(['GYMHOUND', 'PERSONAL RECORD']);

    const mark = tree.root.findByType(Image);
    expect(mark.props.source).toBe(require('../../assets/brand/mark-dark.png'));
  });
});

describe('sharing a personal record (R106)', () => {
  const next: FinishSummary['next'] = [];
  const originalOS = Platform.OS;
  const FAILED = "Couldn't make the image. Try again.";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(captureRef).mockReset().mockResolvedValue('file:///cache/ReactNative-snapshot-image1.png');
    jest.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), plankPr]) };
    Platform.OS = 'android'; // view-shot takes pixels here (iOS points: see sharePb.test.ts)
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  const shareButtons = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).filter((b) => b.props.label === 'Share');

  /** The hound mark on the card being drawn, if any. */
  const cardMark = (tree: ReactTestRenderer) => tree.root.findAllByType(Image).find((i) => i.props.source === require('../../assets/brand/mark-dark.png'));

  /** Lets the frame, the capture and the share sheet run. */
  const settle = (ms = 50) => act(async () => new Promise<void>((r) => setTimeout(r, ms)));

  /** Presses Share on row `i`. */
  const press = (tree: ReactTestRenderer, i: number) => act(async () => shareButtons(tree)[i].props.onPress());

  /** The card's hound mark finishes loading. */
  const markLoads = (tree: ReactTestRenderer) => act(async () => cardMark(tree)!.props.onLoad());

  /** Presses Share on row `i`, lets the card's mark load, and waits for the frame, the capture and the share sheet. */
  async function pressShare(tree: ReactTestRenderer, i: number): Promise<void> {
    await press(tree, i);
    await markLoads(tree);
    await settle();
  }

  it('gives each row a compact secondary Share pill that names the line to VoiceOver', async () => {
    const tree = await mountSettled();
    expect(shareButtons(tree).map((b) => [b.props.variant, b.props.size, b.props.accessibilityLabel])).toEqual([
      ['secondary', 'compact', 'Share Bench press — heaviest: 185 lb × 5'],
      ['secondary', 'compact', 'Share Plank — longest hold: 1:30'],
    ]);
  });

  it("draws that personal record's card, captures it as a 1080 × 1350 PNG and opens the share sheet, then removes the card", async () => {
    const tree = await mountSettled();
    expect(shownText(tree)).not.toContain('PERSONAL RECORD');
    let drawnAtCapture: string[] = [];
    jest.mocked(captureRef).mockImplementationOnce(async () => {
      drawnAtCapture = shownText(tree);
      return 'file:///cache/ReactNative-snapshot-image1.png';
    });

    await pressShare(tree, 1);

    expect(drawnAtCapture).toEqual(expect.arrayContaining(['PERSONAL RECORD', 'Plank', '1:30', 'Longest hold', 'SUN OCT 11 2026']));
    expect(drawnAtCapture.filter((t) => t === 'Bench press')).toEqual([]);
    expect(captureRef).toHaveBeenCalledWith(expect.objectContaining({ current: null }), {
      format: 'png',
      result: 'tmpfile',
      width: 1080,
      height: 1350,
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/ReactNative-snapshot-image1.png', {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Share a personal record',
    });
    expect(shownText(tree)).not.toContain('PERSONAL RECORD');
    expect(shownText(tree)).not.toContain(FAILED);
  });

  it('waits for the hound mark to load before capturing', async () => {
    const tree = await mountSettled();
    await press(tree, 0);
    await settle();

    expect(shownText(tree)).toContain('PERSONAL RECORD');
    expect(captureRef).not.toHaveBeenCalled();

    await markLoads(tree);
    await settle();
    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it('captures anyway when the mark fails to load', async () => {
    const tree = await mountSettled();
    await press(tree, 0);
    await act(async () => cardMark(tree)!.props.onError());
    await settle();

    expect(captureRef).toHaveBeenCalledTimes(1);
  });

  it('captures anyway when the mark never reports, after a short wait', async () => {
    const tree = await mountSettled();
    await press(tree, 0);
    await settle(PB_READY_TIMEOUT_MS - 300);
    expect(captureRef).not.toHaveBeenCalled();

    await settle(400);
    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it("draws the card at the screen's top left, under the scroll view, untouchable and out of VoiceOver, never faded", async () => {
    const tree = await mountSettled();
    await press(tree, 0);

    type Json = { type: string; props: Record<string, unknown>; children: (Json | string)[] | null };
    const root = tree.toJSON() as Json;
    const [holder, scroll] = root.children as Json[];
    expect(flatStyle(holder.props.style)).toMatchObject({ position: 'absolute', top: 0, left: 0 });
    expect(holder.props.pointerEvents).toBe('none');
    expect(holder.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(holder.props.accessibilityElementsHidden).toBe(true);
    // The scroll view comes after it, outside it, and paints over it.
    expect(scroll.type).toBe('RCTScrollView');
    expect(flatStyle(scroll.props.style).backgroundColor).toBe('#100f0c');

    // The card, and nothing between the screen and the card, is faded, so the capture isn't either.
    const pathToCard = (n: Json): Json[] | null => {
      if (n.props.collapsable === false && flatStyle(n.props.style).width === 360) return [n];
      for (const c of n.children ?? []) {
        if (typeof c === 'string') continue;
        const p = pathToCard(c);
        if (p) return [n, ...p];
      }
      return null;
    };
    const path = pathToCard(root)!;
    expect(path[1]).toBe(holder);
    for (const n of path) expect(flatStyle(n.props.style).opacity ?? 1).toBe(1);

    await markLoads(tree);
    await settle();
  });

  it("shows a muted line under the row when the image can't be made, and clears it on the next try", async () => {
    jest.mocked(captureRef).mockRejectedValueOnce(new Error('no view'));
    const tree = await mountSettled();

    await pressShare(tree, 0);

    const text = shownText(tree);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(text.slice(text.indexOf('Bench press — heaviest: 185 lb × 5'))).toEqual([
      'Bench press — heaviest: 185 lb × 5',
      'Share',
      FAILED,
      'PR',
      'Plank — longest hold: 1:30',
      'Share',
      'Save as a workout',
      'Done',
    ]);
    const failure = tree.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === FAILED)[0];
    expect(flatStyle(failure.props.style).color).toBe('#a39d90');
    expect(announce).toHaveBeenCalledWith(FAILED);

    await pressShare(tree, 0);
    expect(shownText(tree)).not.toContain(FAILED);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it('shows the same line when sharing has become unavailable by the tap', async () => {
    const tree = await mountSettled();
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);

    await pressShare(tree, 1);

    expect(captureRef).not.toHaveBeenCalled();
    const text = shownText(tree);
    expect(text.slice(text.indexOf('Plank — longest hold: 1:30'))).toEqual(['Plank — longest hold: 1:30', 'Share', FAILED, 'Save as a workout', 'Done']);
    expect(text).not.toContain('PERSONAL RECORD');
  });

  it('ignores a second tap while an image is being made', async () => {
    const tree = await mountSettled();
    await act(async () => {
      shareButtons(tree)[0].props.onPress();
      shareButtons(tree)[1].props.onPress();
    });
    await markLoads(tree);
    await settle();

    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it('has no Share pill when the phone cannot share', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    const tree = await mountSettled();

    expect(shareButtons(tree)).toHaveLength(0);
    expect(shownText(tree)).toContain('Bench press — heaviest: 185 lb × 5');
  });

  it('has no Share pill in the browser build', async () => {
    Platform.OS = 'web';
    const tree = await mountSettled();

    expect(shareButtons(tree)).toHaveLength(0);
    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  it('does not check sharing when there are no personal records', async () => {
    mockRead = { unit: 'lb', summary: pushA(next) };
    await mountSettled();

    expect(Sharing.isAvailableAsync).not.toHaveBeenCalled();
  });
});

describe('leaving the finish summary (R78)', () => {
  beforeEach(() => jest.clearAllMocks());

  /** Presses the button labelled `label`. */
  function pressButton(tree: ReactTestRenderer, label: string): void {
    const button = tree.root.findAllByType(Button).find((b) => b.props.label === label)!;
    act(() => button.props.onPress());
  }

  it('Done goes back to the Train screen already there, without stacking another', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    pressButton(mount(), 'Done');

    expect(router.dismissTo).toHaveBeenCalledTimes(1);
    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('Back to Train does the same when the workout is not there', () => {
    mockRead = { unit: 'lb', summary: null };
    pressButton(mount(), 'Back to Train');

    expect(router.dismissTo).toHaveBeenCalledWith('/');
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('Save as a workout on the finish summary (R118, R120)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRead = { unit: 'lb', summary: pushA([]) };
    jest.mocked(savedWorkoutOf).mockReturnValue(null);
    jest.mocked(saveWorkoutAs).mockReturnValue('saved-1');
    jest.mocked(hasDoneSets).mockReturnValue(true);
  });

  const buttonsLabelled = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  const pressButton = (tree: ReactTestRenderer, label: string) => act(() => buttonsLabelled(tree, label)[0].props.onPress());
  const nameField = (tree: ReactTestRenderer) => tree.root.findAllByType(TextInput).find((t) => t.props.accessibilityLabel === 'Workout name')!;

  it('free: Save as a workout says saved workouts are Pro and opens no sheet (§18.21, R522)', () => {
    mockPro = false;
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    expect(nameField(tree)).toBeUndefined();
    expect(JSON.stringify(tree.toJSON())).toContain('Saved workouts are part of GymHound Pro.');
    mockPro = true;
  });

  it('is a secondary button just above Done, with room between them', () => {
    const tree = mount();
    const [save] = buttonsLabelled(tree, 'Save as a workout');
    expect(save.props.variant).toBe('secondary');
    const text = shownText(tree);
    expect(text.slice(text.indexOf('Save as a workout') + 1)).toEqual(['Done']);
    const wrapper = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'save-as-workout')[0];
    expect(Object.assign({}, ...[wrapper.props.style].flat())).toMatchObject({ marginBottom: 16 });
  });

  it('opens a sheet with the name prefilled; Save saves it and the button becomes "Saved as Push A."', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    expect(shownText(tree)).toContain('Save as a workout');
    expect(nameField(tree).props.value).toBe('Push A');

    pressButton(tree, 'Save');

    expect(saveWorkoutAs).toHaveBeenCalledWith('db', 'w1', 'Push A', expect.any(Number));
    expect(bumpData).toHaveBeenCalled();
    const text = shownText(tree);
    expect(text).toContain('Saved as Push A.');
    expect(buttonsLabelled(tree, 'Save as a workout')).toEqual([]);
    expect(nameField(tree)).toBeUndefined();
  });

  it('saves the name as typed, trimmed', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    act(() => nameField(tree).props.onChangeText('  Chest day '));
    pressButton(tree, 'Save');

    expect(saveWorkoutAs).toHaveBeenCalledWith('db', 'w1', '  Chest day ', expect.any(Number));
    expect(shownText(tree)).toContain('Saved as Chest day.');
  });

  it('an invalid name shows the validation line and saves nothing', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    act(() => nameField(tree).props.onChangeText('   '));
    pressButton(tree, 'Save');

    expect(saveWorkoutAs).not.toHaveBeenCalled();
    expect(shownText(tree)).toContain('Give the workout a name.');
  });

  it('says what stopped the save when the repository refuses', () => {
    jest.mocked(saveWorkoutAs).mockImplementation(() => {
      throw new Error('Nothing logged to save.');
    });
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Save');

    expect(shownText(tree)).toContain('Nothing logged to save.');
    expect(shownText(tree)).not.toContain('Saved as Push A.');
  });

  it('Cancel closes the sheet and saves nothing', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Cancel');

    expect(nameField(tree)).toBeUndefined();
    expect(saveWorkoutAs).not.toHaveBeenCalled();
    expect(buttonsLabelled(tree, 'Save as a workout')).toHaveLength(1);
  });

  it('a workout started from a saved workout says it remembers today’s sets, with no button', () => {
    jest.mocked(savedWorkoutOf).mockReturnValue({ id: 's1', name: 'Push day' });
    const tree = mount();

    expect(savedWorkoutOf).toHaveBeenCalledWith('db', 'w1');
    const text = shownText(tree);
    expect(text).toContain("Push day remembers today's sets.");
    expect(text.slice(text.indexOf("Push day remembers today's sets.") + 1)).toEqual(['Done']);
    expect(buttonsLabelled(tree, 'Save as a workout')).toEqual([]);
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });
});

describe('Save as a workout: review round 1', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRead = { unit: 'lb', summary: pushA([]) };
    jest.mocked(savedWorkoutOf).mockReturnValue(null);
    jest.mocked(saveWorkoutAs).mockReturnValue('saved-1');
    jest.mocked(hasDoneSets).mockReturnValue(true);
  });

  const buttonsLabelled = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Button).filter((b) => b.props.label === label);
  const pressButton = (tree: ReactTestRenderer, label: string) => act(() => buttonsLabelled(tree, label)[0].props.onPress());

  it('is not offered when nothing was done', () => {
    jest.mocked(hasDoneSets).mockReturnValue(false);
    const tree = mount();
    expect(hasDoneSets).toHaveBeenCalledWith('db', 'w1');
    expect(buttonsLabelled(tree, 'Save as a workout')).toEqual([]);
  });

  it('an unexpected error says "Couldn\'t save. Try again." rather than the error itself', () => {
    jest.mocked(saveWorkoutAs).mockImplementation(() => {
      throw new Error('SQLITE_BUSY: database is locked');
    });
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Save');

    const text = shownText(tree);
    expect(text).toContain("Couldn't save. Try again.");
    expect(text.join(' ')).not.toContain('SQLITE');
    expect(announce).toHaveBeenCalledWith("Couldn't save. Try again.");
  });

  it('tells the screen reader "Saved as Push A."', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    pressButton(tree, 'Save');
    expect(announce).toHaveBeenCalledWith('Saved as Push A.');
  });

  it("does not announce that the saved workout remembers today's sets as the screen opens: it is a line read in order", () => {
    jest.mocked(savedWorkoutOf).mockReturnValue({ id: 's1', name: 'Push day' });
    const tree = mount();
    expect(announce).not.toHaveBeenCalledWith("Push day remembers today's sets.");
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === "Push day remembers today's sets.");
    expect(line).toHaveLength(1);
    expect(line[0].props.accessibilityLiveRegion).toBeUndefined();
  });

  it('a second tap on Save saves nothing more', () => {
    const tree = mount();
    pressButton(tree, 'Save as a workout');
    const [save] = buttonsLabelled(tree, 'Save');
    act(() => {
      save.props.onPress();
      save.props.onPress();
    });
    expect(saveWorkoutAs).toHaveBeenCalledTimes(1);
  });
});
