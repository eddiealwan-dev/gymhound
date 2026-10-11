import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Image, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import FinishSummaryScreen from '../../app/finish/[id]';
import type { FinishSummary } from '../db/repositories/workoutViewsRepo';
import type { PrHighlight } from '../domain/prs';
import { announce } from '../platform/announce';
import { Button } from './Button';
import { PbCard } from './finish/PbCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockRead: { summary: FinishSummary | null; unit: 'lb' | 'kg' };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({ id: 'w1' }),
}));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../state/dataVersion', () => ({ useDbQuery: () => mockRead }));
jest.mock('../db/repositories/settingsRepo', () => ({ getSettings: jest.fn() }));
jest.mock('../db/repositories/workoutViewsRepo', () => ({ getFinishSummary: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///cache/ReactNative-snapshot-image1.png') }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
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
        { name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
        { name: 'Overhead press', loggingType: 'weighted', outcome: 'held_marked', nextWeight: 95, nextUnit: 'lb', mark: 'pain' },
        { name: 'Incline dumbbell press', loggingType: 'weighted', outcome: 'held', nextWeight: 50, nextUnit: 'lb', mark: null },
        { name: 'Assisted pull-up', loggingType: 'assisted', outcome: 'raised', nextWeight: 30, nextUnit: 'lb', mark: null },
        { name: 'Triceps pushdown', loggingType: 'weighted', outcome: 'no_sets', nextWeight: 40, nextUnit: 'lb', mark: null },
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
    expect(text.slice(logged + 1)).toEqual([...lines, 'Done']);
  });

  it('shows no next-time line when no exercise has a rule', () => {
    mockRead = { unit: 'lb', summary: pushA([]) };
    const text = shownText(mount());

    expect(text.slice(text.indexOf('3 sets') + 1)).toEqual(['Done']);
  });
});

/** A bench press personal best of `kind` at 185 lb. */
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

describe('personal bests on the finish summary (R104, R105)', () => {
  const next: FinishSummary['next'] = [
    { name: 'Barbell bench press', loggingType: 'weighted', outcome: 'raised', nextWeight: 140, nextUnit: 'lb', mark: null },
  ];

  it('lists each personal best after the next-time lines, under "Personal bests", each with a PR mark', async () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), benchPr('reps_at_weight', 8), plankPr]) };
    const text = shownText(await mountSettled());

    expect(text.slice(text.indexOf('Barbell bench press — next time 140 lb ↑') + 1)).toEqual([
      'Personal bests',
      'PR',
      'Bench press — heaviest: 185 lb × 5',
      'Share',
      'PR',
      'Bench press — most reps at 185 lb: 8',
      'Share',
      'PR',
      'Plank — longest hold: 1:30',
      'Share',
      'Done',
    ]);
  });

  it('hides the section when there are none', async () => {
    mockRead = { unit: 'lb', summary: pushA(next) };
    const text = shownText(await mountSettled());

    expect(text).not.toContain('Personal bests');
    expect(text).not.toContain('PR');
  });

  it('reads each row to VoiceOver as one sentence, and the heading as a heading', async () => {
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), plankPr]) };
    const tree = await mountSettled();

    const rows = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessible === true && /^Personal best\./.test(n.props.accessibilityLabel ?? ''));
    expect(rows.map((r) => r.props.accessibilityLabel)).toEqual([
      'Personal best. Bench press — heaviest: 185 lb × 5',
      'Personal best. Plank — longest hold: 1:30',
    ]);
    const heading = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'Personal bests');
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

describe('the personal best card (R106)', () => {
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

  it('shows the lockup, PERSONAL BEST, the exercise, the value, the caption and the date, and no footer', () => {
    const text = shownText(renderCard(benchPr('heaviest')));
    expect(text).toEqual(['GYMHOUND', 'PERSONAL BEST', 'Bench press', '185 lb × 5', 'Heaviest set', 'SUN 11 OCT 2026']);
  });

  it('lays the date out for the locale', () => {
    expect(shownText(renderCard(plankPr, 'en-US'))).toEqual(['GYMHOUND', 'PERSONAL BEST', 'Plank', '1:30', 'Longest hold', 'SUN OCT 11 2026']);
  });

  it('is 360 × 450, always dark, at a fixed text size, even with the light theme on', () => {
    mockScheme = 'light';
    const tree = renderCard(benchPr('reps_at_weight', 8));
    const root = tree.root.findAll((n) => typeof n.type === 'string' && n.props.collapsable === false)[0];
    expect(flatStyle(root.props.style)).toMatchObject({ width: 360, height: 450, backgroundColor: '#100f0c' });

    const texts = tree.root.findAll((n) => (n.type as unknown) === 'Text');
    expect(texts.length).toBe(6);
    for (const t of texts) expect(t.props.allowFontScaling).toBe(false);
    const styleOf = (label: string) => flatStyle(texts.find((t) => t.props.children === label)!.props.style);
    expect(styleOf('GYMHOUND')).toMatchObject({ color: '#E10600', fontSize: 38 });
    expect(styleOf('PERSONAL BEST').color).toBe('#E10600');
    expect(styleOf('Bench press')).toMatchObject({ color: '#f1ece2', fontSize: 32 });
    expect(styleOf('8 reps')).toMatchObject({ color: '#f1ece2', fontSize: 64, fontVariant: ['tabular-nums'] });
    expect(styleOf('Most reps at 185 lb')).toMatchObject({ color: '#a39d90', fontSize: 18 });
    expect(styleOf('SUN 11 OCT 2026').color).toBe('#a39d90');

    const mark = tree.root.findByType(Image);
    expect(mark.props.source).toBe(require('../../assets/brand/mark-dark.png'));
    expect(flatStyle(mark.props.style)).toMatchObject({ width: 48, height: 48 });
  });
});

describe('sharing a personal best (R106)', () => {
  const next: FinishSummary['next'] = [];
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(captureRef).mockReset().mockResolvedValue('file:///cache/ReactNative-snapshot-image1.png');
    jest.mocked(Sharing.isAvailableAsync).mockReset().mockResolvedValue(true);
    mockRead = { unit: 'lb', summary: pushA(next, [benchPr('heaviest'), plankPr]) };
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  const shareButtons = (tree: ReactTestRenderer) => tree.root.findAllByType(Button).filter((b) => b.props.label === 'Share');

  /** Lets the frame, the capture and the share sheet run. */
  const settle = () => act(async () => new Promise<void>((r) => setTimeout(r, 50)));

  /** Presses Share on row `i` and waits for the frame, the capture and the share sheet. */
  async function pressShare(tree: ReactTestRenderer, i: number): Promise<void> {
    await act(async () => shareButtons(tree)[i].props.onPress());
    await settle();
  }

  it('gives each row a compact secondary Share pill that names the line to VoiceOver', async () => {
    const tree = await mountSettled();
    expect(shareButtons(tree).map((b) => [b.props.variant, b.props.size, b.props.accessibilityLabel])).toEqual([
      ['secondary', 'compact', 'Share Bench press — heaviest: 185 lb × 5'],
      ['secondary', 'compact', 'Share Plank — longest hold: 1:30'],
    ]);
  });

  it("draws that personal best's card off-screen, captures it as a 1080 × 1350 PNG and opens the share sheet, then removes the card", async () => {
    const tree = await mountSettled();
    expect(shownText(tree)).not.toContain('PERSONAL BEST');
    let drawnAtCapture: string[] = [];
    jest.mocked(captureRef).mockImplementationOnce(async () => {
      drawnAtCapture = shownText(tree);
      return 'file:///cache/ReactNative-snapshot-image1.png';
    });

    await pressShare(tree, 1);

    expect(drawnAtCapture).toEqual(expect.arrayContaining(['PERSONAL BEST', 'Plank', '1:30', 'Longest hold', 'SUN OCT 11 2026']));
    expect(drawnAtCapture).not.toContain('Bench press');
    expect(captureRef).toHaveBeenCalledWith(expect.objectContaining({ current: null }), {
      format: 'png',
      result: 'tmpfile',
      width: 1080,
      height: 1350,
    });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/ReactNative-snapshot-image1.png', {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: 'Share a personal best',
    });
    expect(shownText(tree)).not.toContain('PERSONAL BEST');
    expect(shownText(tree)).not.toContain("Couldn't make the image. Try again.");
  });

  it('keeps the card off-screen, untouchable and out of VoiceOver while it is drawn', async () => {
    const tree = await mountSettled();
    let holder: Record<string, unknown> | undefined;
    jest.mocked(captureRef).mockImplementationOnce(async () => {
      holder = tree.root.findAll((n) => typeof n.type === 'string' && flatStyle(n.props.style).left === -10000)[0]?.props;
      return 'file:///x.png';
    });

    await pressShare(tree, 0);

    expect(holder).toBeDefined();
    expect(flatStyle(holder!.style)).toMatchObject({ position: 'absolute', left: -10000 });
    expect(holder!.importantForAccessibility).toBe('no-hide-descendants');
    expect(holder!.accessibilityElementsHidden).toBe(true);
    expect(holder!.pointerEvents).toBe('none');
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
      "Couldn't make the image. Try again.",
      'PR',
      'Plank — longest hold: 1:30',
      'Share',
      'Done',
    ]);
    const failure = tree.root.findAll((n) => (n.type as unknown) === 'Text' && n.props.children === "Couldn't make the image. Try again.")[0];
    expect(flatStyle(failure.props.style).color).toBe('#a39d90');
    expect(announce).toHaveBeenCalledWith("Couldn't make the image. Try again.");

    await pressShare(tree, 0);
    expect(shownText(tree)).not.toContain("Couldn't make the image. Try again.");
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  });

  it('ignores a second tap while an image is being made', async () => {
    const tree = await mountSettled();
    await act(async () => {
      shareButtons(tree)[0].props.onPress();
      shareButtons(tree)[1].props.onPress();
    });
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

  it('does not check sharing when there are no personal bests', async () => {
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
