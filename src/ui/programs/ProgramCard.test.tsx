import { Image, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { PROGRAMS } from '../../seed/programs.generated';
import { Body } from '../Text';
import { ProgramCard } from './ProgramCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockFontScale = 1;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../platform/announce', () => ({ announce: jest.fn(), focusOn: jest.fn() }));
jest.mock('../ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 3, fontScale: mockFontScale }),
}));
jest.mock('../../seed/programPictures.generated', () => ({
  PROGRAM_PICTURES: { 'program-advanced-upper-lower-dup': { card: 11, thumb: 12 } },
}));

/** Program number `n` of the twenty. */
const programNumber = (n: number) => PROGRAMS.find((p) => p.number === n)!;

const DUP = programNumber(11);
const BARBELL = programNumber(1);

function mount(number = 11, footer: React.ReactNode = <Body>FOOTER</Body>): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ProgramCard program={programNumber(number)} footer={footer} />);
  });
  return tree;
}

/** Every string drawn on screen right now, nested runs joined to their paragraph (a closed sheet draws nothing). */
function shownText(tree: ReactTestRenderer): string[] {
  const out: string[] = [];
  const flat = (node: unknown): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(flat).join('');
    if (node && typeof node === 'object') return flat((node as { children?: unknown }).children ?? []);
    return '';
  };
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object') {
      const n = node as { type?: string; children?: unknown };
      // A paragraph with muted citation runs is one Text with nested Texts: read it as one string.
      if (n.type === 'Text') out.push(flat(n.children ?? []));
      else walk(n.children);
    }
  };
  walk(tree.toJSON());
  return out;
}

const restingStyle = (node: ReactTestInstance) =>
  StyleSheet.flatten(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);

const sourcesLink = (tree: ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Sources'))[0];

beforeEach(() => {
  mockFontScale = 1;
});

describe('the program card (R630)', () => {
  it('renders the title, the summary band, the eight details, WHY IT WORKS bullets, HOW IT PROGRESSES, AFTER THIS PROGRAM, Sources, then the footer', () => {
    const tree = mount(11);
    const shown = shownText(tree);
    const at = (text: string) => {
      const i = shown.indexOf(text);
      expect([text, i]).not.toEqual([text, -1]);
      return i;
    };
    // The title is the page's heading, in Display; a line may break after its slash (§18.24).
    const titleAt = at('#11 · Advanced Upper/​Lower DUP');
    const title = tree.root.findAll((n) => n.type === Text && n.props.accessibilityRole === 'header' && String(n.props.children).startsWith('#11'))[0];
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({ fontFamily: 'BarlowCondensed_700Bold', fontSize: 28 });
    expect(title.props.accessibilityLabel).toBe('Program 11, Advanced Upper/Lower DUP');

    const band = at('4 days a week · 6 weeks · Advanced · Strength + size with daily undulating periodization');
    const rows = [
      'Level: Advanced',
      'Days per week: 4',
      'Program length: 6 weeks',
      'Goal: Strength + size with daily undulating periodization',
      'Equipment: Full gym',
      `Schedule: ${DUP.schedule}`,
      'Deload / special weeks: Week 6 (plus reactive)',
      `Lineage: ${DUP.lineage}`,
    ].map(at);
    const why = at('Why it works');
    const bullets = DUP.whyItWorks.map(at);
    const how = at('How it progresses');
    const progression = at(DUP.progressionNotes);
    const after = at('After this program');
    const afterText = at(DUP.afterThisProgram);
    const sources = at('Sources (7)');
    const footer = at('FOOTER');
    expect([titleAt, band, ...rows, why, ...bullets, how, progression, after, afterText, sources, footer]).toEqual(
      [titleAt, band, ...rows, why, ...bullets, how, progression, after, afterText, sources, footer].sort((a, b) => a - b),
    );
    expect(bullets).toHaveLength(4);
    expect(JSON.stringify(tree.toJSON())).not.toContain('#E10600');
  });

  it('shows "Sources (8)" for #1, a quiet 44pt link that opens the Sources sheet', () => {
    const tree = mount(1);
    expect(shownText(tree)).toContain('Sources (8)');
    expect(shownText(tree)).not.toContain('[18]');
    const link = sourcesLink(tree);
    expect(link.props.accessibilityLabel).toBe('Sources, 8');
    expect(restingStyle(link).minHeight).toBeGreaterThanOrEqual(44);
    act(() => link.props.onPress());
    const shown = shownText(tree);
    expect(shown).toContain('[18]');
    expect(shown).toContain('stronglifts.com');
  });

  it('the summary band is Body strong on the surface colour with 12pt padding', () => {
    const tree = mount(11);
    const text = tree.root.findAll((n) => n.type === Text && n.props.children === '4 days a week · 6 weeks · Advanced · Strength + size with daily undulating periodization')[0];
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({ fontFamily: 'Inter_600SemiBold' });
    const band = text.parent?.parent;
    expect(StyleSheet.flatten(band?.props.style)).toMatchObject({ backgroundColor: '#1a1814', padding: 12 });
  });

  it('shows no exercise names: the days and exercises show only on your active program (R634)', () => {
    for (const program of PROGRAMS) {
      const tree = mount(program.number);
      const shown = shownText(tree);
      const text = shown.join('\n');
      // The documents' own words may name a lift ("Deadlift: drop its increment..."); nothing else on the card does.
      const own = [
        program.goal,
        program.equipment,
        program.schedule,
        program.specialWeeksText,
        program.lineage,
        ...program.whyItWorks,
        program.progressionNotes,
        program.afterThisProgram,
      ].join('\n');
      for (const day of program.days) {
        // #1's days are "A" and "B": no line is a day's name.
        expect([program.id, day.name, shown.includes(day.name)]).toEqual([program.id, day.name, false]);
        for (const slot of day.slots) {
          expect([program.id, slot.catalogName, shown.includes(slot.catalogName)]).toEqual([program.id, slot.catalogName, false]);
          if (text.includes(slot.catalogName)) expect([program.id, slot.catalogName, own.includes(slot.catalogName)]).toEqual([program.id, slot.catalogName, true]);
        }
      }
    }
  });

  it('draws citation markers muted and has VoiceOver read them as "source n"', () => {
    const tree = mount(11);
    const first = DUP.whyItWorks[0];
    const para = tree.root.findAll((n) => n.type === Text && n.props.accessibilityLabel?.startsWith('For trained lifters'))[0];
    expect(para.props.accessibilityLabel).toBe(first.replace('[15][16]', 'source 15, source 16'));
    const marker = para.findAll((n) => n.type === Text && n.props.children === '[15][16]')[0];
    expect(StyleSheet.flatten(marker.props.style).color).toBe('#a39d90');
  });

  it("the picture sits top left, 120 × 80, read as the movement's photo; with no picture yet, there is none", () => {
    const tree = mount(11);
    expect(tree.root.findAllByType(Image)).toHaveLength(1);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Bench press photo' }).length).toBeGreaterThan(0);
    expect(mount(1).root.findAllByType(Image)).toHaveLength(0);
  });

  it('at a large text size the title goes under the picture rather than squeezing beside it', () => {
    const side = mount(11);
    const row = side.root.findAllByProps({ accessibilityLabel: 'Bench press photo' })[0].parent?.parent;
    expect(StyleSheet.flatten(row?.props.style).flexDirection).toBe('row');
    mockFontScale = 2;
    const stacked = mount(11);
    const column = stacked.root.findAllByProps({ accessibilityLabel: 'Bench press photo' })[0].parent?.parent;
    expect(StyleSheet.flatten(column?.props.style).flexDirection).toBe('column');
  });

  it('every control is a 44pt target with a label', () => {
    const tree = mount(1);
    act(() => sourcesLink(tree).props.onPress());
    const pressables = tree.root.findAll(
      (n) => typeof n.props.onPress === 'function' && (n.props.accessibilityRole === 'button' || n.props.accessibilityRole === 'link') && typeof n.type !== 'string',
    );
    expect(pressables.length).toBeGreaterThan(8);
    for (const p of pressables) {
      // The sheet's backdrop fills the space above the panel.
      if (p.props.accessibilityLabel === 'Close' && restingStyle(p).flex === 1) continue;
      const label = p.props.accessibilityLabel ?? p.findAll((n) => n.type === Text)[0]?.props.children;
      expect(typeof label === 'string' && label.length > 0).toBe(true);
      const style = restingStyle(p);
      const slop = typeof p.props.hitSlop === 'number' ? p.props.hitSlop : 0;
      expect([label, (style.minHeight ?? 0) + 2 * slop]).toEqual([label, expect.any(Number)]);
      expect((style.minHeight ?? 0) + 2 * slop).toBeGreaterThanOrEqual(44);
    }
  });
});
