import { cardText, cardWhy, citationParts, citationSpeech, detailRows, siteOf, sourcesFor, summaryLine, titleOf } from './programCard';
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

describe("the card's text (ruling R-w3)", () => {
  it('#1: the schedule drops the volume table the app lacks', () => {
    const rows = detailRows(programNumber(1));
    expect(rows.find((r) => r.label === 'Schedule')!.value).toBe(
      'Two days (A, B) alternate three times a week: A-B-A, then B-A-B. Each day runs 1.5 times a week on average.',
    );
  });

  it('#3: no Appendix A, no earlier app review, and rests of a minute or more in minutes', () => {
    const p = programNumber(3);
    expect(cardWhy(p)[3]).toBe(
      'The RR as written gives rear delts only about 4.5 fractional sets a week and side delts none; this version adds a band pull-apart/face-pull slot and a band lateral raise slot to fix that.',
    );
    expect(cardText(p.progressionNotes)).toBe(
      "Each ladder entry stores the lifter's current rung. Rung rule: 3x5 → add one rep per set each session → at 3x8 on all sets move to the next rung and restart at 3x5. " +
        'Holds: +5 s per session; at 30 s on all sets move up. Stall rule: fewer than 5 reps on any set for 2 consecutive sessions → go back one rung. ' +
        'Top rungs (pull-up, dip, Bulgarian split squat, Nordic curl, feet-elevated row) become weighted: at 3x8 add 5 lb (upper) or 10 lb (lower) with a vest, belt or dumbbell and drop back to 3x5 [37]. ' +
        'Band exercises progress by reps to the top of the range, then a stronger band. Pairs are supersetted (pull-up/squat, dip/hinge, row/push-up) with 1:30 rest; core 1:00 [37].',
    );
    expect(cardText(p.afterThisProgram)).toBe(
      'Run until the top rungs are weighted. Then move to a weighted-calisthenics block (intermediate ladder: 3x6-12 windows on weighted rungs, pike push-up → wall handstand push-up chain for shoulders) or to #1 Barbell Foundations.',
    );
  });

  it('#20: runs read in minutes, "+120 s per week" as "+2:00 a week"', () => {
    expect(cardText(programNumber(20).progressionNotes)).toBe(
      'Lifts: top of range on all sets → +5 lb upper / +10 lb lower; 2 misses → −10%. ' +
        'Runs: easy runs +2:00 a week, long run +5:00 a week up to 90:00, intervals +1 rep to 8 then +15 s per rep, tempo +2:00 a week to 30:00 - never more than ~20–30% total weekly increase [74]. ' +
        'Run sessions follow published hybrid templates (easy runs, one interval day, one tempo day, a long run) [75]. ' +
        'Easy pace = you can talk in full sentences; tempo = comfortably hard (about 1-hour race pace); intervals = hard but repeatable (about 5 km pace) [73]. ' +
        'Lighter weeks 4, 8, 12: half the sets, ~60% of run time [19]. Week 12 ends with a 5 km time trial and a rep-max test on the main lifts.',
    );
  });

  it('seconds: under a minute stay as written; ranges and words of a minute or more read as minutes', () => {
    expect(cardText('Rest 2-3 min on the two heavy lifts, 60-90 s on accessories [14].')).toBe('Rest 2-3 min on the two heavy lifts, 1:00-1:30 on accessories [14].');
    expect(cardText('Rest 60–90 s after that.')).toBe('Rest 1:00–1:30 after that.');
    expect(cardText('the incline walk progresses by +60 s to a cap of 1,800 s.')).toBe('the incline walk progresses by +1:00 to a cap of 30:00.');
    expect(cardText('Holds of 60 seconds or longer cost 4% (under 60 s cost 1%).')).toBe('Holds of 1:00 or longer cost 4% (under 1:00 cost 1%).');
    expect(cardText('12 x 30 s swing intervals, every 30 s, 3 x 30-45 s, slow the lowering to 3 seconds.')).toBe(
      '12 x 30 s swing intervals, every 30 s, 3 x 30-45 s, slow the lowering to 3 seconds.',
    );
  });

  it("drops a sentence pointing at an appendix, and an earlier review's aside (#2, #8, #12, #14)", () => {
    expect(cardWhy(programNumber(2)).join(' ')).toContain('[32], and calves appear on two days.');
    expect(cardText(programNumber(8).progressionNotes)).not.toMatch(/Appendix|need the app/);
    expect(cardText(programNumber(12).progressionNotes)).not.toMatch(/Appendix|stored 1RM/);
    expect(cardWhy(programNumber(14)).join(' ')).toContain('So this program mixes three tools instead of only static holds: controlled active moves');
  });

  it('every card: nothing points at a table, an appendix or an earlier review, and no seconds of a minute or more', () => {
    for (const p of PROGRAMS) {
      const all = [...detailRows(p).map((r) => r.value), ...cardWhy(p), cardText(p.progressionNotes), cardText(p.afterThisProgram)].join(' ');
      expect(all).not.toMatch(/volume table|Appendix|app review|earlier review/i);
      expect(all).not.toMatch(/\b(?:[6-9]\d|\d{3,}|\d{1,3}(?:,\d{3})+)\s?(?:s|seconds)\b/);
      expect(all).not.toMatch(/ {2}|^ | $/);
    }
  });

  it('leaves text with nothing to drop or convert word for word', () => {
    const p = programNumber(11);
    expect(cardText(p.progressionNotes)).toBe(p.progressionNotes);
    expect(cardWhy(p)).toEqual(p.whyItWorks);
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
