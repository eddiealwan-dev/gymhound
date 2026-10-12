import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Hint } from './Hint';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

function mount(onDismiss = jest.fn(), spoken?: string): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<Hint text="Tap ⋯ for more." spoken={spoken} onDismiss={onDismiss} />);
  });
  return tree;
}

const dismissButton = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => n.props.accessibilityLabel === 'Dismiss tip' && typeof n.props.onPress === 'function')[0];

describe('Hint (R407, R408)', () => {
  it('is a surface card with a Seam edge and 16pt corners, never red', () => {
    const tree = mount();
    const card = tree.root.findAll((n) => n.props.testID === 'hint' && typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({ backgroundColor: '#1a1814', borderColor: '#2e2a23', borderWidth: 1, borderRadius: 16 });
    const colours = tree.root.findAllByType(Text).map((t) => StyleSheet.flatten(t.props.style).color);
    expect(colours).not.toContain('#E10600');
  });

  it('the sentence wraps with the text size', () => {
    const line = mount().root.findByType(Text);
    expect(line.props.children).toBe('Tap ⋯ for more.');
    expect(line.props.numberOfLines).toBeUndefined();
    expect(line.props.maxFontSizeMultiplier).toBeUndefined();
    expect(StyleSheet.flatten(line.props.style)).toMatchObject({ flex: 1 });
  });

  it('has a 44pt × that says it dismisses the tip for good, and calls onDismiss', () => {
    const onDismiss = jest.fn();
    const tree = mount(onDismiss);
    const button = dismissButton(tree);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityHint).toBe("It won't show again");
    expect(button.props.style({ pressed: false })).toMatchObject({ width: 44, height: 44 });
    act(() => button.props.onPress());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('reads `spoken` to VoiceOver in place of the sentence', () => {
    expect(mount(jest.fn(), 'Tap Options for more.').root.findByType(Text).props.accessibilityLabel).toBe('Tap Options for more.');
  });
});
