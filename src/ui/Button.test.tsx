import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Button } from './Button';
import { BODY_MAX_SCALE } from './Text';

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

/** Pressable is a memo component, which `findByType` cannot match: find it by its style callback instead. */
const pressableOf = (tree: ReactTestRenderer) => tree.root.findAll((n) => typeof n.props.style === 'function')[0];
const restingStyle = (tree: ReactTestRenderer) => pressableOf(tree).props.style({ pressed: false });
const labelOf = (tree: ReactTestRenderer) => tree.root.findByType(Text);

describe('Button', () => {
  it('compact is 36pt tall and at least 44pt wide with a 4pt hitSlop, for a 44pt target', () => {
    const tree = render(<Button label="+ Set" variant="quiet" size="compact" onPress={jest.fn()} />);
    expect(restingStyle(tree)).toMatchObject({ minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: 18 });
    expect(pressableOf(tree).props.hitSlop).toBe(4);
    expect(StyleSheet.flatten(labelOf(tree).props.style).fontSize).toBe(15);
  });

  it('compact secondary is outlined in borderStrong', () => {
    const tree = render(<Button label="Notes" variant="secondary" size="compact" onPress={jest.fn()} />);
    expect(restingStyle(tree)).toMatchObject({ borderColor: '#736c60' });
  });

  it('regular is unchanged', () => {
    const tree = render(<Button label="Finish" variant="secondary" onPress={jest.fn()} />);
    expect(restingStyle(tree)).toMatchObject({ minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderColor: '#2e2a23' });
    expect(pressableOf(tree).props.hitSlop).toBeUndefined();
    expect(StyleSheet.flatten(labelOf(tree).props.style).fontSize).toBe(16);
  });

  it('compact primary is filled with text and labelled in bg, with no outline', () => {
    const tree = render(<Button label="Done" size="compact" onPress={jest.fn()} />);
    expect(restingStyle(tree)).toMatchObject({ minHeight: 36, backgroundColor: '#f1ece2', borderColor: 'transparent' });
    expect(StyleSheet.flatten(labelOf(tree).props.style)).toMatchObject({ color: '#100f0c', fontSize: 15 });
  });

  it("a default Button's label follows the phone's text size as iOS's body text does", () => {
    const tree = render(<Button label="Finish" onPress={jest.fn()} />);
    expect(labelOf(tree).props.maxFontSizeMultiplier).toBe(BODY_MAX_SCALE);
  });

  it('passes accessibilityLabel and maxFontSizeMultiplier through', () => {
    const tree = render(
      <Button label="+ Set" size="compact" accessibilityLabel="Add a set to Bench Press" maxFontSizeMultiplier={1.3} onPress={jest.fn()} />,
    );
    expect(pressableOf(tree).props.accessibilityLabel).toBe('Add a set to Bench Press');
    expect(labelOf(tree).props.maxFontSizeMultiplier).toBe(1.3);
  });
});
