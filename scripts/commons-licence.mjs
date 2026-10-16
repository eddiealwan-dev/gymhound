// Shared by scripts/find-commons-photos.mjs and scripts/build-web-photos.mjs.

/**
 * Whether the app can bundle a Wikimedia Commons file under this licence, by Commons' short name: public domain and
 * CC0 (no credit needed), and CC BY or CC BY-SA of any version (the credit is shown under the photo). Never NC or ND.
 */
export function bundlable(shortName) {
  const s = (shortName ?? '').trim();
  if (/\bNC\b|\bND\b/i.test(s)) return false;
  return /^(Public domain|CC0)/i.test(s) || /^CC BY(-SA)?( \d(\.\d)?)?( [a-z]{2})?$/i.test(s);
}
