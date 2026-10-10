const MS_PER_DAY = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseParts(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number);
  return [y, m, d];
}

/** The device-local calendar date (YYYY-MM-DD) of an epoch-millisecond timestamp. */
export function toLocalDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local midnight at the start of a YYYY-MM-DD date. */
export function fromLocalDate(s: string): Date {
  const [y, m, d] = parseParts(s);
  return new Date(y, m - 1, d);
}

/** Whole calendar days from a to b (b minus a). Uses UTC so DST cannot shift the count. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = parseParts(a);
  const [by, bm, bd] = parseParts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

/** The Monday on or before a YYYY-MM-DD date. */
export function mondayOf(localDate: string): string {
  const [y, m, d] = parseParts(localDate);
  const sinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(y, m - 1, d - sinceMonday));
  return `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
}

export function greetingFor(d: Date): 'GOOD MORNING' | 'GOOD AFTERNOON' | 'GOOD EVENING' {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'GOOD MORNING';
  if (h >= 12 && h < 17) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

/** Short weekday, day and month in upper case, laid out for the locale: "FRI 9 OCT" or "FRI OCT 9". */
export function formatTrainDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(d)
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** An instant as a local date and time, laid out for the locale (or the device's, when none is given): "Oct 9, 2026, 9:05 AM". */
export function formatDateTime(ms: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
}

/** Elapsed workout time as m:ss, or h:mm:ss from one hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  if (hours === 0) return formatRest(total);
  const rest = total % 3600;
  return `${hours}:${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}`;
}

/** Rest time as m:ss. */
export function formatRest(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${pad2(total % 60)}`;
}
