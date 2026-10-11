import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { LineChart } from './LineChart';

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

  it('pads the plot by half a label line, scaled with the text size, so the top and bottom labels stay inside', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const lines = tree.root.findAllByType(Line).map((l) => l.props.y1);
    expect(Math.min(...lines)).toBe(8);
    expect(Math.max(...lines)).toBe(172);

    mockFontScale = 2;
    const big = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(big);
    const bigLines = big.root.findAllByType(Line).map((l) => l.props.y1);
    expect(Math.min(...bigLines)).toBe(16);
    expect(Math.max(...bigLines)).toBe(164);
  });

  // On the web a label in a zero-height box with overflow hidden (numberOfLines) shrank to nothing, so each label is a
  // line tall itself, laid out down the column so its middle sits on its tick.
  it.each([1, 2])('gives each y label a real line height, centred on its tick, at text size %s', (scale) => {
    mockFontScale = scale;
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const lineHeight = 16 * scale;
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

describe('LineChart marks (R173)', () => {
  const marked = [
    { localDate: '2026-08-03', value: 180 },
    { localDate: '2026-09-01', value: 178.5, hollow: true, label: 'Rough sleep' },
    { localDate: '2026-10-10', value: 186, label: 'Stall' },
  ];
  const labelText = (tree: ReactTestRenderer, label: string) => tree.root.findAllByType(Text).find((t) => t.props.children === label);

  it('an unmarked series draws exactly as before', () => {
    const tree = render(<LineChart points={pts} formatValue={(v) => `${v} lb`} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    expect(tree.toJSON()).toMatchSnapshot();
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

  it('writes each placed label in the chart label style, 6pt over its dot', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    const dots = tree.root.findAllByType(Circle);
    for (const [label, i] of [['Rough sleep', 1], ['Stall', 2]] as const) {
      const text = labelText(tree, label)!;
      expect(text).toBeDefined();
      const style = StyleSheet.flatten(text.props.style);
      expect(style).toMatchObject({ fontFamily: 'Inter_400Regular', fontSize: 12, color: '#a39d90', fontVariant: ['tabular-nums'], position: 'absolute' });
      expect(text.props.numberOfLines).toBe(1);
      expect((style.top as number) + (style.height as number)).toBeCloseTo(dots[i].props.cy - dots[i].props.r - 6, 6);
    }
  });

  it('centres a label over its dot once measured, and keeps it inside the plot', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 300);
    const dots = tree.root.findAllByType(Circle);
    const measure = (label: string, width: number) =>
      act(() => labelText(tree, label)!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height: 16 } } }));
    measure('Rough sleep', 70);
    const middle = StyleSheet.flatten(labelText(tree, 'Rough sleep')!.props.style);
    expect(middle.left).toBeCloseTo(dots[1].props.cx - 35, 6);
    expect(middle.opacity ?? 1).toBe(1);
    // The newest point sits at the right edge: its label ends there instead of running off.
    measure('Stall', 30);
    const last = StyleSheet.flatten(labelText(tree, 'Stall')!.props.style);
    expect(last.left).toBe(300 - 30);
  });

  it('hides a label until it is measured, so it never shows in the wrong place', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    expect(StyleSheet.flatten(labelText(tree, 'Stall')!.props.style).opacity).toBe(0);
  });

  it('skips a label too close to a newer one', () => {
    const close = [
      { localDate: '2026-10-01', value: 180, hollow: true, label: 'Pain' },
      { localDate: '2026-10-02', value: 181, label: 'Stall' },
      { localDate: '2026-10-30', value: 182 },
    ];
    const tree = render(<LineChart points={close} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree, 300);
    expect(labelText(tree, 'Stall')).toBeDefined();
    expect(labelText(tree, 'Pain')).toBeUndefined();
  });

  it('keeps a label line clear above the top tick when a label is placed', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    const lines = tree.root.findAllByType(Line).map((l) => l.props.y1);
    // Half a line, then one label line and its rise over a ring (6 + 4).
    expect(Math.min(...lines)).toBe(8 + 16 + 10);
    expect(Math.max(...lines)).toBe(172);
  });

  it('never uses red', () => {
    const tree = render(<LineChart points={marked} formatValue={fmt} locale="en-GB" accessibilityLabel="Bench" />);
    layOut(tree);
    const values = allPropValues(tree.root).map((s) => s.toUpperCase());
    expect(values).toContain('#F1ECE2');
    expect(values).not.toContain('#E10600');
  });
});
