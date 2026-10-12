/**
 * Shared `Intl` formatters, made once per locale and options. Making a formatter is far slower than using one (on
 * Hermes most of all), and History, the charts and the volume lines made a new one for every card, label and number on
 * every draw. A formatter has no state, so sharing one changes nothing it writes.
 */

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

/** `new Intl.DateTimeFormat(locale, options)`, kept for the next call with the same locale and options. */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}

/**
 * `new Intl.NumberFormat(locale, options)`, kept for the next call with the same locale and options. It writes what
 * `n.toLocaleString(locale, options)` writes, without making a formatter each time; no locale is the device's.
 */
export function numberFormat(locale: string | undefined, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options ?? {})}`;
  let format = numberFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}
