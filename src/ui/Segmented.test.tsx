import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Segmented, segmentLayout } from './Segmented';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function render(element: ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(element);
  });
  return tree;
}

const OPTIONS = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg', spoken: 'kilograms' },
] as const;

/** The pressables themselves: Pressable passes its props down, so only the outermost of each has onPress and a style. */
const radios = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function', { deep: false });

describe('Segmented (R353)', () => {
  it('is a named radio group in a surfaceRaised well', () => {
    const tree = render(<Segmented label="Weight" options={OPTIONS} value="lb" onChange={jest.fn()} />);
    const group = tree.root.findAll((n) => n.props.accessibilityRole === 'radiogroup')[0];
    expect(group.props.accessibilityLabel).toBe('Weight');
    expect(StyleSheet.flatten(group.props.style)).toMatchObject({ backgroundColor: '#232019', borderRadius: 12, padding: 4, gap: 4 });
  });

  it('fills the chosen segment with the text colour, labels it in bg, and says it is checked', () => {
    const tree = render(<Segmented label="Weight" options={OPTIONS} value="kg" onChange={jest.fn()} />);
    const [lb, kg] = radios(tree);
    expect(lb.props.accessibilityState).toEqual({ checked: false });
    expect(kg.props.accessibilityState).toEqual({ checked: true });
    expect(StyleSheet.flatten(kg.props.style)).toMatchObject({ minHeight: 44, borderRadius: 9, backgroundColor: '#f1ece2' });
    const kgLabel = kg.findByType(Text);
    expect(StyleSheet.flatten(kgLabel.props.style)).toMatchObject({ color: '#100f0c', textAlign: 'center' });
  });

  it('reads a choice by its spoken words when given', () => {
    const tree = render(<Segmented label="Weight" options={OPTIONS} value="lb" onChange={jest.fn()} />);
    expect(radios(tree).map((r) => r.props.accessibilityLabel)).toEqual(['lb', 'kilograms']);
  });

  it('calls onChange with the value pressed', () => {
    const onChange = jest.fn();
    const tree = render(<Segmented label="Weight" options={OPTIONS} value="lb" onChange={onChange} />);
    act(() => radios(tree)[1].props.onPress());
    expect(onChange).toHaveBeenCalledWith('kg');
  });

  it('lays segments out four, two or one to a row by the longest label', () => {
    expect(segmentLayout(300, 60, 4).perRow).toBe(4);
    expect(segmentLayout(200, 60, 4).perRow).toBe(2);
    expect(segmentLayout(100, 90, 4).perRow).toBe(1);
  });
});
