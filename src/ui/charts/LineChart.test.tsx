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

  it('never uses red', () => {
    const tree = render(<LineChart points={pts} formatValue={fmt} locale="en-GB" accessibilityLabel="Bodyweight" />);
    layOut(tree);
    const values = allPropValues(tree.root).map((s) => s.toUpperCase());
    expect(values).toContain('#F1ECE2'); // the walk does reach the drawing's colours
    expect(values).not.toContain('#E10600');
  });
});
