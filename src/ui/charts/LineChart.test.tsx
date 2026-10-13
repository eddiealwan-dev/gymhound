import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { CHART_LABEL_MAX_SCALE, LineChart } from './LineChart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

beforeEach(() => {
  mockFontScale = 1;
});

const fmt = (v: number) => `${v}`;
const pts = [
  { localDate: '2026-08-03', value: 180 },
  { localDate: '2026-09-01', value: 178.5 },
  { localDate: '2026-10-10', value: 186 },
];

function render(element: ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

/** Lays the plot area out at a width, as the phone would. */
function layOut(tree: ReactTestRenderer, width = 300) {
  const measured = tree.root.findAll((n) => typeof n.props.onLayout === 'function' && typeof n.type === 'string');
  act(() => {
    measured[0].props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 180 } } });
  });
}

const texts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).map((t) => t.props.children);

function allPropValues(node: ReactTestInstance): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object' && !('$$typeof' in (v as object))) Object.values(v as object).forEach(walk);
  };
  for (const n of [node, ...node.findAll(() => true)]) {
    const { children: _children, ...rest } = n.props;
    walk(rest);
  }
  return out;
}

describe('LineChart', () => {
  it('draws a 2px line in the text colour and one dot per point, once it knows its width', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    layOut(tree);
    const path = tree.root.findByType(Path);
    expect(path.props.d).toMatch(/^M/);
    expect(path.props).toMatchObject({ stroke: '#f1ece2', strokeWidth: 2, fill: 'none' });
    const dots = tree.root.findAllByType(Circle);
    expect(dots).toHaveLength(3);
    expect(dots[0].props).toMatchObject({ r: 2, fill: '#f1ece2' });
  });

  it('draws a border-colour grid line and a muted tabular label for each y tick', () => {
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const lines = tree.root.findAllByType(Line);
    expect(lines).toHaveLength(5);
    lines.forEach((l) => expect(l.props).toMatchObject({ stroke: '#2e2a23', strokeWidth: 1 }));
    expect(texts(tree)).toEqual(expect.arrayContaining(['186 lb', '184 lb', '182 lb', '180 lb', '178 lb']));
    const label = tree.root.findAllByType(Text).find((t) => t.props.children === '186 lb')!;
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a39d90', fontVariant: ['tabular-nums'] });
  });

  it('labels the first and last dates under the axis', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    expect(texts(tree)).toEqual(expect.arrayContaining(['3 Aug', '10 Oct']));
  });

  it('is 180 tall by default and takes a height', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    expect(tree.root.findByType(Svg).props.height).toBe(180);
    const tall = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" height={240} accessibilityLabel="Bodyweight" />);
    layOut(tall);
    expect(tall.root.findByType(Svg).props.height).toBe(240);
  });

  it('one point is a dot only, with its date', () => {
    const tree = render(<LineChart points={[pts[0]]} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    expect(tree.root.findAllByType(Circle)).toHaveLength(1);
    expect(texts(tree).filter((t) => t === '3 Aug')).toHaveLength(1);
  });

  it('no points draws nothing', () => {
    const tree = render(<LineChart points={[]} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('is one accessible image with the given label', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight, 3 Aug to 10 Oct" />);
    layOut(tree);
    const accessible = tree.root.findAll((n) => n.props.accessible === true && typeof n.type === 'string');
    expect(accessible).toHaveLength(1);
    expect(accessible[0].props).toMatchObject({ accessibilityRole: 'image', accessibilityLabel: 'Bodyweight, 3 Aug to 10 Oct' });
    expect(tree.root.findAllByType(View)[0].props.accessible).toBe(true);
  });

  it('pads the plot by half a label line, scaled with the text size (to 1.5×), so the top and bottom labels stay inside', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const lines = tree.root.findAllByType(Line).map((l) => l.props.y1);
    expect(Math.min(...lines)).toBe(8);
    expect(Math.max(...lines)).toBe(172);

    // At 2× text the labels stop at 1.5× (CHART_LABEL_MAX_SCALE): a 24pt line, 12pt above and below.
    mockFontScale = 2;
    const big = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(big);
    const bigLines = big.root.findAllByType(Line).map((l) => l.props.y1);
    expect(Math.min(...bigLines)).toBe(12);
    expect(Math.max(...bigLines)).toBe(168);
  });

  // On the web a label in a zero-height box with overflow hidden (numberOfLines) shrank to nothing, so each label is a
  // line tall itself, laid out down the column so its middle sits on its tick.
  it.each([1, 2])('gives each y label a real line height, centred on its tick, at text size %s', (scale) => {
    mockFontScale = scale;
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const lineHeight = 16 * Math.min(scale, CHART_LABEL_MAX_SCALE);
    const tickYs = tree.root.findAllByType(Line).map((l) => l.props.y1 as number).sort((a, b) => a - b);
    const column = tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.maxWidth === '30%')[0];
    const columnStyle = StyleSheet.flatten(column.props.style);
    expect(columnStyle.height).toBe(180);
    expect(columnStyle.paddingTop ?? 0).toBe(0);
    const labels = column.findAllByType(Text);
    expect(labels.map((l) => l.props.children)).toEqual(['186 lb', '184 lb', '182 lb', '180 lb', '178 lb']);
    // Nothing between the column and a label is zero tall.
    column.findAll((n) => typeof n.type === 'string').forEach((n) => expect(StyleSheet.flatten(n.props.style)?.height).not.toBe(0));
    let y = 0;
    const middles: number[] = [];
    for (const label of labels) {
      const style = StyleSheet.flatten(label.props.style);
      expect(style.height).toBe(lineHeight);
      y += (style.marginTop as number | undefined) ?? 0;
      middles.push(y + lineHeight / 2);
      y += lineHeight;
    }
    expect(middles).toHaveLength(tickYs.length);
    middles.forEach((m, i) => expect(m).toBeCloseTo(tickYs[i], 6));
  });

  it('caps the y label column at 30% of the width and shrinks a label to fit on one line', () => {
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const label = tree.root.findAllByType(Text).find((t) => t.props.children === '186 lb')!;
    expect(label.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    const column = tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.maxWidth === '30%');
    expect(column).toHaveLength(1);
  });

  it('draws nothing when no value is a finite number', () => {
    const tree = render(<LineChart points={[{ localDate: '2026-08-03', value: NaN }]} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('never uses red', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const values = allPropValues(tree.root).map((s) => s.toUpperCase());
    expect(values).toContain('#F1ECE2'); // the walk does reach the drawing's colours
    expect(values).not.toContain('#E10600');
  });
});

describe('LineChart marks (R173, R191)', () => {
  const marked = [
    { localDate: '2026-08-03', value: 180 },
    { localDate: '2026-09-01', value: 178.5, hollow: true, label: 'Rough sleep' },
    { localDate: '2026-10-10', value: 186, label: 'Stall' },
  ];
  const withText = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Text).filter((t) => t.props.children === label);
  /** The label that is shown: the one not waiting to be measured. */
  const shownLabel = (tree: ReactTestRenderer, label: string) => withText(tree, label).find((t) => StyleSheet.flatten(t.props.style).opacity !== 0);
  /** Lays each label out at a width, as the phone would measure it. */
  function measure(tree: ReactTestRenderer, widths: Record<string, number>) {
    for (const [label, width] of Object.entries(widths)) {
      for (const t of withText(tree, label).filter((n) => typeof n.props.onLayout === 'function')) {
        act(() => t.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 16 } } }));
      }
    }
  }
  const absoluteTexts = (tree: ReactTestRenderer) => tree.root.findAllByType(Text).filter((t) => StyleSheet.flatten(t.props.style).position === 'absolute');

  it('an unmarked series draws as before: no extra room, plain dots, no labels', () => {
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree, 300);
    const lines = tree.root.findAllByType(Line).map((l) => l.props.y1);
    expect(Math.min(...lines)).toBe(8);
    expect(Math.max(...lines)).toBe(172);
    const dots = tree.root.findAllByType(Circle);
    expect(dots).toHaveLength(3);
    dots.forEach((d) => {
      expect(d.props).toMatchObject({ r: 2, fill: '#f1ece2' });
      expect(d.props.stroke).toBeUndefined();
    });
    // The dots sit DOT_RADIUS + 1 in from each side.
    expect(dots[0].props.cx).toBe(3);
    expect(dots[2].props.cx).toBe(297);
    expect(absoluteTexts(tree)).toHaveLength(0);
  });

  it('draws a hollow point as a ring in the text colour filled with the card colour, and the rest as dots', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    const dots = tree.root.findAllByType(Circle);
    expect(dots).toHaveLength(3);
    expect(dots[1].props).toMatchObject({ r: 3.5, stroke: '#f1ece2', strokeWidth: 1.5, fill: '#1a1814' });
    expect(dots[0].props).toMatchObject({ r: 2, fill: '#f1ece2' });
    expect(dots[2].props).toMatchObject({ r: 2, fill: '#f1ece2' });
  });

  it('fills a hollow point with dotFill', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" dotFill="#100f0c" accessibilityLabel="Bench" />);
    layOut(tree);
    expect(tree.root.findAllByType(Circle)[1].props.fill).toBe('#100f0c');
  });

  it('measures each label unseen first, so none shows in the wrong place', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    expect(shownLabel(tree, 'Stall')).toBeUndefined();
    expect(withText(tree, 'Stall')).toHaveLength(1);
    expect(StyleSheet.flatten(withText(tree, 'Stall')[0].props.style).opacity).toBe(0);
    // One measured is not enough: labels are placed together once every width is known.
    measure(tree, { Stall: 30 });
    expect(shownLabel(tree, 'Stall')).toBeUndefined();
  });

  it('writes each placed label in the chart label style, centred 6pt over its dot', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 300);
    measure(tree, { 'Rough sleep': 70, Stall: 30 });
    const dots = tree.root.findAllByType(Circle);
    for (const [label, i, width] of [['Rough sleep', 1, 70], ['Stall', 2, 30]] as const) {
      const text = shownLabel(tree, label)!;
      expect(text).toBeDefined();
      const style = StyleSheet.flatten(text.props.style);
      expect(style).toMatchObject({ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a39d90', fontVariant: ['tabular-nums'], position: 'absolute' });
      expect(text.props.numberOfLines).toBe(1);
      expect((style.top as number) + (style.height as number)).toBeCloseTo(dots[i].props.cy - dots[i].props.r - 6, 6);
      if (label === 'Rough sleep') expect(style.left).toBeCloseTo(dots[i].props.cx - width / 2, 6);
    }
    // The newest point sits at the right edge: its label ends there instead of running off.
    expect(StyleSheet.flatten(shownLabel(tree, 'Stall')!.props.style).left).toBe(300 - 30);
  });

  it('skips a label whose dot is too close to a newer one', () => {
    const close = [
      { localDate: '2026-10-01', value: 180, hollow: true, label: 'Pain' },
      { localDate: '2026-10-02', value: 181, label: 'Stall' },
      { localDate: '2026-10-30', value: 182 },
    ];
    const tree = render(<LineChart points={close} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 300);
    measure(tree, { Pain: 30, Stall: 30 });
    expect(shownLabel(tree, 'Stall')).toBeDefined();
    expect(shownLabel(tree, 'Pain')).toBeUndefined();
  });

  // Four days over a 600pt plot: the two marked dots are 60pt apart.
  const wide = [
    { localDate: '2026-10-01', value: 180 },
    { localDate: '2026-10-11', value: 181, hollow: true, label: 'Rough sleep' },
    { localDate: '2026-10-13', value: 182, hollow: true, label: 'Short on food' },
    { localDate: '2026-10-21', value: 183 },
  ];

  it('places one of two 78pt labels whose dots are 60pt apart, as their spans overlap (R191)', () => {
    const tree = render(<LineChart points={wide} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 612);
    const dots = tree.root.findAllByType(Circle);
    expect(dots[2].props.cx - dots[1].props.cx).toBe(60);
    measure(tree, { 'Rough sleep': 78, 'Short on food': 78 });
    expect(shownLabel(tree, 'Short on food')).toBeDefined();
    expect(shownLabel(tree, 'Rough sleep')).toBeUndefined();
    // Narrow enough to clear by 8pt, both show.
    const narrow = render(<LineChart points={wide} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(narrow, 612);
    measure(narrow, { 'Rough sleep': 50, 'Short on food': 50 });
    expect(shownLabel(narrow, 'Short on food')).toBeDefined();
    expect(shownLabel(narrow, 'Rough sleep')).toBeDefined();
  });

  it('at a large text size, wider labels place fewer, measured again at that size', () => {
    mockFontScale = 1;
    const tree = render(<LineChart points={wide} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 612);
    measure(tree, { 'Rough sleep': 50, 'Short on food': 50 });
    expect(shownLabel(tree, 'Rough sleep')).toBeDefined();
    // The same labels at a larger size (their 1.5× cap) no longer clear each other.
    mockFontScale = 3;
    act(() => tree.update(<LineChart points={wide} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />));
    expect(shownLabel(tree, 'Short on food')).toBeUndefined();
    measure(tree, { 'Rough sleep': 100, 'Short on food': 100 });
    expect(shownLabel(tree, 'Short on food')).toBeDefined();
    expect(shownLabel(tree, 'Rough sleep')).toBeUndefined();
  });

  it('keys a measured width by the label, so the same word elsewhere needs no new measure', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 300);
    measure(tree, { 'Rough sleep': 70, Stall: 30 });
    const moved = [{ localDate: '2026-07-01', value: 175 }, ...marked];
    act(() => tree.update(<LineChart points={moved} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />));
    expect(shownLabel(tree, 'Rough sleep')).toBeDefined();
    expect(shownLabel(tree, 'Stall')).toBeDefined();
  });

  it('keeps a label line clear above the top tick when a label is placed', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    const lines = tree.root.findAllByType(Line).map((l) => l.props.y1);
    // Half a line, then one label line and its rise over a ring (6 + 4).
    expect(Math.min(...lines)).toBe(8 + 16 + 10);
    expect(Math.max(...lines)).toBe(172);
  });

  it('stays one accessible image with its labels inside', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    measure(tree, { 'Rough sleep': 70, Stall: 30 });
    expect(tree.root.findAll((n) => n.props.accessible === true && typeof n.type === 'string')).toHaveLength(1);
  });

  it('never uses red', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    measure(tree, { 'Rough sleep': 70, Stall: 30 });
    const values = allPropValues(tree.root).map((s) => s.toUpperCase());
    expect(values).toContain('#F1ECE2');
    expect(values).not.toContain('#E10600');
  });
});
