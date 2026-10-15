import { Linking, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { PROGRAMS } from '../../seed/programs.generated';
import { announce } from '../../platform/announce';
import { Button } from '../Button';
import { SourcesSheet } from './SourcesSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
// The sources out of order, so the sheet's own order is what's tested.
jest.mock('../../seed/programs.generated', () => {
  const actual = jest.requireActual('../../seed/programs.generated');
  return { ...actual, PROGRAM_SOURCES: [...actual.PROGRAM_SOURCES].reverse() };
});

const FAILED = "Couldn't open the link.";

function mount(onClose = jest.fn()): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<SourcesSheet program={PROGRAMS[0]} visible onClose={onClose} />);
  });
  return tree;
}

function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') walk((node as { children?: unknown }).children);
  };
  walk(tree.toJSON());
  return out;
}

/** The pressable links (the components, which take onPress), in order. */
const links = (tree: ReactTestRenderer): ReactTestInstance[] =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'link' && typeof n.props.onPress === 'function');

/** A pressable's style at rest. */
const restingStyle = (node: ReactTestInstance) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

const flush = () => act(async () => {});

beforeEach(() => {
  jest.restoreAllMocks();
  jest.mocked(announce).mockClear();
});

describe('the Sources sheet (R631)', () => {
  it('lists [1], [18], [22]… for #1, each with its citation and its site, under the title "Sources"', () => {
    const tree = mount();
    const shown = shownText(tree);
    expect(shown[0]).toBe('Sources');
    expect(shown).toContain('Barbell Foundations');
    const numbers = shown.filter((t) => /^\[\d+\]$/.test(t));
    expect(numbers).toEqual(['[1]', '[18]', '[22]', '[23]', '[24]', '[25]', '[26]', '[28]']);
    expect(shown).toContain(
      'Pelland JC et al. (2024/2025). The Resistance Training Dose-Response: Meta-regressions exploring the effects of weekly volume and frequency on muscle hypertrophy and strength gain. SportRxiv / Sports Medicine.',
    );
    expect(shown).toContain('sportrxiv.org');
    expect(shown).toContain('stronglifts.com');
    // The number is set in Barlow with tabular figures.
    const one = tree.root.findAll((n) => n.type === Text && n.props.children === '[1]')[0];
    expect(StyleSheet.flatten(one.props.style)).toMatchObject({ fontFamily: expect.stringMatching(/^BarlowCondensed/), fontVariant: ['tabular-nums'] });
  });

  it('opens the address in the browser when its link is pressed', () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const tree = mount();
    const first = links(tree)[0];
    expect(first.props.accessibilityLabel).toBe('Open sportrxiv.org');
    act(() => first.props.onPress());
    expect(open).toHaveBeenCalledWith('https://sportrxiv.org/index.php/server/preprint/view/460');
    expect(shownText(tree)).not.toContain(FAILED);
  });

  it(`says "${FAILED}" under that source, muted and announced, when the browser won't open`, async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no browser'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = mount();
    act(() => links(tree)[1].props.onPress());
    await flush();
    const shown = shownText(tree);
    expect(shown.filter((t) => t === FAILED)).toHaveLength(1);
    // Under the second source ([18]), not the first.
    expect(shown.indexOf(FAILED)).toBeGreaterThan(shown.indexOf('[18]'));
    expect(shown.indexOf(FAILED)).toBeLessThan(shown.indexOf('[22]'));
    const line = tree.root.findAll((n) => n.type === Text && n.props.children === FAILED)[0];
    expect(StyleSheet.flatten(line.props.style).color).toBe('#a39d90');
    // Said once: announced, and not a live region as well.
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(FAILED);
    expect(line.props.accessibilityLiveRegion).toBeUndefined();
  });

  it('every link is a 44pt target labelled "Open {site}", and Close (quiet, last) closes it', () => {
    const onClose = jest.fn();
    const tree = mount(onClose);
    const all = links(tree);
    expect(all).toHaveLength(8);
    for (const link of all) {
      expect(link.props.accessibilityLabel).toMatch(/^Open [a-z0-9.-]+$/);
      expect(restingStyle(link).minHeight).toBeGreaterThanOrEqual(44);
    }
    const buttons = tree.root.findAllByType(Button);
    expect(buttons.map((b) => [b.props.label, b.props.variant])).toEqual([['Close', 'quiet']]);
    act(() => buttons[0].props.onPress());
    expect(onClose).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });
});
