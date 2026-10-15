import { cardText, cardWhy, citationParts, enDashRanges, citationSpeech, detailRows, progressionParagraphs, siteOf, sourcesFor, summaryLine, titleOf } from './programCard';
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
    // Ranges with an en dash (ruling R-g4); every other word as written.
    expect(rows[5].value).toBe(enDashRanges(p.schedule));
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
      'Run until the top rungs are weighted. Then move to a weighted-calisthenics block (intermediate ladder: 3x6–12 windows on weighted rungs, pike push-up → wall handstand push-up chain for shoulders) or to #1 Barbell Foundations.',
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
    expect(cardText('Rest 2-3 min on the two heavy lifts, 60-90 s on accessories [14].')).toBe('Rest 2–3 min on the two heavy lifts, 1:00–1:30 on accessories [14].');
    expect(cardText('Rest 60–90 s after that.')).toBe('Rest 1:00–1:30 after that.');
    expect(cardText('the incline walk progresses by +60 s to a cap of 1,800 s.')).toBe('the incline walk progresses by +1:00 to a cap of 30:00.');
    expect(cardText('Holds of 60 seconds or longer cost 4% (under 60 s cost 1%).')).toBe('Holds of 1:00 or longer cost 4% (under 1:00 cost 1%).');
    expect(cardText('12 x 30 s swing intervals, every 30 s, 3 x 30-45 s, slow the lowering to 3 seconds.')).toBe(
      '12 x 30 s swing intervals, every 30 s, 3 x 30–45 s, slow the lowering to 3 seconds.',
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
    expect(cardText(p.progressionNotes)).toBe(p.progressionNotes.replace('1-2 min', '1–2 min'));
    expect(cardWhy(p)).toEqual(p.whyItWorks.map(enDashRanges));
  });
});

describe('the words on every card (ruling R-g4, design gate #24)', () => {
  it('writes number ranges with an en dash, and keeps a word or a rep scheme hyphenated', () => {
    expect(cardText(programNumber(1).progressionNotes)).not.toMatch(/\d-\d/);
    expect(cardText('Top of range → 4-8 reps, then 10-20 reps; 1-hour race pace; A-B-A; 21-15-9.')).toBe(
      'Top of range → 4–8 reps, then 10–20 reps; 1-hour race pace; A-B-A; 21-15-9.',
    );
    for (const p of PROGRAMS) {
      const all = [...detailRows(p).map((r) => r.value), ...cardWhy(p), cardText(p.progressionNotes), cardText(p.afterThisProgram)].join(' ');
      expect(all).not.toMatch(/(?<![\d-])\d+-\d+(?![\d-])/);
    }
  });

  it('names a program it points to by its number alone', () => {
    expect(cardText('then run #5 Upper/Lower Powerbuilding or #11 to build the base.')).toBe(
      'then run #5 Upper/Lower Powerbuilding or #11 Advanced Upper/Lower DUP to build the base.',
    );
    for (const p of PROGRAMS) expect(cardText(p.afterThisProgram)).not.toMatch(/#\d+(?!\d)(?! [A-Z])/);
  });
});

describe('How it progresses, in short paragraphs (ruling R-g1)', () => {
  it("splits at the documents' own labelled sentences, the label apart and the words unchanged", () => {
    const dup = progressionParagraphs(cardText(programNumber(11).progressionNotes));
    expect(dup.map((p) => p.label)).toEqual(['Heavy days:', 'Light days:', 'Stall rule:', 'Reactive deload:']);
    expect(dup[0].text).toBe('top of range on all sets → +5 lb upper / +10 lb lower; use 2.5 lb on bench and press when 5 lb fails.');
    // An unlabelled sentence stays with the paragraph before it.
    expect(dup[1].text).toBe("top of range on all sets → +5 lb. Each day's weights progress independently.");
    expect(dup[3].text).toBe('if two main lifts miss in the same week, bring the deload week forward. Rest 3 min on heavy compounds, 1–2 min on light-day work [14].');
  });

  it("keeps every word: the paragraphs joined are the card's text", () => {
    for (const p of PROGRAMS) {
      const text = cardText(p.progressionNotes);
      const joined = progressionParagraphs(text)
        .map((x) => (x.label === null ? x.text : `${x.label} ${x.text}`))
        .join(' ');
      expect(joined).toBe(text);
    }
  });

  it('#19 reads as barbell lifts, moving events and stones; a text with no labels is one paragraph', () => {
    expect(progressionParagraphs(cardText(programNumber(19).progressionNotes)).map((p) => p.label)).toEqual([
      'Barbell lifts:',
      'Moving events (logged as sets × distance):',
      'Stones/sandbags:',
      'Starting points if you have nothing to go on:',
    ]);
    const plain = progressionParagraphs(cardText(programNumber(2).progressionNotes));
    expect(plain[0].label).toBeNull();
  });
});

describe('sites and citations (R631)', () => {
  it('siteOf strips the scheme, www and the path', () => {
    expect(siteOf('https://www.sportrxiv.org/index.php/server/preprint/view/460')).toBe('sportrxiv.org');
    expect(siteOf('https://sportrxiv.org/index.php/server/preprint/view/460')).toBe('sportrxiv.org');
    expect(siteOf('https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/')).toBe('pmc.ncbi.nlm.nih.gov');
    expect(siteOf('http://WWW.StrongerByScience.com?x=1')).toBe('strongerbyscience.com');
    expect(siteOf('https://thefitness.wiki#gzclp')).toBe('thefitness.wiki');
    expect(siteOf('https://m.youtube.com/watch?v=x')).toBe('youtube.com');
    expect(siteOf('https://mail.example.org/a')).toBe('example.org');
    expect(siteOf('https://mailchimp.com')).toBe('mailchimp.com');
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
