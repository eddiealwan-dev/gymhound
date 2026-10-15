// What a program's card says (spec §18.29, R630, R631): its title, the summary band, the details, and its sources.
// Pure: the card and the Sources sheet draw these words, and nothing here reads the database.
import type { Program, ProgramSource } from '../seed/programTypes';

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

/** The card's details, in the documents' order and words (R630). */
export function detailRows(p: Program): { label: string; value: string }[] {
  return [
    { label: 'Level', value: p.level },
    { label: 'Days per week', value: String(p.daysPerWeek) },
    { label: 'Program length', value: weeks(p.weeks) },
    { label: 'Goal', value: p.goal },
    { label: 'Equipment', value: p.equipment },
    { label: 'Schedule', value: p.schedule },
    { label: 'Deload / special weeks', value: p.specialWeeksText },
    { label: 'Lineage', value: p.lineage },
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

/** The site a source lives on, as the Sources sheet names it: "https://www.sportrxiv.org/…" is "sportrxiv.org". */
export function siteOf(url: string): string {
  const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#:]/)[0].toLowerCase();
  return host.replace(/^www\./, '');
}

/** The sources a program lists, in number order (R631). */
export function sourcesFor(p: Program, all: readonly ProgramSource[]): ProgramSource[] {
  const ids = new Set(p.sourceIds);
  return all.filter((s) => ids.has(s.id)).sort((a, b) => a.id - b.id);
}
