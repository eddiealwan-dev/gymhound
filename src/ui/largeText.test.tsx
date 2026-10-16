import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { breakableName, SET_HEADER_MAX_SCALE, STACK_ABOVE_SCALE, useTextSizeKey } from './largeText';
import { BODY_MAX_SCALE, TITLE_MAX_SCALE } from './Text';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: mockFontScale }),
}));

describe('the screens are drawn afresh when the text size changes (Round 16c)', () => {
  function Key() {
    return <Text>{useTextSizeKey()}</Text>;
  }
  const keyOf = (tree: ReactTestRenderer) => tree.root.findByType(Text).props.children as string;

  it('gives a key that changes with the font scale and nothing else', () => {
    mockFontScale = 1;
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<Key />);
    });
    const first = keyOf(tree);
    act(() => tree.update(<Key />));
    expect(keyOf(tree)).toBe(first);
    mockFontScale = 1.353;
    act(() => tree.update(<Key />));
    expect(keyOf(tree)).not.toBe(first);
    mockFontScale = 1;
    act(() => tree.update(<Key />));
    expect(keyOf(tree)).toBe(first);
  });
});

describe('text at the largest sizes (R562, Round 13)', () => {
  it('lets a name break after each slash and nowhere else', () => {
    expect(breakableName('Push/pull/legs')).toBe('Push/​pull/​legs');
    expect(breakableName('Adductor/groin stretch')).toBe('Adductor/​groin stretch');
    expect(breakableName('Beginner full body')).toBe('Beginner full body');
  });

  it("caps body text where iOS's own body style stops, titles at 2×, and the set table at 1.5×", () => {
    expect(BODY_MAX_SCALE).toBeCloseTo(53 / 17, 6);
    // React Native's own factor at the largest size is 3.571: past iOS's body text.
    expect(BODY_MAX_SCALE).toBeLessThan(3.571);
    expect(TITLE_MAX_SCALE).toBe(2);
    expect(SET_HEADER_MAX_SCALE).toBe(1.5);
    expect(STACK_ABOVE_SCALE).toBe(1.3);
  });
});
