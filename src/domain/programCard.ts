// What a program's card says (spec §18.29, R630, R631): its title, the summary band, the details, and its sources.
// Pure: the card and the Sources sheet draw these words, and nothing here reads the database.
import type { Program, ProgramSource } from '../seed/programTypes';
import { formatRest } from './dates';

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'} a week`;
const weeks = (n: number) => `${n} ${n === 1 ? 'week' : 'weeks'}`;

/** The card's title, as the owner's example writes it: "#11 · Advanced Upper/Lower DUP". */
export function titleOf(p: Program): string {
  return `#${p.number} · ${p.name}`;
}

/** The summary band: "4 days a week · 6 weeks · Advanced · Strength + size with daily undulating periodization". */
export function summaryLine(p: Program): string {
  return `${days(p.daysPerWeek)} · ${weeks(p.weeks)} · ${p.level} · ${p.goal}`;
}

/**
 * Asides in the documents that point at things the app lacks (ruling R-w3): the volume table, an earlier app review.
 * Each is cut out of its sentence, which keeps the rest of its words.
 */
const ASIDES: readonly RegExp[] = [
  /,? and the volume table below is averaged that way/g,
  / as the earlier app review asked/g,
  / \(the earlier app review's main criticism\)/g,
  /, which was the earlier review's criticism/g,
  /Appendix [A-Z], /g,
];

/** A sentence that only points at a document appendix the app lacks ("Full ladders are in Appendix A."). */
const POINTS_AWAY = /\bAppendix [A-Z]\b/;

/** Seconds as the card says them: "90" → "1:30", "5400" → "90:00". */
const minutes = (digits: string): string => formatRest(Number(digits.replace(/,/g, '')));

/**
 * Seconds of a minute or more, as minutes (ruling R-w3): "5,400 s" → "90:00", "60-90 s" → "1:00-1:30", "60 seconds" →
 * "1:00", and "+120 s per week" → "+2:00 a week". Under a minute stays as written ("30 s", "30-45 s").
 */
function secondsAsMinutes(text: string): string {
  return text.replace(
    /\b(\d{1,3}(?:,\d{3})+|\d+)(?:(\s?[-–]\s?)(\d{1,3}(?:,\d{3})+|\d+))? ?(?:s|seconds)\b( per week)?/g,
    (whole, from: string, dash: string | undefined, to: string | undefined, perWeek: string | undefined) => {
      const top = Number((to ?? from).replace(/,/g, ''));
      if (top < 60) return whole;
      const range = to === undefined ? minutes(from) : `${minutes(from)}${dash}${minutes(to)}`;
      return perWeek ? `${range} a week` : range;
    },
  );
}

/**
 * Program text as the card and Up next show it (ruling R-w3, extending R-t2c): the documents' words, without the
 * asides and sentences that point at things the app lacks (a volume table, an appendix, an earlier app review), and
 * with seconds of a minute or more as minutes. Anything else is word for word.
 */
export function cardText(text: string): string {
  const cut = ASIDES.reduce((t, aside) => t.replace(aside, ''), text);
  const sentences = cut.split(/(?<=[.?])\s+(?=[A-Z#"'])/).filter((s) => !POINTS_AWAY.test(s));
  return secondsAsMinutes(sentences.join(' ')).trim();
}

/** Why it works as the card shows it: each bullet's `cardText`, any left empty dropped. */
export function cardWhy(p: Program): string[] {
  return p.whyItWorks.map(cardText).filter((b) => b !== '');
}

/** The card's details, in the documents' order and words (R630), as `cardText` shows them. */
export function detailRows(p: Program): { label: string; value: string }[] {
  return [
    { label: 'Level', value: p.level },
    { label: 'Days per week', value: String(p.daysPerWeek) },
    { label: 'Program length', value: weeks(p.weeks) },
    { label: 'Goal', value: cardText(p.goal) },
    { label: 'Equipment', value: cardText(p.equipment) },
    { label: 'Schedule', value: cardText(p.schedule) },
    { label: 'Deload / special weeks', value: cardText(p.specialWeeksText) },
    { label: 'Lineage', value: cardText(p.lineage) },
  ];
}

/** A run of one or more citation markers: "[15][16]". */
const MARKERS = /(?:\[\d+\])+/g;

/**
 * What VoiceOver says for a text with citation markers: "[15][16]" is read "source 15, source 16", where it would
 * otherwise say "left bracket fifteen right bracket".
 */
export function citationSpeech(text: string): string {
  return text.replace(MARKERS, (run) => (run.match(/\d+/g) ?? []).map((n) => `source ${n}`).join(', '));
}

/** A text cut into its words and its citation markers, so the card can draw the markers muted. Joined, it is the text. */
export function citationParts(text: string): { text: string; cite: boolean }[] {
  const parts: { text: string; cite: boolean }[] = [];
  let at = 0;
  for (const match of text.matchAll(MARKERS)) {
    const start = match.index ?? 0;
    if (start > at) parts.push({ text: text.slice(at, start), cite: false });
    parts.push({ text: match[0], cite: true });
    at = start + match[0].length;
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at), cite: false });
  return parts;
}

/**
 * The site a source lives on, as the Sources sheet names it: "https://www.sportrxiv.org/…" is "sportrxiv.org", and a
 * mobile or mail host is its site ("m.youtube.com" is "youtube.com").
 */
export function siteOf(url: string): string {
  const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#:]/)[0].toLowerCase();
  return host.replace(/^(?:www|m|mail)\./, '');
}

/** The sources a program lists, in number order (R631). */
export function sourcesFor(p: Program, all: readonly ProgramSource[]): ProgramSource[] {
  const ids = new Set(p.sourceIds);
  return all.filter((s) => ids.has(s.id)).sort((a, b) => a.id - b.id);
}
