import { Image, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { ProgramPicture } from './ProgramPicture';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
// Task 5 generates the real pictures; until then the map is empty.
jest.mock('../../seed/programPictures.generated', () => ({
  PROGRAM_PICTURES: { 'program-advanced-upper-lower-dup': { card: 11, thumb: 12 } },
}));

function render(node: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(node);
  });
  return tree;
}

describe('the program picture (R632)', () => {
  it('the card picture is 120 × 80 with 8pt corners and a 1px border, read as "{movement} photo"', () => {
    const tree = render(<ProgramPicture programId="program-advanced-upper-lower-dup" label="Bench press" kind="card" />);
    const image = tree.root.findByType(Image);
    expect(image.props.source).toBe(11);
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 120, height: 80 });
    const frame = tree.root.findByProps({ accessibilityLabel: 'Bench press photo' });
    expect(frame.props.accessibilityRole).toBe('image');
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ borderRadius: 8, borderWidth: 1, borderColor: '#2e2a23', overflow: 'hidden' });
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });

  it("the row's thumbnail is a 48pt square, and inside a row it is left to the row's own label", () => {
    const tree = render(<ProgramPicture programId="program-advanced-upper-lower-dup" label="Bench press" kind="thumb" decorative />);
    const image = tree.root.findByType(Image);
    expect(image.props.source).toBe(12);
    expect(StyleSheet.flatten(image.props.style)).toMatchObject({ width: 48, height: 48 });
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === 'Bench press photo')).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.accessible === false).length).toBeGreaterThan(0);
  });

  it('draws nothing for a program with no picture yet', () => {
    const tree = render(<ProgramPicture programId="program-barbell-foundations" label="Barbell back squat" kind="card" />);
    expect(tree.toJSON()).toBeNull();
  });
});
