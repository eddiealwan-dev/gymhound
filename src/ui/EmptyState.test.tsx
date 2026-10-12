import type { ReactElement } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

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

describe('EmptyState (R401)', () => {
  it('is one muted line that wraps, with no action when none is given', () => {
    const tree = render(<EmptyState text="No photos yet. Each one you add shows here, newest first." />);
    const line = tree.root.findByType(Text);
    expect(line.props.children).toBe('No photos yet. Each one you add shows here, newest first.');
    expect(StyleSheet.flatten(line.props.style).color).toBe('#a39d90');
    // It follows the phone's text size and wraps: no cap, no line limit.
    expect(line.props.maxFontSizeMultiplier).toBeUndefined();
    expect(line.props.numberOfLines).toBeUndefined();
    expect(tree.root.findAllByType(Button)).toHaveLength(0);
  });

  it('offers one action as a compact secondary pill 12pt under the line', () => {
    const onPress = jest.fn();
    const tree = render(<EmptyState text="No workouts yet." action={{ label: 'Go to Train', onPress }} />);
    const [button] = tree.root.findAllByType(Button);
    expect(button.props).toMatchObject({ label: 'Go to Train', variant: 'secondary', size: 'compact' });
    const box = tree.root.findAll((n) => n.props.testID === 'empty-state' && typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(box.props.style).gap).toBe(12);
    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('passes a VoiceOver label through to the action, and is never red', () => {
    const tree = render(
      <EmptyState text="No exercise called zercher." action={{ label: 'New exercise called zercher', accessibilityLabel: 'Make zercher', onPress: jest.fn() }} />,
    );
    expect(tree.root.findByType(Button).props.accessibilityLabel).toBe('Make zercher');
    const colours = tree.root.findAllByType(Text).map((t) => StyleSheet.flatten(t.props.style).color);
    expect(colours).not.toContain('#E10600');
  });
});
