import { ScrollView, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { Screen } from './Screen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('./Footer', () => ({ Footer: () => null }));
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

describe('Screen: a field near the bottom stays above the iOS keyboard (F9)', () => {
  it('lets its ScrollView scroll clear of the keyboard, and keeps taps on buttons while it is up', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(
        <Screen footer>
          <Text>Custom bar</Text>
        </Screen>,
      );
    });

    const scroll = tree.root.findByType(ScrollView);
    expect(scroll.props.automaticallyAdjustKeyboardInsets).toBe(true);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });
});
