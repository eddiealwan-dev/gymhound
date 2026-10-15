import { citationParts, citationSpeech, detailRows, siteOf, sourcesFor, summaryLine, titleOf } from './programCard';
import { PROGRAM_SOURCES, PROGRAMS } from '../seed/programs.generated';
/** Program number `n` of the twenty. */
const programNumber = (n: number) => PROGRAMS.find((p) => p.number === n)!;


describe('the program card (R630)', () => {
  it("summaryLine and titleOf for #11 match the owner's card example", () => {
    const p = programNumber(11);
    expect(titleOf(p)).toBe('#11 · Advanced Upper/Lower DUP');
    expect(summaryLine(p)).toBe('4 days a week · 6 weeks · Advanced · Strength + size with daily undulating periodization');
  });

  it('detailRows has the eight labels in order, with the values as the documents write them', () => {
    const p = programNumber(11);
    const rows = detailRows(p);
    expect(rows.map((r) => r.label)).toEqual([
      'Level',
      'Days per week',
      'Program length',
      'Goal',
      'Equipment',
      'Schedule',
      'Deload / special weeks',
      'Lineage',
    ]);
    expect(rows.slice(0, 5).map((r) => r.value)).toEqual(['Advanced', '4', '6 weeks', 'Strength + size with daily undulating periodization', 'Full gym']);
    expect(rows[5].value).toBe(p.schedule);
    expect(rows[6].value).toBe('Week 6 (plus reactive)');
    expect(rows[7].value).toBe(p.lineage);
  });
});

describe('sites and citations (R631)', () => {
  it('siteOf strips the scheme, www and the path', () => {
    expect(siteOf('https://www.sportrxiv.org/index.php/server/preprint/view/460')).toBe('sportrxiv.org');
    expect(siteOf('https://sportrxiv.org/index.php/server/preprint/view/460')).toBe('sportrxiv.org');
    expect(siteOf('https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/')).toBe('pmc.ncbi.nlm.nih.gov');
    expect(siteOf('http://WWW.StrongerByScience.com?x=1')).toBe('strongerbyscience.com');
    expect(siteOf('https://thefitness.wiki#gzclp')).toBe('thefitness.wiki');
  });

  it('citationSpeech reads each marker as "source n" for VoiceOver', () => {
    expect(citationSpeech('[15][16]')).toBe('source 15, source 16');
    expect(citationSpeech('unaffected by the periodization model [15][16].')).toBe('unaffected by the periodization model source 15, source 16.');
    expect(citationSpeech('per increment [1], so volume')).toBe('per increment source 1, so volume');
    expect(citationSpeech('No markers here.')).toBe('No markers here.');
  });

  it('citationParts splits the text so the markers can be drawn muted, keeping every character', () => {
    const text = 'loads [19]; a full week off [18], so [1][2]';
    const parts = citationParts(text);
    expect(parts).toEqual([
      { text: 'loads ', cite: false },
      { text: '[19]', cite: true },
      { text: '; a full week off ', cite: false },
      { text: '[18]', cite: true },
      { text: ', so ', cite: false },
      { text: '[1][2]', cite: true },
    ]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(citationParts('Plain.')).toEqual([{ text: 'Plain.', cite: false }]);
  });

  it("sourcesFor lists the program's sources in number order", () => {
    const shuffled = [...PROGRAM_SOURCES].reverse();
    expect(sourcesFor(programNumber(1), shuffled).map((s) => s.id)).toEqual([1, 18, 22, 23, 24, 25, 26, 28]);
    expect(sourcesFor(programNumber(11), shuffled).map((s) => s.id)).toEqual([1, 10, 14, 15, 16, 18, 19]);
  });
});
