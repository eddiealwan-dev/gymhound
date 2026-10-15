const DECIMAL = /^\d+([.,]\d+)?$/;
const WHOLE_SECONDS = /^\d+$/;
const MINUTES_SECONDS = /^(\d+):([0-5]\d)$/;
const HOURS_MINUTES_SECONDS = /^(\d+):([0-5]\d):([0-5]\d)$/;

/** Parses a non-negative decimal. A comma counts as the decimal point ("82,5" is 82.5). */
export function parseDecimal(t: string): number | null {
  const s = t.trim();
  if (!DECIMAL.test(s)) return null;
  return Number(s.replace(',', '.'));
}

/** Parses a whole number of reps. */
export function parseReps(t: string): number | null {
  const n = parseDecimal(t);
  return n !== null && Number.isInteger(n) ? n : null;
}

/** Parses "90" (seconds), "1:30" (minutes:seconds) or "1:05:00" (hours:minutes:seconds) into seconds. */
export function parseDuration(t: string): number | null {
  const s = t.trim();
  if (WHOLE_SECONDS.test(s)) return Number(s);
  const m = MINUTES_SECONDS.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const h = HOURS_MINUTES_SECONDS.exec(s);
  return h ? Number(h[1]) * 3600 + Number(h[2]) * 60 + Number(h[3]) : null;
}

/** Parses an RPE from 6 to 10 in steps of 0.5. */
export function parseRpe(t: string): number | null {
  const n = parseDecimal(t);
  if (n === null || n < 6 || n > 10) return null;
  return Number.isInteger(n * 2) ? n : null;
}
